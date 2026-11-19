
import * as THREE from 'three';

import type {
  GarmentType,
  GarmentParameters,
  GarmentMeshData,
  GarmentResult,
  GarmentFitDefinition,
} from './geometry/types';

/**
 * ============================================================
 * CONTRATO DOS GERADORES
 * ============================================================
 */

export interface GarmentGeneratorOutput<
  TMeasurements extends object = Record<string, number>,
> {
  group: THREE.Group;
  meshData: GarmentMeshData;
  measurements?: TMeasurements;
}

export type GarmentGeneratorFunction<
  TMeasurements extends object = Record<string, number>,
> = (
  measurements: TMeasurements,
) =>
  | THREE.Group
  | GarmentGeneratorOutput<TMeasurements>;

/**
 * ============================================================
 * REGISTRO INTERNO DOS GERADORES
 * ============================================================
 */

interface RegisteredGarmentGenerator {
  type: GarmentType;
  generate: GarmentGeneratorFunction<any>;
}

const garmentGenerators = new Map<
  GarmentType,
  RegisteredGarmentGenerator
>();

/**
 * ============================================================
 * VALIDAÇÃO DE TIPOS
 * ============================================================
 */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isThreeGroup(
  value: unknown,
): value is THREE.Group {
  return value instanceof THREE.Group;
}

function isGarmentMeshData(
  value: unknown,
): value is GarmentMeshData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.panels) &&
    Array.isArray(value.seams) &&
    typeof value.vertexCount === 'number' &&
    Number.isFinite(value.vertexCount) &&
    typeof value.triangleCount === 'number' &&
    Number.isFinite(value.triangleCount)
  );
}

function isGarmentGeneratorOutput(
  value: unknown,
): value is GarmentGeneratorOutput<object> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isThreeGroup(value.group) &&
    isGarmentMeshData(value.meshData)
  );
}

/**
 * ============================================================
 * VALIDAÇÃO DAS MEDIDAS
 * ============================================================
 *
 * As medidas chegam em metros.
 *
 * Valores iguais a zero são permitidos somente em campos
 * que representam posições ou separações opcionais.
 *
 * Não são permitidas medidas negativas, NaN ou Infinity.
 */

const ZERO_ALLOWED_MEASUREMENTS = new Set([
  'strapPositionFront',
  'strapPositionBack',
  'legSeparation',
]);

function validateMeasurements(
  measurements: object,
): void {
  if (
    !measurements ||
    typeof measurements !== 'object' ||
    Array.isArray(measurements)
  ) {
    throw new Error(
      'CAIMENT: medidas da peça não foram fornecidas.',
    );
  }

  const entries = Object.entries(measurements);

  if (entries.length === 0) {
    throw new Error(
      'CAIMENT: conjunto de medidas da peça está vazio.',
    );
  }

  for (const [name, value] of entries) {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      throw new Error(
        `CAIMENT: medida "${name}" inválida. ` +
        'Esperado um número finito.',
      );
    }

    const allowsZero =
      ZERO_ALLOWED_MEASUREMENTS.has(name);

    if (
      allowsZero
        ? value < 0
        : value <= 0
    ) {
      throw new Error(
        `CAIMENT: medida "${name}" inválida. ${
          allowsZero
            ? 'Ela não pode ser negativa.'
            : 'Ela precisa ser maior que zero.'
        }`,
      );
    }
  }
}

/**
 * ============================================================
 * NORMALIZAÇÃO DOS NOMES DE CORES
 * ============================================================
 */

function normalizeColorName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const GARMENT_COLOR_NAMES: Record<string, string> = {
  // Cores básicas.
  preto: '#000000',
  preta: '#000000',
  black: '#000000',
  branco: '#FFFFFF',
  branca: '#FFFFFF',
  white: '#FFFFFF',
  offwhite: '#F5F0E8',
  'off white': '#F5F0E8',
  cinza: '#808080',
  'cinza claro': '#D3D3D3',
  'cinza escuro': '#404040',
  grafite: '#383838',
  chumbo: '#414141',
  prata: '#C0C0C0',

  // Azuis.
  azul: '#0000FF',
  blue: '#0000FF',
  'azul claro': '#ADD8E6',
  'azul bebe': '#89CFF0',
  'azul escuro': '#00008B',
  'azul marinho': '#000080',
  marinho: '#000080',
  navy: '#000080',
  'azul royal': '#4169E1',
  'azul celeste': '#87CEEB',
  'azul turquesa': '#40E0D0',
  turquesa: '#40E0D0',
  'azul jeans': '#41658A',
  jeans: '#41658A',
  denim: '#41658A',
  'azul denim': '#41658A',
  'azul petroleo': '#005F6B',

  // Vermelhos e rosas.
  vermelho: '#FF0000',
  vermelha: '#FF0000',
  red: '#FF0000',
  vinho: '#722F37',
  bordo: '#800020',
  marsala: '#955251',
  rosa: '#FFC0CB',
  pink: '#FFC0CB',
  'rosa claro': '#FFB6C1',
  'rosa bebe': '#F4C2C2',
  'rosa pink': '#FF69B4',
  magenta: '#FF00FF',
  fucsia: '#FF00FF',

  // Amarelos e laranjas.
  amarelo: '#FFFF00',
  amarela: '#FFFF00',
  yellow: '#FFFF00',
  mostarda: '#D4A017',
  dourado: '#D4AF37',
  dourada: '#D4AF37',
  laranja: '#FFA500',
  orange: '#FFA500',
  coral: '#FF7F50',
  pessego: '#FFE5B4',

  // Verdes.
  verde: '#008000',
  green: '#008000',
  'verde claro': '#90EE90',
  'verde escuro': '#006400',
  'verde oliva': '#808000',
  oliva: '#808000',
  militar: '#4B5320',
  'verde militar': '#4B5320',
  'verde musgo': '#556B2F',
  musgo: '#556B2F',
  'verde menta': '#98FF98',
  menta: '#98FF98',
  esmeralda: '#50C878',
  'verde agua': '#7FFFD4',

  // Roxos.
  roxo: '#800080',
  purple: '#800080',
  lilas: '#C8A2C8',
  lavanda: '#E6E6FA',
  violeta: '#8F00FF',
  uva: '#6F2DA8',

  // Marrons e beges.
  marrom: '#8B4513',
  'marrom claro': '#A67B5B',
  'marrom escuro': '#4B2E19',
  brown: '#8B4513',
  bege: '#F5F5DC',
  beige: '#F5F5DC',
  areia: '#C2B280',
  caramelo: '#C68E17',
  camel: '#C19A6B',
  chocolate: '#7B3F00',
  nude: '#E3BC9A',
  terracota: '#E2725B',
  caqui: '#C3B091',
};

/**
 * ============================================================
 * NORMALIZAÇÃO DA COR
 * ============================================================
 */

function normalizeGarmentColor(
  color?: THREE.ColorRepresentation,
): THREE.Color | null {
  if (color === undefined || color === null) {
    return null;
  }

  if (typeof color === 'string') {
    const originalValue = color.trim();

    if (!originalValue) {
      throw new Error(
        'CAIMENT: a cor da roupa foi informada vazia.',
      );
    }

    const normalizedName =
      normalizeColorName(originalValue);

    const mappedColor =
      GARMENT_COLOR_NAMES[normalizedName];

    const colorValue =
      mappedColor ?? originalValue;

    const isHexColor =
      /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
        .test(colorValue);

    const isNumericHex =
      /^0x[0-9a-f]{6}$/i.test(colorValue);

    const isRgbColor =
      /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)$/i
        .test(colorValue);

    const isHslColor =
      /^hsla?\(\s*[\d.]+(?:deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+)?\s*\)$/i
        .test(colorValue);

    if (
      !isHexColor &&
      !isNumericHex &&
      !isRgbColor &&
      !isHslColor
    ) {
      throw new Error(
        `CAIMENT: cor "${originalValue}" não reconhecida. ` +
        'Envie um nome de cor cadastrado ou um código HEX.',
      );
    }

    try {
      const parsedColor = new THREE.Color(colorValue);

      if (
        !Number.isFinite(parsedColor.r) ||
        !Number.isFinite(parsedColor.g) ||
        !Number.isFinite(parsedColor.b)
      ) {
        throw new Error('Valores de cor inválidos.');
      }

      return parsedColor;
    } catch (error) {
      throw new Error(
        `CAIMENT: não foi possível converter a cor "${originalValue}".`,
        { cause: error },
      );
    }
  }

  try {
    const parsedColor = new THREE.Color(color);

    if (
      !Number.isFinite(parsedColor.r) ||
      !Number.isFinite(parsedColor.g) ||
      !Number.isFinite(parsedColor.b)
    ) {
      throw new Error('Valores RGB inválidos.');
    }

    return parsedColor;
  } catch (error) {
    throw new Error(
      'CAIMENT: não foi possível interpretar a cor recebida. ' +
      'Utilize uma representação de cor compatível com Three.js.',
      { cause: error },
    );
  }
}

/**
 * ============================================================
 * APLICAÇÃO UNIVERSAL DA COR
 * ============================================================
 */

function applyGarmentColor(
  group: THREE.Group,
  color: THREE.Color,
): void {
  const processedMaterials = new Set<THREE.Material>();

  group.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh || !mesh.material) {
      return;
    }

    if (
      mesh.userData.isVisualOnly === true ||
      mesh.userData.excludeFromClothSimulation === true
    ) {
      return;
    }

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    for (const material of materials) {
      if (processedMaterials.has(material)) {
        continue;
      }

      processedMaterials.add(material);

      const colorMaterial = material as THREE.Material & {
        color?: THREE.Color;
      };

      if (
        colorMaterial.color instanceof THREE.Color
      ) {
        colorMaterial.color.copy(color);
        material.needsUpdate = true;
      }
    }
  });

  group.userData.garmentColor =
    `#${color.getHexString()}`;
}

/**
 * ============================================================
 * VALIDAÇÃO DOS DADOS DA MALHA
 * ============================================================
 */

function validateGarmentMeshData(
  meshData: GarmentMeshData,
): void {
  if (!meshData.panels.length) {
    throw new Error(
      'CAIMENT: o gerador não produziu painéis.',
    );
  }

  if (
    !Number.isFinite(meshData.vertexCount) ||
    meshData.vertexCount <= 0
  ) {
    throw new Error(
      'CAIMENT: quantidade de vértices inválida.',
    );
  }

  if (
    !Number.isFinite(meshData.triangleCount) ||
    meshData.triangleCount <= 0
  ) {
    throw new Error(
      'CAIMENT: quantidade de triângulos inválida.',
    );
  }

  const panelIds = new Set<string>();

  for (const panel of meshData.panels) {
    if (!panel.id || !panel.name) {
      throw new Error(
        'CAIMENT: foi encontrado um painel sem identificação.',
      );
    }

    if (panelIds.has(panel.id)) {
      throw new Error(
        `CAIMENT: painel duplicado "${panel.id}".`,
      );
    }

    panelIds.add(panel.id);

    if (
      !Array.isArray(panel.vertices) ||
      !Array.isArray(panel.triangles) ||
      panel.vertices.length === 0 ||
      panel.triangles.length === 0
    ) {
      throw new Error(
        `CAIMENT: painel "${panel.name}" sem geometria válida.`,
      );
    }
  }

  for (const seam of meshData.seams) {
    if (
      !panelIds.has(seam.panelAId) ||
      !panelIds.has(seam.panelBId)
    ) {
      throw new Error(
        `CAIMENT: a costura "${seam.name}" ` +
        'referencia um painel inexistente.',
      );
    }
  }

  if (meshData.fit) {
    validateFitDefinition(meshData.fit);
  }
}

/**
 * ============================================================
 * VALIDAÇÃO DA DEFINIÇÃO DE ENCAIXE
 * ============================================================
 */

function validateFitDefinition(
  fit: GarmentFitDefinition,
): void {
  if (!Array.isArray(fit.coverage)) {
    throw new Error(
      'CAIMENT: definição de encaixe sem regiões de cobertura.',
    );
  }

  if (!Array.isArray(fit.anchors)) {
    throw new Error(
      'CAIMENT: definição de encaixe sem âncoras.',
    );
  }

  if (
    !Number.isFinite(fit.clearance) ||
    fit.clearance < 0
  ) {
    throw new Error(
      'CAIMENT: folga da roupa inválida.',
    );
  }

  const anchorIds = new Set<string>();

  for (const anchor of fit.anchors) {
    if (!anchor.id || !anchor.bodyLandmark) {
      throw new Error(
        'CAIMENT: âncora anatômica incompleta.',
      );
    }

    if (anchorIds.has(anchor.id)) {
      throw new Error(
        `CAIMENT: âncora duplicada "${anchor.id}".`,
      );
    }

    anchorIds.add(anchor.id);

    const point = anchor.garmentPosition;

    if (
      !point ||
      ![
        point.x,
        point.y,
        point.z,
      ].every(Number.isFinite)
    ) {
      throw new Error(
        `CAIMENT: posição inválida na âncora "${anchor.id}".`,
      );
    }

    if (
      anchor.weight !== undefined &&
      (
        !Number.isFinite(anchor.weight) ||
        anchor.weight < 0
      )
    ) {
      throw new Error(
        `CAIMENT: peso inválido na âncora "${anchor.id}".`,
      );
    }
  }
}

/**
 * ============================================================
 * REGISTRO DE GERADORES
 * ============================================================
 */

export function registerGarmentGenerator<
  TMeasurements extends object = Record<string, number>,
>(
  type: GarmentType,
  generate: GarmentGeneratorFunction<TMeasurements>,
): void {
  if (!type) {
    throw new Error(
      'CAIMENT: tipo de roupa não informado no registro.',
    );
  }

  if (typeof generate !== 'function') {
    throw new Error(
      `CAIMENT: gerador inválido para o tipo "${type}".`,
    );
  }

  if (garmentGenerators.has(type)) {
    throw new Error(
      `CAIMENT: já existe um gerador registrado para "${type}".`,
    );
  }

  garmentGenerators.set(type, {
    type,
    generate,
  });
}

/**
 * Substitui explicitamente um gerador registrado.
 */

export function replaceGarmentGenerator<
  TMeasurements extends object = Record<string, number>,
>(
  type: GarmentType,
  generate: GarmentGeneratorFunction<TMeasurements>,
): void {
  if (!type) {
    throw new Error(
      'CAIMENT: tipo de roupa não informado.',
    );
  }

  if (typeof generate !== 'function') {
    throw new Error(
      `CAIMENT: gerador inválido para "${type}".`,
    );
  }

  garmentGenerators.set(type, {
    type,
    generate,
  });
}

/**
 * Remove um gerador do registro.
 */

export function unregisterGarmentGenerator(
  type: GarmentType,
): boolean {
  return garmentGenerators.delete(type);
}

/**
 * Verifica se existe um gerador registrado.
 */

export function hasGarmentGenerator(
  type: GarmentType,
): boolean {
  return garmentGenerators.has(type);
}

/**
 * Retorna os tipos de roupas disponíveis.
 */

export function getRegisteredGarmentTypes(): GarmentType[] {
  return Array.from(garmentGenerators.keys());
}

/**
 * ============================================================
 * NORMALIZAÇÃO DO RESULTADO
 * ============================================================
 */

function normalizeGeneratorOutput<
  TMeasurements extends object,
>(
  output:
    | THREE.Group
    | GarmentGeneratorOutput<TMeasurements>,
): GarmentGeneratorOutput<TMeasurements> {
  let group: THREE.Group;
  let meshData: GarmentMeshData;
  let measurements: TMeasurements | undefined;

  if (isThreeGroup(output)) {
    group = output;

    const storedMeshData: unknown =
      output.userData.meshData;

    if (!isGarmentMeshData(storedMeshData)) {
      throw new Error(
        'CAIMENT: o grupo retornado não contém GarmentMeshData. ' +
        'O gerador deve preservar os metadados em ' +
        'group.userData.meshData.',
      );
    }

    meshData = storedMeshData;
    measurements = undefined;
  } else if (isGarmentGeneratorOutput(output)) {
    group = output.group;
    meshData = output.meshData;
    measurements = output.measurements as
      | TMeasurements
      | undefined;
  } else {
    throw new Error(
      'CAIMENT: resultado do gerador inválido. ' +
      'Esperado THREE.Group ou objeto com group e meshData.',
    );
  }

  if (!isThreeGroup(group)) {
    throw new Error(
      'CAIMENT: o gerador não retornou um THREE.Group válido.',
    );
  }

  if (!isGarmentMeshData(meshData)) {
    throw new Error(
      'CAIMENT: o gerador não forneceu GarmentMeshData válido.',
    );
  }

  return {
    group,
    meshData,
    measurements,
  };
}

/**
 * ============================================================
 * GERAÇÃO UNIVERSAL DA ROUPA
 * ============================================================
 */

export function createGarment<
  TType extends GarmentType,
  TMeasurements extends object,
>(
  parameters: GarmentParameters<TType, TMeasurements>,
): GarmentResult<TType, TMeasurements> {
  if (!parameters) {
    throw new Error(
      'CAIMENT: parâmetros de geração não fornecidos.',
    );
  }

  const {
    id,
    name,
    type,
    measurements,
    fit,
    color,
  } = parameters;

  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(
      'CAIMENT: identificador da roupa inválido.',
    );
  }

  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(
      'CAIMENT: nome da roupa inválido.',
    );
  }

  if (!type) {
    throw new Error(
      'CAIMENT: tipo da roupa não informado.',
    );
  }

  validateMeasurements(measurements);

  const normalizedColor =
    normalizeGarmentColor(color);

  const registered =
    garmentGenerators.get(type);

  if (!registered) {
    const available =
      getRegisteredGarmentTypes();

    throw new Error(
      `CAIMENT: não existe gerador registrado para "${type}". ` +
      `Geradores disponíveis: ${
        available.join(', ') || 'nenhum'
      }.`,
    );
  }

  /**
   * 1. Geração da geometria.
   *
   * Esta chamada é síncrona.
   * A geometria é construída pelo gerador registrado.
   */
  const rawOutput =
    registered.generate(measurements);

  /**
   * 2. Normalização do resultado.
   */
  const generated =
    normalizeGeneratorOutput<TMeasurements>(
      rawOutput,
    );

  const group = generated.group;
  const meshData = generated.meshData;

  /**
   * 3. Validação da geometria e dos metadados.
   */
  validateGarmentMeshData(meshData);

  /**
   * 4. Definição universal de encaixe.
   */
  const finalFit =
    fit ?? meshData.fit;

  if (finalFit) {
    validateFitDefinition(finalFit);
    meshData.fit = finalFit;
  }

  /**
   * 5. Aplicação da cor escolhida pela loja.
   */
  if (normalizedColor) {
    applyGarmentColor(
      group,
      normalizedColor,
    );
  }

  /**
   * 6. Medidas finais.
   *
   * Se o gerador devolver medidas processadas,
   * elas são preservadas no resultado.
   *
   * Caso contrário, permanecem as medidas recebidas.
   */
  const finalMeasurements =
    generated.measurements ?? measurements;

  validateMeasurements(finalMeasurements);

  /**
   * 7. Metadados da peça.
   */
  group.name =
    `CAIMENT_${type}_${id}`;

  group.userData.garmentId = id;
  group.userData.garmentName = name;
  group.userData.garmentType = type;

  group.userData.garmentMeasurements =
    finalMeasurements;

  group.userData.meshData = meshData;
  group.userData.garmentFit =
    finalFit ?? null;

  group.userData.coordinateSystem =
    meshData.coordinateSystem;

  group.userData.garmentGenerated = true;

  group.updateMatrix();
  group.updateMatrixWorld(true);

  /**
   * 8. Resultado universal.
   */
  return {
    id,
    name,
    type,
    group,
    measurements: finalMeasurements,
    meshData,
  };
}

/**
 * ============================================================
 * UTILITÁRIOS DE REGISTRO
 * ============================================================
 */

export function clearGarmentGenerators(): void {
  garmentGenerators.clear();
}

export function getGarmentGenerator(
  type: GarmentType,
): GarmentGeneratorFunction<any> | undefined {
  return garmentGenerators.get(type)?.generate;
}

export default createGarment;
