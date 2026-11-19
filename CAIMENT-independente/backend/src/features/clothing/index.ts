/**
 * ============================================================
 * CAIMENT — MÓDULO DE ROUPAS
 * ============================================================
 *
 * Ponto central de exportação e registro dos geradores.
 *
 * Fluxo:
 * Gerador → createGarment → montagem → análise corporal
 * → alinhamento com avatar → deformação da roupa.
 */

// ============================================================
// GERAÇÃO E REGISTRO
// ============================================================

import {
  registerGarmentGenerator,
  hasGarmentGenerator,
} from './createGarment';


import { createTShirtGeometry } from './geometry/createTShirtGeometry';
import { createShortGeometry } from './geometry/createShortGeometry';
import { createDressGeometry } from './geometry/createDressGeometry';
import { createPantsGeometry } from './geometry/createPantsGeometry';

// ============================================================
// REGISTRO DOS GERADORES
// ============================================================

if (!hasGarmentGenerator('tshirt')) {
  registerGarmentGenerator('tshirt', createTShirtGeometry);
}

if (!hasGarmentGenerator('short')) {
  registerGarmentGenerator('short', createShortGeometry);
}

if (!hasGarmentGenerator('dress')) {
  registerGarmentGenerator('dress', createDressGeometry);
}

if (!hasGarmentGenerator('pants')) {
  registerGarmentGenerator('pants', createPantsGeometry);
}

// ============================================================
// API DE GERAÇÃO
// ============================================================

export {
  createGarment,
  registerGarmentGenerator,
  replaceGarmentGenerator,
  unregisterGarmentGenerator,
  hasGarmentGenerator,
  getRegisteredGarmentTypes,
} from './createGarment';

// ============================================================
// GEOMETRIA E TIPOS
// ============================================================

export * from './geometry/types';

// ============================================================
// MONTAGEM E MATERIAIS
// ============================================================

export * from './geometry/assembleGarment';
export * from './simulation/createFabricMaterial';
export * from './simulation/ClothSimulation';

// ============================================================
// GERADORES
// ============================================================

export * from './geometry/createTShirtGeometry';
export * from './geometry/createShortGeometry';
export * from './geometry/createDressGeometry';
export * from './geometry/createPantsGeometry';

// ============================================================
// AJUSTE CORPORAL E DEFORMAÇÃO
// ============================================================

export * from './geometry/MediaPipePoseAdapter';
export * from './geometry/MediaPipePhotoAnalyzer';
export * from './geometry/GarmentAvatarAlignment';
export * from './geometry/GarmentDeformation';
export * from './geometry/GarmentFittingPipeline';