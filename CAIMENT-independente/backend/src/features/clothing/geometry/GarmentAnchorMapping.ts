
import * as THREE from 'three';

import type {
  GarmentAnchor,
  GarmentFitDefinition,
  GarmentType,
} from './types';

import type {
  AvatarLandmarkMap,
  AvatarLandmarkName,
} from './AvatarLandmarks';

export interface GarmentAnchorMappingOptions {
  allowPartial?: boolean;
  weightMultiplier?: number;
  allowInferredLandmarks?: boolean;
  inferredLandmarks?: AvatarLandmarkName[];
}

export interface MappedGarmentAnchor {
  id: string;
  bodyLandmark: AvatarLandmarkName;
  garmentPosition: THREE.Vector3;
  avatarPosition: THREE.Vector3;
  offset: THREE.Vector3;
  weight: number;
  inferred: boolean;
}

export interface GarmentAnchorMappingResult {
  anchors: MappedGarmentAnchor[];
  mappedCount: number;
  missingLandmarks: AvatarLandmarkName[];
  inferredLandmarks: AvatarLandmarkName[];
  coverage: GarmentFitDefinition['coverage'];
  valid: boolean;
}

export interface GarmentAnchorMappingValidation {
  valid: boolean;
  errors: string[];
  missingLandmarks: AvatarLandmarkName[];
}

/**
 * Landmarks mínimos exigidos para cada tipo de roupa.
 *
 * A lista representa os pontos anatômicos indispensáveis
 * para o posicionamento inicial da peça.
 *
 * O mapeamento efetivo utiliza exclusivamente os landmarks
 * declarados nas âncoras de fit.anchors.
 */
const GARMENT_LANDMARKS: Record<
  GarmentType,
  {
    required: AvatarLandmarkName[];
    optional: AvatarLandmarkName[];
  }
> = {
  tshirt: {
    required: [
      'leftShoulder',
      'rightShoulder',
    ],
    optional: [
      'shoulderCenter',
      'neckBase',
      'bustCenter',
      'waistCenter',
    ],
  },

  short: {
    required: [
      'leftHip',
      'rightHip',
      'crotchCenter',
    ],
    optional: [
      'hipCenter',
      'waistCenter',
      'leftKnee',
      'rightKnee',
    ],
  },

  dress: {
    required: [
      'leftShoulder',
      'rightShoulder',
      'hipCenter',
    ],
    optional: [
      'neckBase',
      'bustCenter',
      'waistCenter',
      'leftHip',
      'rightHip',
    ],
  },

  pants: {
    required: [
      'leftHip',
      'rightHip',
      'crotchCenter',
      'leftKnee',
      'rightKnee',
      'leftAnkle',
      'rightAnkle',
    ],
    optional: [
      'hipCenter',
    ],
  },
};

const VALID_LANDMARKS = new Set<string>([
  'bodyCenter',
  'neckBase',
  'shoulderCenter',
  'leftShoulder',
  'rightShoulder',
  'bustCenter',
  'waistCenter',
  'hipCenter',
  'leftHip',
  'rightHip',
  'crotchCenter',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
]);

function isFiniteVector(
  value: THREE.Vector3 | undefined | null,
): value is THREE.Vector3 {
  return Boolean(
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z),
  );
}

function isGarmentType(
  value: string,
): value is GarmentType {
  return Object.prototype.hasOwnProperty.call(
    GARMENT_LANDMARKS,
    value,
  );
}

function validateWeightMultiplier(
  multiplier: number,
): void {
  if (
    !Number.isFinite(multiplier) ||
    multiplier <= 0
  ) {
    throw new Error(
      'CAIMENT: multiplicador de peso das âncoras inválido.',
    );
  }
}

function isInferredLandmark(
  name: AvatarLandmarkName,
  inferred: AvatarLandmarkName[],
): boolean {
  return inferred.includes(name);
}

/**
 * Valida individualmente uma âncora.
 */
function validateAnchor(
  anchor: GarmentAnchor,
  index: number,
): string[] {
  const errors: string[] = [];

  if (
    !anchor ||
    typeof anchor.id !== 'string' ||
    !anchor.id.trim()
  ) {
    errors.push(
      `CAIMENT: identificador inválido na âncora ${index}.`,
    );
  }

  if (
    !anchor ||
    typeof anchor.bodyLandmark !== 'string' ||
    !VALID_LANDMARKS.has(anchor.bodyLandmark)
  ) {
    errors.push(
      `CAIMENT: landmark inválido na âncora ${index}.`,
    );
  }

  if (
    !anchor ||
    !isFiniteVector(anchor.garmentPosition)
  ) {
    errors.push(
      `CAIMENT: posição geométrica inválida na âncora ${index}.`,
    );
  }

  if (
    anchor?.weight !== undefined &&
    (
      !Number.isFinite(anchor.weight) ||
      anchor.weight <= 0
    )
  ) {
    errors.push(
      `CAIMENT: peso inválido na âncora "${anchor.id}".`,
    );
  }

  return errors;
}

/**
 * Verifica se os identificadores das âncoras são únicos.
 */
function validateUniqueAnchorIds(
  anchors: GarmentAnchor[],
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  anchors.forEach((anchor) => {
    if (
      !anchor ||
      typeof anchor.id !== 'string'
    ) {
      return;
    }

    if (ids.has(anchor.id)) {
      errors.push(
        `CAIMENT: identificador de âncora duplicado "${anchor.id}".`,
      );
    }

    ids.add(anchor.id);
  });

  return errors;
}

/**
 * Verifica se existem landmarks duplicados nas âncoras.
 *
 * Cada landmark anatômico deve possuir uma única âncora
 * para evitar que um mesmo ponto tenha influência duplicada
 * na translação.
 */
function validateUniqueAnchorLandmarks(
  anchors: GarmentAnchor[],
): string[] {
  const errors: string[] = [];
  const landmarks = new Set<string>();

  for (const anchor of anchors) {
    if (
      !anchor ||
      typeof anchor.bodyLandmark !== 'string'
    ) {
      continue;
    }

    if (landmarks.has(anchor.bodyLandmark)) {
      errors.push(
        `CAIMENT: landmark duplicado nas âncoras "${anchor.bodyLandmark}".`,
      );
    }

    landmarks.add(anchor.bodyLandmark);
  }

  return errors;
}

/**
 * Verifica se as âncoras contêm todos os landmarks
 * obrigatórios do tipo de roupa.
 */
function validateDeclaredRequiredLandmarks(
  type: GarmentType,
  anchors: GarmentAnchor[],
): AvatarLandmarkName[] {
  const declared = new Set(
    anchors
      .filter(
        (anchor) =>
          anchor &&
          typeof anchor.bodyLandmark === 'string',
      )
      .map((anchor) => anchor.bodyLandmark),
  );

  return GARMENT_LANDMARKS[type].required.filter(
    (name) => !declared.has(name),
  );
}

/**
 * Calcula o deslocamento entre a posição da roupa
 * e a posição correspondente no avatar.
 */
function calculateAnchorOffset(
  garmentPosition: THREE.Vector3,
  avatarPosition: THREE.Vector3,
): THREE.Vector3 {
  return avatarPosition
    .clone()
    .sub(garmentPosition);
}

/**
 * Associa uma âncora da roupa a um landmark do avatar.
 *
 * Não modifica a posição original dos vértices.
 */
function mapAnchor(
  anchor: GarmentAnchor,
  landmarks: AvatarLandmarkMap,
  options: GarmentAnchorMappingOptions,
): MappedGarmentAnchor | null {
  const landmark =
    anchor.bodyLandmark as AvatarLandmarkName;

  const avatarPosition = landmarks[landmark];

  if (!isFiniteVector(avatarPosition)) {
    return null;
  }

  const inferred = isInferredLandmark(
    landmark,
    options.inferredLandmarks ?? [],
  );

  if (
    inferred &&
    !(options.allowInferredLandmarks ?? false)
  ) {
    return null;
  }

  const multiplier =
    options.weightMultiplier ?? 1;

  const weight =
    (anchor.weight ?? 1) * multiplier;

  if (
    !Number.isFinite(weight) ||
    weight <= 0
  ) {
    throw new Error(
      `CAIMENT: peso final inválido na âncora "${anchor.id}".`,
    );
  }

  const garmentPosition =
    anchor.garmentPosition.clone();

  const targetPosition =
    avatarPosition.clone();

  return {
    id: anchor.id,
    bodyLandmark: landmark,
    garmentPosition,
    avatarPosition: targetPosition,

    offset: calculateAnchorOffset(
      garmentPosition,
      targetPosition,
    ),

    weight,
    inferred,
  };
}

/**
 * Valida os landmarks obrigatórios para cada tipo de roupa.
 *
 * Esta função valida os pontos anatômicos mínimos.
 * Não substitui a validação das âncoras presentes em fit.
 */
export function validateGarmentAnchorLandmarks(
  type: GarmentType,
  landmarks: AvatarLandmarkMap,
  options: GarmentAnchorMappingOptions = {},
): GarmentAnchorMappingValidation {
  if (!isGarmentType(type)) {
    return {
      valid: false,
      errors: [
        'CAIMENT: tipo de roupa não suportado.',
      ],
      missingLandmarks: [],
    };
  }

  if (!landmarks) {
    return {
      valid: false,
      errors: [
        'CAIMENT: landmarks do avatar não informados.',
      ],
      missingLandmarks: [
        ...GARMENT_LANDMARKS[type].required,
      ],
    };
  }

  const inferredList =
    options.inferredLandmarks ?? [];

  const missingLandmarks =
    GARMENT_LANDMARKS[type].required.filter(
      (name) => {
        const point = landmarks[name];

        if (!isFiniteVector(point)) {
          return true;
        }

        return (
          isInferredLandmark(name, inferredList) &&
          !(options.allowInferredLandmarks ?? false)
        );
      },
    );

  return {
    valid: missingLandmarks.length === 0,

    errors: missingLandmarks.length > 0
      ? [
          `CAIMENT: landmarks obrigatórios ausentes ou não permitidos para "${type}": ${missingLandmarks.join(', ')}.`,
        ]
      : [],

    missingLandmarks,
  };
}

/**
 * Mapeia as âncoras declaradas em fit para os landmarks
 * extraídos diretamente da geometria do avatar Tripo.
 *
 * garmentPosition e avatarPosition precisam utilizar
 * o mesmo sistema de coordenadas e a mesma unidade.
 *
 * Este procedimento calcula correspondências e offsets.
 * Não escala nem deforma a geometria da roupa.
 */
export function mapGarmentAnchorsToAvatar(
  type: GarmentType,
  fit: GarmentFitDefinition,
  landmarks: AvatarLandmarkMap,
  options: GarmentAnchorMappingOptions = {},
): GarmentAnchorMappingResult {
  if (!isGarmentType(type)) {
    throw new Error(
      'CAIMENT: tipo de roupa não suportado.',
    );
  }

  if (
    !fit ||
    !Array.isArray(fit.anchors)
  ) {
    throw new Error(
      'CAIMENT: definição de encaixe da roupa inválida.',
    );
  }

  if (!landmarks) {
    throw new Error(
      'CAIMENT: landmarks do avatar não informados.',
    );
  }

  if (fit.anchors.length === 0) {
    throw new Error(
      'CAIMENT: a definição de encaixe não possui âncoras.',
    );
  }

  const multiplier =
    options.weightMultiplier ?? 1;

  validateWeightMultiplier(multiplier);

  const anchorErrors = fit.anchors.flatMap(
    (anchor, index) =>
      validateAnchor(anchor, index),
  );

  anchorErrors.push(
    ...validateUniqueAnchorIds(fit.anchors),
  );

  anchorErrors.push(
    ...validateUniqueAnchorLandmarks(fit.anchors),
  );

  if (anchorErrors.length > 0) {
    throw new Error(
      anchorErrors.join('\n'),
    );
  }

  /**
   * Confere se a definição do fit contém as âncoras
   * mínimas necessárias para o tipo de roupa.
   */
  const undeclaredRequired =
    validateDeclaredRequiredLandmarks(
      type,
      fit.anchors,
    );

  if (undeclaredRequired.length > 0) {
    throw new Error(
      `CAIMENT: a definição de fit para "${type}" não contém as âncoras obrigatórias: ${undeclaredRequired.join(', ')}.`,
    );
  }

  const mappedAnchors: MappedGarmentAnchor[] = [];

  const missing =
    new Set<AvatarLandmarkName>();

  const inferred =
    new Set<AvatarLandmarkName>();

  for (const anchor of fit.anchors) {
    const landmark =
      anchor.bodyLandmark as AvatarLandmarkName;

    const mapped = mapAnchor(
      anchor,
      landmarks,
      options,
    );

    if (!mapped) {
      missing.add(landmark);
      continue;
    }

    mappedAnchors.push(mapped);

    if (mapped.inferred) {
      inferred.add(landmark);
    }
  }

  if (mappedAnchors.length === 0) {
    throw new Error(
      'CAIMENT: nenhuma âncora da roupa pôde ser associada ao avatar.',
    );
  }

  const valid =
    missing.size === 0 &&
    mappedAnchors.length === fit.anchors.length;

  if (
    !valid &&
    !(options.allowPartial ?? false)
  ) {
    throw new Error(
      `CAIMENT: não foi possível mapear todas as âncoras: ${[
        ...missing,
      ].join(', ')}.`,
    );
  }

  return {
    anchors: mappedAnchors,
    mappedCount: mappedAnchors.length,
    missingLandmarks: [...missing],
    inferredLandmarks: [...inferred],
    coverage: [...fit.coverage],
    valid,
  };
}

/**
 * Retorna os landmarks mínimos necessários para cada peça.
 */
export function getGarmentRequiredLandmarks(
  type: GarmentType,
): AvatarLandmarkName[] {
  if (!isGarmentType(type)) {
    throw new Error(
      'CAIMENT: tipo de roupa não suportado.',
    );
  }

  return [
    ...GARMENT_LANDMARKS[type].required,
  ];
}

/**
 * Retorna os landmarks complementares recomendados.
 */
export function getGarmentOptionalLandmarks(
  type: GarmentType,
): AvatarLandmarkName[] {
  if (!isGarmentType(type)) {
    throw new Error(
      'CAIMENT: tipo de roupa não suportado.',
    );
  }

  return [
    ...GARMENT_LANDMARKS[type].optional,
  ];
}

/**
 * Calcula somente a translação média ponderada.
 *
 * Não aplica escala, deformação ou simulação física.
 */
export function calculateWeightedAnchorTranslation(
  anchors: MappedGarmentAnchor[],
): THREE.Vector3 {
  if (
    !Array.isArray(anchors) ||
    anchors.length === 0
  ) {
    throw new Error(
      'CAIMENT: não existem âncoras para calcular a translação.',
    );
  }

  const translation =
    new THREE.Vector3();

  let totalWeight = 0;

  for (const anchor of anchors) {
    if (
      !anchor ||
      !isFiniteVector(anchor.offset) ||
      !Number.isFinite(anchor.weight) ||
      anchor.weight <= 0
    ) {
      throw new Error(
        `CAIMENT: dados inválidos na âncora "${anchor?.id ?? 'desconhecida'}".`,
      );
    }

    translation.addScaledVector(
      anchor.offset,
      anchor.weight,
    );

    totalWeight += anchor.weight;
  }

  if (
    !Number.isFinite(totalWeight) ||
    totalWeight <= 0
  ) {
    throw new Error(
      'CAIMENT: soma dos pesos inválida.',
    );
  }

  translation.divideScalar(totalWeight);

  if (!isFiniteVector(translation)) {
    throw new Error(
      'CAIMENT: translação ponderada inválida.',
    );
  }

  return translation;
}

export default mapGarmentAnchorsToAvatar;
