
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
 * Medidas compartilhadas de calças e shorts.
 *
 * Todas as medidas lineares e circunferências
 * são recebidas em metros.
 *
 * Circunferências representam a volta completa.
 *
 * length:
 * - Calça: comprimento interno da perna.
 * - Short: comprimento interno até a barra.
 *
 * outseamLength:
 * comprimento externo da peça.
 *
 * thighHeight, kneeHeight e calfHeight:
 * alturas medidas a partir da barra.
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

const MINIMUM_DIMENSION = 0.0001;

/**
 * Valida as medidas complementares.
 */
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

    if (value === undefined) {
      continue;
    }

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
    input.outseamLength <
      maximumLegLength
  ) {
    throw new Error(
      'CAIMENT: o comprimento externo não pode ser menor que o comprimento interno da perna.',
    );
  }

  if (
    input.waistHeight !== undefined &&
    input.outseamLength !== undefined &&
    input.waistHeight >
      input.outseamLength
  ) {
    throw new Error(
      'CAIMENT: a altura da cintura não pode ultrapassar o comprimento externo.',
    );
  }

  if (
    input.waistbandHeight !== undefined &&
    input.outseamLength !== undefined &&
    input.waistbandHeight >=
      input.outseamLength
  ) {
    throw new Error(
      'CAIMENT: a altura do cós não pode ser maior ou igual ao comprimento externo.',
    );
  }

  if (
    input.frontCrotchLength !== undefined &&
    input.frontCrotchLength >=
      maximumLegLength
  ) {
    throw new Error(
      'CAIMENT: o comprimento do gancho frontal não pode ultrapassar o comprimento da perna.',
    );
  }

  if (
    input.backCrotchLength !== undefined &&
    input.backCrotchLength >=
      maximumLegLength
  ) {
    throw new Error(
      'CAIMENT: o comprimento do gancho traseiro não pode ultrapassar o comprimento da perna.',
    );
  }

  if (
    input.waistbandCircumference !== undefined &&
    input.waistbandCircumference <
      input.waistWidth
  ) {
    throw new Error(
      'CAIMENT: a circunferência do cós não pode ser menor que a medida da cintura.',
    );
  }
}

/**
 * Valida as medidas obrigatórias.
 */
function validateMeasurements(
  input: LowerBodyMeasurements,
  kind: LowerBodyKind,
): NormalizedMeasurements {
  const labels = LABELS[kind];

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
        `CAIMENT: medida inválida ${labels.invalidIn}: ${name} deve ser um número positivo recebido pela loja, em metros.`,
      );
    }
  }

  if (input.crotchDepth >= input.length) {
    throw new Error(
      `CAIMENT: a profundidade do gancho deve ser menor que o comprimento ${labels.lengthOf}.`,
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

/**
 * Recupera um vértice real de um painel.
 */
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

/**
 * Posição média entre dois vértices.
 */
function midpoint(
  a: THREE.Vector3,
  b: THREE.Vector3,
): THREE.Vector3 {
  return a.clone().add(b).multiplyScalar(0.5);
}

/**
 * Converte uma altura física em linha da malha.
 *
 * A altura é relativa à região informada,
 * não à altura total de toda a peça.
 */
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
    (height - regionBottom) /
    regionHeight;

  return THREE.MathUtils.clamp(
    Math.round(normalized * rows),
    0,
    rows,
  );
}

/**
 * Calcula os índices globais da região superior
 * que recebe o suporte do cós.
 */
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

/**
 * Cria as âncoras de encaixe a partir dos vértices
 * efetivamente gerados.
 */
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

/**
 * Interpolação suave entre duas medidas.
 */
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

/**
 * Retorna a circunferência da perna na altura
 * informada a partir da barra.
 *
 * Ordem dos pontos de controle:
 * barra/tornozelo -> panturrilha -> joelho -> coxa.
 *
 * Quando uma medida complementar não é recebida,
 * a interpolação usa os comprimentos disponíveis
 * como referência.
 */
function getLegCircumferenceAt(
  m: NormalizedMeasurements,
  height: number,
  totalLength: number,
): number {
  const opening =
    m.hemCircumference ??
    m.ankleCircumference ??
    m.legOpening;

  const calf =
    m.calfCircumference ??
    opening;

  const knee =
    m.kneeCircumference ??
    m.thighWidth;

  const thigh = m.thighWidth;

  const calfHeight =
    m.calfHeight ??
    totalLength * 0.25;

  const kneeHeight =
    m.kneeHeight ??
    totalLength * 0.5;

  const thighHeight =
    m.thighHeight ??
    totalLength * 0.85;

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

/**
 * Calcula a circunferência da região superior.
 *
 * Interpola a partir do quadril até a cintura.
 */
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

/**
 * Cria a geometria universal de calças e shorts.
 */
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

  const waistY =
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

  const getCrotchLength = (
    face: PanelFace,
  ): number =>
    face === 'front'
      ? m.frontCrotchLength ??
        m.crotchDepth
      : m.backCrotchLength ??
        m.crotchDepth;

  const getSideLength = (
    side: PanelSide,
  ): number =>
    side === 'left'
      ? leftLength
      : rightLength;

  const getWaistY = (
    face: PanelFace,
  ): number => {
    const rise = getRise(face);

    return Math.max(
      waistY + (rise - m.rise),
      getSideLength('left') + rise,
      getSideLength('right') + rise,
    );
  };

  const getCrotchY = (
    side: PanelSide,
    face: PanelFace,
  ): number =>
    getSideLength(side) -
    getCrotchLength(face);

  const leftCrotchY = getCrotchY(
    'left',
    'front',
  );

  const rightCrotchY = getCrotchY(
    'right',
    'front',
  );

  const averageWaistY =
    (getWaistY('front') +
      getWaistY('back')) /
    2;

  const hipBottomY = Math.min(
    leftCrotchY,
    rightCrotchY,
    getCrotchY('left', 'back'),
    getCrotchY('right', 'back'),
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
    hipRegionHeight,
    edgeLength,
    6,
    32,
  );

  const legRows = resolveSegments(
    maxLegLength,
    edgeLength,
    12,
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

  /**
   * Converte circunferência completa em largura
   * aproximada de um quarto da superfície.
   */
  const quarter = (
    circumference: number,
  ): number =>
    circumference / 4;

  /**
   * Largura da perna em uma altura específica.
   */
  const legWidthAt = (
    height: number,
    side: PanelSide,
  ): number => {
    const circumference =
      getLegCircumferenceAt(
        m,
        height,
        getSideLength(side),
      );

    return quarter(circumference);
  };

  /**
   * Largura da região superior.
   */
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

  /**
   * Profundidade da curvatura da superfície.
   */
  const legBulge = (
    width: number,
  ): number =>
    Math.min(
      m.depth / 2,
      width / Math.PI,
    );

  /**
   * Gera um painel de perna ou quadril.
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
      getWaistY(face);

    const crotchLength =
      getCrotchLength(face);

    const crotchY =
      sideLength - crotchLength;

    const rowBottomY =
      region === 'leg'
        ? 0
        : crotchY;

    const rowTopY =
      region === 'leg'
        ? crotchY
        : localWaistY;

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

        if (region === 'hip') {
          const torsoWrap =
            createWrapMapper(
              2 * width,
              m.depth / 2,
            );

          const torsoPoint =
            torsoWrap.map(
              (u - 1) * width,
            );

          x =
            torsoPoint.x - halfGap;

          z = torsoPoint.z;
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

  /**
   * Painéis independentes:
   * frente e costas de cada perna e do quadril.
   */
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
    panels.map(
      (panel) => [
        panel.id,
        panel,
      ],
    ),
  );

  const seams: GarmentSeam[] = [];

  /**
   * Registra uma costura entre dois painéis.
   */
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
   * União da região do quadril com as pernas.
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
   * Fechamento central frontal e traseiro.
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

  /**
   * Âncoras calculadas a partir da geometria final.
   */
  const fit = createLowerBodyFit(
    kind,
    m,
    panels,
    hipRows,
    legRows,
    columns,
    hipBottomY,
    averageWaistY,
    leftLength,
    rightLength,
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

    fit,
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

    garmentFit: fit,

    meshResolution: {
      legRows,
      hipRows,
      columns,
      edgeLength,
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
