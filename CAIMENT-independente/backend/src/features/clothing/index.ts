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
