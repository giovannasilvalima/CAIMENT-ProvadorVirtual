
/*
============================================================
CAIMENT — AvatarViewer
============================================================

RESPONSABILIDADES:
- Carregar e renderizar o avatar Tripo.
- Normalizar o avatar para o sistema de coordenadas CAIMENT.
- Ajustar o avatar para 3,4 metros.
- Extrair landmarks diretamente da geometria do avatar.
- Recuperar e mapear as âncoras da roupa.
- Resolver o encaixe inicial.
- Aplicar escala uniforme e deformação localizada da roupa.
- Fazer a roupa acompanhar a curvatura do corpo.
- Preservar materiais, texturas e cores.
- Preservar os controles de visualização 3D.

NÃO UTILIZA:
- Manequim.
- Segmentação SAM 2.1.
- BodySupportModel.
- BodySurface.
- MediaPipe.
- BodyGeometryParameters.
- ClothSimulation.
- Shape Keys.
- GarmentAvatarAlignment.ts.

CONTRATO DE COORDENADAS:
- X = largura
- Y = altura
- Z = profundidade
- Frente = +Z
- Unidade = metros
- Origem = centro do chão do avatar

IMPORTANTE:
fit.clearance é preservado nos metadados.
A folga não é aplicada como deslocamento dos vértices.
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

import {
  Box3,
  Group,
  Mesh,
  Vector3,
} from 'three';

import type {
  BufferGeometry,
  Material,
  Object3D,
  Texture,
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

import {
  mapGarmentAnchorsToAvatar,
} from '@/features/clothing/geometry/GarmentAnchorMapping';

import {
  resolveGarmentFit,
} from '@/features/clothing/geometry/GarmentFitResolver';

import {
  positionGarmentGroupOnAvatar,
} from '@/features/clothing/geometry/GarmentPositioning';

import {
  applyGarmentDeformation,
} from '@/features/clothing/geometry/GarmentDeformation';

import type {
  BodyLandmarks,
  GarmentFitDefinition,
  GarmentType,
} from '@/features/clothing/geometry/types';

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
// DADOS DO AVATAR NORMALIZADO
// ============================================================

interface AvatarFitData {
  box: Box3;
  size: Vector3;
  center: Vector3;
  landmarks: Partial<BodyLandmarks>;
  inferredLandmarks: AvatarLandmarkName[];
  surface: Object3D;
}

// ============================================================
// CACHE DA NORMALIZAÇÃO
// ============================================================

interface AvatarNormalizationCache {
  model: Object3D;
  group: Object3D;
  fitData: AvatarFitData;
}

// ============================================================
// METADADOS DA ROUPA
// ============================================================

interface GarmentMetadata {
  fit: GarmentFitDefinition | null;
  garmentType: GarmentType | null;
}

// ============================================================
// CONSTANTES
// ============================================================

const AVATAR_TARGET_HEIGHT = 3.4;

const AVATAR_ROTATION_Y = -Math.PI / 2;

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

const VALID_GARMENT_TYPES: GarmentType[] = [
  'tshirt',
  'short',
  'dress',
  'pants',
];

// ============================================================
// LIBERAÇÃO DE RECURSOS THREE.JS
// ============================================================

function disposeObject3D(
  object: Object3D,
  disposeTextures = false,
): void {
  const disposedGeometries = new Set<BufferGeometry>();
  const disposedMaterials = new Set<Material>();
  const disposedTextures = new Set<Texture>();

  const disposeTextureValue = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return;
    }

    if ('isTexture' in value && value.isTexture === true) {
      const texture = value as Texture;

      if (!disposedTextures.has(texture)) {
        disposedTextures.add(texture);
        texture.dispose();
      }

      return;
    }

    if (Array.isArray(value)) {
      value.forEach(disposeTextureValue);
    }
  };

  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    if (
      child.geometry &&
      !disposedGeometries.has(child.geometry)
    ) {
      disposedGeometries.add(child.geometry);
      child.geometry.dispose();
    }

    if (!child.material) {
      return;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    materials.forEach((material) => {
      if (disposedMaterials.has(material)) {
        return;
      }

      disposedMaterials.add(material);

      if (disposeTextures) {
        const materialData = material as unknown as Record<
          string,
          unknown
        >;

        Object.values(materialData).forEach(
          disposeTextureValue,
        );
      }

      material.dispose();
    });
  });
}

// ============================================================
// CLONAGEM INDEPENDENTE DE OBJETOS
// ============================================================

/**
 * Clona hierarquia, geometrias e materiais.
 *
 * As texturas são compartilhadas porque não são modificadas
 * durante a visualização.
 *
 * Cores, mapas, roughness, metalness, transparência e demais
 * propriedades dos materiais são preservados.
 */
function cloneObjectWithResources(
  source: Object3D,
): Object3D {
  const clone = source.clone(true);

  const geometryClones = new Map<
    BufferGeometry,
    BufferGeometry
  >();

  const materialClones = new Map<
    Material,
    Material
  >();

  const cloneGeometry = (
    geometry: BufferGeometry,
  ): BufferGeometry => {
    const existing = geometryClones.get(geometry);

    if (existing) {
      return existing;
    }

    const cloned = geometry.clone();

    geometryClones.set(geometry, cloned);

    return cloned;
  };

  const cloneMaterial = (
    material: Material,
  ): Material => {
    const existing = materialClones.get(material);

    if (existing) {
      return existing;
    }

    const cloned = material.clone();

    materialClones.set(material, cloned);

    return cloned;
  };

  clone.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    if (child.geometry) {
      child.geometry = cloneGeometry(child.geometry);
    }

    if (child.material) {
      child.material = Array.isArray(child.material)
        ? child.material.map(cloneMaterial)
        : cloneMaterial(child.material);
    }
  });

  return clone;
}

// ============================================================
// URL DO MODELO DO AVATAR
// ============================================================

function getModelProxyUrl(
  modelUrl: string,
): string {
  return `/api/avatar/model?url=${encodeURIComponent(modelUrl)}`;
}

// ============================================================
// CONFIGURAÇÃO VISUAL DOS MESHES
// ============================================================

function prepareObjectForRendering(
  object: Object3D,
): void {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = false;
  });
}

// ============================================================
// VALIDAÇÃO DE OBJETOS
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
// NORMALIZAÇÃO DE VETORES
// ============================================================

function toVector3(
  value: unknown,
): Vector3 | null {
  if (value instanceof Vector3) {
    return value.clone();
  }

  if (!isRecord(value)) {
    return null;
  }

  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }

  return new Vector3(x, y, z);
}

// ============================================================
// OBTENÇÃO DA ALTURA REAL DO USUÁRIO
// ============================================================

function getUserHeightInMeters(
  measurements: unknown,
): number | null {
  if (!isRecord(measurements)) {
    return null;
  }

  const candidates: unknown[] = [
    measurements.altura,
    measurements.alturaTotal,
    measurements.height,
  ];

  const nestedMeasurements = [
    measurements.medidas,
    measurements.measurements,
    measurements.dados,
  ];

  for (const nested of nestedMeasurements) {
    if (!isRecord(nested)) {
      continue;
    }

    candidates.push(
      nested.altura,
      nested.alturaTotal,
      nested.height,
    );
  }

  for (const candidate of candidates) {
    let value: number;
    let unit: string | null = null;

    if (typeof candidate === 'number') {
      value = candidate;
    } else if (typeof candidate === 'string') {
      value = Number(candidate);
    } else if (isRecord(candidate)) {
      value = Number(
        candidate.valor ??
        candidate.value ??
        candidate.altura ??
        candidate.alturaTotal,
      );

      if (typeof candidate.unidade === 'string') {
        unit = candidate.unidade.toLowerCase().trim();
      } else if (typeof candidate.unit === 'string') {
        unit = candidate.unit.toLowerCase().trim();
      }
    } else {
      continue;
    }

    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
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
      unit === 'centímetros' ||
      unit === 'centimetros'
    ) {
      return value / 100;
    }

    if (value > 10) {
      return value / 100;
    }

    return value;
  }

  return null;
}

// ============================================================
// ESCALA UNIFORME DA ROUPA
// ============================================================

function calculateUniformGarmentScale(
  measurements: unknown,
): number {
  const userHeight = getUserHeightInMeters(
    measurements,
  );

  if (
    userHeight === null ||
    !Number.isFinite(userHeight) ||
    userHeight <= 0
  ) {
    console.warn(
      'Altura real do usuário não encontrada. A escala uniforme da roupa será 1.',
    );

    return 1;
  }

  const scale =
    AVATAR_TARGET_HEIGHT / userHeight;

  if (
    !Number.isFinite(scale) ||
    scale <= 0
  ) {
    console.warn(
      'Não foi possível calcular a escala uniforme da roupa.',
    );

    return 1;
  }

  return scale;
}

// ============================================================
// NORMALIZAÇÃO DO FIT DA ROUPA
// ============================================================

function normalizeGarmentFit(
  value: unknown,
): GarmentFitDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !Array.isArray(value.anchors) ||
    value.anchors.length === 0
  ) {
    return null;
  }

  const clearance = Number(value.clearance);

  if (
    !Number.isFinite(clearance) ||
    clearance < 0
  ) {
    return null;
  }

  const anchors: GarmentFitDefinition['anchors'] = [];

  for (const anchorValue of value.anchors) {
    if (!isRecord(anchorValue)) {
      return null;
    }

    const garmentPosition = toVector3(
      anchorValue.garmentPosition,
    );

    if (
      !garmentPosition ||
      typeof anchorValue.id !== 'string' ||
      typeof anchorValue.bodyLandmark !== 'string'
    ) {
      return null;
    }

    const weight = Number(anchorValue.weight);

    anchors.push({
      id: anchorValue.id,
      bodyLandmark: anchorValue.bodyLandmark as
        GarmentFitDefinition['anchors'][number]['bodyLandmark'],
      garmentPosition,
      ...(Number.isFinite(weight) && weight > 0
        ? { weight }
        : {}),
    });
  }

  const scale = toVector3(value.scale);

  return {
    ...value,
    clearance,
    anchors,
    ...(scale ? { scale } : {}),
  } as GarmentFitDefinition;
}

// ============================================================
// NORMALIZAÇÃO DO TIPO DA ROUPA
// ============================================================

function normalizeGarmentType(
  value: unknown,
): GarmentType | null {
  if (
    typeof value !== 'string' ||
    !VALID_GARMENT_TYPES.includes(value as GarmentType)
  ) {
    return null;
  }

  return value as GarmentType;
}

// ============================================================
// RECUPERAÇÃO DOS METADADOS DA ROUPA
// ============================================================

function getGarmentMetadata(
  object: Object3D,
): GarmentMetadata {
  let fit: GarmentFitDefinition | null = null;
  let garmentType: GarmentType | null = null;

  const inspectObject = (current: Object3D) => {
    const userData = current.userData ?? {};

    const meshData = isRecord(userData.meshData)
      ? userData.meshData
      : {};

    const rawFit =
      userData.garmentFit ??
      meshData.fit;

    const rawGarmentType =
      userData.garmentType ??
      meshData.garmentType;

    if (!fit && rawFit) {
      fit = normalizeGarmentFit(rawFit);
    }

    if (!garmentType && rawGarmentType) {
      garmentType = normalizeGarmentType(
        rawGarmentType,
      );
    }

    if (
      current instanceof Mesh &&
      current.geometry
    ) {
      const geometryData = current.geometry.userData ?? {};

      if (!fit && geometryData.garmentFit) {
        fit = normalizeGarmentFit(
          geometryData.garmentFit,
        );
      }

      if (!fit && geometryData.fit) {
        fit = normalizeGarmentFit(
          geometryData.fit,
        );
      }

      if (!garmentType && geometryData.garmentType) {
        garmentType = normalizeGarmentType(
          geometryData.garmentType,
        );
      }
    }
  };

  inspectObject(object);

  object.traverse((child) => {
    if (child !== object) {
      inspectObject(child);
    }
  });

  return {
    fit,
    garmentType,
  };
}

// ============================================================
// EXTRAÇÃO DOS LANDMARKS DO AVATAR
// ============================================================

function extractAvatarFitData(
  avatar: Object3D,
): AvatarFitData {
  avatar.updateMatrixWorld(true);

  const box = new Box3().setFromObject(avatar);

  const size = new Vector3();
  const center = new Vector3();

  box.getSize(size);
  box.getCenter(center);

  if (
    !Number.isFinite(size.x) ||
    !Number.isFinite(size.y) ||
    !Number.isFinite(size.z) ||
    size.y <= 0
  ) {
    throw new Error(
      'O avatar normalizado possui dimensões inválidas.',
    );
  }

  const extraction = extractAvatarLandmarks(avatar);

  const landmarks = extraction.landmarks as
    Partial<BodyLandmarks>;

  const inferredLandmarks = [
    ...extraction.inferred,
  ] as AvatarLandmarkName[];

  console.log(
    'LANDMARKS EXTRAÍDOS DO AVATAR TRIPO',
    {
      available: extraction.available,
      missing: extraction.missing,
      inferred: inferredLandmarks,
      landmarkCount: Object.keys(landmarks).length,
      avatarSize: {
        x: size.x,
        y: size.y,
        z: size.z,
      },
    },
  );

  return {
    box,
    size,
    center,
    landmarks,
    inferredLandmarks,
    surface: avatar,
  };
}

// ============================================================
// FILTRAGEM DAS ÂNCORAS DISPONÍVEIS
// ============================================================

function createPartialGarmentFit(
  fit: GarmentFitDefinition,
  landmarks: Partial<BodyLandmarks>,
): GarmentFitDefinition | null {
  const anchors = fit.anchors.filter((anchor) => {
    const landmark = landmarks[anchor.bodyLandmark];

    return (
      landmark !== undefined &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      Number.isFinite(landmark.z) &&
      Number.isFinite(anchor.weight ?? 1) &&
      (anchor.weight ?? 1) > 0
    );
  });

  if (anchors.length === 0) {
    return null;
  }

  return {
    ...fit,
    anchors,
  };
}

// ============================================================
// LOCALIZAÇÃO DA GEOMETRIA DE DEFORMAÇÃO
// ============================================================

/**
 * A deformação usa os índices de vértices de fit.regions.
 *
 * Por isso, não aplicamos o mesmo fit indiscriminadamente
 * a todos os meshes de um GLTF.
 *
 * Quando a roupa possui uma única malha montada, ela é o
 * alvo da deformação.
 *
 * Quando existem várias malhas, só são aceitas aquelas que
 * possuem seu próprio fit com regiões na geometria.
 */
function getDeformationTargets(
  clothing: Group,
): Mesh[] {
  const meshes: Mesh[] = [];

  clothing.traverse((child) => {
    if (
      child instanceof Mesh &&
      child.geometry?.attributes.position
    ) {
      meshes.push(child);
    }
  });

  if (meshes.length === 1) {
    return meshes;
  }

  return meshes.filter((mesh) => {
    const geometryData = mesh.geometry.userData ?? {};

    const geometryFit =
      normalizeGarmentFit(
        geometryData.garmentFit ?? geometryData.fit,
      );

    return Boolean(
      geometryFit &&
      Array.isArray(
        (geometryFit as unknown as Record<string, unknown>).regions,
      ),
    );
  });
}

// ============================================================
// DEFORMAÇÃO DA ROUPA
// ============================================================

/**
 * Aplica o deformador existente do CAIMENT.
 *
 * Importante:
 * applyGarmentDeformation já incorpora a escala uniforme
 * e a translação na geometria retornada.
 *
 * Portanto, depois da deformação, o grupo não recebe
 * novamente a escala ou a translação do resolver.
 */
function deformClothingForAvatar(
  clothing: Group,
  fit: GarmentFitDefinition,
  landmarks: Partial<BodyLandmarks>,
  uniformScale: number,
): boolean {
  const targets = getDeformationTargets(clothing);

  if (targets.length === 0) {
    console.warn(
      'Não foi encontrada uma geometria compatível com a deformação. Será utilizado o posicionamento por âncoras.',
    );

    return false;
  }

  const deformationFit = {
    ...fit,

    // A folga permanece nos metadados originais.
    // Não deve deslocar os vértices durante esta operação.
    clearance: 0,
  } as GarmentFitDefinition;

  let successfulMeshes = 0;

  for (const mesh of targets) {
    const sourceGeometry = mesh.geometry;

    try {
      const result = applyGarmentDeformation(
        sourceGeometry,
        deformationFit,
        landmarks as BodyLandmarks,
        {
          uniformScale,
          strength: 1,
        },
      );

      if (
        !result.geometry ||
        !result.geometry.attributes.position
      ) {
        throw new Error(
          'O deformador não retornou uma geometria válida.',
        );
      }

      // A geometria original já é uma cópia independente
      // criada por cloneObjectWithResources.
      mesh.geometry = result.geometry;

      // Mantém os metadados originais do encaixe.
      mesh.geometry.userData.garmentFit = fit;
      mesh.geometry.userData.garmentType =
        mesh.geometry.userData.garmentType ??
        clothing.userData.garmentType;

      // Libera a geometria substituída.
      sourceGeometry.dispose();

      mesh.userData.garmentDeformationApplied = true;

      mesh.userData.garmentDeformation = {
        deformedVertexCount: result.deformedVertexCount,
        maximumDisplacement: result.maximumDisplacement,
        averageDisplacement: result.averageDisplacement,
        scale: result.scale,
        translation: result.translation.toArray(),
        clearanceApplied: false,
      };

      successfulMeshes++;

      console.log(
        'DEFORMAÇÃO DA ROUPA CONCLUÍDA',
        {
          mesh: mesh.name,
          deformedVertexCount: result.deformedVertexCount,
          maximumDisplacement: result.maximumDisplacement,
          averageDisplacement: result.averageDisplacement,
          scale: result.scale,
          translation: result.translation.toArray(),
        },
      );
    } catch (error) {
      console.error(
        `Não foi possível deformar a malha "${mesh.name}":`,
        error,
      );
    }
  }

  return successfulMeshes > 0;
}

// ============================================================
// POSICIONAMENTO GEOMÉTRICO DA ROUPA
// ============================================================

function positionClothingForAvatar(
  clothing: Group,
  avatarFitData: AvatarFitData,
  measurements: unknown,
): boolean {
  const {
    fit,
    garmentType,
  } = getGarmentMetadata(clothing);

  if (!fit) {
    console.warn(
      'Roupa sem garmentFit válido. Geometria original preservada.',
      {
        objectName: clothing.name,
      },
    );

    return false;
  }

  if (!garmentType) {
    console.warn(
      'Roupa sem garmentType válido. Posicionamento não aplicado.',
      {
        objectName: clothing.name,
      },
    );

    return false;
  }

  const landmarks = avatarFitData.landmarks;

  if (Object.keys(landmarks).length === 0) {
    console.warn(
      'Nenhum landmark foi extraído do avatar.',
    );

    return false;
  }

  try {
    // --------------------------------------------------------
    // 1. ESCALA UNIFORME
    // --------------------------------------------------------

    const userHeightMeters =
      getUserHeightInMeters(measurements);

    const uniformScale =
      calculateUniformGarmentScale(measurements);

    // --------------------------------------------------------
    // 2. FILTRAR ÂNCORAS DISPONÍVEIS
    // --------------------------------------------------------

    const partialFit = createPartialGarmentFit(
      fit,
      landmarks,
    );

    if (!partialFit) {
      console.warn(
        'Nenhuma âncora da roupa possui landmark correspondente no avatar.',
        {
          garmentType,
          garmentAnchors: fit.anchors.map(
            (anchor) => anchor.bodyLandmark,
          ),
          availableLandmarks: Object.keys(landmarks),
        },
      );

      return false;
    }

    // --------------------------------------------------------
    // 3. MAPEAR ÂNCORAS PARA O AVATAR
    // --------------------------------------------------------

    const mapping = mapGarmentAnchorsToAvatar(
      garmentType,
      partialFit,
      landmarks as BodyLandmarks,
      {
        allowPartial: true,
        allowInferredLandmarks: true,
        inferredLandmarks:
          avatarFitData.inferredLandmarks,
      },
    );

    if (mapping.mappedCount === 0) {
      console.warn(
        'Nenhuma âncora da roupa pôde ser associada ao avatar.',
        {
          garmentType,
          missingLandmarks: mapping.missingLandmarks,
        },
      );

      return false;
    }

    // --------------------------------------------------------
    // 4. RESOLVER ENCAIXE
    // --------------------------------------------------------

    const resolution = resolveGarmentFit(
      partialFit,
      mapping,
      {
        allowPartialMapping: true,
        uniformScale,
      },
    );

    if (!resolution.valid) {
      console.warn(
        'Não foi possível resolver o encaixe da roupa.',
        resolution.errors,
      );

      return false;
    }

    // --------------------------------------------------------
    // 5. APLICAR DEFORMAÇÃO LOCAL
    // --------------------------------------------------------

    const deformationApplied =
      deformClothingForAvatar(
        clothing,
        partialFit,
        landmarks,
        uniformScale,
      );

    if (deformationApplied) {
      /**
       * O deformador já aplicou escala e translação
       * diretamente na geometria.
       *
       * Não aplicamos novamente a transformação ao grupo.
       */
      clothing.scale.set(1, 1, 1);
      clothing.position.set(0, 0, 0);

      clothing.updateMatrix();
      clothing.updateMatrixWorld(true);
    } else {
      /**
       * Alternativa para geometrias sem regiões compatíveis:
       * posicionamento convencional por escala uniforme
       * e translação.
       */
      positionGarmentGroupOnAvatar(
        clothing,
        partialFit,
        landmarks as BodyLandmarks,
        {
          uniformScale,
          translation: resolution.translation.clone(),
          calculateScale: true,
          calculateTranslation: true,
          applyLocalDeformation: false,
        },
      );

      clothing.updateMatrixWorld(true);
    }

    // --------------------------------------------------------
    // 6. REGISTRAR RESULTADO
    // --------------------------------------------------------

    const requestedClearance = fit.clearance;

    const scaledClearance =
      requestedClearance * uniformScale;

    clothing.userData.garmentDeformationApplied =
      deformationApplied;

    clothing.userData.garmentPositioningApplied = true;
    clothing.userData.avatarFitApplied = true;
    clothing.userData.bodyLandmarksSource = 'avatar_tripo';

    clothing.userData.surfaceClearanceApplied = false;

    clothing.userData.garmentPositioning = {
      garmentType,

      anchorCount: mapping.mappedCount,
      completeMapping: resolution.completeMapping,

      uniformScale,
      userHeightMeters,

      scale: clothing.scale.toArray(),
      translation: clothing.position.toArray(),

      resolverTranslation: {
        x: resolution.translation.x,
        y: resolution.translation.y,
        z: resolution.translation.z,
      },

      weightedResidual: resolution.weightedResidual,
      maximumResidual: resolution.maximumResidual,

      localDeformationApplied: deformationApplied,

      clearance: {
        requested: requestedClearance,
        scaled: scaledClearance,
        applied: false,
        strategy: 'metadata_only',
      },
    };

    console.log(
      'POSICIONAMENTO DA ROUPA CONCLUÍDO',
      {
        garmentType,

        anchorCount: mapping.mappedCount,
        completeMapping: resolution.completeMapping,

        uniformScale,
        userHeightMeters,

        scale: clothing.scale.toArray(),
        translation: clothing.position.toArray(),

        weightedResidual: resolution.weightedResidual,
        maximumResidual: resolution.maximumResidual,

        localDeformationApplied: deformationApplied,

        clearance: {
          requested: requestedClearance,
          scaled: scaledClearance,
          applied: false,
        },
      },
    );

    return true;
  } catch (error) {
    console.error(
      'Erro ao posicionar a roupa no avatar:',
      error,
    );

    return false;
  }
}

// ============================================================
// CARREGAMENTO DO AVATAR
// ============================================================

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

  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const handleModelError = useCallback(
    (error: unknown) => {
      onErrorRef.current?.(error);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let loadedModel: Object3D | null = null;

    setModel(null);

    if (!url) {
      onErrorRef.current?.(
        new Error('URL do avatar está vazia.'),
      );

      return;
    }

    const proxyUrl = getModelProxyUrl(url);
    const loader = new GLTFLoader();

    loader.load(
      proxyUrl,

      (gltf) => {
        const avatar = gltf.scene;

        if (cancelled) {
          disposeObject3D(avatar, true);
          return;
        }

        let meshCount = 0;

        avatar.traverse((child) => {
          if (child instanceof Mesh) {
            meshCount++;
          }
        });

        if (meshCount === 0) {
          disposeObject3D(avatar, true);

          onErrorRef.current?.(
            new Error(
              'O modelo 3D do avatar não possui meshes.',
            ),
          );

          return;
        }

        prepareObjectForRendering(avatar);

        loadedModel = avatar;
        setModel(avatar);
      },

      undefined,

      (error) => {
        if (cancelled) {
          return;
        }

        console.error(
          'Erro ao carregar avatar:',
          error,
        );

        onErrorRef.current?.(error);
      },
    );

    return () => {
      cancelled = true;

      if (loadedModel) {
        disposeObject3D(loadedModel, true);
        loadedModel = null;
      }
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
      onError={handleModelError}
    />
  );
}

// ============================================================
// NORMALIZAÇÃO DO AVATAR PARA O SISTEMA CAIMENT
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
  const [normalizedAvatar, setNormalizedAvatar] =
    useState<Object3D | null>(null);

  const callbacksRef = useRef({
    onFitData,
    onLoaded,
    onError,
  });

  useEffect(() => {
    callbacksRef.current = {
      onFitData,
      onLoaded,
      onError,
    };
  }, [
    onFitData,
    onLoaded,
    onError,
  ]);

  const normalizationCacheRef =
    useRef<AvatarNormalizationCache | null>(null);

  useEffect(() => {
    let cancelled = false;

    setNormalizedAvatar(null);

    const publishFitData = (
      fitData: AvatarFitData,
    ) => {
      Promise.resolve().then(() => {
        if (cancelled) {
          return;
        }

        callbacksRef.current.onFitData?.(fitData);
        callbacksRef.current.onLoaded?.();
      });
    };

    try {
      const cached = normalizationCacheRef.current;

      // ------------------------------------------------------
      // 1. REUTILIZAR NORMALIZAÇÃO EXISTENTE
      // ------------------------------------------------------

      if (cached?.model === model) {
        setNormalizedAvatar(cached.group);
        publishFitData(cached.fitData);

        return () => {
          cancelled = true;
        };
      }

      // ------------------------------------------------------
      // 2. NORMALIZAR MODELO
      // ------------------------------------------------------

      model.rotation.set(
        0,
        AVATAR_ROTATION_Y,
        0,
      );

      model.updateMatrixWorld(true);

      const normalized = normalizeAvatarCoordinateSystem(
        model,
        {
          targetHeight: AVATAR_TARGET_HEIGHT,
          centerHorizontally: true,
          placeOnGround: true,
        },
      );

      normalized.group.updateMatrixWorld(true);

      // ------------------------------------------------------
      // 3. EXTRAIR LANDMARKS
      // ------------------------------------------------------

      const fitData = extractAvatarFitData(
        normalized.group,
      );

      if (cancelled) {
        return;
      }

      // ------------------------------------------------------
      // 4. REGISTRAR NO CACHE
      // ------------------------------------------------------

      normalizationCacheRef.current = {
        model,
        group: normalized.group,
        fitData,
      };

      console.log(
        'AVATAR NORMALIZADO PARA O CAIMENT',
        {
          originalRotationY: AVATAR_ROTATION_Y,
          targetHeight: AVATAR_TARGET_HEIGHT,

          unitScale: normalized.unitScale,
          modelScale: normalized.modelScale,

          finalSize: {
            x: normalized.size.x,
            y: normalized.size.y,
            z: normalized.size.z,
          },

          finalCenter: {
            x: normalized.center.x,
            y: normalized.center.y,
            z: normalized.center.z,
          },

          floorY: normalized.bounds.min.y,

          landmarkCount: Object.keys(
            fitData.landmarks,
          ).length,
        },
      );

      // ------------------------------------------------------
      // 5. ATUALIZAR E PUBLICAR
      // ------------------------------------------------------

      setNormalizedAvatar(normalized.group);
      publishFitData(fitData);
    } catch (error) {
      if (cancelled) {
        return;
      }

      console.error(
        'Erro ao normalizar o avatar ou extrair landmarks:',
        error,
      );

      callbacksRef.current.onError?.(error);
    }

    return () => {
      cancelled = true;
    };
  }, [model]);

  if (!normalizedAvatar) {
    return null;
  }

  return (
    <primitive object={normalizedAvatar} />
  );
}

// ============================================================
// CARREGAMENTO E POSICIONAMENTO DA ROUPA
// ============================================================

function ClothingModel({
  url,
  clothingObject,
  avatarFitData,
  measurements,
}: {
  url?: string | null;
  clothingObject?: Object3D | null;
  avatarFitData: AvatarFitData;
  measurements?: unknown;
}) {
  const [model, setModel] =
    useState<Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;

    let ownedModel: Object3D | null = null;
    let ownsTextures = false;

    setModel(null);

    console.log(
      'CAIMENT DEBUG: ClothingModel effect iniciado',
      {
        hasClothingObject: !!clothingObject,
        hasAvatarFitData: !!avatarFitData,
        hasMeasurements: !!measurements,
        url,
      },
    );

    // --------------------------------------------------------
    // OPÇÃO 1: OBJETO DO PIPELINE CAIMENT
    // --------------------------------------------------------

    if (clothingObject) {
      try {
        console.log(
          'CAIMENT DEBUG: iniciando clonagem da roupa',
          {
            name: clothingObject.name,
          },
        );

        const clonedObject =
          cloneObjectWithResources(clothingObject);

        prepareObjectForRendering(clonedObject);

        const clothingGroup =
          clonedObject instanceof Group
            ? clonedObject
            : new Group();

        if (clothingGroup !== clonedObject) {
          clothingGroup.add(clonedObject);
        }

        console.log(
          'CAIMENT DEBUG: iniciando posicionamento da roupa',
          {
            name: clothingGroup.name,
            userData: clothingGroup.userData,
          },
        );

        positionClothingForAvatar(
          clothingGroup,
          avatarFitData,
          measurements,
        );

        if (cancelled) {
          disposeObject3D(clothingGroup, false);
          return;
        }

        ownedModel = clothingGroup;
        setModel(clothingGroup);
      } catch (error) {
        console.error(
          'Erro ao clonar ou preparar a roupa do CAIMENT:',
          error,
        );
      }

      return () => {
        cancelled = true;

        if (ownedModel) {
          disposeObject3D(ownedModel, false);
          ownedModel = null;
        }
      };
    }

    // --------------------------------------------------------
    // OPÇÃO 2: CARREGAMENTO DA ROUPA POR URL
    // --------------------------------------------------------

    if (!url) {
      console.warn(
        'ClothingModel: nenhum objeto ou URL de roupa foi recebido.',
      );

      return () => {
        cancelled = true;
      };
    }

    const loader = new GLTFLoader();

    loader.load(
      url,

      (gltf) => {
        const clothing = gltf.scene;

        if (cancelled) {
          disposeObject3D(clothing, true);
          return;
        }

        try {
          prepareObjectForRendering(clothing);

          const clothingGroup = new Group();

          clothingGroup.add(clothing);

          positionClothingForAvatar(
            clothingGroup,
            avatarFitData,
            measurements,
          );

          ownedModel = clothingGroup;
          ownsTextures = true;

          setModel(clothingGroup);
        } catch (error) {
          console.error(
            'Erro ao preparar ou posicionar o modelo da roupa:',
            error,
          );

          disposeObject3D(clothing, true);
        }
      },

      undefined,

      (error) => {
        if (cancelled) {
          return;
        }

        console.error(
          'Erro ao carregar modelo da roupa:',
          error,
        );
      },
    );

    return () => {
      cancelled = true;

      if (ownedModel) {
        disposeObject3D(
          ownedModel,
          ownsTextures,
        );

        ownedModel = null;
      }
    };
  }, [
    url,
    clothingObject,
    avatarFitData,
    measurements,
  ]);

  if (!model) {
    return null;
  }

  return (
    <group>
      <primitive object={model} />
    </group>
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

  const handleAvatarFitData = useCallback(
    (data: AvatarFitData) => {
      setAvatarFitData(data);
    },
    [],
  );

  const handleAvatarLoaded = useCallback(() => {
    onAvatarLoaded();
  }, [onAvatarLoaded]);

  const handleAvatarError = useCallback(() => {
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
            onLoaded={handleAvatarLoaded}
            onError={handleAvatarError}
            onFitData={handleAvatarFitData}
          />
        ) : (
          <AvatarPlaceholderModel />
        )}

        {avatarFitData && (
          <ClothingModel
            url={clothingModelUrl}
            clothingObject={clothingObject}
            avatarFitData={avatarFitData}
            measurements={measurements}
          />
        )}
      </Suspense>
    </>
  );
}

// ============================================================
// CONTROLE DA CÂMERA
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

  // ----------------------------------------------------------
  // ESTADO DO AVATAR
  // ----------------------------------------------------------

  useEffect(() => {
    setModelError(false);
    setReady(!modelUrl);

    console.log(
      'AvatarViewer modelUrl:',
      modelUrl,
    );
  }, [modelUrl]);

  // ----------------------------------------------------------
  // CALLBACKS DO AVATAR
  // ----------------------------------------------------------

  const handleAvatarLoaded = useCallback(() => {
    setReady(true);
    setModelError(false);

    console.log(
      'Avatar carregado e normalizado.',
    );
  }, []);

  const handleAvatarError = useCallback(() => {
    setReady(true);
    setModelError(true);

    console.error(
      'Falha ao carregar ou normalizar o avatar.',
    );
  }, []);

  // ----------------------------------------------------------
  // RESET DA CÂMERA
  // ----------------------------------------------------------

  const handleReset = () => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    const camera = controls.object;

    camera.position.set(
      ...CAMERA_POSITION,
    );

    controls.target.set(
      ...CAMERA_TARGET,
    );

    controls.update();
  };

  // ----------------------------------------------------------
  // ZOOM
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // RENDERIZAÇÃO
  // ----------------------------------------------------------

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
            entregar ou normalizar o modelo 3D no visualizador.
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
            onCreated={() => {
              console.log(
                'Canvas criado.',
              );
            }}
          >
            <CameraController />

            <Scene
              modelUrl={modelUrl}
              clothingModelUrl={clothingModelUrl}
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
