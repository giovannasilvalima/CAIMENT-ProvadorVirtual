
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

import {
  createUpperBodyGarmentFit,
} from './UpperBodyGarment';

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
// VALIDAÇÃO
// ============================================================

function validateMeasurements(
  measurements: TShirtMeasurements,
): void {
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
      'A largura do decote deve ser menor que a largura total da regata.',
    );
  }

  const optionalPositiveFields: Array<
    keyof TShirtMeasurements
  > = [
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

  for (const key of optionalPositiveFields) {
    const value = measurements[key];

    if (value === undefined) {
      continue;
    }

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `Medida opcional inválida na geração da regata: ${key}.`,
      );
    }
  }

  const optionalPositionFields: Array<
    keyof TShirtMeasurements
  > = [
    'strapPositionFront',
    'strapPositionBack',
  ];

  for (const key of optionalPositionFields) {
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
      'A largura da alça não pode ultrapassar a largura dos ombros.',
    );
  }

  if (
    measurements.bustHeight !== undefined &&
    measurements.bustHeight > measurements.height
  ) {
    throw new Error(
      'A altura do busto não pode ultrapassar a altura da regata.',
    );
  }

  if (
    measurements.waistHeight !== undefined &&
    measurements.waistHeight > measurements.height
  ) {
    throw new Error(
      'A altura da cintura não pode ultrapassar a altura da regata.',
    );
  }

  if (
    measurements.hemHeight !== undefined &&
    measurements.hemHeight > measurements.height
  ) {
    throw new Error(
      'A altura da barra não pode ultrapassar a altura da regata.',
    );
  }

  if (
    measurements.necklineFrontWidth !== undefined &&
    measurements.necklineFrontWidth >= measurements.shoulderWidth
  ) {
    throw new Error(
      'A largura frontal do decote deve ser menor que a largura dos ombros.',
    );
  }

  if (
    measurements.necklineBackWidth !== undefined &&
    measurements.necklineBackWidth >= measurements.shoulderWidth
  ) {
    throw new Error(
      'A largura traseira do decote deve ser menor que a largura dos ombros.',
    );
  }
}

// ============================================================
// LAYOUT
// ============================================================

interface TankTopLayout {
  rows: number;
  columns: number;

  neckStartColumn: number;
  neckEndColumn: number;
  neckEdgeVertexCount: number;

  armholeStartFront: number;
  armholeStartBack: number;

  strapWidth: number;
  collarThickness: number;

  halfBody: number;
  halfTop: number;
  halfNeck: number;

  frontNeckHalfWidth: number;
  backNeckHalfWidth: number;

  frontNeckDepth: number;
  backNeckDepth: number;

  edgeLength: number;
}

function clampHeight(
  value: number,
  height: number,
): number {
  return THREE.MathUtils.clamp(
    value,
    height * 0.05,
    height * 0.9,
  );
}

function getArmholeStart(
  measurements: TShirtMeasurements,
  type: 'front' | 'back',
): number {
  const specificDepth =
    type === 'front'
      ? measurements.armholeFrontDepth
      : measurements.armholeBackDepth;

  const depth =
    specificDepth ??
    measurements.armholeDepth ??
    measurements.height * 0.42;

  const normalizedDepth = clampHeight(
    depth,
    measurements.height,
  );

  return THREE.MathUtils.clamp(
    1 - normalizedDepth / measurements.height,
    0.1,
    0.9,
  );
}

function getLayout(
  measurements: TShirtMeasurements,
  edgeLength: number,
): TankTopLayout {
  const rows = resolveSegments(
    measurements.height,
    edgeLength,
    16,
    64,
  );

  const columns = resolveSegments(
    measurements.width,
    edgeLength,
    24,
    80,
    true,
  );

  const frontNeckWidth =
    measurements.necklineFrontWidth ??
    measurements.neckWidth;

  const backNeckWidth =
    measurements.necklineBackWidth ??
    measurements.neckWidth;

  const maximumNeckWidth = Math.max(
    frontNeckWidth,
    backNeckWidth,
    measurements.neckWidth,
  );

  const neckRatio = THREE.MathUtils.clamp(
    maximumNeckWidth / measurements.width,
    0.02,
    0.8,
  );

  const neckHalfSegments = THREE.MathUtils.clamp(
    Math.round((columns * neckRatio) / 2),
    2,
    Math.floor(columns / 2) - 1,
  );

  const neckStartColumn =
    Math.floor(columns / 2) - neckHalfSegments;

  const neckEndColumn =
    Math.floor(columns / 2) + neckHalfSegments;

  const strapWidth =
    measurements.strapWidth ??
    (
      measurements.shoulderWidth -
      maximumNeckWidth
    ) / 2;

  const collarThickness = Math.max(
    EPSILON,
    Math.min(
      measurements.width / columns,
      measurements.height / rows,
      maximumNeckWidth / 8,
      measurements.necklineFinishWidth ??
        measurements.width / columns,
    ),
  );

  const frontNeckHalfWidth =
    frontNeckWidth / 2;

  const backNeckHalfWidth =
    backNeckWidth / 2;

  const frontNeckDepth =
    measurements.frontNeckDepth ??
    measurements.neckWidth * 0.5;

  const backNeckDepth =
    measurements.backNeckDepth ??
    measurements.neckWidth * 0.275;

  return {
    rows,
    columns,

    neckStartColumn,
    neckEndColumn,
    neckEdgeVertexCount:
      neckEndColumn - neckStartColumn + 1,

    armholeStartFront: getArmholeStart(
      measurements,
      'front',
    ),

    armholeStartBack: getArmholeStart(
      measurements,
      'back',
    ),

    strapWidth,
    collarThickness,

    halfBody: measurements.width / 2,
    halfTop: measurements.shoulderWidth / 2,
    halfNeck: maximumNeckWidth / 2,

    frontNeckHalfWidth,
    backNeckHalfWidth,

    frontNeckDepth,
    backNeckDepth,

    edgeLength,
  };
}

function bodyVertexIndex(
  row: number,
  column: number,
  layout: TankTopLayout,
): number {
  return row * (layout.columns + 1) + column;
}

// ============================================================
// PERFIL DE LARGURA DO CORPO
// ============================================================

function getBaseBoundaryHalfWidth(
  v: number,
  layout: TankTopLayout,
  type: 'front' | 'back',
): number {
  const armholeStart =
    type === 'front'
      ? layout.armholeStartFront
      : layout.armholeStartBack;

  if (v <= armholeStart) {
    return layout.halfBody;
  }

  const progress = THREE.MathUtils.clamp(
    (v - armholeStart) / (1 - armholeStart),
    0,
    1,
  );

  return THREE.MathUtils.lerp(
    layout.halfBody,
    layout.halfTop,
    progress * progress,
  );
}

/**
 * Converte uma circunferência completa para a metade
 * usada no cálculo lateral da malha.
 *
 * A conversão acontece somente dentro do gerador.
 */
function getHalfWidthFromCircumference(
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

/**
 * Calcula o perfil lateral da peça usando as medidas
 * de busto, cintura e barra quando estiverem disponíveis.
 *
 * As alturas são medidas a partir da barra inferior.
 */
function getBoundaryHalfWidth(
  v: number,
  layout: TankTopLayout,
  measurements: TShirtMeasurements,
  type: 'front' | 'back',
): number {
  const baseWidth = getBaseBoundaryHalfWidth(
    v,
    layout,
    type,
  );

  const hemHalfWidth =
    getHalfWidthFromCircumference(
      measurements.hemCircumference,
    );

  const waistHalfWidth =
    getHalfWidthFromCircumference(
      measurements.waistCircumference,
    );

  const chestHalfWidth =
    getHalfWidthFromCircumference(
      measurements.chestCircumference,
    );

  const anchors: Array<{
    height: number;
    halfWidth: number;
  }> = [];

  if (hemHalfWidth !== undefined) {
    anchors.push({
      height:
        measurements.hemHeight ?? 0,
      halfWidth: hemHalfWidth,
    });
  }

  if (waistHalfWidth !== undefined) {
    anchors.push({
      height:
        measurements.waistHeight ??
        measurements.height * 0.48,
      halfWidth: waistHalfWidth,
    });
  }

  if (chestHalfWidth !== undefined) {
    anchors.push({
      height:
        measurements.bustHeight ??
        measurements.height * 0.72,
      halfWidth: chestHalfWidth,
    });
  }

  if (anchors.length === 0) {
    return baseWidth;
  }

  anchors.push({
    height: measurements.height,
    halfWidth: layout.halfTop,
  });

  anchors.sort(
    (a, b) => a.height - b.height,
  );

  const currentHeight = v * measurements.height;

  if (currentHeight <= anchors[0].height) {
    return anchors[0].halfWidth;
  }

  for (
    let index = 0;
    index < anchors.length - 1;
    index++
  ) {
    const current = anchors[index];
    const next = anchors[index + 1];

    if (
      currentHeight >= current.height &&
      currentHeight <= next.height
    ) {
      const distance =
        next.height - current.height;

      const progress =
        distance > EPSILON
          ? THREE.MathUtils.clamp(
              (currentHeight - current.height) /
                distance,
              0,
              1,
            )
          : 0;

      return THREE.MathUtils.lerp(
        current.halfWidth,
        next.halfWidth,
        progress,
      );
    }
  }

  return baseWidth;
}

// ============================================================
// POSIÇÃO HORIZONTAL DO TOPO
// ============================================================

function getTopRowS(
  column: number,
  layout: TankTopLayout,
): number {
  const {
    neckStartColumn,
    neckEndColumn,
    columns,
  } = layout;

  if (column <= neckStartColumn) {
    return THREE.MathUtils.lerp(
      -layout.halfTop,
      -layout.halfNeck,
      column / neckStartColumn,
    );
  }

  if (column <= neckEndColumn) {
    return THREE.MathUtils.lerp(
      -layout.halfNeck,
      layout.halfNeck,
      (column - neckStartColumn) /
        (neckEndColumn - neckStartColumn),
    );
  }

  return THREE.MathUtils.lerp(
    layout.halfNeck,
    layout.halfTop,
    (column - neckEndColumn) /
      (columns - neckEndColumn),
  );
}

// ============================================================
// DECOTE
// ============================================================

function getNecklineDepth(
  layout: TankTopLayout,
  type: 'front' | 'back',
): number {
  return type === 'front'
    ? layout.frontNeckDepth
    : layout.backNeckDepth;
}

function getNecklineHalfWidth(
  layout: TankTopLayout,
  type: 'front' | 'back',
): number {
  return type === 'front'
    ? layout.frontNeckHalfWidth
    : layout.backNeckHalfWidth;
}

function getNeckDrop(
  column: number,
  layout: TankTopLayout,
  type: 'front' | 'back',
): number {
  if (
    column < layout.neckStartColumn ||
    column > layout.neckEndColumn
  ) {
    return 0;
  }

  const progress =
    (column - layout.neckStartColumn) /
    (layout.neckEndColumn - layout.neckStartColumn);

  const distance = Math.abs(
    progress * 2 - 1,
  );

  const depth = getNecklineDepth(
    layout,
    type,
  );

  const width = getNecklineHalfWidth(
    layout,
    type,
  );

  const widthFactor = THREE.MathUtils.clamp(
    width / layout.halfNeck,
    0.1,
    1,
  );

  return (
    depth *
    widthFactor *
    (1 + Math.cos(Math.PI * distance)) /
    2
  );
}

// ============================================================
// PAINÉIS FRONTAL E TRASEIRO
// ============================================================

function createBodyPanel(
  type: 'front' | 'back',
  measurements: TShirtMeasurements,
  layout: TankTopLayout,
): GarmentPanel {
  const { rows, columns } = layout;

  const sign = type === 'front' ? 1 : -1;

  const armholeStart =
    type === 'front'
      ? layout.armholeStartFront
      : layout.armholeStartBack;

  const topS = Array.from(
    { length: columns + 1 },
    (_, column) => getTopRowS(column, layout),
  );

  const positions: THREE.Vector3[] = [];

  for (let row = 0; row <= rows; row++) {
    const v = row / rows;

    const halfWidth = getBoundaryHalfWidth(
      v,
      layout,
      measurements,
      type,
    );

    const lift = THREE.MathUtils.smoothstep(
      v,
      armholeStart,
      1,
    );

    for (
      let column = 0;
      column <= columns;
      column++
    ) {
      const uniform =
        (2 * column) / columns - 1;

      const target =
        topS[column] / layout.halfTop;

      const s =
        THREE.MathUtils.lerp(
          uniform,
          target,
          lift,
        ) * halfWidth;

      const neckDrop = getNeckDrop(
        column,
        layout,
        type,
      );

      const y =
        v * measurements.height -
        neckDrop * lift;

      const effectiveV = THREE.MathUtils.clamp(
        y / measurements.height,
        0,
        1,
      );

      const depthProgress =
        THREE.MathUtils.smoothstep(
          effectiveV,
          armholeStart,
          1,
        );

      const halfDepth =
        (measurements.depth / 2) *
        (1 - depthProgress);

      const wrap = createWrapMapper(
        2 * halfWidth,
        Math.max(halfDepth, EPSILON),
      );

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
    id: `tank-top-${type}`,
    name:
      type === 'front'
        ? 'Painel frontal da regata'
        : 'Painel traseiro da regata',
    type,
    positions,
    triangles: createGridTriangles(
      rows,
      columns,
      type === 'front',
    ),
  });
}

// ============================================================
// PAINEL DE ACABAMENTO DO DECOTE
// ============================================================

function createCollarPanel(
  front: GarmentPanel,
  back: GarmentPanel,
  layout: TankTopLayout,
): GarmentPanel {
  const positions: THREE.Vector3[] = [];
  const triangles: GarmentTriangle[] = [];

  const innerBoundary: THREE.Vector3[] = [];

  for (
    let column = layout.neckStartColumn;
    column <= layout.neckEndColumn;
    column++
  ) {
    innerBoundary.push(
      front.vertices[
        bodyVertexIndex(
          layout.rows,
          column,
          layout,
        )
      ].position.clone(),
    );
  }

  for (
    let column = layout.neckEndColumn;
    column >= layout.neckStartColumn;
    column--
  ) {
    innerBoundary.push(
      back.vertices[
        bodyVertexIndex(
          layout.rows,
          column,
          layout,
        )
      ].position.clone(),
    );
  }

  const perimeterCount = innerBoundary.length;

  for (const point of innerBoundary) {
    positions.push(point.clone());
  }

  for (const point of innerBoundary) {
    const direction = new THREE.Vector3(
      point.x,
      0,
      point.z,
    );

    if (direction.lengthSq() > EPSILON) {
      direction.normalize();
    } else {
      direction.set(
        0,
        0,
        point.z >= 0 ? 1 : -1,
      );
    }

    positions.push(
      new THREE.Vector3(
        point.x +
          direction.x * layout.collarThickness,
        point.y + layout.collarThickness,
        point.z +
          direction.z * layout.collarThickness,
      ),
    );
  }

  for (
    let index = 0;
    index < perimeterCount;
    index++
  ) {
    const next =
      (index + 1) % perimeterCount;

    if (
      index === layout.neckEdgeVertexCount - 1 ||
      index === perimeterCount - 1
    ) {
      continue;
    }

    const outerA =
      perimeterCount + index;

    const outerB =
      perimeterCount + next;

    triangles.push(
      { a: index, b: outerA, c: next },
      { a: outerA, b: outerB, c: next },
    );
  }

  return createPanel({
    id: 'tank-top-collar',
    name: 'Acabamento do decote da regata',
    type: 'collar',
    positions,
    triangles,
  });
}

// ============================================================
// ÍNDICES GLOBAIS
// ============================================================

function getGlobalVertexIndices(
  panelOffset: number,
  localIndices: number[],
): number[] {
  return localIndices.map(
    (index) => panelOffset + index,
  );
}

// ============================================================
// REFERÊNCIAS DE ENCAIXE
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

  const collar = panels.find(
    (panel) => panel.type === 'collar',
  );

  if (!front || !back || !collar) {
    throw new Error(
      'Não foi possível construir as referências semânticas da regata.',
    );
  }

  const { rows, columns } = layout;

  const frontOffset = 0;
  const backOffset = front.vertices.length;

  const index = (
    row: number,
    column: number,
  ) => bodyVertexIndex(row, column, layout);

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

  const shoulderColumns = Math.max(
    1,
    Math.min(
      layout.neckStartColumn,
      Math.ceil(
        layout.strapWidth /
          (measurements.width / columns),
      ),
    ),
  );

  const leftShoulderColumns = Array.from(
    { length: shoulderColumns + 1 },
    (_, i) => i,
  );

  const rightShoulderColumns = Array.from(
    { length: shoulderColumns + 1 },
    (_, i) => columns - i,
  );

  const bothPanels = (
    row: number,
    cols: number[],
  ) => [
    ...cols.map(
      (column) =>
        frontOffset + index(row, column),
    ),
    ...cols.map(
      (column) =>
        backOffset + index(row, column),
    ),
  ];

  const leftShoulderVertices = bothPanels(
    rows,
    leftShoulderColumns,
  );

  const rightShoulderVertices = bothPanels(
    rows,
    rightShoulderColumns,
  );

  const shoulderVertices = [
    ...leftShoulderVertices,
    ...rightShoulderVertices,
  ];

  // ----------------------------------------------------------
  // DECOTE
  // ----------------------------------------------------------

  const frontNeckVertices = Array.from(
    { length: layout.neckEdgeVertexCount },
    (_, i) =>
      frontOffset +
      index(
        rows,
        layout.neckStartColumn + i,
      ),
  );

  const backNeckVertices = Array.from(
    { length: layout.neckEdgeVertexCount },
    (_, i) =>
      backOffset +
      index(
        rows,
        layout.neckEndColumn - i,
      ),
  );

  // ----------------------------------------------------------
  // CAVAS
  // ----------------------------------------------------------

  const frontArmholeRows = Array.from(
    {
      length:
        rows -
        Math.floor(
          layout.armholeStartFront * rows,
        ) +
        1,
    },
    (_, i) =>
      Math.floor(
        layout.armholeStartFront * rows,
      ) + i,
  );

  const backArmholeRows = Array.from(
    {
      length:
        rows -
        Math.floor(
          layout.armholeStartBack * rows,
        ) +
        1,
    },
    (_, i) =>
      Math.floor(
        layout.armholeStartBack * rows,
      ) + i,
  );

  const getArmholeVertices = (
    column: number,
  ) => [
    ...frontArmholeRows.map(
      (row) =>
        frontOffset + index(row, column),
    ),
    ...backArmholeRows.map(
      (row) =>
        backOffset + index(row, column),
    ),
  ];

  const leftArmholeVertices =
    getArmholeVertices(0);

  const rightArmholeVertices =
    getArmholeVertices(columns);

  // ----------------------------------------------------------
  // BARRA
  // ----------------------------------------------------------

  const bottomHemLocal = Array.from(
    { length: columns + 1 },
    (_, column) => index(0, column),
  );

  const bottomHemVertices = [
    ...getGlobalVertexIndices(
      frontOffset,
      bottomHemLocal,
    ),
    ...getGlobalVertexIndices(
      backOffset,
      bottomHemLocal,
    ),
  ];

  // ----------------------------------------------------------
  // REGIÕES SEMÂNTICAS
  // ----------------------------------------------------------

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
      vertexIndices: shoulderVertices,
      role: 'support',
    },
    {
      id: 'left-shoulder-support',
      name: 'Sustentação do ombro esquerdo',
      bodyRegion: 'shoulders',
      vertexIndices: leftShoulderVertices,
      role: 'support',
    },
    {
      id: 'right-shoulder-support',
      name: 'Sustentação do ombro direito',
      bodyRegion: 'shoulders',
      vertexIndices: rightShoulderVertices,
      role: 'support',
    },
    {
      id: 'neck-opening',
      name: 'Abertura do pescoço',
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
      vertexIndices: leftArmholeVertices,
      role: 'opening',
    },
    {
      id: 'right-armhole-opening',
      name: 'Cava direita',
      bodyRegion: 'rightArm',
      vertexIndices: rightArmholeVertices,
      role: 'opening',
    },
    {
      id: 'bottom-hem',
      name: 'Barra inferior',
      bodyRegion: 'abdomen',
      vertexIndices: bottomHemVertices,
      role: 'hem',
    },
  ];

  const frontStrapPosition =
    measurements.strapPositionFront ?? 0;

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
          -layout.halfTop +
            frontStrapPosition,
          measurements.height,
          0,
        ),
        weight: 1,
      },
      {
        id: 'right-shoulder',
        bodyLandmark: 'rightShoulder',
        garmentPosition: new THREE.Vector3(
          layout.halfTop +
            frontStrapPosition,
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
// COSTURAS
// ============================================================

function createSeams(
  panels: GarmentPanel[],
  layout: TankTopLayout,
): GarmentSeam[] {
  const front = panels.find(
    (panel) => panel.type === 'front',
  );

  const back = panels.find(
    (panel) => panel.type === 'back',
  );

  const collar = panels.find(
    (panel) => panel.type === 'collar',
  );

  if (!front || !back || !collar) {
    throw new Error(
      'Não foi possível criar as costuras da regata.',
    );
  }

  const { rows, columns } = layout;

  const index = (
    row: number,
    column: number,
  ) => bodyVertexIndex(row, column, layout);

  const bodySideEdge = (
    side: 'left' | 'right',
    type: 'front' | 'back',
  ): number[] => {
    const column =
      side === 'left' ? 0 : columns;

    const armholeStart =
      type === 'front'
        ? layout.armholeStartFront
        : layout.armholeStartBack;

    const startRow = Math.floor(
      armholeStart * rows,
    );

    const edge: number[] = [];

    for (
      let row = 0;
      row <= startRow;
      row++
    ) {
      edge.push(index(row, column));
    }

    return edge;
  };

  const leftShoulderEdge: number[] = [];
  const rightShoulderEdge: number[] = [];

  for (
    let column = 0;
    column <= layout.neckStartColumn;
    column++
  ) {
    leftShoulderEdge.push(
      index(rows, column),
    );
  }

  for (
    let column = layout.neckEndColumn;
    column <= columns;
    column++
  ) {
    rightShoulderEdge.push(
      index(rows, column),
    );
  }

  const frontNeckEdge: number[] = [];

  for (
    let column = layout.neckStartColumn;
    column <= layout.neckEndColumn;
    column++
  ) {
    frontNeckEdge.push(
      index(rows, column),
    );
  }

  const backNeckEdge: number[] = [];

  for (
    let column = layout.neckEndColumn;
    column >= layout.neckStartColumn;
    column--
  ) {
    backNeckEdge.push(
      index(rows, column),
    );
  }

  const collarFrontEdge = Array.from(
    { length: layout.neckEdgeVertexCount },
    (_, i) => i,
  );

  const collarBackEdge = Array.from(
    { length: layout.neckEdgeVertexCount },
    (_, i) =>
      layout.neckEdgeVertexCount + i,
  );

  return [
    {
      id: 'seam-left-side',
      name: 'Costura lateral esquerda',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: bodySideEdge('left', 'front'),
      edgeB: bodySideEdge('left', 'back'),
      stiffness: 1,
    },
    {
      id: 'seam-right-side',
      name: 'Costura lateral direita',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: bodySideEdge('right', 'front'),
      edgeB: bodySideEdge('right', 'back'),
      stiffness: 1,
    },
    {
      id: 'seam-left-shoulder',
      name: 'Alça e ombro esquerdo',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: leftShoulderEdge,
      edgeB: [...leftShoulderEdge],
      stiffness: 1,
    },
    {
      id: 'seam-right-shoulder',
      name: 'Alça e ombro direito',
      panelAId: front.id,
      panelBId: back.id,
      edgeA: rightShoulderEdge,
      edgeB: [...rightShoulderEdge],
      stiffness: 1,
    },
    {
      id: 'seam-collar-front',
      name: 'Acabamento frontal do decote',
      panelAId: front.id,
      panelBId: collar.id,
      edgeA: frontNeckEdge,
      edgeB: collarFrontEdge,
      stiffness: 1,
    },
    {
      id: 'seam-collar-back',
      name: 'Acabamento traseiro do decote',
      panelAId: back.id,
      panelBId: collar.id,
      edgeA: backNeckEdge,
      edgeB: collarBackEdge,
      stiffness: 1,
    },
  ];
}

// ============================================================
// CONSTRUTOR PRINCIPAL
// ============================================================

export function createTShirtGeometry(
  measurements: TShirtMeasurements,
  options?: GarmentMeshOptions,
): THREE.Group {
  if (
    !measurements ||
    typeof measurements !== 'object'
  ) {
    throw new Error(
      'As medidas da regata devem ser fornecidas pela loja.',
    );
  }

  validateMeasurements(measurements);

  const edgeLength = resolveEdgeLength(options);

  const layout = getLayout(
    measurements,
    edgeLength,
  );

  const front = createBodyPanel(
    'front',
    measurements,
    layout,
  );

  const back = createBodyPanel(
    'back',
    measurements,
    layout,
  );

  const collar = createCollarPanel(
    front,
    back,
    layout,
  );

  const panels: GarmentPanel[] = [
    front,
    back,
    collar,
  ];

  const seams = createSeams(
    panels,
    layout,
  );

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
      armholeStartFront:
        layout.armholeStartFront,

      armholeStartBack:
        layout.armholeStartBack,

      frontNeckDepth:
        layout.frontNeckDepth,

      backNeckDepth:
        layout.backNeckDepth,

      frontNeckHalfWidth:
        layout.frontNeckHalfWidth,

      backNeckHalfWidth:
        layout.backNeckHalfWidth,

      strapWidth:
        layout.strapWidth,

      collarThickness:
        layout.collarThickness,
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
