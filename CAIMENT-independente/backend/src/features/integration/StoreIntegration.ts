
/**
 * StoreIntegration.ts
 *
 * Camada universal de integração entre lojas parceiras e CAIMENT.
 *
 * Responsabilidades:
 * - Receber produtos individuais ou catálogos completos.
 * - Validar a estrutura dos dados recebidos.
 * - Normalizar categorias e unidades.
 * - Preservar medidas e seus metadados.
 * - Preservar as medidas de todos os tamanhos disponíveis.
 * - Preservar modelagem, imagens, cores e propriedades do tecido.
 * - Entregar dados padronizados aos adaptadores do CAIMENT.
 *
 * Este módulo não gera geometria nem executa simulações.
 */

// ============================================================
// TIPOS PRINCIPAIS
// ============================================================

export type StoreGarmentType =
  | 'tshirt'
  | 'short'
  | 'dress'
  | 'pants';

export type MeasurementUnit = 'cm';

export type MeasurementType =
  | 'circumference'
  | 'linear'
  | 'length';

// ============================================================
// MEDIDAS
// ============================================================

export interface StoreMeasurement {
  value: number;
  unit: MeasurementUnit;
  type: MeasurementType;
  landmark?: string;
}

export type StoreMeasurementInput = StoreMeasurement;

export type StoreMeasurements = Record<
  string,
  StoreMeasurement
>;

// ============================================================
// PRODUTO: CORES E IMAGENS
// ============================================================

export interface StoreColor {
  name: string;
  hex: string;
}

export interface StoreCatalogImages {
  front?: string;
  back?: string;
}

// ============================================================
// PRODUTO: TAMANHOS
// ============================================================

export interface StoreCatalogSize {
  size: string;
  measurements: StoreMeasurements;
}

// ============================================================
// PRODUTO: CATÁLOGO
// ============================================================

export interface StoreCatalogProduct {
  id: string;
  sku?: string;
  name: string;

  category: StoreGarmentType;
  categoryLabel?: string;

  price?: number;
  description?: string;
  slug?: string;

  images: StoreCatalogImages;
  colors: StoreColor[];

  material: Record<string, unknown>;
  model: Record<string, unknown>;

  measurementConvention?: string;

  sizes: StoreCatalogSize[];
}

// ============================================================
// CATÁLOGO INTEGRADO
// ============================================================

export interface IntegratedStoreCatalog {
  catalogVersion: string;
  notice?: string;

  source: {
    storeId: string;
    storeName?: string;
  };

  products: StoreCatalogProduct[];

  receivedAt: string;
}

// ============================================================
// PAYLOAD DE PRODUTO INDIVIDUAL
// ============================================================

export interface StoreProductPayload {
  id: string;
  sku?: string;
  name: string;

  category: StoreGarmentType | string;
  categoryLabel?: string;

  price?: number;
  image?: string;

  size: string;
  color: string;

  measurements: StoreMeasurements;

  /**
   * Medidas de todos os tamanhos do produto.
   *
   * Necessário para preservar o catálogo completo
   * durante a integração com o CAIMENT.
   */
  sizes?: StoreCatalogSize[];

  measurementUnit: MeasurementUnit;

  material?: Record<string, unknown>;
  model?: Record<string, unknown>;

  measurementConvention?: string;

  catalogVersion?: string;

  storeId?: string;
  storeName?: string;
}

// ============================================================
// PRODUTO INDIVIDUAL INTEGRADO
// ============================================================

export interface IntegratedStoreProduct {
  source: {
    storeId: string;
    storeName?: string;
  };

  product: {
    id: string;
    sku?: string;
    name: string;

    category: StoreGarmentType;
    categoryLabel?: string;

    price?: number;
    image?: string;
  };

  selection: {
    size: string;
    color: string;
  };

  /**
   * Medidas do tamanho selecionado.
   */
  measurements: {
    unit: MeasurementUnit;
    values: StoreMeasurements;
    convention?: string;
  };

  /**
   * Medidas de todos os tamanhos disponíveis.
   */
  sizes: StoreCatalogSize[];

  material: Record<string, unknown>;

  /**
   * Preserva geometryProfile, garmentModel,
   * fit e demais informações da modelagem.
   */
  model: Record<string, unknown>;

  catalogVersion?: string;

  receivedAt: string;
}

// ============================================================
// ERROS
// ============================================================

export class StoreIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreIntegrationError';

    Object.setPrototypeOf(
      this,
      StoreIntegrationError.prototype,
    );
  }
}

// ============================================================
// CONSTANTES
// ============================================================

const GARMENT_CATEGORIES: StoreGarmentType[] = [
  'tshirt',
  'short',
  'dress',
  'pants',
];

const MEASUREMENT_TYPES: MeasurementType[] = [
  'circumference',
  'linear',
  'length',
];

/**
 * Campos que representam posições relativas.
 *
 * Diferentemente de comprimentos e circunferências,
 * podem possuir valores negativos ou iguais a zero.
 */
const RELATIVE_POSITION_FIELDS = new Set<string>([
  'strapPositionFront',
  'strapPositionBack',
]);

// ============================================================
// VALIDAÇÕES BÁSICAS
// ============================================================

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
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

function isMeasurementType(
  value: unknown,
): value is MeasurementType {
  return (
    typeof value === 'string' &&
    MEASUREMENT_TYPES.includes(
      value as MeasurementType,
    )
  );
}

function normalizeOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    throw new StoreIntegrationError(
      `O campo "${fieldName}" precisa ser uma string não vazia.`,
    );
  }

  return value.trim();
}

// ============================================================
// NORMALIZAÇÃO DE CATEGORIAS
// ============================================================

/**
 * Identifica o tipo de roupa utilizando:
 *
 * 1. model.garmentModel
 * 2. model.geometryProfile
 * 3. category
 *
 * A categoria final precisa corresponder a um dos
 * quatro geradores universais do CAIMENT.
 *
 * Observação:
 * tshirt representa a regata no contrato atual.
 */
function normalizeCategory(
  category: string,
  model: Record<string, unknown> = {},
): StoreGarmentType {
  const geometryProfile =
    typeof model.geometryProfile === 'string'
      ? model.geometryProfile.trim().toLowerCase()
      : '';

  const garmentModel =
    typeof model.garmentModel === 'string'
      ? model.garmentModel.trim().toLowerCase()
      : '';

  const normalizedCategory =
    category.trim().toLowerCase();

  const profileMap: Record<
    string,
    StoreGarmentType
  > = {
    'tshirt-basic': 'tshirt',
    'tank-top': 'tshirt',

    'shorts-basic': 'short',

    'pants-wide-leg': 'pants',

    'dress-a-line': 'dress',
  };

  const categoryMap: Record<
    string,
    StoreGarmentType
  > = {
    tshirt: 'tshirt',
    't-shirt': 'tshirt',
    camiseta: 'tshirt',
    regata: 'tshirt',
    shirt: 'tshirt',

    short: 'short',
    shorts: 'short',
    bermuda: 'short',

    dress: 'dress',
    vestido: 'dress',

    pants: 'pants',
    trousers: 'pants',
    calca: 'pants',
    'calça': 'pants',
  };

  if (
    garmentModel &&
    profileMap[garmentModel]
  ) {
    return profileMap[garmentModel];
  }

  if (
    geometryProfile &&
    profileMap[geometryProfile]
  ) {
    return profileMap[geometryProfile];
  }

  const result = categoryMap[normalizedCategory];

  if (
    result &&
    GARMENT_CATEGORIES.includes(result)
  ) {
    return result;
  }

  if (
    normalizedCategory === 'upper' ||
    normalizedCategory === 'lower'
  ) {
    throw new StoreIntegrationError(
      `A categoria "${category}" é genérica. Informe model.geometryProfile ou model.garmentModel para identificar a peça.`,
    );
  }

  throw new StoreIntegrationError(
    `Categoria de roupa não suportada: ${category}.`,
  );
}

// ============================================================
// NORMALIZAÇÃO DE MEDIDAS
// ============================================================

/**
 * Valida e normaliza uma medida individual.
 *
 * Preserva:
 * - value
 * - unit
 * - type
 * - landmark
 *
 * Não converte medidas numéricas isoladas em medidas
 * completas, pois isso poderia atribuir um significado
 * incorreto à dimensão recebida.
 */
function normalizeMeasurement(
  key: string,
  rawMeasurement: unknown,
): StoreMeasurement {
  if (!isRecord(rawMeasurement)) {
    throw new StoreIntegrationError(
      `A medida "${key}" precisa ser um objeto contendo value, unit e type.`,
    );
  }

  const value = rawMeasurement.value;
  const unit = rawMeasurement.unit;
  const type = rawMeasurement.type;
  const landmark = rawMeasurement.landmark;

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    throw new StoreIntegrationError(
      `Valor inválido recebido na medida "${key}".`,
    );
  }

  const allowsRelativePosition =
    RELATIVE_POSITION_FIELDS.has(key);

  if (
    !allowsRelativePosition &&
    value <= 0
  ) {
    throw new StoreIntegrationError(
      `A medida "${key}" precisa possuir um valor positivo.`,
    );
  }

  if (unit !== 'cm') {
    throw new StoreIntegrationError(
      `Unidade inválida na medida "${key}". O CAIMENT espera centímetros (cm).`,
    );
  }

  if (!isMeasurementType(type)) {
    throw new StoreIntegrationError(
      `Tipo inválido ou não informado na medida "${key}".`,
    );
  }

  if (
    landmark !== undefined &&
    landmark !== null &&
    typeof landmark !== 'string'
  ) {
    throw new StoreIntegrationError(
      `O landmark da medida "${key}" precisa ser uma string.`,
    );
  }

  return {
    value,
    unit: 'cm',
    type,
    ...(isNonEmptyString(landmark)
      ? { landmark: landmark.trim() }
      : {}),
  };
}

/**
 * Normaliza todas as medidas de um tamanho.
 *
 * Não altera nomes de campos, não substitui valores
 * e não calcula dimensões ausentes.
 */
function normalizeMeasurements(
  measurements: unknown,
): StoreMeasurements {
  if (!isRecord(measurements)) {
    throw new StoreIntegrationError(
      'As medidas do produto não foram enviadas corretamente.',
    );
  }

  const normalized: StoreMeasurements = {};

  for (const [key, rawMeasurement] of Object.entries(
    measurements,
  )) {
    if (!isNonEmptyString(key)) {
      throw new StoreIntegrationError(
        'Foi recebida uma medida sem identificação.',
      );
    }

    normalized[key] = normalizeMeasurement(
      key,
      rawMeasurement,
    );
  }

  if (Object.keys(normalized).length === 0) {
    throw new StoreIntegrationError(
      'O produto precisa possuir pelo menos uma medida.',
    );
  }

  return normalized;
}

// ============================================================
// NORMALIZAÇÃO DE OBJETOS OPCIONAIS
// ============================================================

function normalizeOptionalRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value)) {
    throw new StoreIntegrationError(
      `O campo "${fieldName}" precisa ser um objeto válido.`,
    );
  }

  return { ...value };
}

// ============================================================
// NORMALIZAÇÃO DE PREÇO
// ============================================================

function normalizePrice(
  value: unknown,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new StoreIntegrationError(
      'O preço informado é inválido.',
    );
  }

  return value;
}

// ============================================================
// NORMALIZAÇÃO DA LOJA
// ============================================================

function normalizeStore(
  store?: {
    id: string;
    name?: string;
  },
  payload?: Record<string, unknown>,
): {
  storeId: string;
  storeName?: string;
} {
  const storeId =
    store?.id ??
    (typeof payload?.storeId === 'string'
      ? payload.storeId
      : undefined);

  const storeName =
    store?.name ??
    (typeof payload?.storeName === 'string'
      ? payload.storeName
      : undefined);

  return {
    storeId:
      isNonEmptyString(storeId)
        ? storeId.trim()
        : 'unidentified-store',

    storeName:
      isNonEmptyString(storeName)
        ? storeName.trim()
        : undefined,
  };
}

// ============================================================
// NORMALIZAÇÃO DE IMAGENS
// ============================================================

function normalizeImages(
  value: unknown,
): StoreCatalogImages {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value)) {
    throw new StoreIntegrationError(
      'O campo "images" precisa ser um objeto válido.',
    );
  }

  return {
    front: normalizeOptionalString(
      value.front,
      'images.front',
    ),

    back: normalizeOptionalString(
      value.back,
      'images.back',
    ),
  };
}

// ============================================================
// NORMALIZAÇÃO DE CORES
// ============================================================

function normalizeColors(
  value: unknown,
): StoreColor[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new StoreIntegrationError(
      'O produto precisa possuir pelo menos uma cor.',
    );
  }

  return value.map((color, index) => {
    if (
      !isRecord(color) ||
      !isNonEmptyString(color.name) ||
      !isNonEmptyString(color.hex)
    ) {
      throw new StoreIntegrationError(
        `A cor de índice ${index} possui dados inválidos.`,
      );
    }

    return {
      name: color.name.trim(),
      hex: color.hex.trim(),
    };
  });
}

// ============================================================
// NORMALIZAÇÃO DE TAMANHOS
// ============================================================

/**
 * Cada tamanho mantém suas próprias medidas.
 *
 * Não existe compartilhamento automático de medidas
 * entre P, M, G, GG ou outros tamanhos.
 */
function normalizeSizes(
  value: unknown,
): StoreCatalogSize[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new StoreIntegrationError(
      'O produto precisa possuir pelo menos um tamanho.',
    );
  }

  const seenSizes = new Set<string>();

  return value.map((item, index) => {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.size)
    ) {
      throw new StoreIntegrationError(
        `O tamanho de índice ${index} é inválido.`,
      );
    }

    const size = item.size.trim();

    if (seenSizes.has(size)) {
      throw new StoreIntegrationError(
        `O tamanho "${size}" está duplicado no produto.`,
      );
    }

    seenSizes.add(size);

    return {
      size,
      measurements: normalizeMeasurements(
        item.measurements,
      ),
    };
  });
}

// ============================================================
// VALIDAÇÃO DAS MEDIDAS DO PRODUTO
// ============================================================

/**
 * Confere se as medidas do tamanho selecionado
 * correspondem às medidas do tamanho informado
 * no catálogo completo.
 *
 * Evita que o produto seja recebido com duas versões
 * diferentes das mesmas medidas.
 */
function validateSelectedSize(
  selectedSize: string,
  selectedMeasurements: StoreMeasurements,
  sizes: StoreCatalogSize[],
): void {
  const catalogSize = sizes.find(
    (item) => item.size === selectedSize,
  );

  if (!catalogSize) {
    throw new StoreIntegrationError(
      `O tamanho selecionado "${selectedSize}" não existe no catálogo do produto.`,
    );
  }

  for (const [key, selectedMeasurement] of Object.entries(
    selectedMeasurements,
  )) {
    const catalogMeasurement =
      catalogSize.measurements[key];

    if (!catalogMeasurement) {
      throw new StoreIntegrationError(
        `A medida "${key}" não existe no tamanho "${selectedSize}" do catálogo.`,
      );
    }

    if (
      catalogMeasurement.value !== selectedMeasurement.value ||
      catalogMeasurement.unit !== selectedMeasurement.unit ||
      catalogMeasurement.type !== selectedMeasurement.type ||
      catalogMeasurement.landmark !== selectedMeasurement.landmark
    ) {
      throw new StoreIntegrationError(
        `A medida "${key}" enviada para o tamanho "${selectedSize}" diverge da medida cadastrada no catálogo.`,
      );
    }
  }

  const selectedKeys = Object.keys(
    selectedMeasurements,
  );

  const catalogKeys = Object.keys(
    catalogSize.measurements,
  );

  if (selectedKeys.length !== catalogKeys.length) {
    throw new StoreIntegrationError(
      `O conjunto de medidas do tamanho "${selectedSize}" está incompleto ou divergente do catálogo.`,
    );
  }
}

// ============================================================
// RECEBIMENTO DE PRODUTO INDIVIDUAL
// ============================================================

/**
 * Recebe um produto selecionado na loja.
 *
 * Estrutura esperada:
 *
 * {
 *   id,
 *   sku,
 *   name,
 *   category,
 *   categoryLabel,
 *   price,
 *   image,
 *   size,
 *   color,
 *   measurements,
 *   sizes,
 *   measurementUnit,
 *   material,
 *   model,
 *   measurementConvention,
 *   catalogVersion
 * }
 *
 * As medidas selecionadas e as medidas dos demais
 * tamanhos são mantidas separadamente.
 */
export function receiveStoreProduct(
  payload: unknown,
  store?: {
    id: string;
    name?: string;
  },
): IntegratedStoreProduct {
  if (!isRecord(payload)) {
    throw new StoreIntegrationError(
      'Os dados recebidos da loja são inválidos.',
    );
  }

  const id = payload.id;
  const name = payload.name;
  const category = payload.category;
  const size = payload.size;
  const color = payload.color;

  if (
    (typeof id !== 'string' &&
      typeof id !== 'number') ||
    String(id).trim().length === 0
  ) {
    throw new StoreIntegrationError(
      'O produto precisa possuir um identificador.',
    );
  }

  if (!isNonEmptyString(name)) {
    throw new StoreIntegrationError(
      'O produto precisa possuir um nome.',
    );
  }

  if (!isNonEmptyString(category)) {
    throw new StoreIntegrationError(
      'A categoria do produto não foi informada.',
    );
  }

  if (!isNonEmptyString(size)) {
    throw new StoreIntegrationError(
      'O tamanho selecionado não foi informado.',
    );
  }

  if (!isNonEmptyString(color)) {
    throw new StoreIntegrationError(
      'A cor selecionada não foi informada.',
    );
  }

  const model = normalizeOptionalRecord(
    payload.model,
    'model',
  );

  const material = normalizeOptionalRecord(
    payload.material,
    'material',
  );

  const measurementUnit =
    payload.measurementUnit ?? 'cm';

  if (measurementUnit !== 'cm') {
    throw new StoreIntegrationError(
      'O CAIMENT espera medidas em centímetros (cm).',
    );
  }

  const normalizedMeasurements =
    normalizeMeasurements(payload.measurements);

  const normalizedSizes = normalizeSizes(
    payload.sizes,
  );

  validateSelectedSize(
    size.trim(),
    normalizedMeasurements,
    normalizedSizes,
  );

  const source = normalizeStore(
    store,
    payload,
  );

  return {
    source,

    product: {
      id: String(id).trim(),

      sku: normalizeOptionalString(
        payload.sku,
        'sku',
      ),

      name: name.trim(),

      category: normalizeCategory(
        category,
        model,
      ),

      categoryLabel: normalizeOptionalString(
        payload.categoryLabel,
        'categoryLabel',
      ),

      price: normalizePrice(payload.price),

      image: normalizeOptionalString(
        payload.image,
        'image',
      ),
    },

    selection: {
      size: size.trim(),
      color: color.trim(),
    },

    measurements: {
      unit: 'cm',
      values: normalizedMeasurements,

      convention: normalizeOptionalString(
        payload.measurementConvention,
        'measurementConvention',
      ),
    },

    sizes: normalizedSizes,

    material,
    model,

    catalogVersion: normalizeOptionalString(
      payload.catalogVersion,
      'catalogVersion',
    ),

    receivedAt: new Date().toISOString(),
  };
}

// ============================================================
// NORMALIZAÇÃO DE PRODUTO DO CATÁLOGO
// ============================================================

/**
 * Normaliza um produto dentro de um catálogo completo.
 */
function normalizeCatalogProduct(
  value: unknown,
): StoreCatalogProduct {
  if (!isRecord(value)) {
    throw new StoreIntegrationError(
      'Um produto do catálogo possui estrutura inválida.',
    );
  }

  if (
    (typeof value.id !== 'string' &&
      typeof value.id !== 'number') ||
    String(value.id).trim().length === 0 ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.category)
  ) {
    throw new StoreIntegrationError(
      'Um produto do catálogo não possui identificador, nome ou categoria válidos.',
    );
  }

  const model = normalizeOptionalRecord(
    value.model,
    'model',
  );

  const material = normalizeOptionalRecord(
    value.material,
    'material',
  );

  return {
    id: String(value.id).trim(),

    sku: normalizeOptionalString(
      value.sku,
      'sku',
    ),

    name: value.name.trim(),

    category: normalizeCategory(
      value.category,
      model,
    ),

    categoryLabel: normalizeOptionalString(
      value.categoryLabel,
      'categoryLabel',
    ),

    price: normalizePrice(value.price),

    description: normalizeOptionalString(
      value.description,
      'description',
    ),

    slug: normalizeOptionalString(
      value.slug,
      'slug',
    ),

    images: normalizeImages(value.images),

    colors: normalizeColors(value.colors),

    material,
    model,

    measurementConvention: normalizeOptionalString(
      value.measurementConvention,
      'measurementConvention',
    ),

    sizes: normalizeSizes(value.sizes),
  };
}

// ============================================================
// RECEBIMENTO DE CATÁLOGO COMPLETO
// ============================================================

/**
 * Recebe e valida um catálogo completo da loja.
 *
 * Estrutura esperada:
 *
 * {
 *   catalogVersion: "1.2.0",
 *   notice: "...",
 *   products: [...]
 * }
 *
 * Os dados dos produtos são preservados sem gerar
 * dimensões ou substituir medidas.
 */
export function receiveStoreCatalog(
  payload: unknown,
  store?: {
    id: string;
    name?: string;
  },
): IntegratedStoreCatalog {
  if (!isRecord(payload)) {
    throw new StoreIntegrationError(
      'Os dados do catálogo são inválidos.',
    );
  }

  if (!isNonEmptyString(payload.catalogVersion)) {
    throw new StoreIntegrationError(
      'A versão do catálogo não foi informada.',
    );
  }

  if (
    !Array.isArray(payload.products) ||
    payload.products.length === 0
  ) {
    throw new StoreIntegrationError(
      'O catálogo precisa possuir pelo menos um produto.',
    );
  }

  const normalizedProducts = payload.products.map(
    normalizeCatalogProduct,
  );

  const productIds = new Set<string>();

  for (const product of normalizedProducts) {
    if (productIds.has(product.id)) {
      throw new StoreIntegrationError(
        `O identificador "${product.id}" está duplicado no catálogo.`,
      );
    }

    productIds.add(product.id);
  }

  const source = normalizeStore(
    store,
    payload,
  );

  return {
    catalogVersion: payload.catalogVersion.trim(),

    notice: normalizeOptionalString(
      payload.notice,
      'notice',
    ),

    source,

    products: normalizedProducts,

    receivedAt: new Date().toISOString(),
  };
}

// ============================================================
// IDENTIFICAÇÃO DE PRODUTO INTEGRADO
// ============================================================

export function isIntegratedStoreProduct(
  value: unknown,
): value is IntegratedStoreProduct {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !isRecord(value.source) ||
    !isRecord(value.product) ||
    !isRecord(value.selection) ||
    !isRecord(value.measurements) ||
    !isRecord(value.measurements.values) ||
    !isRecord(value.material) ||
    !isRecord(value.model) ||
    !Array.isArray(value.sizes)
  ) {
    return false;
  }

  const product = value.product;
  const selection = value.selection;
  const measurements = value.measurements;

  return (
    isNonEmptyString(value.source.storeId) &&
    isNonEmptyString(product.id) &&
    isNonEmptyString(product.name) &&
    typeof product.category === 'string' &&
    GARMENT_CATEGORIES.includes(
      product.category as StoreGarmentType,
    ) &&
    isNonEmptyString(selection.size) &&
    isNonEmptyString(selection.color) &&
    measurements.unit === 'cm' &&
    isNonEmptyString(value.receivedAt)
  );
}

// ============================================================
// IDENTIFICAÇÃO DE CATÁLOGO INTEGRADO
// ============================================================

export function isIntegratedStoreCatalog(
  value: unknown,
): value is IntegratedStoreCatalog {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.catalogVersion) &&
    isRecord(value.source) &&
    isNonEmptyString(value.source.storeId) &&
    Array.isArray(value.products) &&
    isNonEmptyString(value.receivedAt)
  );
}

// ============================================================
// UTILITÁRIOS DE ACESSO
// ============================================================

/**
 * Recupera um produto específico de um catálogo integrado.
 */
export function getIntegratedCatalogProduct(
  catalog: IntegratedStoreCatalog,
  productId: string,
): StoreCatalogProduct | undefined {
  return catalog.products.find(
    (product) => product.id === productId,
  );
}

/**
 * Recupera as medidas de um tamanho específico.
 */
export function getIntegratedProductSize(
  product: StoreCatalogProduct,
  size: string,
): StoreCatalogSize | undefined {
  return product.sizes.find(
    (item) => item.size === size,
  );
}

/**
 * Recupera as medidas de todos os tamanhos.
 *
 * Retorna os dados originais normalizados, sem
 * interpolar ou calcular medidas ausentes.
 */
export function getIntegratedProductSizes(
  product: StoreCatalogProduct,
): StoreCatalogSize[] {
  return product.sizes.map((item) => ({
    size: item.size,
    measurements: { ...item.measurements },
  }));
}

/**
 * Recupera as medidas do tamanho selecionado
 * em um produto integrado.
 */
export function getSelectedProductMeasurements(
  product: IntegratedStoreProduct,
): StoreMeasurements {
  return {
    ...product.measurements.values,
  };
}
