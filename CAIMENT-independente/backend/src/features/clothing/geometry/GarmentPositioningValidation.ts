
import * as THREE from 'three';

import type {
  GarmentFitDefinition,
} from './types';

import type {
  AvatarLandmarkMap,
  AvatarLandmarkName,
} from './AvatarLandmarks';

import type {
  GarmentAnchorMappingResult,
} from './GarmentAnchorMapping';

import type {
  GarmentFitResolution,
} from './GarmentFitResolver';

export interface GarmentPositioningValidationOptions {
  allowInferredLandmarks?: boolean;
  allowPartialMapping?: boolean;
  tolerance?: number;
  maximumWeightedResidual?: number;
}

export interface GarmentPositioningValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checked: {
    landmarks: boolean;
    mapping: boolean;
    fit: boolean;
    resolution: boolean;
    geometry: boolean;
  };
}

export interface GarmentGeometryValidationInput {
  geometry: THREE.BufferGeometry;
  matrixWorld?: THREE.Matrix4;
  expectedVertexCount?: number;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isFiniteVector(
  value: THREE.Vector3 | undefined,
): value is THREE.Vector3 {
  return Boolean(
    value &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z),
  );
}

function isFiniteMatrix(matrix: THREE.Matrix4): boolean {
  return matrix.elements.every(isFiniteNumber);
}

function validateTolerance(tolerance: number): string[] {
  if (!isFiniteNumber(tolerance) || tolerance < 0) {
    return ['CAIMENT: tolerância numérica inválida.'];
  }

  return [];
}

function createResult(
  errors: string[],
  warnings: string[],
  checked: GarmentPositioningValidationResult['checked'],
): GarmentPositioningValidationResult {
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checked,
  };
}

export function validateAvatarLandmarkPositions(
  landmarks: AvatarLandmarkMap,
  requiredLandmarks: AvatarLandmarkName[] = [],
): GarmentPositioningValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!landmarks) {
    errors.push(
      'CAIMENT: landmarks do avatar não foram informados.',
    );
  } else {
    for (const [name, position] of Object.entries(landmarks)) {
      if (!isFiniteVector(position)) {
        errors.push(
          `CAIMENT: posição inválida no landmark "${name}".`,
        );
      }
    }

    for (const name of requiredLandmarks) {
      if (!isFiniteVector(landmarks[name])) {
        errors.push(
          `CAIMENT: landmark obrigatório "${name}" ausente ou inválido.`,
        );
      }
    }

    if (Object.keys(landmarks).length === 0) {
      warnings.push(
        'CAIMENT: nenhum landmark foi disponibilizado.',
      );
    }
  }

  return createResult(errors, warnings, {
    landmarks: true,
    mapping: false,
    fit: false,
    resolution: false,
    geometry: false,
  });
}

export function validateGarmentAnchorMapping(
  mapping: GarmentAnchorMappingResult,
  options: GarmentPositioningValidationOptions = {},
): GarmentPositioningValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (
    !mapping ||
    !Array.isArray(mapping.anchors) ||
    !Array.isArray(mapping.missingLandmarks) ||
    !Array.isArray(mapping.inferredLandmarks) ||
    !Array.isArray(mapping.coverage)
  ) {
    errors.push(
      'CAIMENT: resultado do mapeamento de âncoras inválido.',
    );

    return createResult(errors, warnings, {
      landmarks: false,
      mapping: true,
      fit: false,
      resolution: false,
      geometry: false,
    });
  }

  if (mapping.anchors.length === 0) {
    errors.push(
      'CAIMENT: o mapeamento não possui âncoras.',
    );
  }

  if (
    !mapping.valid &&
    !(options.allowPartialMapping ?? false)
  ) {
    errors.push(
      'CAIMENT: o mapeamento das âncoras está incompleto.',
    );
  }

  if (mapping.missingLandmarks.length > 0) {
    warnings.push(
      `CAIMENT: landmarks ausentes: ${mapping.missingLandmarks.join(', ')}.`,
    );
  }

  const ids = new Set<string>();

  for (const anchor of mapping.anchors) {
    if (!anchor || typeof anchor.id !== 'string' || !anchor.id.trim()) {
      errors.push(
        'CAIMENT: identificador de âncora inválido.',
      );
      continue;
    }

    if (ids.has(anchor.id)) {
      errors.push(
        `CAIMENT: identificador de âncora duplicado "${anchor.id}".`,
      );
    }

    ids.add(anchor.id);

    if (
      !isFiniteVector(anchor.garmentPosition) ||
      !isFiniteVector(anchor.avatarPosition) ||
      !isFiniteVector(anchor.offset)
    ) {
      errors.push(
        `CAIMENT: coordenadas inválidas na âncora "${anchor.id}".`,
      );
      continue;
    }

    if (
      !isFiniteNumber(anchor.weight) ||
      anchor.weight <= 0
    ) {
      errors.push(
        `CAIMENT: peso inválido na âncora "${anchor.id}".`,
      );
    }

    const expectedOffset = anchor.avatarPosition
      .clone()
      .sub(anchor.garmentPosition);

    if (expectedOffset.distanceTo(anchor.offset) > 1e-6) {
      errors.push(
        `CAIMENT: deslocamento inconsistente na âncora "${anchor.id}".`,
      );
    }

    if (
      anchor.inferred &&
      !(options.allowInferredLandmarks ?? false)
    ) {
      errors.push(
        `CAIMENT: âncora "${anchor.id}" utiliza landmark inferido não autorizado.`,
      );
    }
  }

  if (
    mapping.inferredLandmarks.length > 0 &&
    !(options.allowInferredLandmarks ?? false)
  ) {
    warnings.push(
      'CAIMENT: existem landmarks inferidos no mapeamento.',
    );
  }

  return createResult(errors, warnings, {
    landmarks: false,
    mapping: true,
    fit: false,
    resolution: false,
    geometry: false,
  });
}

export function validateGarmentFitDefinition(
  fit: GarmentFitDefinition,
): GarmentPositioningValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fit) {
    errors.push(
      'CAIMENT: definição de encaixe não informada.',
    );
  } else {
    if (
      !isFiniteNumber(fit.clearance) ||
      fit.clearance < 0
    ) {
      errors.push('CAIMENT: folga da roupa inválida.');
    }

    if (!Array.isArray(fit.coverage)) {
      errors.push(
        'CAIMENT: regiões de cobertura inválidas.',
      );
    }

    if (!Array.isArray(fit.anchors)) {
      errors.push(
        'CAIMENT: lista de âncoras inválida.',
      );
    } else if (fit.anchors.length === 0) {
      warnings.push(
        'CAIMENT: a definição de encaixe não possui âncoras.',
      );
    }

    if (fit.scale !== undefined) {
      if (
        !isFiniteNumber(fit.scale.x) ||
        !isFiniteNumber(fit.scale.y) ||
        !isFiniteNumber(fit.scale.z) ||
        fit.scale.x <= 0 ||
        fit.scale.y <= 0 ||
        fit.scale.z <= 0
      ) {
        errors.push(
          'CAIMENT: escala definida no encaixe é inválida.',
        );
      }
    }
  }

  return createResult(errors, warnings, {
    landmarks: false,
    mapping: false,
    fit: true,
    resolution: false,
    geometry: false,
  });
}

export function validateGarmentFitResolution(
  resolution: GarmentFitResolution,
  options: GarmentPositioningValidationOptions = {},
): GarmentPositioningValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tolerance = options.tolerance ?? 1e-7;
  errors.push(...validateTolerance(tolerance));

  if (!resolution) {
    errors.push(
      'CAIMENT: resultado da resolução do encaixe não informado.',
    );
  } else {
    if (!resolution.valid) {
      errors.push(
        'CAIMENT: a resolução do encaixe está marcada como inválida.',
      );
    }

    if (!isFiniteVector(resolution.translation)) {
      errors.push('CAIMENT: translação calculada inválida.');
    }

    if (
      !isFiniteNumber(resolution.clearance) ||
      resolution.clearance < 0
    ) {
      errors.push('CAIMENT: folga da resolução inválida.');
    }

    if (!Array.isArray(resolution.coverage)) {
      errors.push('CAIMENT: cobertura da resolução inválida.');
    }

    if (
      !Array.isArray(resolution.anchors) ||
      resolution.anchors.length === 0
    ) {
      errors.push('CAIMENT: resolução sem âncoras.');
    } else {
      const ids = new Set<string>();
      let weightedSquaredResidual = 0;
      let totalWeight = 0;
      let maximumResidual = 0;

      for (const anchor of resolution.anchors) {
        if (!anchor || !anchor.id) {
          errors.push(
            'CAIMENT: âncora da resolução sem identificador.',
          );
          continue;
        }

        if (ids.has(anchor.id)) {
          errors.push(
            `CAIMENT: âncora duplicada na resolução "${anchor.id}".`,
          );
        }

        ids.add(anchor.id);

        if (
          !isFiniteVector(anchor.garmentPosition) ||
          !isFiniteVector(anchor.avatarPosition) ||
          !isFiniteVector(anchor.translatedPosition) ||
          !isFiniteVector(anchor.remainingOffset)
        ) {
          errors.push(
            `CAIMENT: coordenadas inválidas na âncora "${anchor.id}".`,
          );
          continue;
        }

        if (
          !isFiniteNumber(anchor.weight) ||
          anchor.weight <= 0
        ) {
          errors.push(
            `CAIMENT: peso inválido na âncora "${anchor.id}".`,
          );
          continue;
        }

        if (typeof anchor.inferred !== 'boolean') {
          errors.push(
            `CAIMENT: estado de inferência inválido na âncora "${anchor.id}".`,
          );
        }

        const expectedPosition = anchor.garmentPosition
          .clone()
          .add(resolution.translation);

        if (
          expectedPosition.distanceTo(
            anchor.translatedPosition,
          ) > tolerance
        ) {
          errors.push(
            `CAIMENT: posição transladada inconsistente na âncora "${anchor.id}".`,
          );
        }

        const expectedResidual = anchor.avatarPosition
          .clone()
          .sub(anchor.translatedPosition);

        if (
          expectedResidual.distanceTo(
            anchor.remainingOffset,
          ) > tolerance
        ) {
          errors.push(
            `CAIMENT: deslocamento residual inconsistente na âncora "${anchor.id}".`,
          );
        }

        const residual = anchor.remainingOffset.length();

        weightedSquaredResidual +=
          residual * residual * anchor.weight;

        totalWeight += anchor.weight;
        maximumResidual = Math.max(maximumResidual, residual);
      }

      if (totalWeight > 0) {
        const expectedWeightedResidual = Math.sqrt(
          weightedSquaredResidual / totalWeight,
        );

        if (
          Math.abs(
            expectedWeightedResidual - resolution.weightedResidual,
          ) > tolerance
        ) {
          errors.push(
            'CAIMENT: resíduo ponderado inconsistente com as âncoras.',
          );
        }

        if (
          Math.abs(maximumResidual - resolution.maximumResidual) >
          tolerance
        ) {
          errors.push(
            'CAIMENT: resíduo máximo inconsistente com as âncoras.',
          );
        }

        if (
          Math.abs(totalWeight - resolution.totalWeight) >
          tolerance
        ) {
          errors.push(
            'CAIMENT: soma dos pesos inconsistente.',
          );
        }
      }
    }

    if (
      !isFiniteNumber(resolution.weightedResidual) ||
      resolution.weightedResidual < 0
    ) {
      errors.push('CAIMENT: resíduo ponderado inválido.');
    }

    if (
      !isFiniteNumber(resolution.maximumResidual) ||
      resolution.maximumResidual < 0
    ) {
      errors.push('CAIMENT: resíduo máximo inválido.');
    }

    if (
      options.maximumWeightedResidual !== undefined
    ) {
      if (
        !isFiniteNumber(options.maximumWeightedResidual) ||
        options.maximumWeightedResidual < 0
      ) {
        errors.push(
          'CAIMENT: limite máximo de resíduo inválido.',
        );
      } else if (
        resolution.weightedResidual >
        options.maximumWeightedResidual
      ) {
        errors.push(
          'CAIMENT: o resíduo ponderado ultrapassou o limite configurado.',
        );
      }
    }

    if (!resolution.completeMapping) {
      warnings.push(
        'CAIMENT: a resolução foi calculada com mapeamento parcial.',
      );
    }
  }

  return createResult(errors, warnings, {
    landmarks: false,
    mapping: false,
    fit: false,
    resolution: true,
    geometry: false,
  });
}

export function validateGarmentGeometry(
  input: GarmentGeometryValidationInput,
  options: GarmentPositioningValidationOptions = {},
): GarmentPositioningValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tolerance = options.tolerance ?? 1e-7;
  errors.push(...validateTolerance(tolerance));

  if (!input?.geometry) {
    errors.push('CAIMENT: geometria da roupa não informada.');
  } else {
    const geometry = input.geometry;
    const position = geometry.getAttribute('position');

    if (!position) {
      errors.push(
        'CAIMENT: geometria sem atributo de posição.',
      );
    } else {
      if (position.itemSize !== 3) {
        errors.push(
          'CAIMENT: atributo de posição não possui três componentes.',
        );
      }

      if (
        input.expectedVertexCount !== undefined &&
        position.count !== input.expectedVertexCount
      ) {
        errors.push(
          'CAIMENT: quantidade de vértices diferente da esperada.',
        );
      }

      for (let index = 0; index < position.count; index++) {
        if (
          !isFiniteNumber(position.getX(index)) ||
          !isFiniteNumber(position.getY(index)) ||
          !isFiniteNumber(position.getZ(index))
        ) {
          errors.push(
            `CAIMENT: vértice ${index} possui coordenadas inválidas.`,
          );
          break;
        }
      }

      if (position.count === 0) {
        errors.push(
          'CAIMENT: geometria da roupa não possui vértices.',
        );
      }
    }

    const normal = geometry.getAttribute('normal');

    if (normal) {
      if (normal.itemSize !== 3) {
        errors.push(
          'CAIMENT: atributo de normais inválido.',
        );
      }

      if (position && normal.count !== position.count) {
        errors.push(
          'CAIMENT: quantidade de normais diferente da quantidade de vértices.',
        );
      }

      for (let index = 0; index < normal.count; index++) {
        if (
          !isFiniteNumber(normal.getX(index)) ||
          !isFiniteNumber(normal.getY(index)) ||
          !isFiniteNumber(normal.getZ(index))
        ) {
          errors.push(
            `CAIMENT: normal ${index} possui valores inválidos.`,
          );
          break;
        }
      }
    } else {
      warnings.push(
        'CAIMENT: geometria sem normais calculadas.',
      );
    }

    const indexAttribute = geometry.getIndex();

    if (indexAttribute && position) {
      if (indexAttribute.count % 3 !== 0) {
        errors.push(
          'CAIMENT: quantidade de índices não forma triângulos completos.',
        );
      }

      for (
        let index = 0;
        index < indexAttribute.count;
        index++
      ) {
        const vertexIndex = indexAttribute.getX(index);

        if (
          !Number.isInteger(vertexIndex) ||
          vertexIndex < 0 ||
          vertexIndex >= position.count
        ) {
          errors.push(
            `CAIMENT: índice de vértice inválido na posição ${index}.`,
          );
          break;
        }
      }
    }

    if (
      input.matrixWorld &&
      !isFiniteMatrix(input.matrixWorld)
    ) {
      errors.push(
        'CAIMENT: matriz de transformação possui valores inválidos.',
      );
    }
  }

  return createResult(errors, warnings, {
    landmarks: false,
    mapping: false,
    fit: false,
    resolution: false,
    geometry: true,
  });
}

/**
 * Executa todas as validações para os dados disponibilizados.
 * Dados opcionais não informados não são considerados aprovados:
 * o campo checked indica exatamente o que foi verificado.
 */
export function validateGarmentPositioning(
  input: {
    landmarks?: AvatarLandmarkMap;
    requiredLandmarks?: AvatarLandmarkName[];
    fit?: GarmentFitDefinition;
    mapping?: GarmentAnchorMappingResult;
    resolution?: GarmentFitResolution;
    geometry?: GarmentGeometryValidationInput;
  },
  options: GarmentPositioningValidationOptions = {},
): GarmentPositioningValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const checked = {
    landmarks: false,
    mapping: false,
    fit: false,
    resolution: false,
    geometry: false,
  };

  if (input.landmarks !== undefined) {
    const result = validateAvatarLandmarkPositions(
      input.landmarks,
      input.requiredLandmarks ?? [],
    );

    checked.landmarks = true;
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (input.fit !== undefined) {
    const result = validateGarmentFitDefinition(input.fit);

    checked.fit = true;
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (input.mapping !== undefined) {
    const result = validateGarmentAnchorMapping(
      input.mapping,
      options,
    );

    checked.mapping = true;
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (input.resolution !== undefined) {
    const result = validateGarmentFitResolution(
      input.resolution,
      options,
    );

    checked.resolution = true;
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (input.geometry !== undefined) {
    const result = validateGarmentGeometry(
      input.geometry,
      options,
    );

    checked.geometry = true;
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (!Object.values(checked).some(Boolean)) {
    errors.push(
      'CAIMENT: nenhum dado foi fornecido para validação.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checked,
  };
}

export default validateGarmentPositioning;
