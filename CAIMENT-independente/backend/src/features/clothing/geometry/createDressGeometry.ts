import * as THREE from 'three';

import {
  type DressMeasurements,
  type GarmentPanel,
  type GarmentSeam,
  type GarmentMeshData,
  type GarmentFitDefinition,
  type GarmentTriangle,
} from './types';

import { assembleGarment } from './assembleGarment';
import { createUpperBodyGarmentFit } from './UpperBodyGarment';

import {
  type GarmentMeshOptions,
  createGridTriangles,
  createPanel,
  createSmoothProfile,
  createWrapMapper,
  distributeWithKnots,
  getColumnEdge,
  resolveEdgeLength,
  resolveSegments,
} from './GarmentCommon';

// ============================================================
// CONSTANTES
// ============================================================

const MAX_STRAP_RATIO = 0.15;
const MIN_PROFILE_DISTANCE = 0.0001;
const MIN_MEASUREMENT = 0.0001;
const POSITION_TOLERANCE = 1e-9;

// ============================================================
// CONVENÇÃO VERTICAL
// ============================================================
//
// O topo de TODOS os painéis fica em Y = longest, onde
// longest = max(frontLength, backLength). Assim os ombros e as
// alças coincidem mesmo quando frente e costas têm comprimentos
// diferentes.
//
// Cada painel tem a própria barra em hemY = longest - sideLength.
//
// hipHeight, waistHeight e bustHeight são alturas absolutas a
// partir de Y = 0 (barra do painel mais longo). Quando
// frontLength === backLength === length, hemY = 0 e o
// comportamento é idêntico ao anterior.

// ============================================================
// VALIDAÇÃO DAS MEDIDAS
// ============================================================

function readMeasurements(
  input: Partial<DressMeasurements>,
): DressMeasurements {
  const required: (keyof DressMeasurements)[] = [
    'bustWidth',
    'waistWidth',
    'hipWidth',
    'length',
    'shoulderWidth',
    'depth',
    'strapWidth',
  ];

  const missing = required.filter((key) => {
    const value = input[key];

    return (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    );
  });

  if (missing.length > 0) {
    throw new Error(
      `CAIMENT: medidas obrigatórias ausentes ou inválidas: ${missing.join(', ')}. Todas as medidas devem estar em metros.`,
    );
  }

  const m = input as DressMeasurements;

  if (m.shoulderWidth > m.bustWidth) {
    throw new Error(
      'CAIMENT: shoulderWidth não pode ser maior que bustWidth.',
    );
  }

  if (m.strapWidth > m.shoulderWidth * MAX_STRAP_RATIO) {
    throw new Error(
      `CAIMENT: strapWidth não pode ultrapassar ${MAX_STRAP_RATIO * 100}% de shoulderWidth.`,
    );
  }

  const positiveOptionalFields: (keyof DressMeasurements)[] = [
    'strapLength',
    'strapSpacing',
    'frontNeckDepth',
    'backNeckDepth',
    'necklineFrontWidth',
    'necklineBackWidth',
    'armholeDepth',
    'armholeFrontDepth',
    'armholeBackDepth',
    'armholeWidth',
    'bustHeight',
    'waistHeight',
    'hipHeight',
    'frontLength',
    'backLength',
    'hemCircumference',
    'skirtFlare',
    'skirtFrontLength',
    'skirtBackLength',
    'bustDepth',
    'waistDepth',
    'hipDepth',
    'hemWidth',
    'necklineFinishWidth',
    'armholeFinishWidth',
  ];

  for (const key of positiveOptionalFields) {
    const value = m[key];

    if (value === undefined) continue;

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `CAIMENT: "${key}" deve ser um número positivo em metros.`,
      );
    }
  }

  for (const key of [
    'strapPositionFront',
    'strapPositionBack',
  ] as const) {
    const value = m[key];

    if (
      value !== undefined &&
      (typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new Error(
        `CAIMENT: "${key}" deve ser um número válido em metros.`,
      );
    }
  }

  const frontLength = m.frontLength ?? m.length;
  const backLength = m.backLength ?? m.length;

  if (frontLength > m.length || backLength > m.length) {
    throw new Error(
      'CAIMENT: frontLength e backLength não podem ultrapassar length.',
    );
  }

  const longest = Math.max(frontLength, backLength);
  const highestHem = longest - Math.min(frontLength, backLength);

  const suppliedHeights = [
    m.hipHeight,
    m.waistHeight,
    m.bustHeight,
  ].filter((value): value is number => value !== undefined);

  for (let index = 1; index < suppliedHeights.length; index++) {
    if (suppliedHeights[index] <= suppliedHeights[index - 1]) {
      throw new Error(
        'CAIMENT: as alturas precisam respeitar a ordem barra < quadril < cintura < busto < ombros.',
      );
    }
  }

  for (const [name, height] of [
    ['hipHeight', m.hipHeight],
    ['waistHeight', m.waistHeight],
    ['bustHeight', m.bustHeight],
  ] as const) {
    if (height === undefined) continue;

    if (height <= highestHem || height >= longest) {
      throw new Error(
        `CAIMENT: ${name} precisa estar acima da barra de ambos os painéis e abaixo do topo (entre ${highestHem.toFixed(4)} m e ${longest.toFixed(4)} m).`,
      );
    }
  }

  if (
    m.strapSpacing !== undefined &&
    m.strapSpacing <= m.strapWidth
  ) {
    throw new Error(
      'CAIMENT: strapSpacing precisa ser maior que strapWidth.',
    );
  }

  const SKIRT_TOLERANCE = 0.03;

  if (
    m.skirtFrontLength !== undefined &&
    m.waistHeight !== undefined &&
    m.skirtFrontLength >
      m.waistHeight - (longest - frontLength) + SKIRT_TOLERANCE
  ) {
    throw new Error(
      'CAIMENT: skirtFrontLength não pode ultrapassar a distância disponível entre a cintura e a barra frontal.',
    );
  }

  if (
    m.skirtBackLength !== undefined &&
    m.waistHeight !== undefined &&
    m.skirtBackLength >
      m.waistHeight - (longest - backLength) + SKIRT_TOLERANCE
  ) {
    throw new Error(
      'CAIMENT: skirtBackLength não pode ultrapassar a distância disponível entre a cintura e a barra traseira.',
    );
  }

  if (
    m.hemCircumference !== undefined &&
    m.hemCircumference < MIN_MEASUREMENT
  ) {
    throw new Error(
      'CAIMENT: hemCircumference precisa ser maior que zero.',
    );
  }

  return { ...m };
}

// ============================================================
// PERFIS E COORDENADAS
// ============================================================

function nearestIndex(
  values: number[],
  target: number,
): number {
  let best = 0;

  for (let i = 1; i < values.length; i++) {
    if (
      Math.abs(values[i] - target) <
      Math.abs(values[best] - target)
    ) {
      best = i;
    }
  }

  return best;
}

interface VerticalHeights {
  hip?: number;
  waist?: number;
  bust?: number;
}

/**
 * Valida as alturas absolutas contra um painel cuja barra está
 * em hemY e cujo topo está em hemY + sideLength.
 */
function resolveVerticalHeights(
  measurements: DressMeasurements,
  hemY: number,
  sideLength: number,
  panelLabel: string,
): VerticalHeights {
  const heights: VerticalHeights = {
    hip: measurements.hipHeight,
    waist: measurements.waistHeight,
    bust: measurements.bustHeight,
  };

  const top = hemY + sideLength;

  for (const [name, height] of Object.entries(heights)) {
    if (height === undefined) continue;

    if (
      !Number.isFinite(height) ||
      height <= hemY ||
      height >= top
    ) {
      throw new Error(
        `CAIMENT: ${name}Height precisa estar entre a barra e o topo do painel ${panelLabel}.`,
      );
    }
  }

  return heights;
}

/**
 * Converte altura absoluta em parâmetro t (0 = barra do painel,
 * 1 = topo do painel).
 */
function heightToT(
  height: number,
  hemY: number,
  sideLength: number,
): number {
  return THREE.MathUtils.clamp(
    (height - hemY) / sideLength,
    0,
    1,
  );
}

// ============================================================
// PERFIL DE LARGURA
// ============================================================

/**
 * Cada valor é o comprimento de arco do painel (meia
 * circunferência) naquela altura, que é o que o
 * createWrapMapper espera como panelWidth.
 */
function createWidthProfile(
  hemY: number,
  sideLength: number,
  heights: VerticalHeights,
  hemWidth: number,
  hipWidth: number,
  waistWidth: number,
  bustWidth: number,
  shoulderWidth: number,
): (t: number) => number {
  const knots: { t: number; value: number }[] = [
    { t: 0, value: hemWidth },
  ];

  if (heights.hip !== undefined) {
    knots.push({
      t: heightToT(heights.hip, hemY, sideLength),
      value: hipWidth,
    });
  }

  if (heights.waist !== undefined) {
    knots.push({
      t: heightToT(heights.waist, hemY, sideLength),
      value: waistWidth,
    });
  }

  if (heights.bust !== undefined) {
    knots.push({
      t: heightToT(heights.bust, hemY, sideLength),
      value: bustWidth,
    });
  }

  knots.push({
    t: 1,
    value: shoulderWidth,
  });

  knots.sort((a, b) => a.t - b.t);

  for (let i = 1; i < knots.length; i++) {
    if (
      knots[i].t - knots[i - 1].t <
      MIN_PROFILE_DISTANCE
    ) {
      throw new Error(
        'CAIMENT: as alturas informadas produzem pontos de controle muito próximos no perfil do vestido.',
      );
    }
  }

  return createSmoothProfile(knots);
}

// ============================================================
// PERFIL DE PROFUNDIDADE
// ============================================================

function createDepthProfile(
  measurements: DressMeasurements,
  heights: VerticalHeights,
  hemY: number,
  sideLength: number,
): (t: number) => number {
  const baseDepth = measurements.depth / 2;

  const knots: { t: number; value: number }[] = [
    {
      t: 0,
      value: baseDepth,
    },
  ];

  if (heights.hip !== undefined) {
    knots.push({
      t: heightToT(heights.hip, hemY, sideLength),
      value:
        (measurements.hipDepth ?? measurements.depth) / 2,
    });
  }

  if (heights.waist !== undefined) {
    knots.push({
      t: heightToT(heights.waist, hemY, sideLength),
      value:
        (measurements.waistDepth ?? measurements.depth) / 2,
    });
  }

  if (heights.bust !== undefined) {
    knots.push({
      t: heightToT(heights.bust, hemY, sideLength),
      value:
        (measurements.bustDepth ?? measurements.depth) / 2,
    });
  }

  knots.push({
    t: 1,
    value: baseDepth,
  });

  knots.sort((a, b) => a.t - b.t);

  for (let i = 1; i < knots.length; i++) {
    if (
      knots[i].t - knots[i - 1].t <
      MIN_PROFILE_DISTANCE
    ) {
      throw new Error(
        'CAIMENT: as alturas informadas produzem pontos de profundidade muito próximos.',
      );
    }
  }

  return createSmoothProfile(knots);
}

// ============================================================
// ABERTURAS DO CORPETE
// ============================================================

/**
 * Todas as larguras aqui estão no espaço 3D (coordenada X real
 * dos vértices já curvados), não no espaço plano do tecido.
 */
interface OpeningOptions {
  /** Metade da largura do decote (|x| < necklineHalfWidth é cortado). */
  necklineHalfWidth: number;
  necklineDepth: number;
  /** Cava: |x| > armholeStartX é cortado. */
  armholeStartX: number;
  armholeDepth: number;
}

interface StrapColumnRange {
  start: number;
  end: number;
}

function isOpeningCell(
  centerX: number,
  centerT: number,
  sideLength: number,
  options: OpeningOptions,
): boolean {
  const distanceFromTop = (1 - centerT) * sideLength;
  const absoluteX = Math.abs(centerX);

  const inNeckline =
    options.necklineDepth > 0 &&
    distanceFromTop < options.necklineDepth &&
    absoluteX < options.necklineHalfWidth;

  const inArmhole =
    options.armholeDepth > 0 &&
    distanceFromTop < options.armholeDepth &&
    absoluteX > options.armholeStartX;

  return inNeckline || inArmhole;
}

/**
 * Células das colunas das alças nunca são cortadas pelas
 * aberturas, em nenhuma linha. Isso mantém a alça ligada ao
 * corpo do vestido: a malha é um funil (alarga para baixo), então
 * um corte por X fixo desconectaria a alça nas linhas de baixo.
 *
 * A extremidade final é exclusiva (limite entre células).
 */
function isProtectedStrapCell(
  column: number,
  ranges: StrapColumnRange[],
): boolean {
  return ranges.some(
    (range) =>
      column >= range.start &&
      column < range.end,
  );
}

/**
 * Triangulação em xadrez (mesma de createGridTriangles), pulando
 * as células das aberturas. Convenção do CAIMENT: enrolamento base
 * com normal em -Z; painéis frontais (+Z) invertem.
 */
function createDressTriangles(
  rows: number,
  columns: number,
  positions: THREE.Vector3[],
  sideLength: number,
  openings: OpeningOptions,
  front: boolean,
  protectedStrapRanges: StrapColumnRange[],
): GarmentTriangle[] {
  const triangles: GarmentTriangle[] = [];

  const add = (a: number, b: number, c: number) => {
    triangles.push(front ? { a, b: c, c: b } : { a, b, c });
  };

  for (let row = 0; row < rows; row++) {
    const centerT = (row + 0.5) / rows;

    for (let column = 0; column < columns; column++) {
      const i00 = row * (columns + 1) + column;
      const i01 = i00 + 1;
      const i10 = (row + 1) * (columns + 1) + column;
      const i11 = i10 + 1;

      const centerX =
        (positions[i00].x +
          positions[i01].x +
          positions[i10].x +
          positions[i11].x) /
        4;

      if (
        isOpeningCell(centerX, centerT, sideLength, openings) &&
        !isProtectedStrapCell(column, protectedStrapRanges)
      ) {
        continue;
      }

      if ((row + column) % 2 === 1) {
        add(i00, i10, i11);
        add(i00, i11, i01);
      } else {
        add(i00, i10, i01);
        add(i01, i10, i11);
      }
    }
  }

  return triangles;
}

// ============================================================
// VALIDAÇÃO DE ARESTAS E COSTURAS
// ============================================================

const edgeSetCache = new WeakMap<GarmentPanel, Set<string>>();

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function getEdgeSet(panel: GarmentPanel): Set<string> {
  let set = edgeSetCache.get(panel);

  if (!set) {
    set = new Set<string>();

    for (const triangle of panel.triangles) {
      set.add(edgeKey(triangle.a, triangle.b));
      set.add(edgeKey(triangle.b, triangle.c));
      set.add(edgeKey(triangle.c, triangle.a));
    }

    edgeSetCache.set(panel, set);
  }

  return set;
}

function hasTriangleEdge(
  panel: GarmentPanel,
  a: number,
  b: number,
): boolean {
  return getEdgeSet(panel).has(edgeKey(a, b));
}

function getUsedVertices(panel: GarmentPanel): Set<number> {
  const used = new Set<number>();

  for (const triangle of panel.triangles) {
    used.add(triangle.a);
    used.add(triangle.b);
    used.add(triangle.c);
  }

  return used;
}

function assertPanelEdge(
  panel: GarmentPanel,
  edge: number[],
  seamName: string,
): void {
  if (edge.length < 2) {
    throw new Error(
      `CAIMENT: a costura "${seamName}" não possui vértices suficientes.`,
    );
  }

  for (let index = 0; index < edge.length - 1; index++) {
    const a = edge[index];
    const b = edge[index + 1];

    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0 ||
      a >= panel.vertices.length ||
      b >= panel.vertices.length
    ) {
      throw new Error(
        `CAIMENT: a costura "${seamName}" referencia vértices inválidos no painel "${panel.name}".`,
      );
    }

    if (!hasTriangleEdge(panel, a, b)) {
      throw new Error(
        `CAIMENT: o segmento ${a}-${b} da costura "${seamName}" não existe na triangulação do painel "${panel.name}".`,
      );
    }
  }
}

function assertMatchingSeamEdges(
  panelA: GarmentPanel,
  panelB: GarmentPanel,
  edgeA: number[],
  edgeB: number[],
  seamName: string,
): void {
  if (edgeA.length !== edgeB.length) {
    throw new Error(
      `CAIMENT: a costura "${seamName}" possui quantidades diferentes de vértices nos dois painéis.`,
    );
  }

  assertPanelEdge(panelA, edgeA, seamName);
  assertPanelEdge(panelB, edgeB, seamName);
}

// ============================================================
// BORDAS LATERAIS COMPARTILHADAS
// ============================================================

interface SharedBoundaryEdges {
  front: number[];
  back: number[];
}

function getSharedSideBoundary(
  front: GarmentPanel,
  back: GarmentPanel,
  edge: number[],
  sideName: string,
): SharedBoundaryEdges {
  if (edge.length < 2) {
    throw new Error(
      `CAIMENT: a borda ${sideName} não possui vértices suficientes para costura.`,
    );
  }

  let bestStart = -1;
  let bestEnd = -1;
  let currentStart = -1;
  let bestEdgeCount = 0;

  for (let index = 0; index < edge.length - 1; index++) {
    const a = edge[index];
    const b = edge[index + 1];

    const existsInFront = hasTriangleEdge(front, a, b);
    const existsInBack = hasTriangleEdge(back, a, b);

    if (existsInFront && existsInBack) {
      if (currentStart === -1) {
        currentStart = index;
      }

      const currentEdgeCount = index - currentStart + 1;

      if (currentEdgeCount > bestEdgeCount) {
        bestEdgeCount = currentEdgeCount;
        bestStart = currentStart;
        bestEnd = index + 1;
      }
    } else {
      currentStart = -1;
    }
  }

  if (bestStart === -1 || bestEnd <= bestStart) {
    throw new Error(
      `CAIMENT: não foi encontrada uma borda contínua compartilhada para a costura ${sideName}. Verifique as medidas das cavas e a triangulação do vestido.`,
    );
  }

  const shared = edge.slice(bestStart, bestEnd + 1);

  const result = {
    front: [...shared],
    back: [...shared],
  };

  assertMatchingSeamEdges(
    front,
    back,
    result.front,
    result.back,
    sideName,
  );

  return result;
}

// ============================================================
// ALÇAS
// ============================================================

function createDressStrap(
  id: string,
  name: string,
  type: 'leftStrap' | 'rightStrap',
  front: GarmentPanel,
  back: GarmentPanel,
  strapColumns: number[],
  topRowStart: number,
  edgeLength: number,
  strapLength?: number,
): {
  panel: GarmentPanel;
  rows: number;
} {
  const columns = strapColumns.length;

  if (columns < 2) {
    throw new Error(
      `CAIMENT: resolução insuficiente para construir ${name}. Aumente a resolução da malha ou revise strapWidth.`,
    );
  }

  const frontPoints = strapColumns.map((column) => {
    const vertex = front.vertices[topRowStart + column];

    if (!vertex) {
      throw new Error(
        `CAIMENT: vértice frontal ausente na construção de ${name}.`,
      );
    }

    return vertex.position;
  });

  const backPoints = strapColumns.map((column) => {
    const vertex = back.vertices[topRowStart + column];

    if (!vertex) {
      throw new Error(
        `CAIMENT: vértice traseiro ausente na construção de ${name}.`,
      );
    }

    return vertex.position;
  });

  const span = Math.max(
    ...frontPoints.map((point, index) =>
      point.distanceTo(backPoints[index]),
    ),
  );

  if (strapLength !== undefined && strapLength < span) {
    throw new Error(
      `CAIMENT: strapLength (${strapLength} m) é menor que a distância entre frente e costas (${span.toFixed(4)} m).`,
    );
  }

  /**
   * O arco segue y = h·sin(πt). Seu comprimento é
   * aproximadamente span + π²h²/(4·span), logo:
   * h = (2/π)·√(span·(strapLength − span)).
   */
  const archHeight =
    strapLength !== undefined && strapLength > span
      ? (2 / Math.PI) *
        Math.sqrt(span * (strapLength - span))
      : 0;

  const pathLength = Math.max(
    strapLength ?? span,
    span,
    edgeLength,
  );

  const rows = resolveSegments(
    pathLength,
    edgeLength,
    4,
    24,
  );

  const positions: THREE.Vector3[] = [];

  for (let row = 0; row <= rows; row++) {
    const t = row / rows;

    for (let column = 0; column < columns; column++) {
      const point = frontPoints[column]
        .clone()
        .lerp(backPoints[column], t);

      point.y += Math.sin(Math.PI * t) * archHeight;

      positions.push(point);
    }
  }

  /**
   * Linhas da alça vão da frente (+Z) para as costas (-Z) e as
   * colunas crescem em +X, então o enrolamento base tem normal
   * em -Y. Invertemos para a face externa apontar para cima.
   */
  const triangles = createGridTriangles(
    rows,
    columns - 1,
    true,
  );

  const panel = createPanel({
    id,
    name,
    type,
    positions,
    triangles,
  });

  return {
    panel,
    rows,
  };
}

function createStrapSeams(
  prefix: string,
  label: string,
  strap: {
    panel: GarmentPanel;
    rows: number;
  },
  strapColumns: number[],
  front: GarmentPanel,
  back: GarmentPanel,
  topRowStart: number,
): GarmentSeam[] {
  const count = strapColumns.length;

  const panelEdge = strapColumns.map(
    (column) => topRowStart + column,
  );

  const strapFrontEdge = Array.from(
    { length: count },
    (_, index) => index,
  );

  const strapBackEdge = Array.from(
    { length: count },
    (_, index) => strap.rows * count + index,
  );

  assertMatchingSeamEdges(
    front,
    strap.panel,
    panelEdge,
    strapFrontEdge,
    `Alça ${label} - frente`,
  );

  assertMatchingSeamEdges(
    back,
    strap.panel,
    panelEdge,
    strapBackEdge,
    `Alça ${label} - costas`,
  );

  return [
    {
      id: `${prefix}-strap-front`,
      name: `Alça ${label} - frente`,
      panelAId: front.id,
      panelBId: strap.panel.id,
      edgeA: panelEdge,
      edgeB: strapFrontEdge,
      stiffness: 1,
    },
    {
      id: `${prefix}-strap-back`,
      name: `Alça ${label} - costas`,
      panelAId: back.id,
      panelBId: strap.panel.id,
      edgeA: panelEdge,
      edgeB: strapBackEdge,
      stiffness: 1,
    },
  ];
}

// ============================================================
// ÂNCORAS E REGIÕES DO ENCAIXE
// ============================================================

interface DressFitInput {
  front: GarmentPanel;
  rows: number;
  columns: number;
  heights: VerticalHeights;
  frontHemY: number;
  frontLength: number;
  backHemY: number;
  backLength: number;
  panels: GarmentPanel[];
  leftStrapColumns: number[];
  rightStrapColumns: number[];
}

function createDressFit({
  front,
  rows,
  columns,
  heights,
  frontHemY,
  frontLength,
  backHemY,
  backLength,
  panels,
  leftStrapColumns,
  rightStrapColumns,
}: DressFitInput): GarmentFitDefinition {
  const centerColumn = Math.floor(columns / 2);
  const rowStride = columns + 1;

  const usedFront = getUsedVertices(front);

  /**
   * Devolve o vértice que realmente pertence à triangulação mais
   * próximo de (row, column). Âncoras em vértices cortados pelas
   * aberturas ficariam presas em pontos fora da malha.
   */
  const nearestUsedPosition = (
    row: number,
    column: number,
  ): THREE.Vector3 => {
    const maxRadius = Math.max(rows, columns);

    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) {
            continue;
          }

          const r = row + dr;
          const c = column + dc;

          if (r < 0 || r > rows || c < 0 || c > columns) {
            continue;
          }

          const index = r * rowStride + c;

          if (usedFront.has(index)) {
            return front.vertices[index].position.clone();
          }
        }
      }
    }

    throw new Error(
      'CAIMENT: não foi possível localizar um vértice utilizável para uma âncora do vestido.',
    );
  };

  const positionAtHeight = (
    heightAbsolute: number,
    column: number,
  ): THREE.Vector3 => {
    const t = heightToT(
      heightAbsolute,
      frontHemY,
      frontLength,
    );

    const row = THREE.MathUtils.clamp(
      Math.round(t * rows),
      0,
      rows,
    );

    return nearestUsedPosition(
      row,
      THREE.MathUtils.clamp(column, 0, columns),
    );
  };

  const midColumn = (strapColumns: number[]) =>
    strapColumns[Math.floor(strapColumns.length / 2)];

  // Base do pescoço: primeira linha, descendo do topo, em que o
  // vértice central existe (abaixo do decote, se houver).
  let neckRow = rows;

  while (
    neckRow > 0 &&
    !usedFront.has(neckRow * rowStride + centerColumn)
  ) {
    neckRow--;
  }

  const anchors: GarmentFitDefinition['anchors'] = [
    {
      id: 'dress-left-shoulder',
      bodyLandmark: 'leftShoulder',
      garmentPosition: nearestUsedPosition(
        rows,
        midColumn(leftStrapColumns),
      ),
      weight: 1.5,
    },
    {
      id: 'dress-right-shoulder',
      bodyLandmark: 'rightShoulder',
      garmentPosition: nearestUsedPosition(
        rows,
        midColumn(rightStrapColumns),
      ),
      weight: 1.5,
    },
    {
      id: 'dress-neck-base',
      bodyLandmark: 'neckBase',
      garmentPosition: nearestUsedPosition(
        neckRow,
        centerColumn,
      ),
      weight: 0.7,
    },
  ];

  if (heights.hip !== undefined) {
    anchors.push(
      {
        id: 'dress-hip-center',
        bodyLandmark: 'hipCenter',
        garmentPosition: positionAtHeight(
          heights.hip,
          centerColumn,
        ),
        weight: 1.2,
      },
      {
        id: 'dress-left-hip',
        bodyLandmark: 'leftHip',
        garmentPosition: positionAtHeight(heights.hip, 0),
        weight: 0.8,
      },
      {
        id: 'dress-right-hip',
        bodyLandmark: 'rightHip',
        garmentPosition: positionAtHeight(
          heights.hip,
          columns,
        ),
        weight: 0.8,
      },
    );
  }

  if (heights.waist !== undefined) {
    anchors.push({
      id: 'dress-waist-center',
      bodyLandmark: 'waistCenter',
      garmentPosition: positionAtHeight(
        heights.waist,
        centerColumn,
      ),
      weight: 1,
    });
  }

  if (heights.bust !== undefined) {
    anchors.push({
      id: 'dress-bust-center',
      bodyLandmark: 'bustCenter',
      garmentPosition: positionAtHeight(
        heights.bust,
        centerColumn,
      ),
      weight: 1,
    });
  }

  const regions: NonNullable<GarmentFitDefinition['regions']> = [];
  const supports: NonNullable<GarmentFitDefinition['supports']> = [];

  let globalOffset = 0;

  for (const panel of panels) {
    const isMainPanel =
      panel.id === 'front' || panel.id === 'back';

    if (isMainPanel) {
      if (panel.vertices.length !== (rows + 1) * rowStride) {
        throw new Error(
          `CAIMENT: quantidade inesperada de vértices no painel ${panel.id}.`,
        );
      }

      if (heights.waist !== undefined) {
        const isFrontPanel = panel.id === 'front';

        const panelLength = isFrontPanel
          ? frontLength
          : backLength;

        const panelHemY = isFrontPanel
          ? frontHemY
          : backHemY;

        const used = getUsedVertices(panel);

        const bodiceStartRow = THREE.MathUtils.clamp(
          Math.round(
            heightToT(
              heights.waist,
              panelHemY,
              panelLength,
            ) * rows,
          ),
          0,
          rows,
        );

        const bodiceIndices: number[] = [];
        const skirtIndices: number[] = [];

        for (let row = 0; row <= rows; row++) {
          for (let column = 0; column <= columns; column++) {
            const localIndex = row * rowStride + column;

            // Vértices cortados pelas aberturas não entram.
            if (!used.has(localIndex)) continue;

            const globalIndex = globalOffset + localIndex;

            if (row >= bodiceStartRow) {
              bodiceIndices.push(globalIndex);
            } else {
              skirtIndices.push(globalIndex);
            }
          }
        }

        const side = panel.id;

        if (bodiceIndices.length > 0) {
          const regionId = `dress-${side}-bodice-contact`;

          regions.push({
            id: regionId,
            name: `Corpete ${side}`,
            bodyRegion: 'chest',
            vertexIndices: bodiceIndices,
            role: 'contact',
          });

          supports.push({
            id: `${regionId}-support`,
            garmentRegionId: regionId,
            bodyRegion: 'chest',
            mode: 'contact',
            strength: 1,
          });
        }

        if (skirtIndices.length > 0) {
          const regionId = `dress-${side}-skirt-hang`;

          regions.push({
            id: regionId,
            name: `Saia ${side}`,
            bodyRegion: 'pelvis',
            vertexIndices: skirtIndices,
            role: 'support',
          });

          supports.push({
            id: `${regionId}-support`,
            garmentRegionId: regionId,
            bodyRegion: 'pelvis',
            mode: 'hang',
            strength: 0.15,
          });
        }
      }
    }

    globalOffset += panel.vertices.length;
  }

  return {
    coverage: [
      'shoulders',
      'chest',
      'abdomen',
      'pelvis',
      'leftThigh',
      'rightThigh',
    ],
    clearance: 0.02,
    anchors,
    regions,
    supports,
  };
}

// ============================================================
// GERADOR PRINCIPAL
// ============================================================

function createDressGeometry(
  input: Partial<DressMeasurements> = {},
  options?: GarmentMeshOptions,
): THREE.Group {
  const m = readMeasurements(input);

  const edgeLength = resolveEdgeLength(options);

  const frontLength = m.frontLength ?? m.length;
  const backLength = m.backLength ?? m.length;

  // Referência vertical: topo de todos os painéis em Y = longest.
  const longest = Math.max(frontLength, backLength);
  const frontHemY = longest - frontLength;
  const backHemY = longest - backLength;

  const rows = resolveSegments(longest, edgeLength, 16, 64);

  // Cada painel cobre metade da circunferência.
  const columns = resolveSegments(
    Math.max(
      m.bustWidth,
      m.hipWidth,
      m.waistWidth,
      m.shoulderWidth,
    ) / 2,
    edgeLength,
    20,
    64,
    true,
  );

  // ----------------------------------------------------------
  // ALTURAS
  // ----------------------------------------------------------

  const frontHeights = resolveVerticalHeights(
    m,
    frontHemY,
    frontLength,
    'frontal',
  );

  const backHeights = resolveVerticalHeights(
    m,
    backHemY,
    backLength,
    'traseiro',
  );

  // ----------------------------------------------------------
  // BARRA E MODELAGEM DA SAIA
  // ----------------------------------------------------------

  /**
   * hemWidth (acabamento) não é circunferência. Na ausência de
   * hemCircumference, usa-se hipWidth (circunferência completa do
   * quadril) como referência, sem inventar uma medida.
   */
  const hemCircumference = m.hemCircumference ?? m.hipWidth;

  const skirtHemCircumference =
    hemCircumference + (m.skirtFlare ?? 0);

  const hemHalfWidth = skirtHemCircumference / 2;

  const frontWidthAt = createWidthProfile(
    frontHemY,
    frontLength,
    frontHeights,
    hemHalfWidth,
    m.hipWidth / 2,
    m.waistWidth / 2,
    m.bustWidth / 2,
    m.shoulderWidth / 2,
  );

  const backWidthAt = createWidthProfile(
    backHemY,
    backLength,
    backHeights,
    hemHalfWidth,
    m.hipWidth / 2,
    m.waistWidth / 2,
    m.bustWidth / 2,
    m.shoulderWidth / 2,
  );

  // ----------------------------------------------------------
  // PROFUNDIDADE
  // ----------------------------------------------------------

  const frontHalfDepthAt = createDepthProfile(
    m,
    frontHeights,
    frontHemY,
    frontLength,
  );

  const backHalfDepthAt = createDepthProfile(
    m,
    backHeights,
    backHemY,
    backLength,
  );

  // ----------------------------------------------------------
  // POSIÇÃO E DISTRIBUIÇÃO DAS ALÇAS
  // ----------------------------------------------------------

  /**
   * No topo, o tecido plano tem largura shoulderWidth / 2 (é o
   * valor do perfil em t = 1). Posições das alças são medidas
   * nesse espaço plano, de -topWidth/2 a +topWidth/2.
   */
  const topWidth = m.shoulderWidth / 2;
  const topHalfFlat = topWidth / 2;

  const frontPosition =
    m.strapPositionFront !== undefined
      ? Math.abs(m.strapPositionFront)
      : undefined;

  const backPosition =
    m.strapPositionBack !== undefined
      ? Math.abs(m.strapPositionBack)
      : undefined;

  const catalogPosition =
    frontPosition !== undefined && backPosition !== undefined
      ? (frontPosition + backPosition) / 2
      : frontPosition ?? backPosition;

  const maximumStrapCenter = topHalfFlat - m.strapWidth / 2;

  const strapCenter =
    m.strapSpacing !== undefined
      ? m.strapSpacing / 2
      : catalogPosition ?? maximumStrapCenter;

  if (
    strapCenter - m.strapWidth / 2 <= 0 ||
    strapCenter > maximumStrapCenter + POSITION_TOLERANCE
  ) {
    throw new Error(
      'CAIMENT: a posição das alças ultrapassa a largura disponível dos ombros.',
    );
  }

  const toU = (x: number) => 0.5 + x / topWidth;

  const leftOuterU = toU(-strapCenter - m.strapWidth / 2);
  const leftInnerU = toU(-strapCenter + m.strapWidth / 2);
  const rightInnerU = toU(strapCenter - m.strapWidth / 2);
  const rightOuterU = toU(strapCenter + m.strapWidth / 2);

  const halfColumns = columns / 2;

  const leftHalf = distributeWithKnots(
    [0, leftOuterU * 2, leftInnerU * 2, 1],
    halfColumns,
  );

  const columnU = Array.from(
    { length: columns + 1 },
    (_, index) => {
      if (index <= halfColumns) {
        return leftHalf[index] / 2;
      }

      return 1 - leftHalf[columns - index] / 2;
    },
  );

  // Colunas das alças (início = lado de menor X, fim = maior X).
  const leftStartColumn = nearestIndex(columnU, leftOuterU);
  const leftEndColumn = nearestIndex(columnU, leftInnerU);
  const rightStartColumn = nearestIndex(columnU, rightInnerU);
  const rightEndColumn = nearestIndex(columnU, rightOuterU);

  if (
    leftEndColumn <= leftStartColumn ||
    rightEndColumn <= rightStartColumn
  ) {
    throw new Error(
      'CAIMENT: a resolução da malha não permite representar a largura das alças. Aumente a resolução da peça.',
    );
  }

  if (leftEndColumn >= rightStartColumn) {
    throw new Error(
      'CAIMENT: as alças se encontram no centro. Reduza strapWidth ou aumente strapSpacing.',
    );
  }

  const leftStrapColumns = Array.from(
    { length: leftEndColumn - leftStartColumn + 1 },
    (_, index) => leftStartColumn + index,
  );

  const rightStrapColumns = Array.from(
    { length: rightEndColumn - rightStartColumn + 1 },
    (_, index) => rightStartColumn + index,
  );

  const protectedStrapRanges: StrapColumnRange[] = [
    { start: leftStartColumn, end: leftEndColumn },
    { start: rightStartColumn, end: rightEndColumn },
  ];

  // ----------------------------------------------------------
  // ABERTURAS DO DECOTE E DAS CAVAS
  // ----------------------------------------------------------

  /**
   * As aberturas são cortadas por X real (já curvado). Os padrões
   * são derivados da posição 3D das colunas das alças no topo.
   */
  const topWrap = createWrapMapper(topWidth, m.depth / 2);

  const topColumnX = (column: number) =>
    Math.abs(
      topWrap.map((columnU[column] - 0.5) * topWidth).x,
    );

  const strapOuterX = topColumnX(leftStartColumn);
  const strapInnerX = topColumnX(leftEndColumn);
  const topHalfExtent = topWrap.halfExtent;

  const necklineFrontWidth =
    m.necklineFrontWidth ?? 2 * strapInnerX;

  const necklineBackWidth =
    m.necklineBackWidth ?? necklineFrontWidth;

  const armholeWidth =
    m.armholeWidth ?? Math.max(topHalfExtent - strapOuterX, 0);

  const frontNeckDepth = m.frontNeckDepth ?? 0;
  const backNeckDepth = m.backNeckDepth ?? 0;

  const frontArmholeDepth =
    m.armholeFrontDepth ?? m.armholeDepth ?? 0;

  const backArmholeDepth =
    m.armholeBackDepth ?? m.armholeDepth ?? 0;

  const armholeStartX = Math.max(topHalfExtent - armholeWidth, 0);

  const frontOpenings: OpeningOptions = {
    necklineHalfWidth: necklineFrontWidth / 2,
    necklineDepth: frontNeckDepth,
    armholeStartX,
    armholeDepth: frontArmholeDepth,
  };

  const backOpenings: OpeningOptions = {
    necklineHalfWidth: necklineBackWidth / 2,
    necklineDepth: backNeckDepth,
    armholeStartX,
    armholeDepth: backArmholeDepth,
  };

  // ----------------------------------------------------------
  // PAINÉIS FRONTAL E TRASEIRO
  // ----------------------------------------------------------

  const createBodyPanel = (
    type: 'front' | 'back',
  ): GarmentPanel => {
    const isFront = type === 'front';

    const sideLength = isFront ? frontLength : backLength;
    const hemY = isFront ? frontHemY : backHemY;
    const widthAt = isFront ? frontWidthAt : backWidthAt;
    const halfDepthAt = isFront
      ? frontHalfDepthAt
      : backHalfDepthAt;

    const sign = isFront ? 1 : -1;

    const openings = isFront ? frontOpenings : backOpenings;

    const positions: THREE.Vector3[] = [];

    for (let row = 0; row <= rows; row++) {
      const t = row / rows;

      const width = widthAt(t);
      const halfDepth = halfDepthAt(t);

      if (
        !Number.isFinite(width) ||
        !Number.isFinite(halfDepth) ||
        width <= 0 ||
        halfDepth <= 0
      ) {
        throw new Error(
          `CAIMENT: perfil inválido de largura ou profundidade no painel ${type}, linha ${row}.`,
        );
      }

      const wrap = createWrapMapper(width, halfDepth);

      const y = hemY + t * sideLength;

      for (let column = 0; column <= columns; column++) {
        const s = (columnU[column] - 0.5) * width;

        const point = wrap.map(s);

        positions.push(
          new THREE.Vector3(point.x, y, sign * point.z),
        );
      }
    }

    const triangles = createDressTriangles(
      rows,
      columns,
      positions,
      sideLength,
      openings,
      isFront,
      protectedStrapRanges,
    );

    return createPanel({
      id: type,
      name: isFront ? 'Frente do vestido' : 'Costas do vestido',
      type,
      positions,
      triangles,
    });
  };

  const front = createBodyPanel('front');
  const back = createBodyPanel('back');

  // ----------------------------------------------------------
  // FIXAÇÃO DAS ALÇAS
  // ----------------------------------------------------------

  const topRowStart = rows * (columns + 1);

  const assertStrapAttachment = (
    panel: GarmentPanel,
    strapColumns: number[],
    strapName: string,
  ): void => {
    assertPanelEdge(
      panel,
      strapColumns.map((column) => topRowStart + column),
      `${strapName} - fixação`,
    );
  };

  assertStrapAttachment(front, leftStrapColumns, 'Alça esquerda frontal');
  assertStrapAttachment(back, leftStrapColumns, 'Alça esquerda traseira');
  assertStrapAttachment(front, rightStrapColumns, 'Alça direita frontal');
  assertStrapAttachment(back, rightStrapColumns, 'Alça direita traseira');

  // ----------------------------------------------------------
  // ALÇAS
  // ----------------------------------------------------------

  const leftStrap = createDressStrap(
    'left-strap',
    'Alça esquerda',
    'leftStrap',
    front,
    back,
    leftStrapColumns,
    topRowStart,
    edgeLength,
    m.strapLength,
  );

  const rightStrap = createDressStrap(
    'right-strap',
    'Alça direita',
    'rightStrap',
    front,
    back,
    rightStrapColumns,
    topRowStart,
    edgeLength,
    m.strapLength,
  );

  // ----------------------------------------------------------
  // BORDAS LATERAIS
  // ----------------------------------------------------------

  const leftBoundary = getColumnEdge(rows, columns, 0);
  const rightBoundary = getColumnEdge(rows, columns, columns);

  const sideLeft = getSharedSideBoundary(
    front,
    back,
    leftBoundary,
    'Lateral esquerda',
  );

  const sideRight = getSharedSideBoundary(
    front,
    back,
    rightBoundary,
    'Lateral direita',
  );

  // ----------------------------------------------------------
  // PAINÉIS
  // ----------------------------------------------------------

  const panels = [
    front,
    back,
    leftStrap.panel,
    rightStrap.panel,
  ];

  // ----------------------------------------------------------
  // REGIÕES DE ENCAIXE
  // ----------------------------------------------------------

  const initialFit = createDressFit({
    front,
    rows,
    columns,
    heights: frontHeights,
    frontHemY,
    frontLength,
    backHemY,
    backLength,
    panels,
    leftStrapColumns,
    rightStrapColumns,
  });

  // ----------------------------------------------------------
  // COSTURAS
  // ----------------------------------------------------------

  const seams: GarmentSeam[] = [
    {
      id: 'left-side',
      name: 'Lateral esquerda',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: sideLeft.front,
      edgeB: sideLeft.back,
      stiffness: 1,
    },
    {
      id: 'right-side',
      name: 'Lateral direita',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: sideRight.front,
      edgeB: sideRight.back,
      stiffness: 1,
    },
    ...createStrapSeams(
      'left',
      'esquerda',
      leftStrap,
      leftStrapColumns,
      front,
      back,
      topRowStart,
    ),
    ...createStrapSeams(
      'right',
      'direita',
      rightStrap,
      rightStrapColumns,
      front,
      back,
      topRowStart,
    ),
  ];

  // ----------------------------------------------------------
  // VALIDAÇÃO FINAL DAS COSTURAS
  // ----------------------------------------------------------

  const panelById = new Map(
    panels.map((panel) => [panel.id, panel]),
  );

  for (const seam of seams) {
    const panelA = panelById.get(seam.panelAId);
    const panelB = panelById.get(seam.panelBId);

    if (!panelA || !panelB) {
      throw new Error(
        `CAIMENT: a costura "${seam.name}" referencia um painel inexistente.`,
      );
    }

    assertMatchingSeamEdges(
      panelA,
      panelB,
      seam.edgeA,
      seam.edgeB,
      seam.name,
    );
  }

  // ----------------------------------------------------------
  // DADOS DA MALHA
  // ----------------------------------------------------------

  const meshData: GarmentMeshData = {
    panels,
    seams,

    vertexCount: panels.reduce(
      (total, panel) => total + panel.vertices.length,
      0,
    ),

    triangleCount: panels.reduce(
      (total, panel) => total + panel.triangles.length,
      0,
    ),

    fit: initialFit,
  };

  // ----------------------------------------------------------
  // ENCAIXE COMPARTILHADO
  // ----------------------------------------------------------

  const fit = createUpperBodyGarmentFit(
    'dress',
    meshData,
    0.02,
  );

  meshData.fit = {
    ...fit,
    anchors: initialFit.anchors,
    regions: initialFit.regions,
    supports: initialFit.supports,
  };

  // ----------------------------------------------------------
  // MONTAGEM
  // ----------------------------------------------------------

  const group = assembleGarment(meshData).group;

  group.name = 'CAIMENT_Dress';

  group.userData = {
    ...group.userData,

    garmentType: 'dress',
    garmentFit: meshData.fit,
    measurements: { ...m },
    meshData,

    meshResolution: {
      rows,
      columns,
      edgeLength,
    },

    panelLengths: {
      front: frontLength,
      back: backLength,
    },

    panelHemOffsets: {
      front: frontHemY,
      back: backHemY,
    },

    verticalControlHeights: {
      front: frontHeights,
      back: backHeights,
    },

    openings: {
      necklineFrontWidth,
      necklineBackWidth,
      frontNeckDepth,
      backNeckDepth,
      armholeWidth,
      armholeStartX,
      frontArmholeDepth,
      backArmholeDepth,
    },

    strapAttachments: {
      left: [...leftStrapColumns],
      right: [...rightStrapColumns],
      protectedDuringOpeningCut: true,
    },

    skirt: {
      hemCircumference: skirtHemCircumference,
      flare: m.skirtFlare ?? 0,
      waistHeight: m.waistHeight,
      hipHeight: m.hipHeight,
      frontLength: m.skirtFrontLength,
      backLength: m.skirtBackLength,
    },

    coordinateSystem: {
      width: 'X',
      height: 'Y',
      depth: 'Z',
      unit: 'meters',
      front: '+Z',
      origin: 'garment_local_origin',
      heightMeasurements: 'from_longest_hem_upward',
    },
  };

  group.updateMatrixWorld(true);

  return group;
}

// ============================================================
// EXPORTAÇÃO
// ============================================================

export {
  createDressGeometry,
};