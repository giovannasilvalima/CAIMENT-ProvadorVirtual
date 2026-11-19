
import * as THREE from 'three';

import {
  type PantsMeasurements,
  type GarmentMeshData,
} from './types';

import {
  type GarmentMeshOptions,
} from './GarmentCommon';

import {
  buildLowerBodyGarment,
  type LowerBodyMeasurements,
} from './LowerBodyGarment';

/**
 * Construtor principal da calça.
 *
 * Recebe as medidas definidas pelo contrato PantsMeasurements
 * e encaminha os dados ao gerador universal de peças inferiores.
 *
 * A geometria, os painéis, as costuras e as âncoras
 * são produzidos pelo buildLowerBodyGarment.
 *
 * Não recria o fit para evitar divergência entre
 * a definição de encaixe e a geometria gerada.
 */
function createPantsGeometry(
  input: PantsMeasurements & LowerBodyMeasurements,
  options?: GarmentMeshOptions,
): THREE.Group {
  const group = buildLowerBodyGarment(
    input,
    'pants',
    options,
  );

  const meshData = group.userData
    .meshData as GarmentMeshData | undefined;

  if (!meshData) {
    throw new Error(
      'CAIMENT: o gerador universal não retornou meshData para a calça.',
    );
  }

  const fit =
    meshData.fit ??
    group.userData.garmentFit;

  if (!fit) {
    throw new Error(
      'CAIMENT: o gerador universal não retornou garmentFit para a calça.',
    );
  }

  meshData.fit = fit;

  group.name = 'CAIMENT_Pants';

  group.userData = {
    ...group.userData,

    garmentType: 'pants',

    garmentFit: fit,

    measurements: {
      ...input,
    },

    meshData,

    coordinateSystem: {
      width: 'X',
      height: 'Y',
      depth: 'Z',
      front: '+Z',
      back: '-Z',
      unit: 'meters',
      origin: 'body_floor_center',
    },
  };

  group.updateMatrixWorld(true);

  return group;
}

export {
  createPantsGeometry,
};
