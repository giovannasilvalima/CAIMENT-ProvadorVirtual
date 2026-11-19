
export type MeasurementKind =
  | 'circumference'
  | 'length'
  | 'linear';

export type MeasurementUnit = 'cm' | 'm' | 'mm';

export interface UserMeasurementValue {
  valor?: number;
  value?: number;
  unidade?: MeasurementUnit;
  unit?: MeasurementUnit;
  origem?: string;
}

export type UserMeasurementInput =
  | number
  | UserMeasurementValue;

export interface UserMeasurements {
  [measurement: string]: UserMeasurementInput | undefined;
}

export interface ProductMeasurementValue {
  value: number;
  unit?: MeasurementUnit;
  unidade?: MeasurementUnit;
  type: MeasurementKind;
  landmark?: string;
}

export type ProductMeasurementInput =
  | number
  | ProductMeasurementValue;

export interface ProductSize {
  size: string;
  measurements: {
    [measurement: string]: ProductMeasurementInput | undefined;
  };
}

export interface SizeRecommendationOptions {
  /**
   * Classificação opcional de medidas quando
   * o produto fornece valores numéricos simples.
   */
  measurementKinds?: {
    [measurement: string]: MeasurementKind;
  };

  /**
   * Penalização aplicada quando a circunferência
   * da roupa é menor que a circunferência corporal.
   */
  circumferenceUnderfitPenalty?: number;

  /**
   * Desvio relativo máximo utilizado na pontuação.
   */
  maxDeviation?: number;

  /**
   * Unidade assumida para valores numéricos sem metadados.
   * O padrão é centímetros.
   */
  defaultUnit?: MeasurementUnit;
}

export interface MeasurementComparison {
  measurement: string;
  garmentMeasurement: string;
  userValue: number;
  garmentValue: number;
  difference: number;
  deviation: number;
  compatibility: number;
  kind: MeasurementKind;
  unit: 'cm';
}

export interface SizeCompatibility {
  size: string;
  compatibility: number;
  measurementsCompared: number;
  comparisons: MeasurementComparison[];
}

export interface SizeRecommendationResult {
  recommendedSize: string | null;
  compatibility: number;
  level:
    | 'high'
    | 'medium'
    | 'low'
    | 'incompatible'
    | 'unavailable';
  ranking: SizeCompatibility[];
  message: string;
}

/**
 * Correspondências semânticas entre as medidas
 * corporais do CAIMENT e as medidas fornecidas
 * pelos catálogos das lojas.
 *
 * A correspondência é explícita para impedir
 * comparações entre dimensões diferentes.
 */
export const MEASUREMENT_MAPPINGS = {
  torax: [
    'chestCircumference',
  ],

  busto: [
    'bustCircumference',
  ],

  cintura: [
    'waistCircumference',
    'waistWidth',
  ],

  quadril: [
    'hipCircumference',
    'hipWidth',
  ],

  ombros: [
    'shoulderWidth',
  ],
} as const;

const DEFAULT_OPTIONS = {
  circumferenceUnderfitPenalty: 2,
  maxDeviation: 0.25,
  defaultUnit: 'cm' as MeasurementUnit,
};

type NormalizedMeasurement = {
  value: number;
  unit: 'cm';
  kind?: MeasurementKind;
};

type MeasurementMapping = {
  bodyMeasurement: string;
  garmentMeasurement: string;
  kind: MeasurementKind;
};

const MEASUREMENT_MAPPINGS_LIST: MeasurementMapping[] = [
  {
    bodyMeasurement: 'torax',
    garmentMeasurement: 'chestCircumference',
    kind: 'circumference',
  },
  {
    bodyMeasurement: 'busto',
    garmentMeasurement: 'bustCircumference',
    kind: 'circumference',
  },
  {
    bodyMeasurement: 'cintura',
    garmentMeasurement: 'waistCircumference',
    kind: 'circumference',
  },
  {
    bodyMeasurement: 'cintura',
    garmentMeasurement: 'waistWidth',
    kind: 'circumference',
  },
  {
    bodyMeasurement: 'quadril',
    garmentMeasurement: 'hipCircumference',
    kind: 'circumference',
  },
  {
    bodyMeasurement: 'quadril',
    garmentMeasurement: 'hipWidth',
    kind: 'circumference',
  },
  {
    bodyMeasurement: 'ombros',
    garmentMeasurement: 'shoulderWidth',
    kind: 'linear',
  },
];

function convertToCentimeters(
  value: number,
  unit: MeasurementUnit
): number {
  switch (unit) {
    case 'm':
      return value * 100;

    case 'mm':
      return value / 10;

    case 'cm':
      return value;

    default:
      return NaN;
  }
}

/**
 * Normaliza medidas numéricas ou objetos de medida.
 *
 * Medidas corporais detalhadas do Firebase:
 * { valor: 100, unidade: 'cm', origem: 'usuario' }
 *
 * Medidas de catálogo:
 * { value: 100, unit: 'cm', type: 'circumference' }
 *
 * Valores numéricos simples são interpretados
 * conforme defaultUnit.
 */
function normalizeMeasurement(
  input: UserMeasurementInput | ProductMeasurementInput,
  defaultUnit: MeasurementUnit
): NormalizedMeasurement | null {
  let value: number;
  let unit = defaultUnit;
  let kind: MeasurementKind | undefined;

  if (typeof input === 'number') {
    value = input;
  } else if (
    input !== null &&
    typeof input === 'object'
  ) {
    const measurement = input as
      | UserMeasurementValue
      | ProductMeasurementValue;

    const rawValue =
      'value' in measurement &&
      typeof measurement.value === 'number'
        ? measurement.value
        : 'valor' in measurement &&
            typeof measurement.valor === 'number'
          ? measurement.valor
          : undefined;

    if (rawValue === undefined) {
      return null;
    }

    value = rawValue;

    if (
      measurement.unit === 'cm' ||
      measurement.unit === 'm' ||
      measurement.unit === 'mm'
    ) {
      unit = measurement.unit;
    } else if (
      measurement.unidade === 'cm' ||
      measurement.unidade === 'm' ||
      measurement.unidade === 'mm'
    ) {
      unit = measurement.unidade;
    }

    if (
      'type' in measurement &&
      (
        measurement.type === 'circumference' ||
        measurement.type === 'length' ||
        measurement.type === 'linear'
      )
    ) {
      kind = measurement.type;
    }
  } else {
    return null;
  }

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  const normalizedValue = convertToCentimeters(
    value,
    unit
  );

  if (
    !Number.isFinite(normalizedValue) ||
    normalizedValue <= 0
  ) {
    return null;
  }

  return {
    value: normalizedValue,
    unit: 'cm',
    kind,
  };
}

function calculateMeasurementCompatibility(
  userValue: number,
  garmentValue: number,
  kind: MeasurementKind,
  options: {
    circumferenceUnderfitPenalty: number;
    maxDeviation: number;
  }
): number {
  if (
    userValue <= 0 ||
    garmentValue <= 0
  ) {
    return 0;
  }

  const difference = garmentValue - userValue;

  let deviation =
    Math.abs(difference) / userValue;

  /**
   * Uma circunferência de roupa menor que a
   * circunferência corporal pode impedir o uso
   * adequado da peça.
   *
   * Por isso, recebe penalização adicional.
   *
   * A folga positiva não recebe bônus automático:
   * a folga ideal depende da modelagem e do tecido.
   */
  if (
    kind === 'circumference' &&
    difference < 0
  ) {
    deviation *=
      options.circumferenceUnderfitPenalty;
  }

  const normalizedDeviation = Math.min(
    deviation / options.maxDeviation,
    1
  );

  return Math.round(
    (1 - normalizedDeviation) * 100
  );
}

function getCompatibilityLevel(
  compatibility: number
): SizeRecommendationResult['level'] {
  if (compatibility >= 85) {
    return 'high';
  }

  if (compatibility >= 65) {
    return 'medium';
  }

  if (compatibility > 0) {
    return 'low';
  }

  return 'incompatible';
}

function createUnavailableResult(
  message: string
): SizeRecommendationResult {
  return {
    recommendedSize: null,
    compatibility: 0,
    level: 'unavailable',
    ranking: [],
    message,
  };
}

function validateOptions(
  options: SizeRecommendationOptions
): void {
  if (
    !Number.isFinite(options.maxDeviation) ||
    (options.maxDeviation ?? 0) <= 0 ||
    !Number.isFinite(
      options.circumferenceUnderfitPenalty
    ) ||
    (options.circumferenceUnderfitPenalty ?? 0) < 1
  ) {
    throw new Error(
      'Parâmetros de recomendação inválidos.'
    );
  }

  if (
    options.defaultUnit !== undefined &&
    !['cm', 'm', 'mm'].includes(options.defaultUnit)
  ) {
    throw new Error(
      'Unidade padrão de medida inválida.'
    );
  }
}

/**
 * Recomenda o tamanho mais compatível com
 * as medidas corporais do usuário.
 *
 * Não depende do catálogo FitSense.
 *
 * Os produtos podem vir de qualquer loja,
 * desde que suas medidas sejam normalizadas
 * ou fornecidas com metadados compatíveis.
 */
export function recommendSize(
  userMeasurements: UserMeasurements,
  productSizes: ProductSize[],
  customOptions: SizeRecommendationOptions = {}
): SizeRecommendationResult {
  const options = {
    ...DEFAULT_OPTIONS,
    ...customOptions,
  };

  validateOptions(options);

  if (
    !userMeasurements ||
    !Array.isArray(productSizes) ||
    productSizes.length === 0
  ) {
    return createUnavailableResult(
      'Não existem dados suficientes para recomendar um tamanho.'
    );
  }

  const normalizedUserMeasurements = new Map<
    string,
    NormalizedMeasurement
  >();

  for (
    const [measurement, input]
    of Object.entries(userMeasurements)
  ) {
    if (input === undefined) {
      continue;
    }

    const normalized = normalizeMeasurement(
      input,
      options.defaultUnit
    );

    if (normalized) {
      normalizedUserMeasurements.set(
        measurement,
        normalized
      );
    }
  }

  if (normalizedUserMeasurements.size === 0) {
    return createUnavailableResult(
      'As medidas corporais do usuário não estão disponíveis.'
    );
  }

  const ranking: SizeCompatibility[] = [];

  for (const productSize of productSizes) {
    if (
      !productSize ||
      typeof productSize.size !== 'string' ||
      productSize.size.trim().length === 0 ||
      !productSize.measurements ||
      typeof productSize.measurements !== 'object'
    ) {
      continue;
    }

    const comparisons: MeasurementComparison[] = [];

    const usedBodyMeasurements = new Set<string>();
    const usedGarmentMeasurements = new Set<string>();

    for (
      const mapping of MEASUREMENT_MAPPINGS_LIST
    ) {
      const userMeasurement =
        normalizedUserMeasurements.get(
          mapping.bodyMeasurement
        );

      if (!userMeasurement) {
        continue;
      }

      if (
        usedBodyMeasurements.has(
          mapping.bodyMeasurement
        ) ||
        usedGarmentMeasurements.has(
          mapping.garmentMeasurement
        )
      ) {
        continue;
      }

      const rawGarmentMeasurement =
        productSize.measurements[
          mapping.garmentMeasurement
        ];

      if (rawGarmentMeasurement === undefined) {
        continue;
      }

      const garmentMeasurement =
        normalizeMeasurement(
          rawGarmentMeasurement,
          options.defaultUnit
        );

      if (!garmentMeasurement) {
        continue;
      }

      const configuredKind =
        customOptions.measurementKinds?.[
          mapping.garmentMeasurement
        ];

      const kind =
        garmentMeasurement.kind ??
        configuredKind ??
        mapping.kind;

      /**
       * Impede comparar medidas com naturezas
       * diferentes, por exemplo uma medida linear
       * com uma circunferência.
       */
      if (kind !== mapping.kind) {
        continue;
      }

      const difference =
        garmentMeasurement.value -
        userMeasurement.value;

      const deviation =
        Math.abs(difference) /
        userMeasurement.value;

      const compatibility =
        calculateMeasurementCompatibility(
          userMeasurement.value,
          garmentMeasurement.value,
          kind,
          options
        );

      comparisons.push({
        measurement: mapping.bodyMeasurement,
        garmentMeasurement: mapping.garmentMeasurement,
        userValue: Number(
          userMeasurement.value.toFixed(2)
        ),
        garmentValue: Number(
          garmentMeasurement.value.toFixed(2)
        ),
        difference: Number(
          difference.toFixed(2)
        ),
        deviation: Number(
          deviation.toFixed(4)
        ),
        compatibility,
        kind,
        unit: 'cm',
      });

      usedBodyMeasurements.add(
        mapping.bodyMeasurement
      );

      usedGarmentMeasurements.add(
        mapping.garmentMeasurement
      );
    }

    if (comparisons.length === 0) {
      continue;
    }

    const totalCompatibility =
      comparisons.reduce(
        (total, comparison) =>
          total + comparison.compatibility,
        0
      );

    const compatibility = Math.round(
      totalCompatibility / comparisons.length
    );

    ranking.push({
      size: productSize.size,
      compatibility,
      measurementsCompared: comparisons.length,
      comparisons,
    });
  }

  if (ranking.length === 0) {
    return createUnavailableResult(
      'Não existem medidas semanticamente correspondentes entre o corpo do usuário e a peça.'
    );
  }

  /**
   * Ordenação:
   * 1. Maior compatibilidade.
   * 2. Maior quantidade de medidas comparadas.
   */
  ranking.sort((a, b) => {
    return (
      b.compatibility - a.compatibility ||
      b.measurementsCompared -
        a.measurementsCompared
    );
  });

  const bestMatch = ranking[0];

  const level = getCompatibilityLevel(
    bestMatch.compatibility
  );

  return {
    recommendedSize: bestMatch.size,
    compatibility: bestMatch.compatibility,
    level,
    ranking,
    message:
      level === 'high'
        ? `O tamanho ${bestMatch.size} apresenta alta compatibilidade com suas medidas.`
        : level === 'medium'
          ? `O tamanho ${bestMatch.size} apresenta compatibilidade moderada com suas medidas.`
          : level === 'low'
            ? `O tamanho ${bestMatch.size} é o mais próximo das suas medidas, mas pode não oferecer um bom caimento.`
            : 'Nenhum tamanho apresenta compatibilidade adequada com suas medidas.',
  };
}
