
import * as THREE from 'three';

import {
  type TShirtMeasurements,
  type GarmentPanel,
  type GarmentTriangle,
  type GarmentSeam,
  type GarmentMeshData,
  type GarmentFitDefinition,
  type GarmentRegionDefinition,
} from './types';

import { assembleGarment } from './assembleGarment';

import { createUpperBodyGarmentFit } from './UpperBodyGarment';

import {
  type GarmentMeshOptions,
  createGridTriangles,
  createPanel,
  createWrapMapper,
  resolveEdgeLength,
  resolveSegments,
} from './GarmentCommon';

const EPSILON = 1e-8;

// ============================================================
// TIPOS INTERNOS DA MODELAGEM
// ============================================================

interface TankTopLayout {
  rows: number;
  columns: number;

  halfWidth: number;
  halfDepth: number;
  halfShoulder: number;

  neckFrontHalfWidth: number;
  neckBackHalfWidth: number;

  neckFrontDepth: number;
  neckBackDepth: number;

  armholeFrontDepth: number;
  armholeBackDepth: number;

  armholeFrontStart: number;
  armholeBackStart: number;

  strapWidth: number;
  strapSpacing: number;
  strapFrontPosition: number;
  strapBackPosition: number;

  edgeLength: number;
}

interface WidthAnchor {
  height: number;
  halfWidth: number;
}

// ============================================================
// VALIDAÇÃO
// ============================================================

function validateMeasurements(
  measurements: TShirtMeasurements,
): void {
  if (!measurements || typeof measurements !== 'object') {
    throw new Error(
      'As medidas da regata devem ser fornecidas pela loja.',
    );
  }

  const required: Array<keyof TShirtMeasurements> = [
    'width',
    'height',
    'depth',
    'shoulderWidth',
    'neckWidth',
  ];

  for (const key of required) {
    const value = measurements[key];

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `Medida obrigatória inválida na geração da regata: ${key}.`,
      );
    }
  }

  if (measurements.neckWidth >= measurements.shoulderWidth) {
    throw new Error(
      'A largura do decote deve ser menor que a largura dos ombros.',
    );
  }

  if (measurements.shoulderWidth > measurements.width) {
    throw new Error(
      'A largura dos ombros não pode ultrapassar a largura da regata.',
    );
  }

  if (measurements.neckWidth >= measurements.width) {
    throw new Error(
      'A largura do decote deve ser menor que a largura da regata.',
    );
  }

  const positiveFields: Array<keyof TShirtMeasurements> = [
    'chestCircumference',
    'waistCircumference',
    'hemCircumference',
    'bustHeight',
    'waistHeight',
    'hemHeight',
    'strapWidth',
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
    'hemWidth',
    'necklineFinishWidth',
    'armholeFinishWidth',
  ];

  for (const key of positiveFields) {
    const value = measurements[key];

    if (value === undefined) continue;

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `Medida inválida na geração da regata: ${key}.`,
      );
    }
  }

  const positionFields: Array<keyof TShirtMeasurements> = [
    'strapPositionFront',
    'strapPositionBack',
  ];

  for (const key of positionFields) {
    const value = measurements[key];

    if (
      value !== undefined &&
      (
        typeof value !== 'number' ||
        !Number.isFinite(value)
      )
    ) {
      throw new Error(
        `Posição inválida na geração da regata: ${key}.`,
      );
    }
  }

  if (
    measurements.strapWidth !== undefined &&
    measurements.strapWidth > measurements.shoulderWidth
  ) {
    throw new Error(
      'A largura das alças não pode ultrapassar a largura dos ombros.',
    );
  }

  for (const key of [
    'bustHeight',
    'waistHeight',
    'hemHeight',
  ] as const) {
    const value = measurements[key];

    if (value !== undefined && value > measurements.height) {
      throw new Error(
        `A medida ${key} não pode ultrapassar a altura da regata.`,
      );
    }
  }

  for (const key of [
    'necklineFrontWidth',
    'necklineBackWidth',
  ] as const) {
    const value = measurements[key];

    if (
      value !== undefined &&
      value >= measurements.shoulderWidth
    ) {
      throw new Error(
        `A medida ${key} deve ser menor que a largura dos ombros.`,
      );
    }
  }
}

// ============================================================
// FUNÇÕES MATEMÁTICAS
// ============================================================

function smooth(
  start: number,
  end: number,
  value: number,
): number {
  return THREE.MathUtils.smoothstep(
    value,
    start,
    end,
  );
}

function interpolate(
  a: number,
  b: number,
  t: number,
): number {
  return THREE.MathUtils.lerp(
    a,
    b,
    THREE.MathUtils.clamp(t, 0, 1),
  );
}

function circumferenceToHalfWidth(
  circumference: number | undefined,
): number | undefined {
  if (
    circumference === undefined ||
    !Number.isFinite(circumference) ||
    circumference <= 0
  ) {
    return undefined;
  }

  return circumference / 2;
}

// ============================================================
// LAYOUT DA MODELAGEM
// ============================================================

function getLayout(
  measurements: TShirtMeasurements,
  edgeLength: number,
): TankTopLayout {
  const rows = resolveSegments(
    measurements.height,
    edgeLength,
    24,
    100,
  );

  const columns = resolveSegments(
    measurements.width,
    edgeLength,
    32,
    120,
    true,
  );

  const neckFrontWidth =
    measurements.necklineFrontWidth ??
    measurements.neckWidth;

  const neckBackWidth =
    measurements.necklineBackWidth ??
    measurements.neckWidth;

  const armholeFrontDepth =
    measurements.armholeFrontDepth ??
    measurements.armholeDepth ??
    measurements.height * 0.42;

  const armholeBackDepth =
    measurements.armholeBackDepth ??
    measurements.armholeDepth ??
    measurements.height * 0.40;

  const strapWidth =
    measurements.strapWidth ??
    Math.max(
      EPSILON,
      (measurements.shoulderWidth -
        Math.max(neckFrontWidth, neckBackWidth)) / 2,
    );

  const strapSpacing =
    measurements.strapSpacing ??
    measurements.shoulderWidth -
      strapWidth * 2;

  return {
    rows,
    columns,

    halfWidth: measurements.width / 2,
    halfDepth: measurements.depth / 2,
    halfShoulder: measurements.shoulderWidth / 2,

    neckFrontHalfWidth: neckFrontWidth / 2,
    neckBackHalfWidth: neckBackWidth / 2,

    neckFrontDepth:
      measurements.frontNeckDepth ??
      measurements.neckWidth * 0.5,

    neckBackDepth:
      measurements.backNeckDepth ??
      measurements.neckWidth * 0.275,

    armholeFrontDepth,
    armholeBackDepth,

    armholeFrontStart: THREE.MathUtils.clamp(
      1 - armholeFrontDepth / measurements.height,
      0.05,
      0.95,
    ),

    armholeBackStart: THREE.MathUtils.clamp(
      1 - armholeBackDepth / measurements.height,
      0.05,
      0.95,
    ),

    strapWidth,
    strapSpacing,

    strapFrontPosition:
      measurements.strapPositionFront ?? 0,

    strapBackPosition:
      measurements.strapPositionBack ?? 0,

    edgeLength,
  };
}

// ============================================================
// MODELAGEM DO CONTORNO LATERAL
// ============================================================

function getWidthAnchors(
  measurements: TShirtMeasurements,
  layout: TankTopLayout,
): WidthAnchor[] {
  const anchors: WidthAnchor[] = [
    {
      height: 0,
      halfWidth:
        circumferenceToHalfWidth(
          measurements.hemCircumference,
        ) ?? layout.halfWidth,
    },
  ];

  const waistWidth =
    circumferenceToHalfWidth(
      measurements.waistCircumference,
    );

  if (waistWidth !== undefined) {
    anchors.push({
      height:
        measurements.waistHeight ??
        measurements.height * 0.48,
      halfWidth: waistWidth,
    });
  }

  const bustWidth =
    circumferenceToHalfWidth(
      measurements.chestCircumference,
    );

  if (bustWidth !== undefined) {
    anchors.push({
      height:
        measurements.bustHeight ??
        measurements.height * 0.72,
      halfWidth: bustWidth,
    });
  }

  anchors.push({
    height: measurements.height,
    halfWidth: layout.halfShoulder,
  });

  anchors.sort((a, b) => a.height - b.height);

  return anchors;
}

function getPatternHalfWidth(
  height: number,
  anchors: WidthAnchor[],
): number {
  if (height <= anchors[0].height) {
    return anchors[0].halfWidth;
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];

    if (height <= b.height) {
      const distance = b.height - a.height;

      const t = distance > EPSILON
        ? (height - a.height) / distance
        : 0;

      return interpolate(
        a.halfWidth,
        b.halfWidth,
        t,
      );
    }
  }

  return anchors[anchors.length - 1].halfWidth;
}

// ============================================================
// CONTORNO DA CAVA
// ============================================================

function getArmholeBoundary(
  v: number,
  layout: TankTopLayout,
  type: 'front' | 'back',
): number {
  const start =
    type === 'front'
      ? layout.armholeFrontStart
      : layout.armholeBackStart;

  const depth =
    type === 'front'
      ? layout.armholeFrontDepth
      : layout.armholeBackDepth;

  const progress = smooth(start, 1, v);

  const anatomicalCurve =
    Math.sin(progress * Math.PI * 0.5);

  const shoulderWidth =
    layout.halfShoulder;

  const bodyWidth =
    layout.halfWidth;

  const contour = interpolate(
    bodyWidth,
    shoulderWidth,
    anatomicalCurve,
  );

  const depthInfluence =
    THREE.MathUtils.clamp(
      depth / (layout.edgeLength + depth),
      0,
      1,
    );

  return interpolate(
    contour,
    shoulderWidth,
    depthInfluence * progress * 0.15,
  );
}

// ============================================================
// CONTORNO DO DECOTE
// ============================================================

function getNecklineBoundary(
  x: number,
  layout: TankTopLayout,
  type: 'front' | 'back',
): number {
  const halfNeck =
    type === 'front'
      ? layout.neckFrontHalfWidth
      : layout.neckBackHalfWidth;

  const depth =
    type === 'front'
      ? layout.neckFrontDepth
      : layout.neckBackDepth;

  const center = type === 'front'
    ? layout.strapFrontPosition
    : layout.strapBackPosition;

  const distance = Math.abs(x - center);

  if (distance >= halfNeck) {
    return 0;
  }

  const normalized =
    distance / halfNeck;

  const curve =
    (1 + Math.cos(Math.PI * normalized)) / 2;

  return depth * curve;
}

// ============================================================
// PERFIL DE PROFUNDIDADE
// ============================================================

function getBodyDepth(
  v: number,
  measurements: TShirtMeasurements,
  layout: TankTopLayout,
): number {
  const chestProgress = smooth(
    layout.armholeFrontStart * 0.45,
    layout.armholeFrontStart + 0.1,
    v,
  );

  const waistHeight =
    measurements.waistHeight ??
    measurements.height * 0.48;

  const waistProgress = smooth(
    0,
    waistHeight / measurements.height,
    v,
  );

  const upperBodyReduction =
    smooth(0.78, 1, v);

  const depthProfile =
    0.88 +
    chestProgress * 0.12 -
    waistProgress * 0.08;

  return Math.max(
    EPSILON,
    layout.halfDepth *
      depthProfile *
      (1 - upperBodyReduction * 0.16),
  );
}

// ============================================================
// SUPERFÍCIE PARAMÉTRICA
// ============================================================

function createPanelSurface(
  type: 'front' | 'back',
  measurements: TShirtMeasurements,
  layout: TankTopLayout,
): GarmentPanel {
  const positions: THREE.Vector3[] = [];

  const anchors = getWidthAnchors(
    measurements,
    layout,
  );

  const sign = type === 'front' ? 1 : -1;

  for (let row = 0; row <= layout.rows; row++) {
    const v = row / layout.rows;

    const y = v * measurements.height;

    const patternHalfWidth = getPatternHalfWidth(
      y,
      anchors,
    );

    const armholeHalfWidth = getArmholeBoundary(
      v,
      layout,
      type,
    );

    const halfWidth = Math.min(
      patternHalfWidth,
      armholeHalfWidth,
    );

    const depth = getBodyDepth(
      v,
      measurements,
      layout,
    );

    const wrap = createWrapMapper(
      halfWidth * 2,
      depth,
    );

    for (
      let column = 0;
      column <= layout.columns;
      column++
    ) {
      const u = column / layout.columns;

      const normalizedX = u * 2 - 1;

      const x = normalizedX * halfWidth;

      const neckDrop = getNecklineBoundary(
        x,
        layout,
        type,
      );

      const topInfluence = smooth(
        0.75,
        1,
        v,
      );

      const finalY =
        y - neckDrop * topInfluence;

      const mapped = wrap.map(x);

      positions.push(
        new THREE.Vector3(
          mapped.x,
          finalY,
          sign * Math.abs(mapped.z),
        ),
      );
    }
  }

  return createPanel({
    id: `tank-top-${type}`,
    name:
      type === 'front'
        ? 'Modelagem frontal da regata'
        : 'Modelagem traseira da regata',
    type,
    positions,
    triangles: createGridTriangles(
      layout.rows,
      layout.columns,
      type === 'front',
    ),
  });
}

// ============================================================
// ÍNDICES
// ============================================================

function vertexIndex(
  row: number,
  column: number,
  layout: TankTopLayout,
): number {
  return row * (layout.columns + 1) + column;
}

// ============================================================
// ACABAMENTO DO DECOTE
// ============================================================

function createNecklinePanel(
  front: GarmentPanel,
  back: GarmentPanel,
  layout: TankTopLayout,
): GarmentPanel {
  const positions: THREE.Vector3[] = [];
  const triangles: GarmentTriangle[] = [];

  const centerColumn = Math.floor(
    layout.columns / 2,
  );

  const frontCount = Math.max(
    2,
    Math.round(
      layout.neckFrontHalfWidth /
      layout.halfWidth *
      layout.columns,
    ),
  );

  const backCount = Math.max(
    2,
    Math.round(
      layout.neckBackHalfWidth /
      layout.halfWidth *
      layout.columns,
    ),
  );

  const frontStart = THREE.MathUtils.clamp(
    centerColumn - frontCount,
    0,
    layout.columns,
  );

  const frontEnd = THREE.MathUtils.clamp(
    centerColumn + frontCount,
    0,
    layout.columns,
  );

  const backStart = THREE.MathUtils.clamp(
    centerColumn - backCount,
    0,
    layout.columns,
  );

  const backEnd = THREE.MathUtils.clamp(
    centerColumn + backCount,
    0,
    layout.columns,
  );

  const boundary: THREE.Vector3[] = [];

  for (let column = frontStart; column <= frontEnd; column++) {
    boundary.push(
      front.vertices[
        vertexIndex(
          layout.rows,
          column,
          layout,
        )
      ].position.clone(),
    );
  }

  for (let column = backEnd; column >= backStart; column--) {
    boundary.push(
      back.vertices[
        vertexIndex(
          layout.rows,
          column,
          layout,
        )
      ].position.clone(),
    );
  }

  const count = boundary.length;

  if (count < 4) {
    throw new Error(
      'Não foi possível gerar o contorno do decote.',
    );
  }

  const finishWidth = Math.min(
    layout.edgeLength * 1.5,
    layout.neckFrontDepth * 0.2,
    layout.neckBackDepth * 0.3,
  );

  for (const point of boundary) {
    positions.push(point.clone());
  }

  for (const point of boundary) {
    const outward = new THREE.Vector3(
      point.x,
      0,
      point.z,
    );

    if (outward.lengthSq() > EPSILON) {
      outward.normalize();
    } else {
      outward.set(0, 0, point.z >= 0 ? 1 : -1);
    }

    positions.push(
      new THREE.Vector3(
        point.x + outward.x * finishWidth,
        point.y + finishWidth * 0.15,
        point.z + outward.z * finishWidth,
      ),
    );
  }

  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;

    const outerA = count + i;
    const outerB = count + next;

    triangles.push(
      { a: i, b: next, c: outerA },
      { a: outerA, b: next, c: outerB },
    );
  }

  return createPanel({
    id: 'tank-top-neckline',
    name: 'Acabamento do decote',
    type: 'collar',
    positions,
    triangles,
  });
}

// ============================================================
// COSTURAS
// ============================================================

function createSeams(
  front: GarmentPanel,
  back: GarmentPanel,
  collar: GarmentPanel,
  layout: TankTopLayout,
): GarmentSeam[] {
  const rows = layout.rows;
  const columns = layout.columns;

  const index = (
    row: number,
    column: number,
  ) => vertexIndex(row, column, layout);

  const sideEdge = (
    side: 'left' | 'right',
  ): number[] => {
    const column = side === 'left' ? 0 : columns;

    const result: number[] = [];

    for (let row = 0; row <= rows; row++) {
      result.push(index(row, column));
    }

    return result;
  };

  const shoulderLeft = Array.from(
    { length: Math.max(2, Math.ceil(
      layout.strapWidth /
      (layout.halfWidth * 2 / columns),
    )) + 1 },
    (_, i) => i,
  );

  const shoulderRight = shoulderLeft.map(
    (column) => columns - column,
  );

  const shoulderEdges = (
    columnsList: number[],
  ) => ({
    front: columnsList.map(
      (column) => index(rows, column),
    ),
    back: columnsList.map(
      (column) => index(rows, column),
    ),
  });

  const leftShoulder = shoulderEdges(shoulderLeft);
  const rightShoulder = shoulderEdges(shoulderRight);

  const neckStart = Math.floor(
    columns / 2 -
    layout.neckFrontHalfWidth /
    (layout.halfWidth * 2) * columns,
  );

  const neckEnd = Math.ceil(
    columns / 2 +
    layout.neckFrontHalfWidth /
    (layout.halfWidth * 2) * columns,
  );

  const frontNeck = Array.from(
    { length: neckEnd - neckStart + 1 },
    (_, i) => index(rows, neckStart + i),
  );

  const collarFront = Array.from(
    { length: frontNeck.length },
    (_, i) => i,
  );

  const backNeck = Array.from(
    { length: neckEnd - neckStart + 1 },
    (_, i) => index(rows, neckEnd - i),
  );

  const collarBack = Array.from(
    { length: backNeck.length },
    (_, i) =>
      frontNeck.length + i,
  );

  return [
    {
      id: 'seam-left-side',
      name: 'Costura lateral esquerda',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: sideEdge('left'),
      edgeB: sideEdge('left'),
      stiffness: 1,
    },
    {
      id: 'seam-right-side',
      name: 'Costura lateral direita',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: sideEdge('right'),
      edgeB: sideEdge('right'),
      stiffness: 1,
    },
    {
      id: 'seam-left-shoulder',
      name: 'Alça e ombro esquerdo',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: leftShoulder.front,
      edgeB: leftShoulder.back,
      stiffness: 1,
    },
    {
      id: 'seam-right-shoulder',
      name: 'Alça e ombro direito',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: rightShoulder.front,
      edgeB: rightShoulder.back,
      stiffness: 1,
    },
    {
      id: 'seam-neck-front',
      name: 'Acabamento frontal do decote',
      panelAId: front.id,
      panelBId: collar.id,
      edgeA: frontNeck,
      edgeB: collarFront,
      stiffness: 1,
    },
    {
      id: 'seam-neck-back',
      name: 'Acabamento traseiro do decote',
      panelAId: back.id,
      panelBId: collar.id,
      edgeA: backNeck,
      edgeB: collarBack,
      stiffness: 1,
    },
  ];
}

// ============================================================
// REFERÊNCIAS SEMÂNTICAS E DE ENCAIXE
// ============================================================

function createTankTopFit(
  measurements: TShirtMeasurements,
  panels: GarmentPanel[],
  layout: TankTopLayout,
): GarmentFitDefinition {
  const front = panels.find(
    (panel) => panel.type === 'front',
  );

  const back = panels.find(
    (panel) => panel.type === 'back',
  );

  if (!front || !back) {
    throw new Error(
      'Não foi possível criar as referências da regata.',
    );
  }

  const frontOffset = 0;
  const backOffset = front.vertices.length;

  const rows = layout.rows;
  const columns = layout.columns;

  const allBodyVertices = [
    ...Array.from(
      { length: front.vertices.length },
      (_, i) => frontOffset + i,
    ),
    ...Array.from(
      { length: back.vertices.length },
      (_, i) => backOffset + i,
    ),
  ];

  const shoulderColumnCount = Math.max(
    2,
    Math.ceil(
      layout.strapWidth /
      (measurements.width / columns),
    ),
  );

  const leftShoulderColumns = Array.from(
    { length: shoulderColumnCount + 1 },
    (_, i) => i,
  );

  const rightShoulderColumns = leftShoulderColumns.map(
    (column) => columns - column,
  );

  const shoulderVertices = (
    selectedColumns: number[],
  ) => [
    ...selectedColumns.map(
      (column) =>
        frontOffset +
        vertexIndex(rows, column, layout),
    ),
    ...selectedColumns.map(
      (column) =>
        backOffset +
        vertexIndex(rows, column, layout),
    ),
  ];

  const leftShoulder = shoulderVertices(
    leftShoulderColumns,
  );

  const rightShoulder = shoulderVertices(
    rightShoulderColumns,
  );

  const neckFrontStart = Math.floor(
    columns / 2 -
    layout.neckFrontHalfWidth /
    measurements.width * columns,
  );

  const neckFrontEnd = Math.ceil(
    columns / 2 +
    layout.neckFrontHalfWidth /
    measurements.width * columns,
  );

  const neckBackStart = Math.floor(
    columns / 2 -
    layout.neckBackHalfWidth /
    measurements.width * columns,
  );

  const neckBackEnd = Math.ceil(
    columns / 2 +
    layout.neckBackHalfWidth /
    measurements.width * columns,
  );

  const frontNeckVertices = Array.from(
    { length: neckFrontEnd - neckFrontStart + 1 },
    (_, i) =>
      frontOffset +
      vertexIndex(rows, neckFrontStart + i, layout),
  );

  const backNeckVertices = Array.from(
    { length: neckBackEnd - neckBackStart + 1 },
    (_, i) =>
      backOffset +
      vertexIndex(rows, neckBackEnd - i, layout),
  );

  const armholeStartFront = Math.floor(
    layout.armholeFrontStart * rows,
  );

  const armholeStartBack = Math.floor(
    layout.armholeBackStart * rows,
  );

  const armholeVertices = (
    column: number,
  ) => [
    ...Array.from(
      { length: rows - armholeStartFront + 1 },
      (_, i) =>
        frontOffset +
        vertexIndex(
          armholeStartFront + i,
          column,
          layout,
        ),
    ),
    ...Array.from(
      { length: rows - armholeStartBack + 1 },
      (_, i) =>
        backOffset +
        vertexIndex(
          armholeStartBack + i,
          column,
          layout,
        ),
    ),
  ];

  const leftArmhole = armholeVertices(0);
  const rightArmhole = armholeVertices(columns);

  const hemVertices = [
    ...Array.from(
      { length: columns + 1 },
      (_, column) =>
        frontOffset +
        vertexIndex(0, column, layout),
    ),
    ...Array.from(
      { length: columns + 1 },
      (_, column) =>
        backOffset +
        vertexIndex(0, column, layout),
    ),
  ];

  const regions: GarmentRegionDefinition[] = [
    {
      id: 'body-coverage',
      name: 'Cobertura do tronco',
      bodyRegion: 'chest',
      vertexIndices: allBodyVertices,
      role: 'coverage',
    },
    {
      id: 'shoulder-support',
      name: 'Sustentação dos ombros',
      bodyRegion: 'shoulders',
      vertexIndices: [
        ...leftShoulder,
        ...rightShoulder,
      ],
      role: 'support',
    },
    {
      id: 'left-shoulder-support',
      name: 'Alça esquerda',
      bodyRegion: 'shoulders',
      vertexIndices: leftShoulder,
      role: 'support',
    },
    {
      id: 'right-shoulder-support',
      name: 'Alça direita',
      bodyRegion: 'shoulders',
      vertexIndices: rightShoulder,
      role: 'support',
    },
    {
      id: 'neck-opening',
      name: 'Abertura do decote',
      bodyRegion: 'neck',
      vertexIndices: [
        ...frontNeckVertices,
        ...backNeckVertices,
      ],
      role: 'opening',
    },
    {
      id: 'left-armhole-opening',
      name: 'Cava esquerda',
      bodyRegion: 'leftArm',
      vertexIndices: leftArmhole,
      role: 'opening',
    },
    {
      id: 'right-armhole-opening',
      name: 'Cava direita',
      bodyRegion: 'rightArm',
      vertexIndices: rightArmhole,
      role: 'opening',
    },
    {
      id: 'bottom-hem',
      name: 'Barra inferior',
      bodyRegion: 'abdomen',
      vertexIndices: hemVertices,
      role: 'hem',
    },
  ];

  return {
    coverage: [
      'shoulders',
      'chest',
      'abdomen',
    ],

    clearance: 0,

    anchors: [
      {
        id: 'left-shoulder',
        bodyLandmark: 'leftShoulder',
        garmentPosition: new THREE.Vector3(
          -layout.halfShoulder,
          measurements.height,
          0,
        ),
        weight: 1,
      },
      {
        id: 'right-shoulder',
        bodyLandmark: 'rightShoulder',
        garmentPosition: new THREE.Vector3(
          layout.halfShoulder,
          measurements.height,
          0,
        ),
        weight: 1,
      },
    ],

    regions,

    supports: [
      {
        id: 'left-shoulder-contact',
        garmentRegionId: 'left-shoulder-support',
        bodyRegion: 'shoulders',
        mode: 'contact',
        strength: 1,
      },
      {
        id: 'right-shoulder-contact',
        garmentRegionId: 'right-shoulder-support',
        bodyRegion: 'shoulders',
        mode: 'contact',
        strength: 1,
      },
    ],
  };
}

// ============================================================
// CONSTRUTOR PRINCIPAL
// ============================================================

export function createTShirtGeometry(
  measurements: TShirtMeasurements,
  options?: GarmentMeshOptions,
): THREE.Group {
  validateMeasurements(measurements);

  const edgeLength = resolveEdgeLength(options);

  const layout = getLayout(
    measurements,
    edgeLength,
  );

  // ----------------------------------------------------------
  // MODELAGEM FRONTAL E TRASEIRA
  // ----------------------------------------------------------

  const front = createPanelSurface(
    'front',
    measurements,
    layout,
  );

  const back = createPanelSurface(
    'back',
    measurements,
    layout,
  );

  // ----------------------------------------------------------
  // ACABAMENTO
  // ----------------------------------------------------------

  const collar = createNecklinePanel(
    front,
    back,
    layout,
  );

  const panels: GarmentPanel[] = [
    front,
    back,
    collar,
  ];

  // ----------------------------------------------------------
  // COSTURAS
  // ----------------------------------------------------------

  const seams = createSeams(
    front,
    back,
    collar,
    layout,
  );

  // ----------------------------------------------------------
  // MALHA E REFERÊNCIAS
  // ----------------------------------------------------------

  const initialFit = createTankTopFit(
    measurements,
    panels,
    layout,
  );

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

  const fit = createUpperBodyGarmentFit(
    'tshirt',
    meshData,
  );

  meshData.fit = fit;

  // ----------------------------------------------------------
  // MONTAGEM
  // ----------------------------------------------------------

  const group = assembleGarment(
    meshData,
  ).group;

  group.name = 'CAIMENT_TankTop';

  group.userData = {
    ...group.userData,

    garmentType: 'tshirt',
    garmentModel: 'tank-top',

    measurements: {
      ...measurements,
    },

    meshData,

    fit,
    garmentFit: fit,

    semanticRegions: fit.regions ?? [],

    meshResolution: {
      rows: layout.rows,
      columns: layout.columns,
      edgeLength,
    },

    geometryParameters: {
      armholeFrontStart:
        layout.armholeFrontStart,

      armholeBackStart:
        layout.armholeBackStart,

      armholeFrontDepth:
        layout.armholeFrontDepth,

      armholeBackDepth:
        layout.armholeBackDepth,

      frontNeckDepth:
        layout.neckFrontDepth,

      backNeckDepth:
        layout.neckBackDepth,

      frontNeckHalfWidth:
        layout.neckFrontHalfWidth,

      backNeckHalfWidth:
        layout.neckBackHalfWidth,

      strapWidth:
        layout.strapWidth,

      strapSpacing:
        layout.strapSpacing,

      strapFrontPosition:
        layout.strapFrontPosition,

      strapBackPosition:
        layout.strapBackPosition,

      bodyDepth:
        layout.halfDepth,
    },

    geometryConstruction: {
      method: 'parametric-pattern-surface',
      independentFrontAndBack: true,
      anatomicalWidthProfile: true,
      independentNecklineProfiles: true,
      variableBodyDepth: true,
      semanticRegions: true,
    },

    coordinateSystem: {
      unit: 'meters',
      up: '+Y',
      right: '+X',
      forward: '+Z',
      origin: 'body_floor_center',
    },
  };

  group.updateMatrixWorld(true);

  return group;
}
