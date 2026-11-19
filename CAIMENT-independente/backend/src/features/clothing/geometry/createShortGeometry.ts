
import * as THREE from 'three';

import {
  type ShortMeasurements,
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
 * Construtor principal do short.
 *
 * Recebe o contrato ShortMeasurements e encaminha
 * todas as medidas ao gerador universal de peças inferiores.
 *
 * A geometria, os painéis, as costuras e as âncoras
 * são produzidos pelo buildLowerBodyGarment.
 *
 * Não recria o fit para evitar divergência entre
 * a definição de encaixe e a geometria gerada.
 *
 * Todas as dimensões são recebidas em metros.
 */
function createShortGeometry(
  input: ShortMeasurements & LowerBodyMeasurements,
  options?: GarmentMeshOptions,
): THREE.Group {
  const group = buildLowerBodyGarment(
    input,
    'short',
    options,
  );

  const meshData = group.userData
    .meshData as GarmentMeshData | undefined;

  if (!meshData) {
    throw new Error(
      'CAIMENT: o gerador universal não retornou meshData para o short.',
    );
  }

  const fit =
    meshData.fit ??
    group.userData.garmentFit;

  if (!fit) {
    throw new Error(
      'CAIMENT: o gerador universal não retornou garmentFit para o short.',
    );
  }

  meshData.fit = fit;

  group.name = 'CAIMENT_Short';

  group.userData = {
    ...group.userData,

    garmentType: 'short',

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
  createShortGeometry,
};
