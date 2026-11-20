
import type {
  TShirtMeasurements,
  DressMeasurements,
  ShortMeasurements,
  PantsMeasurements,
} from './types';

type MeasurementType = 'circumference' | 'linear' | 'length';

type MeasurementSpec = {
  field: string;
  allowedTypes: MeasurementType[];
};

interface CatalogMeasurement {
  value: number;
  unit: string;
  type: MeasurementType;
  landmark?: string;
}

interface CatalogSize {
  size: string;
  unit?: string;
  measurements: Record<string, unknown>;
}

interface ProductModel {
  geometryProfile?: string;
  garmentModel?: string;
  [key: string]: unknown;
}

interface IntegratedMeasurements {
  unit?: string;
  values?: Record<string, unknown>;
  convention?: unknown;
  [key: string]: unknown;
}

export interface StoreCatalogProduct {
  id?: string;
  name?: string;
  size?: string;

  color?: string;
  colorHex?: string;
  fabric?: {
    color?: string;
    colorHex?: string;
    [key: string]: unknown;
  };

  measurementUnit?: string;
  measurementConvention?: string;
  unit?: string;

  model?: ProductModel;

  measurements?:
    | Record<string, unknown>
    | IntegratedMeasurements;

  sizes?: CatalogSize[];

  product?: {
    id: string;
    name: string;
    category?: string;
    color?: string;
    colorHex?: string;
    [key: string]: unknown;
  };

  selection?: {
    size?: string;
    color?: string;
  };

  [key: string]: unknown;
}

export interface RegataGeometryMeasurements
  extends TShirtMeasurements {}

export interface ShortGeometryMeasurements
  extends ShortMeasurements {}

export interface DressGeometryMeasurements
  extends DressMeasurements {}

export interface PantsGeometryMeasurements
  extends PantsMeasurements {}

export type AdaptedGarment =
  | {
      type: 'tshirt';
      productId: string;
      productName: string;
      size: string;
      color?: string;
      measurements: RegataGeometryMeasurements;
    }
  | {
      type: 'short';
      productId: string;
      productName: string;
      size: string;
      color?: string;
      measurements: ShortGeometryMeasurements;
    }
  | {
      type: 'dress';
      productId: string;
      productName: string;
      size: string;
      color?: string;
      measurements: DressGeometryMeasurements;
    }
  | {
      type: 'pants';
      productId: string;
      productName: string;
      size: string;
      color?: string;
      measurements: PantsGeometryMeasurements;
    };

interface NormalizedProduct {
  id: string;
  name: string;
  size: string;
  profile: string;
  color?: string;
  measurements: Record<string, CatalogMeasurement>;
  convention?: string;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isMeasurementType(
  value: unknown,
): value is MeasurementType {
  return (
    value === 'circumference' ||
    value === 'linear' ||
    value === 'length'
  );
}

function isNonEmptyString(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  );
}

/**
 * Recupera a cor escolhida no FitSense.
 *
 * A seleção do usuário tem prioridade sobre a cor padrão
 * cadastrada no produto.
 */
function getProductColor(
  product: StoreCatalogProduct,
): string | undefined {
  const candidates: unknown[] = [
    product.selection?.color,
    product.color,
    product.colorHex,
    product.product?.color,
    product.product?.colorHex,
    product.fabric?.color,
    product.fabric?.colorHex,
  ];

  for (const candidate of candidates) {
    if (isNonEmptyString(candidate)) {
      return candidate.trim();
    }
  }

  return undefined;
}

const CIRCUMFERENCE_FIELDS = new Set([
  'chestCircumference',
  'waistCircumference',
  'hemCircumference',
  'bustWidth',
  'waistWidth',
  'hipWidth',
  'thighWidth',
  'legOpening',
  'kneeCircumference',
  'calfCircumference',
  'ankleCircumference',
  'waistbandCircumference',
]);

const LENGTH_FIELDS = new Set([
  'height',
  'length',
  'outseamLength',
  'crotchDepth',
  'rise',
  'frontRise',
  'backRise',
  'frontCrotchLength',
  'backCrotchLength',
  'bustHeight',
  'waistHeight',
  'hipHeight',
  'hemHeight',
  'strapLength',
  'frontNeckDepth',
  'backNeckDepth',
  'armholeDepth',
  'armholeFrontDepth',
  'armholeBackDepth',
  'thighHeight',
  'kneeHeight',
  'calfHeight',
  'waistbandHeight',
  'leftLegLength',
  'rightLegLength',
  'frontLength',
  'backLength',
  'skirtFrontLength',
  'skirtBackLength',
]);

const LINEAR_FIELDS = new Set([
  'width',
  'depth',
  'shoulderWidth',
  'neckWidth',
  'strapWidth',
  'strapSpacing',
  'strapPositionFront',
  'strapPositionBack',
  'necklineFrontWidth',
  'necklineBackWidth',
  'armholeWidth',
  'crotchWidth',
  'legSeparation',
  'hemWidth',
  'necklineFinishWidth',
  'armholeFinishWidth',
  'waistbandFinishWidth',
  'skirtFlare',
  'bustDepth',
  'waistDepth',
  'hipDepth',
]);

function inferMeasurementType(
  field: string,
): MeasurementType {
  if (CIRCUMFERENCE_FIELDS.has(field)) {
    return 'circumference';
  }

  if (LENGTH_FIELDS.has(field)) {
    return 'length';
  }

  if (LINEAR_FIELDS.has(field)) {
    return 'linear';
  }

  throw new Error(
    `Não foi possível identificar o tipo da medida "${field}". ` +
    'Informe explicitamente circumference, linear ou length no catálogo.',
  );
}

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase();
}

function convertToMeters(
  value: number,
  unit: string,
  field: string,
): number {
  const normalizedUnit = normalizeUnit(unit);

  if (
    normalizedUnit === 'cm' ||
    normalizedUnit === 'centimeter' ||
    normalizedUnit === 'centimeters' ||
    normalizedUnit === 'centímetro' ||
    normalizedUnit === 'centímetros'
  ) {
    return value / 100;
  }

  if (
    normalizedUnit === 'm' ||
    normalizedUnit === 'meter' ||
    normalizedUnit === 'meters' ||
    normalizedUnit === 'metro' ||
    normalizedUnit === 'metros'
  ) {
    return value;
  }

  throw new Error(
    `Unidade inválida para "${field}": "${unit}". ` +
    'Utilize centímetros (cm) ou metros (m).',
  );
}

function isZeroAllowedMeasurement(
  field: string,
): boolean {
  return (
    field === 'strapPositionFront' ||
    field === 'strapPositionBack' ||
    field === 'legSeparation'
  );
}

function normalizeMeasurements(
  source: Record<string, unknown>,
  defaultUnit: string,
): Record<string, CatalogMeasurement> {
  const result: Record<string, CatalogMeasurement> = {};

  for (const [key, raw] of Object.entries(source)) {
    let value: unknown;
    let unit = defaultUnit;
    let type: MeasurementType;
    let landmark: string | undefined;

    if (typeof raw === 'number') {
      value = raw;
      type = inferMeasurementType(key);
    } else if (isRecord(raw)) {
      value = raw.value;

      if (typeof raw.unit === 'string') {
        unit = raw.unit;
      }

      if (raw.type !== undefined) {
        if (!isMeasurementType(raw.type)) {
          throw new Error(
            `A medida "${key}" possui um tipo inválido: "${String(raw.type)}".`,
          );
        }

        type = raw.type;
      } else {
        type = inferMeasurementType(key);
      }

      if (typeof raw.landmark === 'string') {
        landmark = raw.landmark;
      }
    } else {
      throw new Error(
        `Formato inválido para a medida "${key}".`,
      );
    }

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      throw new Error(
        `A medida "${key}" possui um valor inválido.`,
      );
    }

    if (
      isZeroAllowedMeasurement(key)
        ? value < 0
        : value <= 0
    ) {
      throw new Error(
        `A medida "${key}" possui um valor inválido. ${
          isZeroAllowedMeasurement(key)
            ? 'Ela não pode ser negativa.'
            : 'Ela precisa ser maior que zero.'
        }`,
      );
    }

    convertToMeters(value, unit, key);

    result[key] = {
      value,
      unit: normalizeUnit(unit),
      type,
      landmark,
    };
  }

  if (Object.keys(result).length === 0) {
    throw new Error(
      'O produto não possui medidas cadastradas.',
    );
  }

  return result;
}

function extractMeasurementSource(
  source: Record<string, unknown>,
  fallbackUnit: string,
): {
  values: Record<string, unknown>;
  unit: string;
  convention?: string;
} {
  const unit =
    typeof source.unit === 'string'
      ? source.unit
      : fallbackUnit;

  const convention =
    typeof source.convention === 'string'
      ? source.convention
      : undefined;

  if (isRecord(source.values)) {
    return {
      values: source.values,
      unit,
      convention,
    };
  }

  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (
      key === 'unit' ||
      key === 'convention' ||
      key === 'measurementConvention'
    ) {
      continue;
    }

    values[key] = value;
  }

  return {
    values,
    unit,
    convention,
  };
}

function normalizeProduct(
  product: StoreCatalogProduct,
  selectedSize?: string,
): NormalizedProduct {
  if (!isRecord(product)) {
    throw new Error('Produto FitSense inválido.');
  }

  const id =
    product.product?.id ??
    product.id;

  const name =
    product.product?.name ??
    product.name;

  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof name !== 'string' ||
    !name.trim()
  ) {
    throw new Error(
      'O produto precisa possuir identificador e nome válidos.',
    );
  }

  const size =
    selectedSize ??
    product.selection?.size ??
    product.size;

  if (!isNonEmptyString(size)) {
    throw new Error(
      'O tamanho selecionado não foi informado.',
    );
  }

  const profile =
    product.model?.geometryProfile ??
    product.model?.garmentModel;

  if (!isNonEmptyString(profile)) {
    throw new Error(
      'O produto não informa model.geometryProfile ou model.garmentModel.',
    );
  }

  let rawMeasurements: Record<string, unknown> | undefined;

  let unit =
    product.measurementUnit ??
    product.unit ??
    'cm';

  let convention =
    typeof product.measurementConvention === 'string'
      ? product.measurementConvention
      : undefined;

  const source = product.measurements;

  if (isRecord(source)) {
    const extracted = extractMeasurementSource(
      source,
      unit,
    );

    if (Object.keys(extracted.values).length > 0) {
      rawMeasurements = extracted.values;
      unit = extracted.unit;
      convention =
        extracted.convention ??
        convention;
    }
  }

  if (
    !rawMeasurements &&
    Array.isArray(product.sizes)
  ) {
    const selected = product.sizes.find(
      (item) =>
        isRecord(item) &&
        item.size === size,
    );

    if (!selected) {
      throw new Error(
        `O tamanho "${size}" não foi encontrado no produto "${name}".`,
      );
    }

    if (!isRecord(selected.measurements)) {
      throw new Error(
        `As medidas do tamanho "${size}" são inválidas.`,
      );
    }

    const extracted = extractMeasurementSource(
      selected.measurements,
      selected.unit ?? unit,
    );

    rawMeasurements = extracted.values;
    unit = extracted.unit;

    convention =
      extracted.convention ??
      convention;
  }

  if (!rawMeasurements) {
    throw new Error(
      `O produto "${name}" não possui medidas para o tamanho "${size}".`,
    );
  }

  return {
    id,
    name,
    size: size.trim(),
    profile: profile.trim().toLowerCase(),

    // A cor é preservada separadamente das medidas.
    color: getProductColor(product),

    measurements: normalizeMeasurements(
      rawMeasurements,
      unit,
    ),

    convention,
  };
}

function getMeasurement(
  measurements: Record<string, CatalogMeasurement>,
  field: string,
  allowedTypes: MeasurementType[],
): number {
  const measurement = measurements[field];

  if (!measurement) {
    throw new Error(
      `O catálogo não fornece a medida obrigatória "${field}".`,
    );
  }

  if (!allowedTypes.includes(measurement.type)) {
    throw new Error(
      `A medida "${field}" possui tipo incompatível. ` +
      `Tipos aceitos: ${allowedTypes.join(', ')}. ` +
      `Tipo recebido: "${measurement.type}".`,
    );
  }

  return convertToMeters(
    measurement.value,
    measurement.unit,
    field,
  );
}

function getLinear(
  measurements: Record<string, CatalogMeasurement>,
  field: string,
): number {
  return getMeasurement(measurements, field, ['linear']);
}

function getGeometricDimension(
  measurements: Record<string, CatalogMeasurement>,
  field: string,
): number {
  return getMeasurement(
    measurements,
    field,
    ['linear', 'length'],
  );
}

function getCircumference(
  measurements: Record<string, CatalogMeasurement>,
  field: string,
): number {
  return getMeasurement(
    measurements,
    field,
    ['circumference'],
  );
}

function getLength(
  measurements: Record<string, CatalogMeasurement>,
  field: string,
): number {
  return getMeasurement(
    measurements,
    field,
    ['length', 'linear'],
  );
}

function getOptionalFields(
  measurements: Record<string, CatalogMeasurement>,
  specs: MeasurementSpec[],
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const spec of specs) {
    if (!measurements[spec.field]) {
      continue;
    }

    result[spec.field] = getMeasurement(
      measurements,
      spec.field,
      spec.allowedTypes,
    );
  }

  return result;
}

const LINEAR_TYPES: MeasurementType[] = ['linear'];
const LENGTH_TYPES: MeasurementType[] = ['length', 'linear'];
const DIMENSION_TYPES: MeasurementType[] = ['linear', 'length'];
const CIRCUMFERENCE_TYPES: MeasurementType[] = ['circumference'];

function adaptTShirt(
  measurements: Record<string, CatalogMeasurement>,
): RegataGeometryMeasurements {
  const required: TShirtMeasurements = {
    width: getLinear(measurements, 'width'),
    height: getLength(measurements, 'height'),
    depth: getGeometricDimension(measurements, 'depth'),
    shoulderWidth: getLinear(measurements, 'shoulderWidth'),
    neckWidth: getLinear(measurements, 'neckWidth'),
  };

  const optional = getOptionalFields(measurements, [
    { field: 'chestCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'waistCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'hemCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'bustHeight', allowedTypes: LENGTH_TYPES },
    { field: 'waistHeight', allowedTypes: LENGTH_TYPES },
    { field: 'hemHeight', allowedTypes: LENGTH_TYPES },
    { field: 'strapWidth', allowedTypes: LINEAR_TYPES },
    { field: 'strapLength', allowedTypes: LENGTH_TYPES },
    { field: 'strapSpacing', allowedTypes: LINEAR_TYPES },
    { field: 'strapPositionFront', allowedTypes: LINEAR_TYPES },
    { field: 'strapPositionBack', allowedTypes: LINEAR_TYPES },
    { field: 'frontNeckDepth', allowedTypes: LENGTH_TYPES },
    { field: 'backNeckDepth', allowedTypes: LENGTH_TYPES },
    { field: 'necklineFrontWidth', allowedTypes: LINEAR_TYPES },
    { field: 'necklineBackWidth', allowedTypes: LINEAR_TYPES },
    { field: 'armholeDepth', allowedTypes: LENGTH_TYPES },
    { field: 'armholeFrontDepth', allowedTypes: LENGTH_TYPES },
    { field: 'armholeBackDepth', allowedTypes: LENGTH_TYPES },
    { field: 'armholeWidth', allowedTypes: LINEAR_TYPES },
    { field: 'hemWidth', allowedTypes: LINEAR_TYPES },
    { field: 'necklineFinishWidth', allowedTypes: LINEAR_TYPES },
    { field: 'armholeFinishWidth', allowedTypes: LINEAR_TYPES },
  ]);

  return { ...required, ...optional };
}

function adaptDress(
  measurements: Record<string, CatalogMeasurement>,
): DressGeometryMeasurements {
  const required: DressMeasurements = {
    bustWidth: getCircumference(measurements, 'bustWidth'),
    waistWidth: getCircumference(measurements, 'waistWidth'),
    hipWidth: getCircumference(measurements, 'hipWidth'),
    length: getLength(measurements, 'length'),
    shoulderWidth: getLinear(measurements, 'shoulderWidth'),
    depth: getGeometricDimension(measurements, 'depth'),
    strapWidth: getLinear(measurements, 'strapWidth'),
  };

  const optional = getOptionalFields(measurements, [
    { field: 'strapLength', allowedTypes: LENGTH_TYPES },
    { field: 'strapSpacing', allowedTypes: LINEAR_TYPES },
    { field: 'strapPositionFront', allowedTypes: LINEAR_TYPES },
    { field: 'strapPositionBack', allowedTypes: LINEAR_TYPES },
    { field: 'frontNeckDepth', allowedTypes: LENGTH_TYPES },
    { field: 'backNeckDepth', allowedTypes: LENGTH_TYPES },
    { field: 'necklineFrontWidth', allowedTypes: LINEAR_TYPES },
    { field: 'necklineBackWidth', allowedTypes: LINEAR_TYPES },
    { field: 'armholeDepth', allowedTypes: LENGTH_TYPES },
    { field: 'armholeFrontDepth', allowedTypes: LENGTH_TYPES },
    { field: 'armholeBackDepth', allowedTypes: LENGTH_TYPES },
    { field: 'armholeWidth', allowedTypes: LINEAR_TYPES },
    { field: 'bustHeight', allowedTypes: LENGTH_TYPES },
    { field: 'waistHeight', allowedTypes: LENGTH_TYPES },
    { field: 'hipHeight', allowedTypes: LENGTH_TYPES },
    { field: 'frontLength', allowedTypes: LENGTH_TYPES },
    { field: 'backLength', allowedTypes: LENGTH_TYPES },
    { field: 'hemCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'skirtFlare', allowedTypes: DIMENSION_TYPES },
    { field: 'skirtFrontLength', allowedTypes: LENGTH_TYPES },
    { field: 'skirtBackLength', allowedTypes: LENGTH_TYPES },
    { field: 'bustDepth', allowedTypes: LENGTH_TYPES },
    { field: 'waistDepth', allowedTypes: LENGTH_TYPES },
    { field: 'hipDepth', allowedTypes: LENGTH_TYPES },
    { field: 'hemWidth', allowedTypes: LINEAR_TYPES },
    { field: 'necklineFinishWidth', allowedTypes: LINEAR_TYPES },
    { field: 'armholeFinishWidth', allowedTypes: LINEAR_TYPES },
  ]);

  return { ...required, ...optional };
}

function adaptShort(
  measurements: Record<string, CatalogMeasurement>,
): ShortGeometryMeasurements {
  const required: ShortMeasurements = {
    waistWidth: getCircumference(measurements, 'waistWidth'),
    hipWidth: getCircumference(measurements, 'hipWidth'),
    thighWidth: getCircumference(measurements, 'thighWidth'),
    legOpening: getCircumference(measurements, 'legOpening'),
    length: getLength(measurements, 'length'),
    depth: getGeometricDimension(measurements, 'depth'),
    crotchDepth: getLength(measurements, 'crotchDepth'),
    crotchWidth: getLinear(measurements, 'crotchWidth'),
    rise: getLength(measurements, 'rise'),
  };

  const optional = getOptionalFields(measurements, [
    { field: 'frontRise', allowedTypes: LENGTH_TYPES },
    { field: 'backRise', allowedTypes: LENGTH_TYPES },
    { field: 'frontCrotchLength', allowedTypes: LENGTH_TYPES },
    { field: 'backCrotchLength', allowedTypes: LENGTH_TYPES },
    { field: 'kneeCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'thighHeight', allowedTypes: LENGTH_TYPES },
    { field: 'kneeHeight', allowedTypes: LENGTH_TYPES },
    { field: 'outseamLength', allowedTypes: LENGTH_TYPES },
    { field: 'waistbandHeight', allowedTypes: LENGTH_TYPES },
    { field: 'waistbandCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'leftLegLength', allowedTypes: LENGTH_TYPES },
    { field: 'rightLegLength', allowedTypes: LENGTH_TYPES },
    { field: 'legSeparation', allowedTypes: LINEAR_TYPES },
    { field: 'hemWidth', allowedTypes: LINEAR_TYPES },
    { field: 'waistbandFinishWidth', allowedTypes: LINEAR_TYPES },
    { field: 'hemCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
  ]);

  return { ...required, ...optional };
}

function adaptPants(
  measurements: Record<string, CatalogMeasurement>,
): PantsGeometryMeasurements {
  const required: PantsMeasurements = {
    waistWidth: getCircumference(measurements, 'waistWidth'),
    hipWidth: getCircumference(measurements, 'hipWidth'),
    thighWidth: getCircumference(measurements, 'thighWidth'),
    legOpening: getCircumference(measurements, 'legOpening'),
    length: getLength(measurements, 'length'),
    depth: getGeometricDimension(measurements, 'depth'),
    crotchDepth: getLength(measurements, 'crotchDepth'),
    crotchWidth: getLinear(measurements, 'crotchWidth'),
    rise: getLength(measurements, 'rise'),
  };

  const optional = getOptionalFields(measurements, [
    { field: 'frontRise', allowedTypes: LENGTH_TYPES },
    { field: 'backRise', allowedTypes: LENGTH_TYPES },
    { field: 'frontCrotchLength', allowedTypes: LENGTH_TYPES },
    { field: 'backCrotchLength', allowedTypes: LENGTH_TYPES },
    { field: 'kneeCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'calfCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'ankleCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'thighHeight', allowedTypes: LENGTH_TYPES },
    { field: 'kneeHeight', allowedTypes: LENGTH_TYPES },
    { field: 'calfHeight', allowedTypes: LENGTH_TYPES },
    { field: 'outseamLength', allowedTypes: LENGTH_TYPES },
    { field: 'waistbandHeight', allowedTypes: LENGTH_TYPES },
    { field: 'waistbandCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
    { field: 'leftLegLength', allowedTypes: LENGTH_TYPES },
    { field: 'rightLegLength', allowedTypes: LENGTH_TYPES },
    { field: 'legSeparation', allowedTypes: LINEAR_TYPES },
    { field: 'hemWidth', allowedTypes: LINEAR_TYPES },
    { field: 'waistbandFinishWidth', allowedTypes: LINEAR_TYPES },
    { field: 'hemCircumference', allowedTypes: CIRCUMFERENCE_TYPES },
  ]);

  return { ...required, ...optional };
}

/**
 * Adaptador principal.
 *
 * Preserva a cor selecionada no FitSense e entrega
 * essa informação junto com as medidas ao CAIMENT.
 */
export function adaptStoreProductMeasurements(
  product: StoreCatalogProduct,
  selectedSize?: string,
): AdaptedGarment {
  const normalized = normalizeProduct(
    product,
    selectedSize,
  );

  const base = {
    productId: normalized.id,
    productName: normalized.name,
    size: normalized.size,
    ...(normalized.color
      ? { color: normalized.color }
      : {}),
  };

  switch (normalized.profile) {
    case 'tshirt-basic':
    case 'tank-top':
      return {
        ...base,
        type: 'tshirt',
        measurements: adaptTShirt(normalized.measurements),
      };

    case 'shorts-basic':
      return {
        ...base,
        type: 'short',
        measurements: adaptShort(normalized.measurements),
      };

    case 'dress-a-line':
      return {
        ...base,
        type: 'dress',
        measurements: adaptDress(normalized.measurements),
      };

    case 'pants-wide-leg':
      return {
        ...base,
        type: 'pants',
        measurements: adaptPants(normalized.measurements),
      };

    default:
      throw new Error(
        `Perfil de geometria não reconhecido: "${normalized.profile}".`,
      );
  }
}
