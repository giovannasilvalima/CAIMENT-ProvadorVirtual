
import * as THREE from 'three';

import {
  type GarmentPanel,
  type GarmentSeam,
  type GarmentMeshData,
  type GarmentFitDefinition,
} from './types';

import { assembleGarment } from './assembleGarment';

import {
  type GarmentMeshOptions,
  createGridTriangles,
  createPanel,
  createWrapMapper,
  getColumnEdge,
  getRowEdge,
  pairEdgesByPosition,
  resolveEdgeLength,
  resolveSegments,
} from './GarmentCommon';

/**
 * ============================================================
 * CAIMENT — GEOMETRIA DE CALÇAS E SHORTS
 * ============================================================
 *
 * As medidas são recebidas em metros.
 *
 * A geometria é construída a partir das dimensões recebidas
 * pela loja, sem dimensões corporais fixas.
 *
 * A montagem final compartilha os vértices das uniões:
 * não depende de costuras físicas separadas para conectar
 * as partes da peça.
 */

export interface LowerBodyMeasurements {
  waistWidth: number;
  hipWidth: number;
  thighWidth: number;
  legOpening: number;

  length: number;
  depth: number;

  crotchDepth: number;
  crotchWidth: number;
  rise: number;

  frontRise?: number;
  backRise?: number;

  frontCrotchLength?: number;
  backCrotchLength?: number;

  kneeCircumference?: number;
  calfCircumference?: number;
  ankleCircumference?: number;

  thighHeight?: number;
  kneeHeight?: number;
  calfHeight?: number;

  hipHeight?: number;
  waistHeight?: number;

  outseamLength?: number;

  waistbandHeight?: number;
  waistbandCircumference?: number;

  leftLegLength?: number;
  rightLegLength?: number;

  legSeparation?: number;

  hemWidth?: number;
  waistbandFinishWidth?: number;
  hemCircumference?: number;
}

export type LowerBodyKind = 'pants' | 'short';

type PanelSide = 'left' | 'right';
type PanelFace = 'front' | 'back';
type PanelRegion = 'leg' | 'hip';

type NormalizedMeasurements = LowerBodyMeasurements;

const MINIMUM_DIMENSION = 0.0001;
const GEOMETRY_EPSILON = 1e-10;

const LABELS: Record<
  LowerBodyKind,
  {
    invalidIn: string;
    lengthOf: string;
    groupName: string;
  }
> = {
  pants: {
    invalidIn: 'na calça',
    lengthOf: 'da calça',
    groupName: 'CAIMENT_Pants',
  },
  short: {
    invalidIn: 'no short',
    lengthOf: 'do short',
    groupName: 'CAIMENT_Short',
  },
};

/* ============================================================
 * VALIDAÇÃO
 * ========================================================== */

function validateOptionalMeasurements(
  input: LowerBodyMeasurements,
  kind: LowerBodyKind,
): void {
  const optionalFields: Array<
    keyof LowerBodyMeasurements
  > = [
    'frontRise',
    'backRise',
    'frontCrotchLength',
    'backCrotchLength',
    'kneeCircumference',
    'calfCircumference',
    'ankleCircumference',
    'thighHeight',
    'kneeHeight',
    'calfHeight',
    'hipHeight',
    'waistHeight',
    'outseamLength',
    'waistbandHeight',
    'waistbandCircumference',
    'leftLegLength',
    'rightLegLength',
    'legSeparation',
    'hemWidth',
    'waistbandFinishWidth',
    'hemCircumference',
  ];

  for (const name of optionalFields) {
    const value = input[name];

    if (value === undefined) continue;

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `CAIMENT: medida complementar inválida ${LABELS[kind].invalidIn}: ${name} deve ser positiva e estar em metros.`,
      );
    }
  }

  const orderedHeights = [
    input.thighHeight,
    input.kneeHeight,
    input.calfHeight,
  ].filter(
    (value): value is number =>
      value !== undefined,
  );

  for (
    let index = 1;
    index < orderedHeights.length;
    index++
  ) {
    if (
      orderedHeights[index] <=
      orderedHeights[index - 1]
    ) {
      throw new Error(
        'CAIMENT: as alturas de coxa, joelho e panturrilha devem estar em ordem crescente a partir da barra.',
      );
    }
  }

  const maximumLegLength = Math.max(
    input.leftLegLength ?? input.length,
    input.rightLegLength ?? input.length,
  );

  for (const [name, height] of [
    ['thighHeight', input.thighHeight],
    ['kneeHeight', input.kneeHeight],
    ['calfHeight', input.calfHeight],
  ] as const) {
    if (
      height !== undefined &&
      height > maximumLegLength
    ) {
      throw new Error(
        `CAIMENT: ${name} não pode ultrapassar o comprimento da perna.`,
      );
    }
  }

  if (
    input.hipHeight !== undefined &&
    input.waistHeight !== undefined &&
    input.hipHeight >= input.waistHeight
  ) {
    throw new Error(
      'CAIMENT: a altura do quadril deve ser menor que a altura da cintura.',
    );
  }

  if (
    input.outseamLength !== undefined &&
    input.outseamLength < maximumLegLength
  ) {
    throw new Error(
      'CAIMENT: o comprimento externo não pode ser menor que o comprimento interno da perna.',
    );
  }

  if (
    input.waistHeight !== undefined &&
    input.outseamLength !== undefined &&
    input.waistHeight > input.outseamLength
  ) {
    throw new Error(
      'CAIMENT: a altura da cintura não pode ultrapassar o comprimento externo.',
    );
  }

  if (
    input.waistbandHeight !== undefined &&
    input.outseamLength !== undefined &&
    input.waistbandHeight >= input.outseamLength
  ) {
    throw new Error(
      'CAIMENT: a altura do cós não pode ser maior ou igual ao comprimento externo.',
    );
  }

  if (
    input.frontCrotchLength !== undefined &&
    input.frontCrotchLength >= maximumLegLength
  ) {
    throw new Error(
      'CAIMENT: o comprimento do gancho frontal não pode ultrapassar o comprimento da perna.',
    );
  }

  if (
    input.backCrotchLength !== undefined &&
    input.backCrotchLength >= maximumLegLength
  ) {
    throw new Error(
      'CAIMENT: o comprimento do gancho traseiro não pode ultrapassar o comprimento da perna.',
    );
  }

  if (
    input.waistbandCircumference !== undefined &&
    input.waistbandCircumference < input.waistWidth
  ) {
    throw new Error(
      'CAIMENT: a circunferência do cós não pode ser menor que a medida da cintura.',
    );
  }
}

function validateMeasurements(
  input: LowerBodyMeasurements,
  kind: LowerBodyKind,
): NormalizedMeasurements {
  const required: Array<
    keyof LowerBodyMeasurements
  > = [
    'waistWidth',
    'hipWidth',
    'thighWidth',
    'legOpening',
    'length',
    'depth',
    'crotchDepth',
    'crotchWidth',
    'rise',
  ];

  for (const name of required) {
    const value = input[name];

    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `CAIMENT: medida inválida ${LABELS[kind].invalidIn}: ${name} deve ser um número positivo recebido pela loja, em metros.`,
      );
    }
  }

  if (input.crotchDepth >= input.length) {
    throw new Error(
      `CAIMENT: a profundidade do gancho deve ser menor que o comprimento ${LABELS[kind].lengthOf}.`,
    );
  }

  if (
    input.leftLegLength !== undefined &&
    input.crotchDepth >= input.leftLegLength
  ) {
    throw new Error(
      'CAIMENT: a profundidade do gancho deve ser menor que o comprimento da perna esquerda.',
    );
  }

  if (
    input.rightLegLength !== undefined &&
    input.crotchDepth >= input.rightLegLength
  ) {
    throw new Error(
      'CAIMENT: a profundidade do gancho deve ser menor que o comprimento da perna direita.',
    );
  }

  validateOptionalMeasurements(input, kind);

  return { ...input };
}

/* ============================================================
 * FUNÇÕES DE GEOMETRIA
 * ========================================================== */

function midpoint(
  a: THREE.Vector3,
  b: THREE.Vector3,
): THREE.Vector3 {
  return a.clone().add(b).multiplyScalar(0.5);
}

function getPanelVertex(
  panels: GarmentPanel[],
  panelId: string,
  row: number,
  column: number,
  columns: number,
): THREE.Vector3 {
  const panel = panels.find(
    (item) => item.id === panelId,
  );

  if (!panel) {
    throw new Error(
      `CAIMENT: painel "${panelId}" não encontrado ao gerar as âncoras.`,
    );
  }

  const index =
    row * (columns + 1) + column;

  const vertex = panel.vertices[index];

  if (
    !vertex?.position ||
    !vertex.position.isVector3
  ) {
    throw new Error(
      `CAIMENT: vértice inválido no painel "${panelId}", linha ${row}, coluna ${column}.`,
    );
  }

  return vertex.position.clone();
}

function resolveRowFromHeight(
  height: number | undefined,
  regionBottom: number,
  regionTop: number,
  rows: number,
  fallback: number,
): number {
  const regionHeight =
    regionTop - regionBottom;

  if (
    height === undefined ||
    regionHeight <= MINIMUM_DIMENSION
  ) {
    return Math.round(
      THREE.MathUtils.clamp(
        fallback,
        0,
        1,
      ) * rows,
    );
  }

  const normalized =
    (height - regionBottom) / regionHeight;

  return THREE.MathUtils.clamp(
    Math.round(normalized * rows),
    0,
    rows,
  );
}

function smoothInterpolate(
  a: number,
  b: number,
  t: number,
): number {
  const clamped = THREE.MathUtils.clamp(
    t,
    0,
    1,
  );

  const smooth =
    clamped *
    clamped *
    (3 - 2 * clamped);

  return THREE.MathUtils.lerp(
    a,
    b,
    smooth,
  );
}

/* ============================================================
 * PERFIS DE CIRCUNFERÊNCIA
 * ========================================================== */

function getLegCircumferenceAt(
  m: NormalizedMeasurements,
  height: number,
  totalLength: number,
  kind: LowerBodyKind,
): number {
  const opening =
    m.hemCircumference ??
    (
      kind === 'pants'
        ? m.ankleCircumference
        : undefined
    ) ??
    m.legOpening;

  const thigh = m.thighWidth;

  if (kind === 'short') {
    const normalizedHeight =
      height /
      Math.max(
        totalLength,
        MINIMUM_DIMENSION,
      );

    return smoothInterpolate(
      opening,
      thigh,
      normalizedHeight,
    );
  }

  const calf =
    m.calfCircumference ?? opening;

  const knee =
    m.kneeCircumference ?? thigh;

  const calfHeight =
    m.calfHeight ?? totalLength * 0.25;

  const kneeHeight =
    m.kneeHeight ?? totalLength * 0.5;

  const thighHeight =
    m.thighHeight ?? totalLength * 0.85;

  if (height <= calfHeight) {
    return smoothInterpolate(
      opening,
      calf,
      height /
        Math.max(
          calfHeight,
          MINIMUM_DIMENSION,
        ),
    );
  }

  if (height <= kneeHeight) {
    return smoothInterpolate(
      calf,
      knee,
      (height - calfHeight) /
        Math.max(
          kneeHeight - calfHeight,
          MINIMUM_DIMENSION,
        ),
    );
  }

  if (height <= thighHeight) {
    return smoothInterpolate(
      knee,
      thigh,
      (height - kneeHeight) /
        Math.max(
          thighHeight - kneeHeight,
          MINIMUM_DIMENSION,
        ),
    );
  }

  return thigh;
}

function getHipCircumferenceAt(
  m: NormalizedMeasurements,
  height: number,
  crotchY: number,
  waistY: number,
): number {
  const hip = m.hipWidth;

  const waist =
    m.waistbandCircumference ??
    m.waistWidth;

  const hipY =
    m.hipHeight ??
    crotchY +
      (waistY - crotchY) * 0.55;

  if (height <= hipY) {
    const t =
      (height - crotchY) /
      Math.max(
        hipY - crotchY,
        MINIMUM_DIMENSION,
      );

    return smoothInterpolate(
      m.thighWidth,
      hip,
      t,
    );
  }

  const t =
    (height - hipY) /
    Math.max(
      waistY - hipY,
      MINIMUM_DIMENSION,
    );

  return smoothInterpolate(
    hip,
    waist,
    t,
  );
}

function getCrotchProjection(
  m: NormalizedMeasurements,
  face: PanelFace,
): number {
  const crotchLength =
    face === 'front'
      ? m.frontCrotchLength ?? m.crotchDepth
      : m.backCrotchLength ?? m.crotchDepth;

  return THREE.MathUtils.clamp(
    Math.max(
      m.crotchDepth,
      crotchLength * 0.25,
    ),
    MINIMUM_DIMENSION,
    Math.max(
      m.depth,
      m.crotchDepth,
    ),
  );
}

/* ============================================================
 * UNIÃO TOPOLÓGICA DOS PAINÉIS
 * ========================================================== */

/**
 * Estrutura de retorno da união.
 *
 * oldToNew converte índices globais dos painéis originais
 * para os índices do painel contínuo.
 */
interface ContinuousSurfaceResult {
  panel: GarmentPanel;
  oldToNew: number[];
}

/**
 * Une vértices de costuras usando conjuntos disjuntos.
 *
 * Diferentemente do comportamento de weldConstraints,
 * os triângulos passam a referenciar os mesmos índices.
 *
 * O resultado é uma única malha topologicamente conectada.
 */
function mergePanelsIntoContinuousSurface(
  panels: GarmentPanel[],
  seams: GarmentSeam[],
): ContinuousSurfaceResult {
  if (panels.length === 0) {
    throw new Error(
      'CAIMENT: não existem painéis para formar a superfície da peça.',
    );
  }

  const offsets = new Map<string, number>();

  let totalVertices = 0;

  for (const panel of panels) {
    offsets.set(
      panel.id,
      totalVertices,
    );

    totalVertices += panel.vertices.length;
  }

  const parent = Array.from(
    { length: totalVertices },
    (_, index) => index,
  );

  const find = (value: number): number => {
    let root = value;

    while (parent[root] !== root) {
      root = parent[root];
    }

    let current = value;

    while (parent[current] !== current) {
      const next = parent[current];
      parent[current] = root;
      current = next;
    }

    return root;
  };

  const union = (
    a: number,
    b: number,
  ): void => {
    const rootA = find(a);
    const rootB = find(b);

    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  };

  const panelById = new Map(
    panels.map((panel) => [
      panel.id,
      panel,
    ]),
  );

  /**
   * Une as bordas correspondentes das costuras.
   */
  for (const seam of seams) {
    const panelA = panelById.get(
      seam.panelAId,
    );

    const panelB = panelById.get(
      seam.panelBId,
    );

    const offsetA = offsets.get(
      seam.panelAId,
    );

    const offsetB = offsets.get(
      seam.panelBId,
    );

    if (
      !panelA ||
      !panelB ||
      offsetA === undefined ||
      offsetB === undefined
    ) {
      throw new Error(
        `CAIMENT: não foi possível unir a costura "${seam.id}".`,
      );
    }

    if (
      seam.edgeA.length !== seam.edgeB.length ||
      seam.edgeA.length < 2
    ) {
      throw new Error(
        `CAIMENT: bordas incompatíveis na costura "${seam.id}".`,
      );
    }

    for (
      let index = 0;
      index < seam.edgeA.length;
      index++
    ) {
      const localA = seam.edgeA[index];
      const localB = seam.edgeB[index];

      if (
        localA < 0 ||
        localA >= panelA.vertices.length ||
        localB < 0 ||
        localB >= panelB.vertices.length
      ) {
        throw new Error(
          `CAIMENT: índice inválido na costura "${seam.id}".`,
        );
      }

      union(
        offsetA + localA,
        offsetB + localB,
      );
    }
  }

  /**
   * Agrupa os vértices que representam o mesmo ponto.
   */
  const groups = new Map<
    number,
    {
      position: THREE.Vector3;
      count: number;
    }
  >();

  for (
    let globalIndex = 0;
    globalIndex < totalVertices;
    globalIndex++
  ) {
    const root = find(globalIndex);

    const panel = panels.find(
      (item) => {
        const offset = offsets.get(item.id)!;

        return (
          globalIndex >= offset &&
          globalIndex <
            offset + item.vertices.length
        );
      },
    );

    if (!panel) {
      throw new Error(
        'CAIMENT: não foi possível recuperar um vértice durante a união.',
      );
    }

    const offset = offsets.get(panel.id)!;

    const localIndex =
      globalIndex - offset;

    const position =
      panel.vertices[localIndex].position;

    const group = groups.get(root);

    if (group) {
      group.position.add(position);
      group.count++;
    } else {
      groups.set(root, {
        position: position.clone(),
        count: 1,
      });
    }
  }

  /**
   * Cria os novos índices sem duplicar vértices soldados.
   */
  const rootToNew = new Map<number, number>();

  const positions: THREE.Vector3[] = [];

  for (const [root, group] of groups) {
    const position = group.position
      .clone()
      .multiplyScalar(1 / group.count);

    rootToNew.set(
      root,
      positions.length,
    );

    positions.push(position);
  }

  const oldToNew = new Array<number>(
    totalVertices,
  );

  for (
    let globalIndex = 0;
    globalIndex < totalVertices;
    globalIndex++
  ) {
    oldToNew[globalIndex] =
      rootToNew.get(find(globalIndex))!;
  }

  /**
   * Reconstrói os triângulos usando os índices compartilhados.
   *
   * Triângulos degenerados e duplicados são descartados.
   */
  const triangles: Array<{
    a: number;
    b: number;
    c: number;
  }> = [];

  const triangleKeys = new Set<string>();

  for (const panel of panels) {
    const offset = offsets.get(panel.id)!;

    for (const triangle of panel.triangles) {
      const a = oldToNew[
        offset + triangle.a
      ];

      const b = oldToNew[
        offset + triangle.b
      ];

      const c = oldToNew[
        offset + triangle.c
      ];

      if (
        a === b ||
        b === c ||
        c === a
      ) {
        continue;
      }

      const pa = positions[a];
      const pb = positions[b];
      const pc = positions[c];

      const areaVector = new THREE.Vector3()
        .subVectors(pb, pa)
        .cross(
          new THREE.Vector3().subVectors(
            pc,
            pa,
          ),
        );

      if (
        areaVector.lengthSq() <=
        GEOMETRY_EPSILON
      ) {
        continue;
      }

      const sorted = [a, b, c]
        .sort((x, y) => x - y);

      const key = sorted.join(':');

      if (triangleKeys.has(key)) {
        continue;
      }

      triangleKeys.add(key);

      triangles.push({
        a,
        b,
        c,
      });
    }
  }

  if (triangles.length === 0) {
    throw new Error(
      'CAIMENT: a união dos painéis não produziu triângulos válidos.',
    );
  }

  const panel = createPanel({
    id: 'lower-body-continuous-surface',
    name: 'Superfície contínua da peça',
    type: 'front',
    positions,
    triangles,
  });

  return {
    panel,
    oldToNew,
  };
}

/**
 * Atualiza os índices das regiões de encaixe após a união.
 *
 * Os índices de regiões são globais, portanto precisam
 * acompanhar a nova numeração da malha.
 */
function remapFitRegions(
  fit: GarmentFitDefinition,
  oldToNew: number[],
): GarmentFitDefinition {
  return {
    ...fit,

    regions: fit.regions?.map((region) => ({
      ...region,
      vertexIndices: [
        ...new Set(
          region.vertexIndices
            .map((index) => oldToNew[index])
            .filter(
              (index) => index !== undefined,
            ),
        ),
      ],
    })),
  };
}

/* ============================================================
 * CÓS E REGIÕES DE SUPORTE
 * ========================================================== */

function getWaistbandVertexIndices(
  panels: GarmentPanel[],
  hipRows: number,
  columns: number,
  waistbandHeight: number,
  hipRegionHeight: number,
): number[] {
  const indices: number[] = [];

  let offset = 0;

  const bandRatio =
    hipRegionHeight > MINIMUM_DIMENSION
      ? THREE.MathUtils.clamp(
          waistbandHeight / hipRegionHeight,
          0,
          1,
        )
      : 0;

  const bandRows = Math.max(
    1,
    Math.ceil(bandRatio * hipRows),
  );

  const firstRow = Math.max(
    0,
    hipRows - bandRows,
  );

  for (const panel of panels) {
    if (panel.id.startsWith('hip-')) {
      for (
        let row = firstRow;
        row <= hipRows;
        row++
      ) {
        for (
          let column = 0;
          column <= columns;
          column++
        ) {
          indices.push(
            offset +
              row * (columns + 1) +
              column,
          );
        }
      }
    }

    offset += panel.vertices.length;
  }

  if (indices.length === 0) {
    throw new Error(
      'CAIMENT: não foi possível identificar os vértices da região do cós.',
    );
  }

  return indices;
}

/* ============================================================
 * ENCAIXE DA ROUPA
 * ========================================================== */

function createLowerBodyFit(
  kind: LowerBodyKind,
  measurements: NormalizedMeasurements,
  panels: GarmentPanel[],
  hipRows: number,
  legRows: number,
  columns: number,
  hipBottomY: number,
  waistY: number,
  leftCrotchY: number,
  rightCrotchY: number,
): GarmentFitDefinition {
  const hipRow = resolveRowFromHeight(
    measurements.hipHeight,
    hipBottomY,
    waistY,
    hipRows,
    0.55,
  );

  const leftKneeRow = resolveRowFromHeight(
    measurements.kneeHeight,
    0,
    leftCrotchY,
    legRows,
    0.5,
  );

  const rightKneeRow = resolveRowFromHeight(
    measurements.kneeHeight,
    0,
    rightCrotchY,
    legRows,
    0.5,
  );

  const centerColumn = Math.floor(
    columns / 2,
  );

  const leftHip = getPanelVertex(
    panels,
    'hip-front-left',
    hipRow,
    0,
    columns,
  );

  const rightHip = getPanelVertex(
    panels,
    'hip-front-right',
    hipRow,
    columns,
    columns,
  );

  const leftCrotch = getPanelVertex(
    panels,
    'front-left',
    legRows,
    columns,
    columns,
  );

  const rightCrotch = getPanelVertex(
    panels,
    'front-right',
    legRows,
    0,
    columns,
  );

  const crotchCenter = midpoint(
    leftCrotch,
    rightCrotch,
  );

  const hipRegionHeight =
    waistY - hipBottomY;

  const waistbandVertexIndices =
    getWaistbandVertexIndices(
      panels,
      hipRows,
      columns,
      measurements.waistbandHeight ?? 0,
      hipRegionHeight,
    );

  const anchors: GarmentFitDefinition['anchors'] = [
    {
      id: `${kind}-left-hip`,
      bodyLandmark: 'leftHip',
      garmentPosition: leftHip,
      weight: 1,
    },
    {
      id: `${kind}-right-hip`,
      bodyLandmark: 'rightHip',
      garmentPosition: rightHip,
      weight: 1,
    },
    {
      id: `${kind}-crotch-center`,
      bodyLandmark: 'crotchCenter',
      garmentPosition: crotchCenter,
      weight: 1,
    },
  ];

  if (kind === 'short') {
    const hipCenter = midpoint(
      leftHip,
      rightHip,
    );

    const waistFrontLeft = getPanelVertex(
      panels,
      'hip-front-left',
      hipRows,
      0,
      columns,
    );

    const waistFrontRight = getPanelVertex(
      panels,
      'hip-front-right',
      hipRows,
      columns,
      columns,
    );

    anchors.push(
      {
        id: 'short-hip-center',
        bodyLandmark: 'hipCenter',
        garmentPosition: hipCenter,
        weight: 1,
      },
      {
        id: 'short-waist-center',
        bodyLandmark: 'waistCenter',
        garmentPosition: midpoint(
          waistFrontLeft,
          waistFrontRight,
        ),
        weight: 1,
      },
    );
  }

  if (kind === 'pants') {
    const leftKnee = getPanelVertex(
      panels,
      'front-left',
      leftKneeRow,
      centerColumn,
      columns,
    );

    const rightKnee = getPanelVertex(
      panels,
      'front-right',
      rightKneeRow,
      centerColumn,
      columns,
    );

    const leftAnkle = getPanelVertex(
      panels,
      'front-left',
      0,
      centerColumn,
      columns,
    );

    const rightAnkle = getPanelVertex(
      panels,
      'front-right',
      0,
      centerColumn,
      columns,
    );

    anchors.push(
      {
        id: 'pants-left-knee',
        bodyLandmark: 'leftKnee',
        garmentPosition: leftKnee,
        weight: 1,
      },
      {
        id: 'pants-right-knee',
        bodyLandmark: 'rightKnee',
        garmentPosition: rightKnee,
        weight: 1,
      },
      {
        id: 'pants-left-ankle',
        bodyLandmark: 'leftAnkle',
        garmentPosition: leftAnkle,
        weight: 1,
      },
      {
        id: 'pants-right-ankle',
        bodyLandmark: 'rightAnkle',
        garmentPosition: rightAnkle,
        weight: 1,
      },
    );
  }

  return {
    coverage: [
      'pelvis',
      'leftThigh',
      'rightThigh',
    ],

    clearance: 0.02,

    anchors,

    regions: [
      {
        id: `${kind}-waistband`,
        name:
          kind === 'short'
            ? 'Cós do short'
            : 'Cós da calça',
        bodyRegion: 'pelvis',
        role: 'support',
        vertexIndices: waistbandVertexIndices,
      },
    ],

    supports: [
      {
        id: `${kind}-waistband-support`,
        garmentRegionId: `${kind}-waistband`,
        bodyRegion: 'pelvis',
        mode: 'hang',
        strength: 1,
      },
    ],
  };
}

/* ============================================================
 * GERADOR PRINCIPAL
 * ========================================================== */

export function buildLowerBodyGarment(
  input: LowerBodyMeasurements,
  kind: LowerBodyKind,
  options?: GarmentMeshOptions,
): THREE.Group {
  const m = validateMeasurements(
    input,
    kind,
  );

  const edgeLength = resolveEdgeLength(
    options,
  );

  const leftLength =
    m.leftLegLength ?? m.length;

  const rightLength =
    m.rightLegLength ?? m.length;

  const maxLegLength = Math.max(
    leftLength,
    rightLength,
  );

  const outseamLength =
    m.outseamLength ??
    maxLegLength + m.rise;

  const baseWaistY =
    m.waistHeight ??
    outseamLength;

  const waistbandHeight =
    m.waistbandHeight ?? 0;

  const getRise = (
    face: PanelFace,
  ): number =>
    face === 'front'
      ? m.frontRise ?? m.rise
      : m.backRise ?? m.rise;

  const getSideLength = (
    side: PanelSide,
  ): number =>
    side === 'left'
      ? leftLength
      : rightLength;

  const getWaistY = (
    side: PanelSide,
    face: PanelFace,
  ): number => {
    const sideLength =
      getSideLength(side);

    const rise = getRise(face);

    return Math.max(
      baseWaistY + (rise - m.rise),
      sideLength + rise,
    );
  };

  const getCrotchY = (
    side: PanelSide,
  ): number =>
    getSideLength(side);

  const leftCrotchY = getCrotchY('left');
  const rightCrotchY = getCrotchY('right');

  const averageWaistY =
    (
      getWaistY('left', 'front') +
      getWaistY('right', 'front') +
      getWaistY('left', 'back') +
      getWaistY('right', 'back')
    ) / 4;

  const hipBottomY = Math.min(
    leftCrotchY,
    rightCrotchY,
  );

  const hipRegionHeight =
    averageWaistY - hipBottomY;

  if (
    hipRegionHeight <= MINIMUM_DIMENSION
  ) {
    throw new Error(
      'CAIMENT: a altura disponível para gerar a região do quadril é inválida.',
    );
  }

  const hipRows = resolveSegments(
    hipRegionHeight + waistbandHeight,
    edgeLength,
    6,
    32,
  );

  const legRows = resolveSegments(
    maxLegLength,
    edgeLength,
    kind === 'short' ? 8 : 12,
    64,
  );

  const columns = resolveSegments(
    Math.max(
      m.hipWidth,
      m.thighWidth,
      m.waistWidth,
    ) / 4,
    edgeLength,
    6,
    24,
    true,
  );

  const halfGap =
    (m.legSeparation ??
      m.crotchWidth) / 2;

  const quarter = (
    circumference: number,
  ): number =>
    circumference / 4;

  const legWidthAt = (
    height: number,
    side: PanelSide,
  ): number => {
    const circumference =
      getLegCircumferenceAt(
        m,
        height,
        getSideLength(side),
        kind,
      );

    return quarter(circumference);
  };

  const hipWidthAt = (
    height: number,
    crotchY: number,
    localWaistY: number,
  ): number => {
    const circumference =
      getHipCircumferenceAt(
        m,
        height,
        crotchY,
        localWaistY,
      );

    return quarter(circumference);
  };

  const legBulge = (
    width: number,
  ): number =>
    Math.min(
      m.depth / 2,
      width / Math.PI,
    );

  /**
   * Gera cada superfície de construção.
   *
   * As superfícies são posteriormente unidas fisicamente
   * na topologia da malha.
   */
  const createLegOrHipPanel = (
    id: string,
    name: string,
    face: PanelFace,
    side: PanelSide,
    region: PanelRegion,
  ): GarmentPanel => {
    const rows =
      region === 'leg'
        ? legRows
        : hipRows;

    const sign =
      face === 'front'
        ? 1
        : -1;

    const positions: THREE.Vector3[] = [];

    const sideLength =
      getSideLength(side);

    const localWaistY =
      getWaistY(side, face);

    const crotchY =
      getCrotchY(side);

    const rowBottomY =
      region === 'leg'
        ? 0
        : crotchY;

    /**
     * A extensão superior do painel forma a faixa
     * física do cós quando a loja fornece waistbandHeight.
     */
    const rowTopY =
      region === 'leg'
        ? crotchY
        : localWaistY + waistbandHeight;

    const crotchProjection =
      getCrotchProjection(m, face);

    for (
      let row = 0;
      row <= rows;
      row++
    ) {
      const p = row / rows;

      const currentY =
        THREE.MathUtils.lerp(
          rowBottomY,
          rowTopY,
          p,
        );

      const width =
        region === 'leg'
          ? legWidthAt(
              THREE.MathUtils.clamp(
                currentY,
                0,
                sideLength,
              ),
              side,
            )
          : hipWidthAt(
              currentY,
              crotchY,
              localWaistY,
            );

      const wrap = createWrapMapper(
        width,
        legBulge(width),
      );

      const torsoWrap =
        region === 'hip'
          ? createWrapMapper(
              2 * width,
              m.depth / 2,
            )
          : undefined;

      for (
        let column = 0;
        column <= columns;
        column++
      ) {
        const leftColumn =
          side === 'left'
            ? column
            : columns - column;

        const u =
          leftColumn / columns;

        const point = wrap.map(
          (u - 0.5) * width,
        );

        let x =
          -halfGap -
          wrap.halfExtent +
          point.x;

        let z = point.z;

        if (
          region === 'hip' &&
          torsoWrap
        ) {
          const torsoPoint =
            torsoWrap.map(
              (u - 1) * width,
            );

          x =
            torsoPoint.x - halfGap;

          z = torsoPoint.z;

          /**
           * Gancho anatômico:
           *
           * A extensão é mais evidente no centro,
           * diminui em direção às laterais e desaparece
           * progressivamente em direção à cintura.
           *
           * Frente e costas usam medidas independentes.
           */
          const centerFactor =
            Math.pow(
              Math.sin(Math.PI * u),
              1.5,
            );

          const lowerRegionFactor =
            Math.pow(
              1 - p,
              2,
            );

          const crotchExtension =
            crotchProjection *
            centerFactor *
            lowerRegionFactor;

          z += crotchExtension;
        }

        positions.push(
          new THREE.Vector3(
            side === 'left'
              ? x
              : -x,
            currentY,
            sign * z,
          ),
        );
      }
    }

    return createPanel({
      id,
      name,
      type: face,
      positions,
      triangles: createGridTriangles(
        rows,
        columns,
        face === 'front',
      ),
    });
  };

  /* ----------------------------------------------------------
   * SUPERFÍCIES DE CONSTRUÇÃO
   * -------------------------------------------------------- */

  const panels: GarmentPanel[] = [
    createLegOrHipPanel(
      'front-left',
      'Frente da perna esquerda',
      'front',
      'left',
      'leg',
    ),

    createLegOrHipPanel(
      'back-left',
      'Costas da perna esquerda',
      'back',
      'left',
      'leg',
    ),

    createLegOrHipPanel(
      'front-right',
      'Frente da perna direita',
      'front',
      'right',
      'leg',
    ),

    createLegOrHipPanel(
      'back-right',
      'Costas da perna direita',
      'back',
      'right',
      'leg',
    ),

    createLegOrHipPanel(
      'hip-front-left',
      'Frente do quadril esquerdo',
      'front',
      'left',
      'hip',
    ),

    createLegOrHipPanel(
      'hip-back-left',
      'Costas do quadril esquerdo',
      'back',
      'left',
      'hip',
    ),

    createLegOrHipPanel(
      'hip-front-right',
      'Frente do quadril direito',
      'front',
      'right',
      'hip',
    ),

    createLegOrHipPanel(
      'hip-back-right',
      'Costas do quadril direito',
      'back',
      'right',
      'hip',
    ),
  ];

  const panelMap = new Map(
    panels.map((panel) => [
      panel.id,
      panel,
    ]),
  );

  const seams: GarmentSeam[] = [];

  const addSeam = (
    id: string,
    name: string,
    panelAId: string,
    panelBId: string,
    rawEdgeA: number[],
    rawEdgeB: number[],
  ): void => {
    const panelA =
      panelMap.get(panelAId);

    const panelB =
      panelMap.get(panelBId);

    if (!panelA || !panelB) {
      throw new Error(
        `CAIMENT: costura ${id}: painel não encontrado (${panelAId}, ${panelBId}).`,
      );
    }

    const paired = pairEdgesByPosition(
      panelA,
      panelB,
      rawEdgeA,
      rawEdgeB,
    );

    seams.push({
      id,
      name,
      panelAId,
      panelBId,
      edgeA: paired.edgeA,
      edgeB: paired.edgeB,
      stiffness: 1,
    });
  };

  const legEdge = (
    column: number,
  ): number[] =>
    getColumnEdge(
      legRows,
      columns,
      column,
    );

  const hipEdge = (
    column: number,
  ): number[] =>
    getColumnEdge(
      hipRows,
      columns,
      column,
    );

  /**
   * Costuras externas e internas das pernas.
   */
  const legPairs = [
    {
      front: 'front-left',
      back: 'back-left',
      outer: 0,
      inner: columns,
      label: 'Esquerda',
    },
    {
      front: 'front-right',
      back: 'back-right',
      outer: columns,
      inner: 0,
      label: 'Direita',
    },
  ] as const;

  for (const pair of legPairs) {
    addSeam(
      `outer-${pair.label}`,
      `Lateral externa da perna ${pair.label}`,
      pair.front,
      pair.back,
      legEdge(pair.outer),
      legEdge(pair.outer),
    );

    addSeam(
      `inner-${pair.label}`,
      `Entreperna ${pair.label}`,
      pair.front,
      pair.back,
      legEdge(pair.inner),
      legEdge(pair.inner),
    );
  }

  /**
   * União do quadril com cada perna.
   */
  const hipConnections = [
    ['hip-front-left', 'front-left'],
    ['hip-back-left', 'back-left'],
    ['hip-front-right', 'front-right'],
    ['hip-back-right', 'back-right'],
  ] as const;

  for (const [hipId, legId] of hipConnections) {
    addSeam(
      `hip-leg-${hipId}`,
      `União do quadril com ${legId}`,
      hipId,
      legId,
      getRowEdge(columns, 0),
      getRowEdge(columns, legRows),
    );
  }

  /**
   * Fechamento frontal e traseiro do gancho.
   */
  addSeam(
    'center-front',
    'Centro da frente',
    'hip-front-left',
    'hip-front-right',
    hipEdge(columns),
    hipEdge(0),
  );

  addSeam(
    'center-back',
    'Centro das costas',
    'hip-back-left',
    'hip-back-right',
    hipEdge(columns),
    hipEdge(0),
  );

  /**
   * Fechamento das laterais do quadril.
   */
  addSeam(
    'hip-side-left',
    'Lateral esquerda do quadril',
    'hip-front-left',
    'hip-back-left',
    hipEdge(0),
    hipEdge(0),
  );

  addSeam(
    'hip-side-right',
    'Lateral direita do quadril',
    'hip-front-right',
    'hip-back-right',
    hipEdge(columns),
    hipEdge(columns),
  );

  /* ----------------------------------------------------------
   * ENCAIXE
   * -------------------------------------------------------- */

  const fit = createLowerBodyFit(
    kind,
    m,
    panels,
    hipRows,
    legRows,
    columns,
    hipBottomY,
    averageWaistY,
    leftCrotchY,
    rightCrotchY,
  );

  /* ----------------------------------------------------------
   * UNIÃO REAL DA TOPOLOGIA
   * -------------------------------------------------------- */

  const continuous =
    mergePanelsIntoContinuousSurface(
      panels,
      seams,
    );

  const finalFit = remapFitRegions(
    fit,
    continuous.oldToNew,
  );

  /**
   * A montagem recebe apenas uma superfície.
   *
   * As uniões já compartilham índices de vértices,
   * então não é necessário depender de costuras para
   * aproximar partes independentes.
   */
  const meshData: GarmentMeshData = {
    panels: [
      continuous.panel,
    ],

    seams: [],

    vertexCount:
      continuous.panel.vertices.length,

    triangleCount:
      continuous.panel.triangles.length,

    fit: finalFit,
  };

  const assembled =
    assembleGarment(meshData);

  const group = assembled.group;

  group.name =
    LABELS[kind].groupName;

  group.userData = {
    ...group.userData,

    garmentType: kind,

    measurements: { ...m },

    meshData,

    garmentFit: finalFit,

    meshResolution: {
      legRows,
      hipRows,
      columns,
      edgeLength,
    },

    topology: {
      continuous: true,
      panelCount: 1,
      originalPanelCount: panels.length,
      originalSeamCount: seams.length,
      weldedVertices:
        panels.reduce(
          (total, panel) =>
            total + panel.vertices.length,
          0,
        ) -
        continuous.panel.vertices.length,
    },

    garmentRegions: {
      waistband: {
        height: waistbandHeight,
        circumference:
          m.waistbandCircumference ??
          m.waistWidth,
        finishWidth:
          m.waistbandFinishWidth,
      },

      crotch: {
        depth: m.crotchDepth,
        frontLength:
          m.frontCrotchLength ??
          m.crotchDepth,
        backLength:
          m.backCrotchLength ??
          m.crotchDepth,
      },

      hem: {
        finishWidth: m.hemWidth,
        circumference:
          m.hemCircumference ??
          m.legOpening,
      },
    },

    coordinateSystem: {
      width: 'X',
      height: 'Y',
      depth: 'Z',
      front: '+Z',
      back: '-Z',
      unit: 'meters',
      origin: 'body_floor_center',
    },
  };

  group.updateMatrixWorld(true);

  return group;
}
