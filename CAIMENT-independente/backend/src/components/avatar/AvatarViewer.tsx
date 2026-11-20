
/*
============================================================
CAIMENT — AvatarViewer
============================================================

ÚNICA ALTERAÇÃO:
- Deslocar a roupa para frente no eixo Z (+Z).

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
}

interface HorizontalBounds {
  width: number;
  depth: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// ============================================================
// CONSTANTES
// ============================================================

const AVATAR_TARGET_HEIGHT = 3.4;

const AVATAR_ROTATION_Y = -Math.PI / 2;

// Deslocamento da roupa para frente.
// Frente do avatar = +Z.
const CLOTHING_FORWARD_OFFSET = 0.1;

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
// VALIDAÇÃO DE DADOS
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
// EXTRAÇÃO DOS REGISTROS DE MEDIDAS CORPORAIS
// ============================================================

function getMeasurementRecords(
  measurements: unknown,
): Record<string, unknown>[] {
  if (!isRecord(measurements)) {
    return [];
  }

  const records: Record<string, unknown>[] = [
    measurements,
  ];

  const nestedKeys = [
    'medidas',
    'measurements',
    'dados',
  ];

  for (const key of nestedKeys) {
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
          candidate.valor ??
          candidate.value,
        );

        if (typeof candidate.unidade === 'string') {
          unit = candidate.unidade.toLowerCase();
        } else if (typeof candidate.unit === 'string') {
          unit = candidate.unit.toLowerCase();
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
// EXTRAÇÃO DOS LANDMARKS
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

  for (const [name, value] of Object.entries(
    extraction.landmarks,
  )) {
    if (value instanceof THREE.Vector3) {
      landmarks[name] = value.clone();
    }
  }

  const inferredLandmarks = [
    ...extraction.inferred,
  ] as AvatarLandmarkName[];

  console.log(
    'LANDMARKS DO AVATAR',
    {
      available: extraction.available,
      missing: extraction.missing,
      inferred: inferredLandmarks,
      landmarkCount: Object.keys(landmarks).length,
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
// ESCALA PROPORCIONAL DA ROUPA
// ============================================================

function applyGarmentScale(
  garment: Object3D,
  measurements: unknown,
): number {
  if (
    garment.userData.avatarScaleApplied === true
  ) {
    return Number(
      garment.userData.uniformScale ?? 1,
    );
  }

  const userHeight = getUserHeightInMeters(
    measurements,
  );

  if (
    userHeight === null ||
    userHeight <= 0
  ) {
    console.warn(
      'Altura corporal não encontrada. A escala original da roupa será preservada.',
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
      'Fator de escala inválido. A escala original da roupa será preservada.',
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
// IDENTIFICAÇÃO DO TIPO DA ROUPA
// ============================================================

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

    const normalized = candidate
      .toLowerCase()
      .trim()
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
        'calças',
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
  }

  return 'tshirt';
}

// ============================================================
// REFERÊNCIA ANATÔMICA HORIZONTAL
// ============================================================

function getHorizontalReference(
  garmentType: string,
  fitData: AvatarFitData,
): {
  anchor: THREE.Vector3;
  left: THREE.Vector3 | null;
  right: THREE.Vector3 | null;
} | null {
  switch (garmentType) {
    case 'tshirt': {
      const anchor = getLandmark(
        fitData,
        [
          'bustCenter',
          'shoulderCenter',
          'neckBase',
        ],
      );

      if (!anchor) {
        return null;
      }

      return {
        anchor,
        left: getLandmark(
          fitData,
          ['leftShoulder'],
        ),
        right: getLandmark(
          fitData,
          ['rightShoulder'],
        ),
      };
    }

    case 'short':
    case 'pants': {
      const anchor = getLandmark(
        fitData,
        [
          'hipCenter',
          'waistCenter',
        ],
      );

      if (!anchor) {
        return null;
      }

      return {
        anchor,
        left: getLandmark(
          fitData,
          ['leftHip'],
        ),
        right: getLandmark(
          fitData,
          ['rightHip'],
        ),
      };
    }

    case 'dress': {
      const anchor = getLandmark(
        fitData,
        [
          'bustCenter',
          'shoulderCenter',
          'neckBase',
        ],
      );

      if (!anchor) {
        return null;
      }

      return {
        anchor,
        left: getLandmark(
          fitData,
          ['leftShoulder'],
        ),
        right: getLandmark(
          fitData,
          ['rightShoulder'],
        ),
      };
    }

    default:
      return null;
  }
}

// ============================================================
// DIMENSÕES DA SUPERFÍCIE DO AVATAR EM UMA ALTURA
// ============================================================

function getAvatarHorizontalSlice(
  fitData: AvatarFitData,
  centerY: number,
): HorizontalBounds | null {
  const verticalTolerance = Math.max(
    0.045,
    fitData.size.y * 0.018,
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const vertex = new THREE.Vector3();

  fitData.surface.updateMatrixWorld(true);

  fitData.surface.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const position = child.geometry.getAttribute(
      'position',
    );

    if (!position) {
      return;
    }

    const stride = Math.max(
      1,
      Math.floor(position.count / 30000),
    );

    for (
      let index = 0;
      index < position.count;
      index += stride
    ) {
      vertex.fromBufferAttribute(
        position,
        index,
      );

      vertex.applyMatrix4(
        child.matrixWorld,
      );

      if (
        Math.abs(vertex.y - centerY) >
        verticalTolerance
      ) {
        continue;
      }

      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
    }
  });

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxZ)
  ) {
    return null;
  }

  const width = maxX - minX;
  const depth = maxZ - minZ;

  if (
    width <= 0 ||
    depth <= 0
  ) {
    return null;
  }

  return {
    width,
    depth,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

// ============================================================
// AJUSTE HORIZONTAL X/Z DA ROUPA
// ============================================================

function applyGarmentHorizontalFit(
  garment: Object3D,
  fitData: AvatarFitData,
): {
  scaleX: number;
  scaleZ: number;
  targetWidth: number;
  targetDepth: number;
} | null {
  if (
    garment.userData.avatarHorizontalFitApplied === true
  ) {
    return null;
  }

  const garmentType = getGarmentType(
    garment,
  );

  const reference = getHorizontalReference(
    garmentType,
    fitData,
  );

  if (!reference) {
    console.warn(
      'Não foi possível calcular o ajuste X/Z: landmark horizontal ausente.',
      garmentType,
    );

    return null;
  }

  garment.updateMatrixWorld(true);

  const originalBox = new THREE.Box3().setFromObject(
    garment,
  );

  if (originalBox.isEmpty()) {
    return null;
  }

  const originalSize = new THREE.Vector3();

  originalBox.getSize(originalSize);

  if (
    originalSize.x <= 0 ||
    originalSize.z <= 0
  ) {
    console.warn(
      'A roupa possui largura ou profundidade inválida.',
      originalSize.toArray(),
    );

    return null;
  }

  let targetWidth: number | null = null;

  if (
    reference.left &&
    reference.right
  ) {
    targetWidth = Math.abs(
      reference.right.x - reference.left.x,
    );
  }

  const avatarSlice = getAvatarHorizontalSlice(
    fitData,
    reference.anchor.y,
  );

  if (
    targetWidth === null ||
    !Number.isFinite(targetWidth) ||
    targetWidth <= 0
  ) {
    targetWidth = avatarSlice?.width ?? null;
  }

  const targetDepth = avatarSlice?.depth ?? null;

  if (
    targetWidth === null ||
    targetDepth === null ||
    targetWidth <= 0 ||
    targetDepth <= 0
  ) {
    console.warn(
      'Não foi possível obter as dimensões horizontais do avatar.',
      {
        garmentType,
        targetWidth,
        targetDepth,
        avatarSlice,
      },
    );

    return null;
  }

  const scaleX = targetWidth / originalSize.x;
  const scaleZ = targetDepth / originalSize.z;

  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleZ) ||
    scaleX <= 0 ||
    scaleZ <= 0
  ) {
    console.warn(
      'Fatores de escala horizontal inválidos.',
      {
        scaleX,
        scaleZ,
      },
    );

    return null;
  }

  garment.scale.x *= scaleX;
  garment.scale.z *= scaleZ;

  garment.userData.avatarHorizontalFitApplied = true;

  garment.userData.horizontalFit = {
    garmentType,
    scaleX,
    scaleZ,
    targetWidth,
    targetDepth,
    originalWidth: originalSize.x,
    originalDepth: originalSize.z,
    verticalScalePreserved: true,
  };

  garment.updateMatrix();
  garment.updateMatrixWorld(true);

  console.log(
    'AJUSTE HORIZONTAL DA ROUPA',
    {
      garmentType,
      avatarWidthX: targetWidth,
      avatarDepthZ: targetDepth,
      originalGarmentWidthX: originalSize.x,
      originalGarmentDepthZ: originalSize.z,
      scaleX,
      scaleZ,
      finalScale: garment.scale.toArray(),
    },
  );

  return {
    scaleX,
    scaleZ,
    targetWidth,
    targetDepth,
  };
}

// ============================================================
// POSICIONAMENTO DA ROUPA NO AVATAR
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
      'Não foi possível posicionar a roupa: geometria vazia.',
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
      'Não foi possível posicionar a roupa: altura inválida.',
    );

    return false;
  }

  const garmentType = getGarmentType(garment);

  let verticalAnchor: THREE.Vector3 | null = null;
  let horizontalAnchor: THREE.Vector3 | null = null;
  let depthAnchor: THREE.Vector3 | null = null;

  switch (garmentType) {
    case 'tshirt': {
      verticalAnchor = getLandmark(
        fitData,
        [
          'shoulderCenter',
          'neckBase',
        ],
      );

      horizontalAnchor = getLandmark(
        fitData,
        [
          'shoulderCenter',
          'neckBase',
        ],
      );

      depthAnchor = getLandmark(
        fitData,
        [
          'bustCenter',
          'shoulderCenter',
          'bodyCenter',
        ],
      );

      break;
    }

    case 'short': {
      verticalAnchor = getLandmark(
        fitData,
        [
          'waistCenter',
          'hipCenter',
        ],
      );

      horizontalAnchor = getLandmark(
        fitData,
        [
          'hipCenter',
          'waistCenter',
        ],
      );

      depthAnchor = getLandmark(
        fitData,
        [
          'hipCenter',
          'crotchCenter',
        ],
      );

      break;
    }

    case 'pants': {
      verticalAnchor = getLandmark(
        fitData,
        [
          'waistCenter',
          'hipCenter',
        ],
      );

      horizontalAnchor = getLandmark(
        fitData,
        [
          'hipCenter',
          'waistCenter',
        ],
      );

      depthAnchor = getLandmark(
        fitData,
        [
          'hipCenter',
          'crotchCenter',
        ],
      );

      break;
    }

    case 'dress': {
      verticalAnchor = getLandmark(
        fitData,
        [
          'neckBase',
          'shoulderCenter',
        ],
      );

      horizontalAnchor = getLandmark(
        fitData,
        [
          'shoulderCenter',
          'neckBase',
        ],
      );

      depthAnchor = getLandmark(
        fitData,
        [
          'bustCenter',
          'bodyCenter',
        ],
      );

      break;
    }

    default:
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

  const targetPosition = new THREE.Vector3(
    horizontalAnchor.x,
    verticalAnchor.y,
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

  garment.position.add(translation);

  // ÚNICA ALTERAÇÃO:
  // desloca a peça para frente no eixo Z positivo.
  garment.position.z += CLOTHING_FORWARD_OFFSET;

  garment.updateMatrix();
  garment.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(
    garment,
  );

  console.log(
    'ROUPA POSICIONADA NO AVATAR',
    {
      garmentType,
      forwardOffset: CLOTHING_FORWARD_OFFSET,
      targetPosition: [
        horizontalAnchor.x,
        verticalAnchor.y,
        depthAnchor.z,
      ],
      translation: translation.toArray(),
      garmentSize: garmentSize.toArray(),
      finalPosition: garment.position.toArray(),
      finalBounds: {
        min: finalBox.min.toArray(),
        max: finalBox.max.toArray(),
      },
    },
  );

  garment.userData.avatarPositionApplied = true;
  garment.userData.avatarPositionType = garmentType;

  return true;
}

// ============================================================
// PREPARAÇÃO DOS MATERIAIS
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
// ROUPA RECEBIDA DO FITTING ROOM
// ============================================================

function ClothingModel({
  clothingObject,
  measurements,
  avatarFitData,
}: {
  clothingObject: Object3D;
  measurements?: unknown;
  avatarFitData: AvatarFitData;
}) {
  const [garment, setGarment] =
    useState<Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;

    setGarment(null);

    try {
      console.log(
        'OBJETO DE ROUPA RECEBIDO DO FITTING ROOM:',
        clothingObject,
      );

      const generated = clothingObject.clone(true);

      prepareObjectForRendering(generated);

      const uniformScale = applyGarmentScale(
        generated,
        measurements,
      );

      const horizontalFit = applyGarmentHorizontalFit(
        generated,
        avatarFitData,
      );

      const positioned = positionGarmentOnAvatar(
        generated,
        avatarFitData,
      );

      generated.userData.isDemonstrationGarment = true;

      generated.updateMatrixWorld(true);

      if (cancelled) {
        return;
      }

      setGarment(generated);

      console.log(
        'ROUPA DO FITTING ROOM CARREGADA:',
        {
          object: generated,
          uniformScale,
          horizontalFit,
          positioned,
          position: generated.position.toArray(),
          rotation: generated.rotation.toArray(),
          objectScale: generated.scale.toArray(),
          children: generated.children.length,
          garmentType: getGarmentType(generated),
        },
      );
    } catch (error) {
      console.error(
        'Erro ao carregar ou posicionar a roupa:',
        error,
      );
    }

    return () => {
      cancelled = true;
    };
  }, [
    clothingObject,
    measurements,
    avatarFitData,
  ]);

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
  clothingObject,
  measurements,
  onAvatarLoaded,
  onAvatarError,
}: {
  modelUrl?: string | null;
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

        {avatarFitData && clothingObject ? (
          <ClothingModel
            clothingObject={clothingObject}
            measurements={measurements}
            avatarFitData={avatarFitData}
          />
        ) : null}
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
  clothingModelUrl: _clothingModelUrl,
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
