
import * as THREE from 'three';

import {
  criarCamisetaEssential,
  type CamisetaEssentialMedidas
} from './CamisetaEssential';

import {
  criarCalcaWideLeg,
  type CalcaWideLegMedidas
} from './CalcaWideLeg';

import {
  criarVestidoALine,
  type VestidoALineMedidas
} from './VestidoALine';

import {
  criarShortEssential,
  type ShortEssentialMedidas
} from './ShortEssential';

export type DemonstrationGarmentType =
  | 'tshirt'
  | 'pants'
  | 'dress'
  | 'shorts';

export type DemonstrationGarmentMeasurements =
  | CamisetaEssentialMedidas
  | CalcaWideLegMedidas
  | VestidoALineMedidas
  | ShortEssentialMedidas;

export interface DemonstrationGarmentOptions {
  type: DemonstrationGarmentType;
  measurements: DemonstrationGarmentMeasurements;
  material?: THREE.Material;
}

export function createDemonstrationGarment(
  options: DemonstrationGarmentOptions
): THREE.Group {
  const { type, measurements, material } = options;

  const medidas = {
    ...measurements,
    ...(material ? { material } : {})
  };

  let garment: THREE.Group;

  switch (type) {
    case 'tshirt':
      garment = criarCamisetaEssential(
        medidas as CamisetaEssentialMedidas
      );
      break;

    case 'pants':
      garment = criarCalcaWideLeg(
        medidas as CalcaWideLegMedidas
      );
      break;

    case 'dress':
      garment = criarVestidoALine(
        medidas as VestidoALineMedidas
      );
      break;

    case 'shorts':
      garment = criarShortEssential(
        medidas as ShortEssentialMedidas
      );
      break;

    default:
      throw new Error(
        `Peça demonstrativa não reconhecida: ${type}`
      );
  }

  garment.userData = {
    ...garment.userData,
    isDemonstrationGarment: true,
    garmentType: type
  };

  return garment;
}

export {
  criarCamisetaEssential,
  criarCalcaWideLeg,
  criarVestidoALine,
  criarShortEssential
};

export type {
  CamisetaEssentialMedidas,
  CalcaWideLegMedidas,
  VestidoALineMedidas,
  ShortEssentialMedidas
};
