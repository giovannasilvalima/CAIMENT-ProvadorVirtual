
// ============================================================
// CAIMENT - TIPOS DE MEDIDAS
// ============================================================

export type MeasurementName =
  | "altura"
  | "alturaPeCintura"
  | "alturaCinturaOmbros"
  | "ombros"
  | "busto"
  | "torax"
  | "cintura"
  | "quadril";

// ============================================================
// MEDIDAS INFORMADAS PELO USUÁRIO
// ============================================================

export interface UnisexMeasurements {
  altura: number;
  alturaPeCintura: number;
  alturaCinturaOmbros: number;

  ombros: number;
  busto: number;
  torax: number;
  cintura: number;
  quadril: number;
}

export type UserMeasurements = UnisexMeasurements;

// ============================================================
// ORIGEM DA MEDIDA
// ============================================================

export type MeasurementSource =
  | "usuario"
  | "editor"
  | "estimativa"
  | "derivada"
  | "foto";

// ============================================================
// VALOR DA MEDIDA
// ============================================================

export interface MeasurementValue {
  valor: number;
  unidade: "cm";
  origem: MeasurementSource;
}

// ============================================================
// MEDIDAS DETALHADAS DO USUÁRIO
// ============================================================

export interface DetailedBodyMeasurements {
  altura: MeasurementValue;
  alturaPeCintura: MeasurementValue;
  alturaCinturaOmbros: MeasurementValue;

  ombros: MeasurementValue;
  busto: MeasurementValue;
  torax: MeasurementValue;
  cintura: MeasurementValue;
  quadril: MeasurementValue;
}

// ============================================================
// PERFIL CORPORAL
// ============================================================

export interface BodyProfile {
  medidas: DetailedBodyMeasurements;
}

// ============================================================
// MEDIDAS EDITÁVEIS
// ============================================================

export interface EditableMeasurements extends UnisexMeasurements {}

// ============================================================
// MEDIDAS INTERNAS EXIGIDAS PELO MANEQUIM
// ============================================================

export interface BodyMeasurementInput {
  alturaTotal: number;
  comprimentoInternoPernas: number;
  comprimentoCinturaOmbros: number;
  larguraOmbros: number;

  circunferenciaBusto: number;
  circunferenciaCintura: number;
  circunferenciaQuadril: number;

  comprimentoBracos: number;
  circunferenciaBracos: number;
  circunferenciaPunhos: number;

  circunferenciaCoxas: number;
  circunferenciaPanturrilhas: number;
  circunferenciaTornozelos: number;

  comprimentoPes: number;
}
