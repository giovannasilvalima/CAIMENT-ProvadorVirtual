
import * as THREE from 'three';

import {
  type DressMeasurements,
  type GarmentPanel,
  type GarmentSeam,
  type GarmentMeshData,
  type GarmentFitDefinition,
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

/** Fração máxima da largura dos ombros ocupada por uma alça. */
const MAX_STRAP_RATIO = 0.15;

/** Limites de proporção para os pontos de controle verticais. */
const DEFAULT_HIP_HEIGHT_RATIO = 0;
const DEFAULT_WAIST_HEIGHT_RATIO = 0.45;
const DEFAULT_BUST_HEIGHT_RATIO = 0.75;

// ============================================================
// VALIDAÇÃO DAS MEDIDAS
// ============================================================

/**
 * Valida as medidas recebidas do catálogo.
 *
 * Todas as dimensões lineares devem estar em metros.
 *
 * Convenções:
 * - bustHeight, waistHeight e hipHeight: distância da barra para cima.
 * - frontLength e backLength: comprimento total de cada lado,
 *   do ombro até a barra.
 * - skirtFrontLength e skirtBackLength: comprimento da saia,
 *   da cintura até a barra.
 * - bustDepth, waistDepth e hipDepth: profundidade no eixo Z.
 * - strapSpacing: distância entre os centros das duas alças.
 * - strapPositionFront e strapPositionBack: posição lateral
 *   das alças em relação ao centro da peça.
 */
function readMeasurements(
  input: Partial<DressMeasurements>,
): DressMeasurements {
  const requiredMeasurements: (keyof DressMeasurements)[] = [
    'bustWidth',
    'waistWidth',
    'hipWidth',
    'length',
    'shoulderWidth',
    'depth',
    'strapWidth',
  ];

  const missing = requiredMeasurements.filter((key) => {
    const value = input[key];

    return (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    );
  });

  if (missing.length > 0) {
    throw new Error(
      `CAIMENT: medidas obrigatórias ausentes ou inválidas para o vestido: ${missing.join(', ')}. Todas as medidas devem ser fornecidas em metros.`,
    );
  }

  const m = input as DressMeasurements;

  if (m.shoulderWidth > m.bustWidth) {
    throw new Error(
      'CAIMENT: a largura dos ombros não pode ser maior que a medida completa do busto.',
    );
  }

  if (m.strapWidth > m.shoulderWidth * MAX_STRAP_RATIO) {
    throw new Error(
      `CAIMENT: a largura da alça não pode ser maior que ${MAX_STRAP_RATIO * 100}% da largura dos ombros.`,
    );
  }

  if (m.hipWidth > m.length * 4) {
    throw new Error(
      'CAIMENT: a medida do quadril é incompatível com o comprimento informado.',
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

    if (value === undefined) {
      continue;
    }

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `CAIMENT: a medida opcional "${key}" deve ser um número positivo em metros.`,
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
      (
        typeof value !== 'number' ||
        !Number.isFinite(value)
      )
    ) {
      throw new Error(
        `CAIMENT: a medida "${key}" deve ser um número válido em metros.`,
      );
    }
  }

  if (
    m.frontLength !== undefined &&
    m.frontLength > m.length
  ) {
    throw new Error(
      'CAIMENT: frontLength não pode ser maior que o comprimento total do vestido.',
    );
  }

  if (
    m.backLength !== undefined &&
    m.backLength > m.length
  ) {
    throw new Error(
      'CAIMENT: backLength não pode ser maior que o comprimento total do vestido.',
    );
  }

  const heightFields = [
    ['hipHeight', m.hipHeight],
    ['waistHeight', m.waistHeight],
    ['bustHeight', m.bustHeight],
  ] as const;

  for (const [key, value] of heightFields) {
    if (value !== undefined && value >= m.length) {
      throw new Error(
        `CAIMENT: ${key} deve ser menor que o comprimento total do vestido, pois é medido a partir da barra.`,
      );
    }
  }

  if (
    m.hipHeight !== undefined &&
    m.waistHeight !== undefined &&
    m.hipHeight >= m.waistHeight
  ) {
    throw new Error(
      'CAIMENT: hipHeight deve ser menor que waistHeight.',
    );
  }

  if (
    m.waistHeight !== undefined &&
    m.bustHeight !== undefined &&
    m.waistHeight >= m.bustHeight
  ) {
    throw new Error(
      'CAIMENT: waistHeight deve ser menor que bustHeight.',
    );
  }

  if (
    m.strapSpacing !== undefined &&
    m.strapSpacing <= m.strapWidth
  ) {
    throw new Error(
      'CAIMENT: strapSpacing deve ser maior que strapWidth para manter as duas alças separadas.',
    );
  }

  return { ...m };
}

// ============================================================
// UTILITÁRIOS
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

/**
 * Resolve as alturas verticais dos pontos de controle.
 *
 * As alturas são medidas a partir da barra.
 * Quando uma medida não é fornecida, mantém-se a proporção
 * estrutural anterior do gerador.
 */
function resolveVerticalHeights(
  measurements: DressMeasurements,
  sideLength: number,
): {
  hip: number;
  waist: number;
  bust: number;
} {
  const hip =
    measurements.hipHeight ??
    sideLength * DEFAULT_HIP_HEIGHT_RATIO;

  const waist =
    measurements.waistHeight ??
    measurements.skirtFrontLength ??
    measurements.skirtBackLength ??
    sideLength * DEFAULT_WAIST_HEIGHT_RATIO;

  const bust =
    measurements.bustHeight ??
    sideLength * DEFAULT_BUST_HEIGHT_RATIO;

  if (
    hip < 0 ||
    waist <= hip ||
    bust <= waist ||
    bust >= sideLength
  ) {
    throw new Error(
      'CAIMENT: as alturas do quadril, cintura e busto precisam respeitar a ordem barra < quadril < cintura < busto < ombros.',
    );
  }

  return { hip, waist, bust };
}

/**
 * Calcula a posição vertical de uma linha da peça.
 *
 * O topo dos dois painéis permanece alinhado.
 * Quando frontLength/backLength diferem, a barra de cada
 * painel recebe a diferença correspondente.
 */
function getPanelHeight(
  t: number,
  totalLength: number,
  sideLength: number,
): number {
  return totalLength - sideLength * (1 - t);
}

// ============================================================
// CRIAÇÃO DAS ALÇAS
// ============================================================

/**
 * Cria uma alça independente que conecta a frente às costas.
 *
 * A geometria é construída a partir dos vértices dos painéis,
 * sem coordenadas anatômicas fixas.
 */
function createDressStrap(
  id: string,
  name: string,
  front: GarmentPanel,
  back: GarmentPanel,
  strapColumns: number[],
  topRowStart: number,
  defaultArchHeight: number,
  edgeLength: number,
  strapLength?: number,
): {
  panel: GarmentPanel;
  rows: number;
} {
  const k = strapColumns.length;

  if (k < 2) {
    throw new Error(
      `CAIMENT: não há vértices suficientes para construir ${name}.`,
    );
  }

  const fronts = strapColumns.map((column) => {
    const vertex = front.vertices[topRowStart + column];

    if (!vertex) {
      throw new Error(
        `CAIMENT: vértice frontal ausente ao construir ${name}.`,
      );
    }

    return vertex.position;
  });

  const backs = strapColumns.map((column) => {
    const vertex = back.vertices[topRowStart + column];

    if (!vertex) {
      throw new Error(
        `CAIMENT: vértice traseiro ausente ao construir ${name}.`,
      );
    }

    return vertex.position;
  });

  const span = Math.max(
    ...fronts.map((point, i) =>
      point.distanceTo(backs[i]),
    ),
  );

  /**
   * Se o catálogo informar o comprimento da alça, calcula
   * uma elevação aproximada para acomodar esse comprimento.
   *
   * A aproximação considera uma curva parabólica.
   */
  const archHeight =
    strapLength !== undefined && strapLength > span
      ? Math.sqrt(
          (3 * span * (strapLength - span)) / 8,
        )
      : defaultArchHeight;

  const rows = resolveSegments(
    span + 2 * archHeight,
    edgeLength,
    4,
    16,
  );

  const positions: THREE.Vector3[] = [];

  for (let row = 0; row <= rows; row++) {
    const t = row / rows;

    for (let j = 0; j < k; j++) {
      const point = fronts[j]
        .clone()
        .lerp(backs[j], t);

      point.y += Math.sin(Math.PI * t) * archHeight;

      positions.push(point);
    }
  }

  const triangles: {
    a: number;
    b: number;
    c: number;
  }[] = [];

  for (let row = 0; row < rows; row++) {
    for (let j = 0; j < k - 1; j++) {
      const i00 = row * k + j;
      const i01 = i00 + 1;
      const i10 = (row + 1) * k + j;
      const i11 = i10 + 1;

      triangles.push(
        { a: i00, b: i01, c: i10 },
        { a: i01, b: i11, c: i10 },
      );
    }
  }

  return {
    panel: createPanel({
      id,
      name,
      type: 'front',
      positions,
      triangles,
    }),
    rows,
  };
}

// ============================================================
// CRIAÇÃO DAS ÂNCORAS DO VESTIDO
// ============================================================

/**
 * As âncoras são retiradas diretamente dos vértices da frente.
 *
 * Os pontos verticais acompanham as alturas reais informadas
 * no catálogo, quando disponíveis.
 */
function createDressFit(
  front: GarmentPanel,
  rows: number,
  columns: number,
  columnU: number[],
  heights: {
    hip: number;
    waist: number;
    bust: number;
  },
  frontLength: number,
): GarmentFitDefinition {
  const centerColumn = nearestIndex(columnU, 0.5);

  const getVertexPosition = (
    heightFromHem: number,
    column: number,
  ): THREE.Vector3 => {
    const t = THREE.MathUtils.clamp(
      heightFromHem / frontLength,
      0,
      1,
    );

    const row = THREE.MathUtils.clamp(
      Math.round(t * rows),
      0,
      rows,
    );

    const safeColumn = THREE.MathUtils.clamp(
      column,
      0,
      columns,
    );

    const index =
      row * (columns + 1) + safeColumn;

    const vertex = front.vertices[index];

    if (!vertex) {
      throw new Error(
        `CAIMENT: não foi possível obter o vértice da âncora do vestido. Linha: ${row}, coluna: ${safeColumn}.`,
      );
    }

    return vertex.position.clone();
  };

  const leftShoulder = getVertexPosition(
    frontLength,
    0,
  );

  const rightShoulder = getVertexPosition(
    frontLength,
    columns,
  );

  const hipCenter = getVertexPosition(
    heights.hip,
    centerColumn,
  );

  const waistCenter = getVertexPosition(
    heights.waist,
    centerColumn,
  );

  const bustCenter = getVertexPosition(
    heights.bust,
    centerColumn,
  );

  const neckBase = getVertexPosition(
    frontLength,
    centerColumn,
  );

  const leftHip = getVertexPosition(
    heights.hip,
    0,
  );

  const rightHip = getVertexPosition(
    heights.hip,
    columns,
  );

  return {
    coverage: [
      'shoulders',
      'chest',
      'abdomen',
      'pelvis',
    ],

    clearance: 0,

    anchors: [
      {
        id: 'dress-left-shoulder',
        bodyLandmark: 'leftShoulder',
        garmentPosition: leftShoulder,
        weight: 1.5,
      },
      {
        id: 'dress-right-shoulder',
        bodyLandmark: 'rightShoulder',
        garmentPosition: rightShoulder,
        weight: 1.5,
      },
      {
        id: 'dress-hip-center',
        bodyLandmark: 'hipCenter',
        garmentPosition: hipCenter,
        weight: 1.2,
      },
      {
        id: 'dress-left-hip',
        bodyLandmark: 'leftHip',
        garmentPosition: leftHip,
        weight: 0.8,
      },
      {
        id: 'dress-right-hip',
        bodyLandmark: 'rightHip',
        garmentPosition: rightHip,
        weight: 0.8,
      },
      {
        id: 'dress-waist-center',
        bodyLandmark: 'waistCenter',
        garmentPosition: waistCenter,
        weight: 1,
      },
      {
        id: 'dress-bust-center',
        bodyLandmark: 'bustCenter',
        garmentPosition: bustCenter,
        weight: 1,
      },
      {
        id: 'dress-neck-base',
        bodyLandmark: 'neckBase',
        garmentPosition: neckBase,
        weight: 0.7,
      },
    ],
  } as GarmentFitDefinition;
}

// ============================================================
// GERADOR PRINCIPAL
// ============================================================

/**
 * Construtor principal do vestido.
 *
 * Sistema de coordenadas:
 * X = largura
 * Y = altura
 * Z = profundidade
 *
 * Unidade: metros.
 */
function createDressGeometry(
  input: Partial<DressMeasurements> = {},
  options?: GarmentMeshOptions,
): THREE.Group {
  const m = readMeasurements(input);

  const edgeLength = resolveEdgeLength(options);

  const frontLength = m.frontLength ?? m.length;
  const backLength = m.backLength ?? m.length;

  const rows = resolveSegments(
    Math.max(frontLength, backLength),
    edgeLength,
    12,
    48,
  );

  const columns = resolveSegments(
    Math.max(
      m.bustWidth,
      m.hipWidth,
      m.waistWidth,
    ) / 2,
    edgeLength,
    16,
    48,
    true,
  );

  // ----------------------------------------------------------
  // ALTURAS DOS PONTOS DE CONTROLE
  // ----------------------------------------------------------

  const frontHeights = resolveVerticalHeights(
    m,
    frontLength,
  );

  const backHeights = resolveVerticalHeights(
    m,
    backLength,
  );

  // ----------------------------------------------------------
  // PERFIL DE LARGURA
  // ----------------------------------------------------------

  /**
   * O perfil acompanha as alturas do catálogo.
   *
   * t = 0: barra
   * t = hipHeight/frontLength: quadril
   * t = waistHeight/frontLength: cintura
   * t = bustHeight/frontLength: busto
   * t = 1: ombros
   *
   * hemCircumference, quando fornecida, controla a largura
   * da barra. Caso contrário, a largura do quadril é mantida
   * como referência inferior.
   */
  const hemWidth =
    m.hemCircumference !== undefined
      ? m.hemCircumference / 2
      : m.hipWidth / 2;

  const frontWidthAt = createSmoothProfile([
    {
      t: 0,
      value: hemWidth,
    },
    {
      t: frontHeights.hip / frontLength,
      value: m.hipWidth / 2,
    },
    {
      t: frontHeights.waist / frontLength,
      value: m.waistWidth / 2,
    },
    {
      t: frontHeights.bust / frontLength,
      value: m.bustWidth / 2,
    },
    {
      t: 1,
      value: m.shoulderWidth / 2,
    },
  ]);

  const backWidthAt = createSmoothProfile([
    {
      t: 0,
      value: hemWidth,
    },
    {
      t: backHeights.hip / backLength,
      value: m.hipWidth / 2,
    },
    {
      t: backHeights.waist / backLength,
      value: m.waistWidth / 2,
    },
    {
      t: backHeights.bust / backLength,
      value: m.bustWidth / 2,
    },
    {
      t: 1,
      value: m.shoulderWidth / 2,
    },
  ]);

  const maxWidth =
    Math.max(
      m.hipWidth,
      m.waistWidth,
      m.bustWidth,
      m.shoulderWidth,
      m.hemCircumference ?? 0,
    ) / 2;

  // ----------------------------------------------------------
  // PERFIL DE PROFUNDIDADE
  // ----------------------------------------------------------

  const createDepthAt = (
    widthAt: (t: number) => number,
    heights: {
      hip: number;
      waist: number;
      bust: number;
    },
    sideLength: number,
  ) => {
    const baseDepth = m.depth / 2;

    const depthProfile = createSmoothProfile([
      {
        t: 0,
        value: baseDepth,
      },
      {
        t: heights.hip / sideLength,
        value: (m.hipDepth ?? m.depth) / 2,
      },
      {
        t: heights.waist / sideLength,
        value: (m.waistDepth ?? m.depth) / 2,
      },
      {
        t: heights.bust / sideLength,
        value: (m.bustDepth ?? m.depth) / 2,
      },
      {
        t: 1,
        value: baseDepth,
      },
    ]);

    return (t: number): number => {
      const shoulderTaper = THREE.MathUtils.lerp(
        1,
        0.7,
        THREE.MathUtils.smoothstep(t, 0.75, 1),
      );

      const widthFactor = Math.sqrt(
        Math.max(
          widthAt(t) / maxWidth,
          0.000001,
        ),
      );

      return (
        depthProfile(t) *
        widthFactor *
        shoulderTaper
      );
    };
  };

  const frontHalfDepthAt = createDepthAt(
    frontWidthAt,
    frontHeights,
    frontLength,
  );

  const backHalfDepthAt = createDepthAt(
    backWidthAt,
    backHeights,
    backLength,
  );

  // ----------------------------------------------------------
  // POSICIONAMENTO DAS ALÇAS
  // ----------------------------------------------------------

  const topWidth = m.shoulderWidth / 2;
  const halfTop = topWidth / 2;

  const positionFront =
    m.strapPositionFront !== undefined
      ? Math.abs(m.strapPositionFront)
      : undefined;

  const positionBack =
    m.strapPositionBack !== undefined
      ? Math.abs(m.strapPositionBack)
      : undefined;

  const positionFromCatalog =
    positionFront !== undefined &&
    positionBack !== undefined
      ? (positionFront + positionBack) / 2
      : positionFront ?? positionBack;

  const strapCenter =
    m.strapSpacing !== undefined
      ? m.strapSpacing / 2
      : positionFromCatalog ??
        THREE.MathUtils.clamp(
          halfTop * 0.55,
          m.strapWidth / 2,
          halfTop * 0.8 - m.strapWidth / 2,
        );

  const maximumStrapCenter =
    halfTop - m.strapWidth / 2;

  if (
    strapCenter <= 0 ||
    strapCenter > maximumStrapCenter
  ) {
    throw new Error(
      'CAIMENT: a posição ou o espaçamento informado para as alças ultrapassa a área disponível dos ombros.',
    );
  }

  const uOuter =
    0.5 -
    (strapCenter + m.strapWidth / 2) /
      topWidth;

  const uInner =
    0.5 -
    (strapCenter - m.strapWidth / 2) /
      topWidth;

  const half = distributeWithKnots(
    [
      uOuter * 2,
      uInner * 2,
    ],
    columns / 2,
  );

  const columnU = Array.from(
    {
      length: columns + 1,
    },
    (_, j) =>
      j <= columns / 2
        ? half[j] / 2
        : 1 - half[columns - j] / 2,
  );

  const cOuter = nearestIndex(
    half,
    uOuter * 2,
  );

  const cInner = nearestIndex(
    half,
    uInner * 2,
  );

  const leftStrapColumns = Array.from(
    {
      length: cInner - cOuter + 1,
    },
    (_, i) => cOuter + i,
  );

  const rightStrapColumns = Array.from(
    {
      length: cInner - cOuter + 1,
    },
    (_, i) => columns - cInner + i,
  );

  // ----------------------------------------------------------
  // PAINÉIS PRINCIPAIS
  // ----------------------------------------------------------

  const createBodyPanel = (
    type: 'front' | 'back',
  ): GarmentPanel => {
    const isFront = type === 'front';

    const sideLength = isFront
      ? frontLength
      : backLength;

    const widthAt = isFront
      ? frontWidthAt
      : backWidthAt;

    const halfDepthAt = isFront
      ? frontHalfDepthAt
      : backHalfDepthAt;

    const sign = isFront ? 1 : -1;

    const positions: THREE.Vector3[] = [];

    for (let row = 0; row <= rows; row++) {
      const t = row / rows;

      const width = widthAt(t);

      const wrap = createWrapMapper(
        width,
        halfDepthAt(t),
      );

      const y = getPanelHeight(
        t,
        m.length,
        sideLength,
      );

      for (
        let column = 0;
        column <= columns;
        column++
      ) {
        const s =
          (columnU[column] - 0.5) * width;

        const point = wrap.map(s);

        positions.push(
          new THREE.Vector3(
            point.x,
            y,
            sign * point.z,
          ),
        );
      }
    }

    return createPanel({
      id: type,
      name: isFront
        ? 'Frente do vestido'
        : 'Costas do vestido',
      type,
      positions,
      triangles: createGridTriangles(
        rows,
        columns,
        isFront,
      ),
    });
  };

  const front = createBodyPanel('front');
  const back = createBodyPanel('back');

  // ----------------------------------------------------------
  // ALÇAS
  // ----------------------------------------------------------

  const topRowStart =
    rows * (columns + 1);

  const defaultArchHeight =
    m.strapWidth * 0.75;

  const leftStrap = createDressStrap(
    'left-strap',
    'Alça esquerda',
    front,
    back,
    leftStrapColumns,
    topRowStart,
    defaultArchHeight,
    edgeLength,
    m.strapLength,
  );

  const rightStrap = createDressStrap(
    'right-strap',
    'Alça direita',
    front,
    back,
    rightStrapColumns,
    topRowStart,
    defaultArchHeight,
    edgeLength,
    m.strapLength,
  );

  // ----------------------------------------------------------
  // COSTURAS LATERAIS
  // ----------------------------------------------------------

  const sideLeft = getColumnEdge(
    rows,
    columns,
    0,
  );

  const sideRight = getColumnEdge(
    rows,
    columns,
    columns,
  );

  // ----------------------------------------------------------
  // COSTURAS DAS ALÇAS
  // ----------------------------------------------------------

  const strapSeams = (
    prefix: string,
    label: string,
    strap: {
      panel: GarmentPanel;
      rows: number;
    },
    strapColumns: number[],
  ): GarmentSeam[] => {
    const k = strapColumns.length;

    const panelEdge = strapColumns.map(
      (column) => topRowStart + column,
    );

    return [
      {
        id: `${prefix}-strap-front`,
        name: `Alça ${label} - frente`,
        panelAId: front.id,
        panelBId: strap.panel.id,
        edgeA: panelEdge,
        edgeB: Array.from(
          { length: k },
          (_, j) => j,
        ),
        stiffness: 1,
      },
      {
        id: `${prefix}-strap-back`,
        name: `Alça ${label} - costas`,
        panelAId: back.id,
        panelBId: strap.panel.id,
        edgeA: panelEdge,
        edgeB: Array.from(
          { length: k },
          (_, j) => strap.rows * k + j,
        ),
        stiffness: 1,
      },
    ];
  };

  // ----------------------------------------------------------
  // ORGANIZAÇÃO DOS PAINÉIS
  // ----------------------------------------------------------

  const panels = [
    front,
    back,
    leftStrap.panel,
    rightStrap.panel,
  ];

  // ----------------------------------------------------------
  // ÂNCORAS DO VESTIDO
  // ----------------------------------------------------------

  const initialFit = createDressFit(
    front,
    rows,
    columns,
    columnU,
    frontHeights,
    frontLength,
  );

  // ----------------------------------------------------------
  // COSTURAS
  // ----------------------------------------------------------

  const seams: GarmentSeam[] = [
    {
      id: 'left-side',
      name: 'Lateral esquerda',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: sideLeft,
      edgeB: sideLeft,
      stiffness: 1,
    },
    {
      id: 'right-side',
      name: 'Lateral direita',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: sideRight,
      edgeB: sideRight,
      stiffness: 1,
    },
    ...strapSeams(
      'left',
      'esquerda',
      leftStrap,
      leftStrapColumns,
    ),
    ...strapSeams(
      'right',
      'direita',
      rightStrap,
      rightStrapColumns,
    ),
  ];

  // ----------------------------------------------------------
  // DADOS DA MALHA
  // ----------------------------------------------------------

  const meshData: GarmentMeshData = {
    panels,
    seams,

    vertexCount: panels.reduce(
      (total, panel) =>
        total + panel.vertices.length,
      0,
    ),

    triangleCount: panels.reduce(
      (total, panel) =>
        total + panel.triangles.length,
      0,
    ),

    fit: initialFit,
  };

  // ----------------------------------------------------------
  // CONFIGURAÇÃO COMPARTILHADA DO ENCAIXE
  // ----------------------------------------------------------

  const fit = createUpperBodyGarmentFit(
    'dress',
    meshData,
  );

  meshData.fit = fit;

  // ----------------------------------------------------------
  // MONTAGEM
  // ----------------------------------------------------------

  const group = assembleGarment(
    meshData,
  ).group;

  group.name = 'CAIMENT_Dress';

  group.userData = {
    ...group.userData,

    garmentType: 'dress',
    garmentFit: fit,

    measurements: {
      ...m,
    },

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

    verticalControlHeights: {
      front: frontHeights,
      back: backHeights,
    },

    coordinateSystem: {
      width: 'X',
      height: 'Y',
      depth: 'Z',
      unit: 'meters',
      front: '+Z',
      origin: 'garment_local_origin',
      heightMeasurements: 'from_hem_upward',
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
