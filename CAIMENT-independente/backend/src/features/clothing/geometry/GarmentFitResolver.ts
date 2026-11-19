
import * as THREE from 'three';

import type {
  GarmentFitDefinition,
} from './types';

import {
  calculateWeightedAnchorTranslation,
  type GarmentAnchorMappingResult,
  type MappedGarmentAnchor,
} from './GarmentAnchorMapping';

export interface GarmentFitResolverOptions {
  allowPartialMapping?: boolean;

  /**
   * Escala uniforme já calculada para a roupa.
   *
   * Deve corresponder à escala utilizada para normalizar
   * o avatar. Se omitida, utiliza 1.
   */
  uniformScale?: number;
}

export interface ResolvedGarmentAnchor {
  id: string;
  bodyLandmark: MappedGarmentAnchor['bodyLandmark'];

  /**
   * Posição original da âncora na geometria da roupa,
   * antes da aplicação da escala.
   */
  garmentPosition: THREE.Vector3;

  avatarPosition: THREE.Vector3;

  /**
   * Posição da âncora depois da escala e da translação.
   */
  translatedPosition: THREE.Vector3;

  /**
   * Diferença restante entre a posição ajustada
   * da roupa e o landmark do avatar.
   */
  remainingOffset: THREE.Vector3;

  weight: number;
  inferred: boolean;
}

export interface GarmentFitResolution {
  valid: boolean;
  translation: THREE.Vector3;
  uniformScale: number;
  anchors: ResolvedGarmentAnchor[];
  clearance: number;
  coverage: GarmentFitDefinition['coverage'];
  weightedResidual: number;
  maximumResidual: number;
  totalWeight: number;
  completeMapping: boolean;
  errors: string[];
}

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

function validateUniformScale(
  scale: number,
): string[] {
  if (
    !Number.isFinite(scale) ||
    scale <= 0
  ) {
    return [
      'CAIMENT: escala uniforme da roupa inválida.',
    ];
  }

  return [];
}

function validateFit(
  fit: GarmentFitDefinition,
): string[] {
  const errors: string[] = [];

  if (!fit) {
    return [
      'CAIMENT: definição de encaixe não informada.',
    ];
  }

  if (
    !Number.isFinite(fit.clearance) ||
    fit.clearance < 0
  ) {
    errors.push(
      'CAIMENT: folga da roupa inválida.',
    );
  }

  if (
    !Array.isArray(fit.coverage) ||
    fit.coverage.length === 0
  ) {
    errors.push(
      'CAIMENT: regiões de cobertura inválidas.',
    );
  }

  if (
    !Array.isArray(fit.anchors) ||
    fit.anchors.length === 0
  ) {
    errors.push(
      'CAIMENT: âncoras da roupa inválidas.',
    );
  }

  return errors;
}

function validateMapping(
  mapping: GarmentAnchorMappingResult,
): string[] {
  const errors: string[] = [];

  if (
    !mapping ||
    !Array.isArray(mapping.anchors) ||
    !Array.isArray(mapping.missingLandmarks) ||
    !Array.isArray(mapping.inferredLandmarks) ||
    !Array.isArray(mapping.coverage)
  ) {
    return [
      'CAIMENT: resultado do mapeamento de âncoras inválido.',
    ];
  }

  if (mapping.anchors.length === 0) {
    errors.push(
      'CAIMENT: o mapeamento não possui âncoras utilizáveis.',
    );
  }

  if (
    mapping.mappedCount !== mapping.anchors.length
  ) {
    errors.push(
      'CAIMENT: quantidade de âncoras mapeadas inconsistente.',
    );
  }

  const ids = new Set<string>();

  for (const anchor of mapping.anchors) {
    if (
      !anchor ||
      typeof anchor.id !== 'string' ||
      !anchor.id.trim() ||
      ids.has(anchor.id)
    ) {
      errors.push(
        'CAIMENT: identificador de âncora inválido ou duplicado.',
      );
      continue;
    }

    ids.add(anchor.id);

    if (
      typeof anchor.bodyLandmark !== 'string' ||
      !anchor.bodyLandmark.trim()
    ) {
      errors.push(
        `CAIMENT: landmark inválido na âncora "${anchor.id}".`,
      );
    }

    if (
      !isFiniteVector(anchor.garmentPosition) ||
      !isFiniteVector(anchor.avatarPosition) ||
      !isFiniteVector(anchor.offset)
    ) {
      errors.push(
        `CAIMENT: posições inválidas na âncora "${anchor.id}".`,
      );
      continue;
    }

    if (
      !Number.isFinite(anchor.weight) ||
      anchor.weight <= 0
    ) {
      errors.push(
        `CAIMENT: peso inválido na âncora "${anchor.id}".`,
      );
    }

    if (typeof anchor.inferred !== 'boolean') {
      errors.push(
        `CAIMENT: estado de inferência inválido na âncora "${anchor.id}".`,
      );
    }

    const expectedOffset = anchor.avatarPosition
      .clone()
      .sub(anchor.garmentPosition);

    if (
      expectedOffset.distanceTo(anchor.offset) > 1e-6
    ) {
      errors.push(
        `CAIMENT: deslocamento inconsistente na âncora "${anchor.id}".`,
      );
    }
  }

  return errors;
}

/**
 * Aplica a escala uniforme às posições das âncoras
 * sem modificar a geometria original.
 *
 * Recalcula os offsets usando as posições escaladas.
 */
function scaleMappedAnchors(
  anchors: MappedGarmentAnchor[],
  uniformScale: number,
): MappedGarmentAnchor[] {
  return anchors.map((anchor) => {
    const scaledGarmentPosition =
      anchor.garmentPosition
        .clone()
        .multiplyScalar(uniformScale);

    const avatarPosition =
      anchor.avatarPosition.clone();

    const offset = avatarPosition
      .clone()
      .sub(scaledGarmentPosition);

    return {
      ...anchor,
      garmentPosition: scaledGarmentPosition,
      avatarPosition,
      offset,
    };
  });
}

/**
 * Calcula a posição final de uma âncora.
 *
 * A garmentPosition recebida já está escalada.
 */
function resolveAnchor(
  anchor: MappedGarmentAnchor,
  translation: THREE.Vector3,
  uniformScale: number,
): ResolvedGarmentAnchor {
  const originalGarmentPosition =
    anchor.garmentPosition
      .clone()
      .divideScalar(uniformScale);

  const translatedPosition =
    anchor.garmentPosition
      .clone()
      .add(translation);

  const remainingOffset =
    anchor.avatarPosition
      .clone()
      .sub(translatedPosition);

  return {
    id: anchor.id,
    bodyLandmark: anchor.bodyLandmark,
    garmentPosition: originalGarmentPosition,
    avatarPosition: anchor.avatarPosition.clone(),
    translatedPosition,
    remainingOffset,
    weight: anchor.weight,
    inferred: anchor.inferred,
  };
}

/**
 * Calcula as métricas dos resíduos depois da translação.
 *
 * weightedResidual representa o erro quadrático médio
 * ponderado das âncoras.
 */
function calculateResidualMetrics(
  anchors: ResolvedGarmentAnchor[],
): {
  weightedResidual: number;
  maximumResidual: number;
  totalWeight: number;
} {
  let weightedSquaredResidual = 0;
  let totalWeight = 0;
  let maximumResidual = 0;

  for (const anchor of anchors) {
    const residual =
      anchor.remainingOffset.length();

    if (!Number.isFinite(residual)) {
      throw new Error(
        `CAIMENT: resíduo inválido na âncora "${anchor.id}".`,
      );
    }

    weightedSquaredResidual +=
      residual * residual * anchor.weight;

    totalWeight += anchor.weight;

    maximumResidual = Math.max(
      maximumResidual,
      residual,
    );
  }

  if (
    !Number.isFinite(totalWeight) ||
    totalWeight <= 0
  ) {
    throw new Error(
      'CAIMENT: não foi possível calcular os resíduos.',
    );
  }

  const weightedResidual = Math.sqrt(
    weightedSquaredResidual / totalWeight,
  );

  if (!Number.isFinite(weightedResidual)) {
    throw new Error(
      'CAIMENT: resíduo ponderado inválido.',
    );
  }

  return {
    weightedResidual,
    maximumResidual,
    totalWeight,
  };
}

/**
 * Resolve o posicionamento inicial da roupa.
 *
 * Considera:
 * - Escala uniforme da roupa.
 * - Posições das âncoras.
 * - Landmarks do avatar.
 * - Translação média ponderada.
 *
 * Não:
 * - Modifica a geometria.
 * - Deforma vértices.
 * - Executa colisão.
 * - Executa simulação física.
 *
 * A escala e a translação retornadas devem ser aplicadas
 * posteriormente ao grupo da roupa, sem reaplicar a escala.
 */
export function resolveGarmentFit(
  fit: GarmentFitDefinition,
  mapping: GarmentAnchorMappingResult,
  options: GarmentFitResolverOptions = {},
): GarmentFitResolution {
  const uniformScale =
    options.uniformScale ?? 1;

  const errors = [
    ...validateFit(fit),
    ...validateMapping(mapping),
    ...validateUniformScale(uniformScale),
  ];

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  if (
    !mapping.valid &&
    !(options.allowPartialMapping ?? false)
  ) {
    throw new Error(
      [
        'CAIMENT: não é possível resolver um mapeamento incompleto.',
        `Landmarks ausentes: ${mapping.missingLandmarks.join(', ')}.`,
      ].join('\n'),
    );
  }

  if (
    mapping.anchors.length > fit.anchors.length
  ) {
    throw new Error(
      'CAIMENT: o mapeamento contém mais âncoras do que a definição de fit.',
    );
  }

  /**
   * Aplica a escala às posições utilizadas no cálculo.
   *
   * Isso mantém a roupa no mesmo referencial de escala
   * utilizado na normalização do avatar.
   */
  const scaledAnchors = scaleMappedAnchors(
    mapping.anchors,
    uniformScale,
  );

  /**
   * Calcula a translação considerando as posições escaladas.
   */
  const translation =
    calculateWeightedAnchorTranslation(
      scaledAnchors,
    );

  if (!isFiniteVector(translation)) {
    throw new Error(
      'CAIMENT: translação calculada inválida.',
    );
  }

  /**
   * Calcula as posições finais das âncoras.
   */
  const anchors = scaledAnchors.map(
    (anchor) =>
      resolveAnchor(
        anchor,
        translation,
        uniformScale,
      ),
  );

  const metrics =
    calculateResidualMetrics(anchors);

  return {
    valid: true,

    translation: translation.clone(),

    uniformScale,

    anchors,

    clearance: fit.clearance,

    coverage: [...fit.coverage],

    weightedResidual:
      metrics.weightedResidual,

    maximumResidual:
      metrics.maximumResidual,

    totalWeight:
      metrics.totalWeight,

    completeMapping: mapping.valid,

    errors: [],
  };
}

export default resolveGarmentFit;
