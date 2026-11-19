
/* ============================================================
 * CAIMENT - TIPOS DE MEDIDAS
 * ============================================================
 *
 * As medidas corporais são armazenadas em centímetros.
 *
 * O sistema utiliza:
 * - Medidas informadas pelo usuário;
 * - Medidas corrigidas pelo editor;
 * - Estimativas obtidas pelo MediaPipe;
 * - Medidas calculadas matematicamente.
 *
 * Não depende de manequim, avatar ou malha corporal.
 * As fotografias utilizadas pelo MediaPipe são processadas
 * sem necessidade de armazenamento.
 *
 * ============================================================ */

/* ============================================================
 * NOMES DAS MEDIDAS
 * ============================================================ */

export type MeasurementName =
  | "altura"
  | "alturaPeCintura"
  | "alturaCinturaOmbros"
  | "ombros"
  | "busto"
  | "torax"
  | "cintura"
  | "quadril";

/* ============================================================
 * MEDIDAS INFORMADAS PELO USUÁRIO
 * ============================================================ */

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

/* ============================================================
 * ORIGEM DA MEDIDA
 * ============================================================ */

export type MeasurementSource =
  | "usuario"
  | "editor"
  | "estimativa"
  | "derivada";

/* ============================================================
 * VALOR DA MEDIDA
 * ============================================================ */

export interface MeasurementValue {
  valor: number;
  unidade: "cm";
  origem: MeasurementSource;
}

/* ============================================================
 * MEDIDAS DETALHADAS DO USUÁRIO
 * ============================================================ */

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

/* ============================================================
 * PERFIL CORPORAL
 * ============================================================ */

export interface BodyProfile {
  medidas: DetailedBodyMeasurements;
}

/* ============================================================
 * MEDIDAS EDITÁVEIS
 * ============================================================ */

export type EditableMeasurements = UnisexMeasurements;
