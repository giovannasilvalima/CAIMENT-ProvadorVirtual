
/*
============================================================
CAIMENT — AvatarViewer
============================================================

- Carrega e normaliza o avatar Tripo.
- Carrega roupas GLB / GLTF.
- Mantém compatibilidade com clothingObject.
- Extrai referências anatômicas da geometria do avatar.
- Prioriza landmarks fornecidos pelo AvatarLandmarks.
- Aplica escala proporcional à altura corporal.
- Preserva a geometria e a folga original das roupas.
- Não executa simulação de colisão BVH.
- Não depende de Shape Keys.
- Não gera roupas proceduralmente.

============================================================
*/

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Canvas,
  useThree,
} from '@react-three/fiber';

import {
  OrbitControls,
} from '@react-three/drei';

import type {
  OrbitControls as OrbitControlsImpl,
} from 'three-stdlib';

import * as THREE from 'three';

import type {
  Object3D,
} from 'three';

import {
  GLTFLoader,
} from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import {
  AvatarPlaceholderModel,
} from './AvatarPlaceholderModel';

import {
  LoadingState,
} from '@/components/ui/LoadingState';

import {
  ErrorBoundary,
} from '@/components/ui/ErrorBoundary';

import {
  normalizeAvatarCoordinateSystem,
} from '@/features/clothing/geometry/AvatarCoordinateSystem';

import {
  extractAvatarLandmarks,
} from '@/features/clothing/geometry/AvatarLandmarks';

import type {
  AvatarLandmarkName,
} from '@/features/clothing/geometry/AvatarLandmarks';

// ============================================================
// PROPRIEDADES
// ============================================================

interface AvatarViewerProps {
  modelUrl?: string | null;
  clothingModelUrl?: string | null;
  clothingObject?: Object3D | null;
  measurements?: unknown;
  className?: string;
  showControls?: boolean;
}

// ============================================================
// DADOS DO AVATAR
// ============================================================

interface AvatarFitData {
  box: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  landmarks: Record<string, THREE.Vector3>;
  inferredLandmarks: AvatarLandmarkName[];
  surface: Object3D;
  landmarkSources: Record<string, 'supplied' | 'geometry-estimated'>;
}

interface AvatarProfileSection {
  y: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  count: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
}

// ============================================================
// CONSTANTES
// ============================================================

const AVATAR_TARGET_HEIGHT = 3.4;

const AVATAR_ROTATION_Y = -Math.PI / 2;

const CLOTHING_FORWARD_OFFSET = 0.1;

/**
 * Elevação adicional da camiseta para compensar
 * a diferença entre o topo da bounding box e a gola.
 *
 * 2,5% de um avatar de 3,4 m = aproximadamente 8,5 cm.
 *
 * Esse ajuste é exclusivamente de posicionamento:
 * não modifica geometria, escala ou modelagem da roupa.
 */
const TSHIRT_VERTICAL_OFFSET_RATIO = 0.025;

const CAMERA_POSITION: [number, number, number] = [
  0,
  1.7,
  5.2,
];

const CAMERA_TARGET: [number, number, number] = [
  0,
  1.7,
  0,
];

// ============================================================
// VALIDAÇÃO
// ============================================================

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

// ============================================================
// MEDIDAS CORPORAIS
// ============================================================

function getMeasurementRecords(
  measurements: unknown,
): Record<string, unknown>[] {
  if (!isRecord(measurements)) {
    return [];
  }

  const records = [measurements];

  for (const key of [
    'medidas',
    'measurements',
    'dados',
  ]) {
    const nested = measurements[key];

    if (isRecord(nested)) {
      records.push(nested);
    }
  }

  return records;
}

// ============================================================
// ALTURA REAL DO USUÁRIO
// ============================================================

function getUserHeightInMeters(
  measurements: unknown,
): number | null {
  const records = getMeasurementRecords(
    measurements,
  );

  for (const record of records) {
    for (const key of [
      'altura',
      'alturaTotal',
      'height',
    ]) {
      const candidate = record[key];

      let value: number;
      let unit: string | null = null;

      if (typeof candidate === 'number') {
        value = candidate;
      } else if (typeof candidate === 'string') {
        value = Number(candidate);
      } else if (isRecord(candidate)) {
        value = Number(
          candidate.valor ?? candidate.value,
        );

        if (typeof candidate.unidade === 'string') {
          unit = candidate.unidade.toLowerCase();
        } else if (typeof candidate.unit === 'string') {
          unit = candidate.unit.toLowerCase();
        }
      } else {
        continue;
      }

      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }

      if (
        unit === 'm' ||
        unit === 'metro' ||
        unit === 'metros'
      ) {
        return value;
      }

      if (
        unit === 'cm' ||
        unit === 'centimetro' ||
        unit === 'centimetros'
      ) {
        return value / 100;
      }

      return value > 10
        ? value / 100
        : value;
    }
  }

  return null;
}

// ============================================================
// EXTRAÇÃO DOS VÉRTICES DO AVATAR
// ============================================================

function collectAvatarVertices(
  avatar: Object3D,
): THREE.Vector3[] {
  const vertices: THREE.Vector3[] = [];

  const vertex = new THREE.Vector3();

  avatar.updateMatrixWorld(true);

  avatar.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    if (!child.visible) {
      return;
    }

    const position = child.geometry.getAttribute(
      'position',
    );

    if (!position || position.count === 0) {
      return;
    }

    child.updateWorldMatrix(true, false);

    for (let i = 0; i < position.count; i++) {
      child.getVertexPosition(i, vertex);

      vertex.applyMatrix4(child.matrixWorld);

      if (
        Number.isFinite(vertex.x) &&
        Number.isFinite(vertex.y) &&
        Number.isFinite(vertex.z)
      ) {
        vertices.push(vertex.clone());
      }
    }
  });

  return vertices;
}

// ============================================================
// PERFIL HORIZONTAL DO CORPO
// ============================================================

function buildAvatarProfile(
  vertices: THREE.Vector3[],
  box: THREE.Box3,
): AvatarProfileSection[] {
  if (vertices.length === 0) {
    return [];
  }

  const height = box.max.y - box.min.y;
  const width = box.max.x - box.min.x;

  if (height <= 0 || width <= 0) {
    return [];
  }

  const sectionCount = 100;

  const sections: AvatarProfileSection[] = [];

  const centralLimit = Math.max(
    width * 0.27,
    0.08,
  );

  const centerX = (box.min.x + box.max.x) / 2;

  for (let index = 0; index < sectionCount; index++) {
    const minY =
      box.min.y + (height * index) / sectionCount;

    const maxY =
      box.min.y + (height * (index + 1)) / sectionCount;

    const sectionVertices = vertices.filter((vertex) => {
      return (
        vertex.y >= minY &&
        vertex.y < maxY &&
        Math.abs(vertex.x - centerX) <= centralLimit
      );
    });

    if (sectionVertices.length < 3) {
      continue;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    let sumX = 0;
    let sumZ = 0;
    let sumY = 0;

    for (const vertex of sectionVertices) {
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);

      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);

      sumX += vertex.x;
      sumZ += vertex.z;
      sumY += vertex.y;
    }

    sections.push({
      y: sumY / sectionVertices.length,
      minX,
      maxX,
      minZ,
      maxZ,
      count: sectionVertices.length,
      width: maxX - minX,
      depth: maxZ - minZ,
      centerX: sumX / sectionVertices.length,
      centerZ: sumZ / sectionVertices.length,
    });
  }

  return sections;
}

// ============================================================
// SELEÇÃO DE SEÇÕES ANATÔMICAS
// ============================================================

function selectProfileSection(
  sections: AvatarProfileSection[],
  minHeight: number,
  maxHeight: number,
  metric: 'width' | 'depth',
  mode: 'min' | 'max',
): AvatarProfileSection | null {
  const candidates = sections.filter((section) => {
    return (
      section.y >= minHeight &&
      section.y <= maxHeight
    );
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const valueA = a[metric];
    const valueB = b[metric];

    return mode === 'min'
      ? valueA - valueB
      : valueB - valueA;
  });

  return candidates[0];
}

// ============================================================
// ESTIMATIVA GEOMÉTRICA DOS LANDMARKS
// ============================================================

function estimateGeometricLandmarks(
  avatar: Object3D,
  box: THREE.Box3,
): Record<string, THREE.Vector3> {
  const vertices = collectAvatarVertices(avatar);

  if (vertices.length < 30) {
    console.warn(
      'Poucos vértices disponíveis para estimar landmarks do avatar.',
      vertices.length,
    );

    return {};
  }

  const sections = buildAvatarProfile(vertices, box);

  if (sections.length < 10) {
    console.warn(
      'Não foi possível construir um perfil corporal confiável.',
    );

    return {};
  }

  const height = box.max.y - box.min.y;

  if (!Number.isFinite(height) || height <= 0) {
    return {};
  }

  const normalizedSections = sections.map((section) => ({
    ...section,
    y: (section.y - box.min.y) / height,
  }));

  const neck = selectProfileSection(
    normalizedSections, 0.82, 0.96, 'width', 'min',
  );

  const shoulders = selectProfileSection(
    normalizedSections, 0.70, 0.87, 'width', 'max',
  );

  const bust = selectProfileSection(
    normalizedSections, 0.59, 0.76, 'depth', 'max',
  );

  const waist = selectProfileSection(
    normalizedSections, 0.45, 0.65, 'width', 'min',
  );

  const hip = selectProfileSection(
    normalizedSections, 0.34, 0.54, 'width', 'max',
  );

  const crotch = selectProfileSection(
    normalizedSections, 0.20, 0.40, 'width', 'min',
  );

  const landmarks: Record<string, THREE.Vector3> = {};

  const makePoint = (
    section: AvatarProfileSection | null,
  ): THREE.Vector3 | null => {
    if (!section) {
      return null;
    }

    return new THREE.Vector3(
      section.centerX,
      box.min.y + section.y * height,
      section.centerZ,
    );
  };

  const add = (
    name: string,
    section: AvatarProfileSection | null,
  ) => {
    const point = makePoint(section);

    if (point) {
      landmarks[name] = point;
    }
  };

  add('neckBase', neck);
  add('shoulderCenter', shoulders);
  add('bustCenter', bust);
  add('waistCenter', waist);
  add('hipCenter', hip);
  add('crotchCenter', crotch);

  const bodyCenter = makePoint(bust ?? waist);

  if (bodyCenter) {
    landmarks.bodyCenter = bodyCenter;
  }

  console.log(
    'LANDMARKS ESTIMADOS PELA GEOMETRIA TRIPO',
    {
      vertexCount: vertices.length,
      profileSections: sections.length,
      found: Object.keys(landmarks),
      points: Object.fromEntries(
        Object.entries(landmarks).map(([name, point]) => [
          name,
          point.toArray(),
        ]),
      ),
    },
  );

  return landmarks;
}

// ============================================================
// EXTRAÇÃO COMPLETA DOS DADOS DO AVATAR
// ============================================================

function extractAvatarFitData(
  avatar: Object3D,
): AvatarFitData {
  avatar.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(
    avatar,
  );

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  if (
    !Number.isFinite(size.y) ||
    size.y <= 0
  ) {
    throw new Error(
      'Dimensões inválidas do avatar.',
    );
  }

  const extraction = extractAvatarLandmarks(
    avatar,
  );

  const landmarks: Record<string, THREE.Vector3> = {};

  const landmarkSources: Record<
    string,
    'supplied' | 'geometry-estimated'
  > = {};

  for (const [name, value] of Object.entries(
    extraction.landmarks,
  )) {
    if (
      value instanceof THREE.Vector3 &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      Number.isFinite(value.z)
    ) {
      landmarks[name] = value.clone();
      landmarkSources[name] = 'supplied';
    }
  }

  const estimated = estimateGeometricLandmarks(
    avatar,
    box,
  );

  for (const [name, value] of Object.entries(estimated)) {
    if (!landmarks[name]) {
      landmarks[name] = value.clone();
      landmarkSources[name] = 'geometry-estimated';
    }
  }

  const inferredLandmarks = [
    ...extraction.inferred,
  ] as AvatarLandmarkName[];

  console.log(
    'LANDMARKS FINAIS DO AVATAR',
    {
      available: extraction.available,
      missing: extraction.missing,
      inferred: inferredLandmarks,
      landmarkCount: Object.keys(landmarks).length,
      sources: landmarkSources,
      avatarSize: size.toArray(),
    },
  );

  return {
    box,
    size,
    center,
    landmarks,
    inferredLandmarks,
    surface: avatar,
    landmarkSources,
  };
}

// ============================================================
// CONSULTA DE LANDMARKS
// ============================================================

function getLandmark(
  fitData: AvatarFitData,
  names: string[],
): THREE.Vector3 | null {
  for (const name of names) {
    const landmark = fitData.landmarks[name];

    if (
      landmark instanceof THREE.Vector3 &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      Number.isFinite(landmark.z)
    ) {
      return landmark.clone();
    }
  }

  return null;
}

// ============================================================
// TRANSLADAÇÃO EM COORDENADAS DO OBJETO PAI
// ============================================================

function translateObjectInWorld(
  object: Object3D,
  worldTranslation: THREE.Vector3,
): void {
  if (!object.parent) {
    object.position.add(worldTranslation);
    return;
  }

  object.parent.updateWorldMatrix(true, false);

  const inverseParentMatrix = object.parent.matrixWorld
    .clone()
    .invert();

  inverseParentMatrix.setPosition(0, 0, 0);

  const localTranslation = worldTranslation
    .clone()
    .applyMatrix4(inverseParentMatrix);

  object.position.add(localTranslation);
}

// ============================================================
// IDENTIFICAÇÃO DO TIPO DA ROUPA
// ============================================================

function normalizeGarmentType(
  value: string,
): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');

  if (
    [
      'tshirt',
      'camiseta',
      'shirt',
      'regata',
    ].includes(normalized)
  ) {
    return 'tshirt';
  }

  if (
    [
      'short',
      'shorts',
    ].includes(normalized)
  ) {
    return 'short';
  }

  if (
    [
      'pants',
      'calca',
      'trousers',
    ].includes(normalized)
  ) {
    return 'pants';
  }

  if (
    [
      'dress',
      'vestido',
    ].includes(normalized)
  ) {
    return 'dress';
  }

  return '';
}

function getGarmentType(
  garment: Object3D,
): string {
  const candidates = [
    garment.userData.garmentType,
    garment.userData.type,
    garment.userData.category,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const type = normalizeGarmentType(candidate);

    if (type) {
      return type;
    }
  }

  return 'tshirt';
}

function getGarmentTypeFromUrl(
  url: string,
): string {
  const filename = decodeURIComponent(
    url.split('/').pop() ?? '',
  );

  const normalized = filename
    .toLowerCase()
    .replace(/\.(glb|gltf)$/i, '');

  const patterns: Array<[RegExp, string]> = [
    [/(^|[-_])(?:short|shorts)([-_]|$)/, 'short'],
    [/(^|[-_])(?:pants|calca|trousers)([-_]|$)/, 'pants'],
    [/(^|[-_])(?:dress|vestido)([-_]|$)/, 'dress'],
    [/(^|[-_])(?:tshirt|camiseta|shirt|regata)([-_]|$)/, 'tshirt'],
  ];

  for (const [pattern, type] of patterns) {
    if (pattern.test(normalized)) {
      return type;
    }
  }

  return '';
}

// ============================================================
// ESCALA PROPORCIONAL DA ROUPA
// ============================================================

function applyGarmentScale(
  garment: Object3D,
  measurements: unknown,
): number {
  if (garment.userData.avatarScaleApplied === true) {
    return Number(
      garment.userData.uniformScale ?? 1,
    );
  }

  const userHeight = getUserHeightInMeters(
    measurements,
  );

  if (userHeight === null || userHeight <= 0) {
    console.warn(
      'Altura corporal não encontrada. Escala original da roupa preservada.',
    );

    return 1;
  }

  const scale =
    AVATAR_TARGET_HEIGHT / userHeight;

  if (!Number.isFinite(scale) || scale <= 0) {
    console.warn(
      'Fator de escala inválido. Escala original da roupa preservada.',
    );

    return 1;
  }

  garment.scale.multiplyScalar(scale);

  garment.userData.avatarScaleApplied = true;
  garment.userData.uniformScale = scale;

  garment.updateMatrix();
  garment.updateMatrixWorld(true);

  return scale;
}

// ============================================================
// POSICIONAMENTO ANATÔMICO
// ============================================================

function positionGarmentOnAvatar(
  garment: Object3D,
  fitData: AvatarFitData,
): boolean {
  garment.updateMatrixWorld(true);

  const garmentBox = new THREE.Box3().setFromObject(
    garment,
  );

  if (garmentBox.isEmpty()) {
    console.warn(
      'Modelo de roupa sem geometria válida.',
    );

    return false;
  }

  const garmentSize = new THREE.Vector3();

  garmentBox.getSize(garmentSize);

  if (
    !Number.isFinite(garmentSize.y) ||
    garmentSize.y <= 0
  ) {
    console.warn(
      'Altura inválida do modelo de roupa.',
    );

    return false;
  }

  const garmentType = getGarmentType(garment);

  let verticalAnchor: THREE.Vector3 | null = null;
  let horizontalAnchor: THREE.Vector3 | null = null;
  let depthAnchor: THREE.Vector3 | null = null;

  let forwardOffset = CLOTHING_FORWARD_OFFSET;

  if (garmentType === 'tshirt') {
    verticalAnchor = getLandmark(
      fitData,
      ['neckBase', 'shoulderCenter'],
    );

    horizontalAnchor = getLandmark(
      fitData,
      ['shoulderCenter', 'neckBase'],
    );

    depthAnchor = getLandmark(
      fitData,
      ['bustCenter', 'shoulderCenter', 'bodyCenter'],
    );
  } else if (
    garmentType === 'short' ||
    garmentType === 'pants'
  ) {
    verticalAnchor = getLandmark(
      fitData,
      ['waistCenter', 'hipCenter'],
    );

    horizontalAnchor = getLandmark(
      fitData,
      ['hipCenter', 'waistCenter'],
    );

    depthAnchor = getLandmark(
      fitData,
      ['hipCenter', 'crotchCenter', 'waistCenter'],
    );

    forwardOffset = 0.025;
  } else if (garmentType === 'dress') {
    verticalAnchor = getLandmark(
      fitData,
      ['neckBase', 'shoulderCenter'],
    );

    horizontalAnchor = getLandmark(
      fitData,
      ['shoulderCenter', 'neckBase'],
    );

    depthAnchor = getLandmark(
      fitData,
      ['bustCenter', 'bodyCenter'],
    );
  } else {
    console.warn(
      'Tipo de roupa não reconhecido:',
      garmentType,
    );

    return false;
  }

  if (
    !verticalAnchor ||
    !horizontalAnchor ||
    !depthAnchor
  ) {
    console.warn(
      'Landmarks insuficientes para posicionar a roupa.',
      {
        garmentType,
        availableLandmarks: Object.keys(
          fitData.landmarks,
        ),
      },
    );

    return false;
  }

  // ----------------------------------------------------------
  // CORREÇÃO DA ALTURA DA CAMISETA
  // ----------------------------------------------------------
  // O topo da bounding box não corresponde necessariamente
  // à linha da gola, pois pode incluir mangas e ombros.
  //
  // Elevamos a camiseta em uma pequena proporção da altura
  // do avatar para aproximar a região superior da gola.
  //
  // A correção não modifica a geometria da peça.
  // ----------------------------------------------------------

  const verticalCorrection =
    garmentType === 'tshirt'
      ? fitData.size.y * TSHIRT_VERTICAL_OFFSET_RATIO
      : 0;

  const targetPosition = new THREE.Vector3(
    horizontalAnchor.x,
    verticalAnchor.y + verticalCorrection,
    depthAnchor.z,
  );

  const currentPosition = new THREE.Vector3(
    (garmentBox.min.x + garmentBox.max.x) / 2,
    garmentBox.max.y,
    (garmentBox.min.z + garmentBox.max.z) / 2,
  );

  const translation = targetPosition.sub(
    currentPosition,
  );

  translateObjectInWorld(
    garment,
    translation,
  );

  translateObjectInWorld(
    garment,
    new THREE.Vector3(
      0,
      0,
      forwardOffset,
    ),
  );

  garment.updateMatrix();
  garment.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(
    garment,
  );

  garment.userData.avatarPositionApplied = true;
  garment.userData.avatarPositionType = garmentType;
  garment.userData.verticalCorrection = verticalCorrection;

  console.log(
    'ROUPA POSICIONADA NO AVATAR',
    {
      garmentType,
      anchors: {
        vertical: verticalAnchor.toArray(),
        horizontal: horizontalAnchor.toArray(),
        depth: depthAnchor.toArray(),
      },
      verticalCorrection,
      verticalCorrectionRatio:
        garmentType === 'tshirt'
          ? TSHIRT_VERTICAL_OFFSET_RATIO
          : 0,
      forwardOffset,
      garmentSize: garmentSize.toArray(),
      finalPosition: garment.position.toArray(),
      finalBounds: {
        min: finalBox.min.toArray(),
        max: finalBox.max.toArray(),
      },
    },
  );

  return true;
}

// ============================================================
// PREPARAÇÃO DO MODELO 3D
// ============================================================

function prepareObjectForRendering(
  object: Object3D,
): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = false;
    child.frustumCulled = true;
  });

  object.updateMatrixWorld(true);
}

// ============================================================
// CLONAGEM DO MODELO
// ============================================================

function cloneGarment(
  original: Object3D,
): Object3D {
  const cloned = original.clone(true);

  cloned.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry = child.geometry.clone();
  });

  prepareObjectForRendering(cloned);

  return cloned;
}

// ============================================================
// LIBERAÇÃO DAS GEOMETRIAS DA ROUPA
// ============================================================

function disposeGarmentGeometries(
  garment: Object3D,
): void {
  garment.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry.dispose();
  });
}

// ============================================================
// CARREGAMENTO DO AVATAR
// ============================================================

function getModelProxyUrl(
  modelUrl: string,
): string {
  return `/api/avatar/model?url=${encodeURIComponent(modelUrl)}`;
}

function RealModel({
  url,
  onLoaded,
  onError,
  onFitData,
}: {
  url: string;
  onLoaded?: () => void;
  onError?: (error: unknown) => void;
  onFitData?: (data: AvatarFitData) => void;
}) {
  const [model, setModel] =
    useState<Object3D | null>(null);

  const errorRef = useRef(onError);

  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    setModel(null);

    const loader = new GLTFLoader();

    loader.load(
      getModelProxyUrl(url),

      (gltf) => {
        const avatar = gltf.scene;

        if (cancelled) {
          return;
        }

        let meshCount = 0;

        avatar.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshCount++;
          }
        });

        if (meshCount === 0) {
          errorRef.current?.(
            new Error(
              'O modelo Tripo não possui meshes.',
            ),
          );

          return;
        }

        prepareObjectForRendering(avatar);

        setModel(avatar);
      },

      undefined,

      (error) => {
        if (!cancelled) {
          console.error(
            'Erro ao carregar avatar:',
            error,
          );

          errorRef.current?.(error);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!model) {
    return null;
  }

  return (
    <AvatarModelObject
      model={model}
      onFitData={onFitData}
      onLoaded={onLoaded}
      onError={onError}
    />
  );
}

// ============================================================
// NORMALIZAÇÃO DO AVATAR
// ============================================================

function AvatarModelObject({
  model,
  onFitData,
  onLoaded,
  onError,
}: {
  model: Object3D;
  onFitData?: (data: AvatarFitData) => void;
  onLoaded?: () => void;
  onError?: (error: unknown) => void;
}) {
  const [
    normalizedAvatar,
    setNormalizedAvatar,
  ] = useState<Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;

    setNormalizedAvatar(null);

    try {
      model.rotation.set(
        0,
        AVATAR_ROTATION_Y,
        0,
      );

      model.updateMatrixWorld(true);

      const normalized =
        normalizeAvatarCoordinateSystem(
          model,
          {
            targetHeight: AVATAR_TARGET_HEIGHT,
            centerHorizontally: true,
            placeOnGround: true,
          },
        );

      normalized.group.updateMatrixWorld(true);

      const fitData = extractAvatarFitData(
        normalized.group,
      );

      if (cancelled) {
        return;
      }

      setNormalizedAvatar(normalized.group);

      onFitData?.(fitData);
      onLoaded?.();

      console.log(
        'AVATAR NORMALIZADO',
        {
          targetHeight: AVATAR_TARGET_HEIGHT,
          unitScale: normalized.unitScale,
          modelScale: normalized.modelScale,
          size: normalized.size.toArray(),
          center: normalized.center.toArray(),
          floorY: normalized.bounds.min.y,
        },
      );
    } catch (error) {
      if (!cancelled) {
        console.error(
          'Erro na normalização do avatar:',
          error,
        );

        onError?.(error);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    model,
    onFitData,
    onLoaded,
    onError,
  ]);

  if (!normalizedAvatar) {
    return null;
  }

  return (
    <primitive object={normalizedAvatar} />
  );
}

// ============================================================
// CARREGAMENTO DIRETO DA ROUPA
// ============================================================

function ClothingModel({
  clothingModelUrl,
  clothingObject,
  measurements,
  avatarFitData,
}: {
  clothingModelUrl?: string | null;
  clothingObject?: Object3D | null;
  measurements?: unknown;
  avatarFitData: AvatarFitData;
}) {
  const [garment, setGarment] =
    useState<Object3D | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (garment) {
        disposeGarmentGeometries(garment);
      }
    };
  }, [garment]);

  useEffect(() => {
    let cancelled = false;

    setGarment(null);
    setError(null);

    if (!clothingModelUrl && !clothingObject) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const processGarment = (
      original: Object3D,
      source: string,
    ) => {
      try {
        if (cancelled) {
          return;
        }

        console.log(
          'MODELO 3D DE ROUPA RECEBIDO:',
          {
            source,
            original,
          },
        );

        const generated = cloneGarment(original);

        if (
          !generated.userData.garmentType &&
          clothingModelUrl
        ) {
          const type = getGarmentTypeFromUrl(
            clothingModelUrl,
          );

          if (type) {
            generated.userData.garmentType = type;
          }
        }

        const uniformScale = applyGarmentScale(
          generated,
          measurements,
        );

        const positioned = positionGarmentOnAvatar(
          generated,
          avatarFitData,
        );

        generated.userData.isImportedGarment = true;

        generated.userData.collisionCorrectionApplied =
          false;

        generated.userData.collisionMeshesProcessed = 0;
        generated.userData.collisionMeshesSkipped = 0;

        generated.updateMatrixWorld(true);

        if (cancelled) {
          disposeGarmentGeometries(generated);
          return;
        }

        setGarment(generated);
        setLoading(false);

        console.log(
          'ROUPA IMPORTADA E POSICIONADA:',
          {
            source,
            object: generated,
            uniformScale,
            positioned,
            position: generated.position.toArray(),
            rotation: generated.rotation.toArray(),
            scale: generated.scale.toArray(),
            garmentType: getGarmentType(generated),
            children: generated.children.length,
          },
        );
      } catch (processingError) {
        console.error(
          'Erro ao preparar a roupa:',
          processingError,
        );

        if (!cancelled) {
          setError(
            processingError instanceof Error
              ? processingError.message
              : 'Não foi possível preparar a roupa.',
          );

          setLoading(false);
        }
      }
    };

    if (clothingObject && !clothingModelUrl) {
      processGarment(
        clothingObject,
        'clothingObject',
      );

      return () => {
        cancelled = true;
      };
    }

    if (clothingModelUrl) {
      const loader = new GLTFLoader();

      console.log(
        'CARREGANDO ROUPA IMPORTADA:',
        clothingModelUrl,
      );

      loader.load(
        clothingModelUrl,

        (gltf) => {
          if (cancelled) {
            return;
          }

          const original = gltf.scene;

          let meshCount = 0;

          original.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              meshCount++;
            }
          });

          if (meshCount === 0) {
            setError(
              'O arquivo da roupa não contém meshes.',
            );

            setLoading(false);
            return;
          }

          processGarment(
            original,
            clothingModelUrl,
          );
        },

        undefined,

        (loadError) => {
          if (cancelled) {
            return;
          }

          console.error(
            'ERRO AO CARREGAR ROUPA 3D:',
            {
              url: clothingModelUrl,
              error: loadError,
            },
          );

          setError(
            `Não foi possível carregar a roupa: ${clothingModelUrl}`,
          );

          setLoading(false);
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, [
    clothingModelUrl,
    clothingObject,
    measurements,
    avatarFitData,
  ]);

  if (loading) {
    return null;
  }

  if (error) {
    console.error(
      'FALHA NO MODELO DE ROUPA:',
      error,
    );

    return null;
  }

  if (!garment) {
    return null;
  }

  return (
    <primitive
      object={garment}
      dispose={null}
    />
  );
}

// ============================================================
// CENA 3D
// ============================================================

function Scene({
  modelUrl,
  clothingModelUrl,
  clothingObject,
  measurements,
  onAvatarLoaded,
  onAvatarError,
}: {
  modelUrl?: string | null;
  clothingModelUrl?: string | null;
  clothingObject?: Object3D | null;
  measurements?: unknown;
  onAvatarLoaded: () => void;
  onAvatarError: () => void;
}) {
  const [
    avatarFitData,
    setAvatarFitData,
  ] = useState<AvatarFitData | null>(null);

  const handleFitData = useCallback(
    (data: AvatarFitData) => {
      setAvatarFitData(data);
    },
    [],
  );

  const handleLoaded = useCallback(() => {
    onAvatarLoaded();
  }, [onAvatarLoaded]);

  const handleError = useCallback(() => {
    setAvatarFitData(null);
    onAvatarError();
  }, [onAvatarError]);

  useEffect(() => {
    setAvatarFitData(null);
  }, [modelUrl]);

  return (
    <>
      <hemisphereLight
        args={[
          '#F4F1FC',
          '#6E42D1',
          0.55,
        ]}
      />

      <ambientLight intensity={0.65} />

      <directionalLight
        position={[3, 5, 4]}
        intensity={1.2}
      />

      <directionalLight
        position={[-3, 2, -3]}
        intensity={0.4}
      />

      <pointLight
        position={[0, 2.5, -2]}
        intensity={0.3}
        color="#C6F24E"
      />

      <Suspense fallback={null}>
        {modelUrl ? (
          <RealModel
            url={modelUrl}
            onLoaded={handleLoaded}
            onError={handleError}
            onFitData={handleFitData}
          />
        ) : (
          <AvatarPlaceholderModel />
        )}

        {avatarFitData && (
          <ClothingModel
            clothingModelUrl={clothingModelUrl}
            clothingObject={clothingObject}
            measurements={measurements}
            avatarFitData={avatarFitData}
          />
        )}
      </Suspense>
    </>
  );
}

// ============================================================
// CÂMERA
// ============================================================

function CameraController() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(
      ...CAMERA_POSITION,
    );

    camera.lookAt(
      ...CAMERA_TARGET,
    );
  }, [camera]);

  return null;
}

// ============================================================
// AVATAR VIEWER
// ============================================================

export function AvatarViewer({
  modelUrl,
  clothingModelUrl,
  clothingObject,
  measurements,
  className,
  showControls = true,
}: AvatarViewerProps) {
  const controlsRef =
    useRef<OrbitControlsImpl | null>(null);

  const [ready, setReady] =
    useState(!modelUrl);

  const [modelError, setModelError] =
    useState(false);

  useEffect(() => {
    setModelError(false);
    setReady(!modelUrl);
  }, [modelUrl]);

  // IMPORTANTE:
  // Não existe mais uma roupa padrão.
  //
  // O Viewer só carrega uma roupa quando o componente
  // pai informa explicitamente clothingModelUrl.
  //
  // Se clothingModelUrl for null ou undefined,
  // nenhuma roupa será carregada.
  //
  // clothingObject continua tendo suporte independente.

  const resolvedClothingModelUrl =
    clothingModelUrl ?? null;

  const handleAvatarLoaded = useCallback(() => {
    setReady(true);
    setModelError(false);

    console.log(
      'Avatar Tripo carregado e normalizado.',
    );
  }, []);

  const handleAvatarError = useCallback(() => {
    setReady(true);
    setModelError(true);
  }, []);

  const handleReset = () => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    controls.object.position.set(
      ...CAMERA_POSITION,
    );

    controls.target.set(
      ...CAMERA_TARGET,
    );

    controls.update();
  };

  const handleZoom = (
    direction: 1 | -1,
  ) => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    const camera = controls.object;

    const factor =
      direction === 1
        ? 0.85
        : 1.15;

    camera.position
      .sub(controls.target)
      .multiplyScalar(factor)
      .add(controls.target);

    controls.update();
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-b from-caiment-purple-50 to-white ${
        className ?? ''
      }`}
    >
      {!ready && !modelError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
          <LoadingState label="Carregando avatar..." />
        </div>
      )}

      {modelError ? (
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-3xl">
            ⚠️
          </div>

          <p className="text-sm font-medium text-caiment-ink">
            Não foi possível carregar o avatar 3D.
          </p>

          <p className="max-w-xs text-xs text-caiment-ink-soft">
            O avatar foi gerado, mas não foi possível
            entregar ou normalizar o modelo 3D.
          </p>
        </div>
      ) : (
        <ErrorBoundary
          fallback={
            <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-center">
              <p className="text-sm text-caiment-ink-soft">
                Erro inesperado no visualizador 3D.
              </p>
            </div>
          }
        >
          <Canvas
            dpr={1}
            frameloop="demand"
            shadows={false}
            gl={{
              antialias: false,
              powerPreference: 'low-power',
              preserveDrawingBuffer: false,
            }}
            camera={{
              position: CAMERA_POSITION,
              fov: 30,
            }}
          >
            <CameraController />

            <Scene
              modelUrl={modelUrl}
              clothingModelUrl={resolvedClothingModelUrl}
              clothingObject={clothingObject}
              measurements={measurements}
              onAvatarLoaded={handleAvatarLoaded}
              onAvatarError={handleAvatarError}
            />

            <OrbitControls
              ref={controlsRef}
              makeDefault
              enablePan={false}
              minDistance={3.2}
              maxDistance={8}
              minPolarAngle={Math.PI / 3.2}
              maxPolarAngle={Math.PI / 1.7}
              target={CAMERA_TARGET}
            />
          </Canvas>
        </ErrorBoundary>
      )}

      {showControls && !modelError && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full glass px-2 py-2">
          <button
            onClick={() => handleZoom(-1)}
            aria-label="Diminuir zoom"
            className="flex h-8 w-8 items-center justify-center rounded-full text-caiment-ink-soft hover:bg-white/70"
          >
            <ZoomOut size={15} />
          </button>

          <button
            onClick={handleReset}
            aria-label="Resetar câmera"
            className="flex h-8 w-8 items-center justify-center rounded-full text-caiment-ink-soft hover:bg-white/70"
          >
            <RotateCcw size={15} />
          </button>

          <button
            onClick={() => handleZoom(1)}
            aria-label="Aumentar zoom"
            className="flex h-8 w-8 items-center justify-center rounded-full text-caiment-ink-soft hover:bg-white/70"
          >
            <ZoomIn size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
