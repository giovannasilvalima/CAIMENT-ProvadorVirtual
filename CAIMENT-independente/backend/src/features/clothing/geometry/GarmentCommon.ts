import * as THREE from 'three';

import {
  type GarmentPanel,
  type GarmentPanelType,
  type GarmentTriangle,
  type GarmentVertex,
} from './types';

/**
 * ============================================================
 * UTILITÁRIOS COMPARTILHADOS DOS GERADORES CAIMENT
 * ============================================================
 *
 * Nada aqui define dimensões físicas da roupa. Tudo é derivado
 * das medidas recebidas da loja (metros).
 */

const EPSILON = 1e-8;

/* ------------------------------------------------------------
 * RESOLUÇÃO ADAPTATIVA DA MALHA
 * ---------------------------------------------------------- */

export interface GarmentMeshOptions {
  /**
   * Comprimento alvo das arestas da malha, em metros.
   * Menor = mais detalhe (e mais custo na simulação).
   */
  edgeLength?: number;
}

const DEFAULT_EDGE_LENGTH = 0.025;
const MIN_EDGE_LENGTH = 0.005;

export function resolveEdgeLength(
  options?: GarmentMeshOptions,
): number {
  const value = options?.edgeLength;

  if (value === undefined) {
    return DEFAULT_EDGE_LENGTH;
  }

  if (!Number.isFinite(value) || value < MIN_EDGE_LENGTH) {
    throw new Error(
      `CAIMENT: edgeLength deve ser um número, em metros, maior ou igual a ${MIN_EDGE_LENGTH}.`,
    );
  }

  return value;
}

/**
 * Converte uma dimensão em número de segmentos da malha,
 * limitado a [min, max]. Com `even`, o resultado é par
 * (necessário para simetria esquerda/direita).
 */
export function resolveSegments(
  length: number,
  edgeLength: number,
  min: number,
  max: number,
  even = false,
): number {
  let segments = THREE.MathUtils.clamp(
    Math.round(length / edgeLength),
    min,
    max,
  );

  if (even && segments % 2 !== 0) {
    segments += segments + 1 > max ? -1 : 1;
  }

  return segments;
}

/* ------------------------------------------------------------
 * PERFIL SUAVE QUE PASSA EXATAMENTE PELAS MEDIDAS
 * ---------------------------------------------------------- */

export interface ProfileStop {
  t: number;
  value: number;
}

/**
 * Interpolação cúbica monótona (PCHIP).
 *
 * Passa exatamente por cada medida e nunca ultrapassa os valores
 * vizinhos, então a silhueta fica curva sem "estourar" medidas.
 */
export function createSmoothProfile(
  stops: ProfileStop[],
): (t: number) => number {
  const n = stops.length;

  if (n < 2) {
    throw new Error('CAIMENT: perfil requer ao menos 2 pontos.');
  }

  const xs = stops.map((stop) => stop.t);
  const ys = stops.map((stop) => stop.value);

  const h: number[] = [];
  const d: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }

  const m = new Array<number>(n).fill(0);

  m[0] = d[0];
  m[n - 1] = d[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];

      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }

  return (t: number): number => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];

    let i = 0;

    while (i < n - 2 && t > xs[i + 1]) {
      i++;
    }

    const s = (t - xs[i]) / h[i];
    const s2 = s * s;
    const s3 = s2 * s;

    return (
      (2 * s3 - 3 * s2 + 1) * ys[i] +
      (s3 - 2 * s2 + s) * h[i] * m[i] +
      (-2 * s3 + 3 * s2) * ys[i + 1] +
      (s3 - s2) * h[i] * m[i + 1]
    );
  };
}

/* ------------------------------------------------------------
 * ENVOLTURA 3D PRESERVANDO O COMPRIMENTO DO TECIDO
 * ---------------------------------------------------------- */

const WRAP_SAMPLES = 48;
const WRAP_COS: number[] = [];
const WRAP_SIN: number[] = [];

for (let i = 0; i <= WRAP_SAMPLES; i++) {
  const phi = (Math.PI * i) / WRAP_SAMPLES;

  WRAP_COS.push(Math.cos(phi));
  WRAP_SIN.push(Math.sin(phi));
}

function halfEllipseLength(a: number, b: number): number {
  let length = 0;

  for (let i = 1; i <= WRAP_SAMPLES; i++) {
    length += Math.hypot(
      a * (WRAP_COS[i - 1] - WRAP_COS[i]),
      b * (WRAP_SIN[i] - WRAP_SIN[i - 1]),
    );
  }

  return length;
}

export interface WrapMapper {
  /** Semieixo horizontal resultante (largura real em 3D / 2). */
  halfExtent: number;
  /**
   * Converte a posição sobre o tecido plano (s, em metros, de
   * -panelWidth/2 a +panelWidth/2) na posição 3D (x, z >= 0).
   */
  map: (s: number) => { x: number; z: number };
}

/**
 * Curva o painel em torno do corpo (meia elipse).
 *
 * O comprimento de arco da meia elipse é igual à largura do painel:
 * o tecido não é esticado, então a circunferência da peça continua
 * igual à medida recebida. A largura visível em 3D é menor que a
 * largura "plana" — exatamente como numa roupa vestida.
 *
 * Nas extremidades z = 0, então frente e costas se encontram
 * nas costuras laterais.
 */
export function createWrapMapper(
  panelWidth: number,
  halfDepth: number,
): WrapMapper {
  const b = Math.min(
    Math.max(halfDepth, 0),
    panelWidth * 0.45,
  );

  if (panelWidth <= EPSILON || b < 1e-6) {
    return {
      halfExtent: panelWidth / 2,
      map: (s) => ({ x: s, z: 0 }),
    };
  }

  let low = 0;
  let high = panelWidth / 2;

  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;

    if (halfEllipseLength(mid, b) < panelWidth) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const a = (low + high) / 2;

  const xs: number[] = [];
  const zs: number[] = [];
  const arc: number[] = [0];

  for (let i = 0; i <= WRAP_SAMPLES; i++) {
    xs.push(-a * WRAP_COS[i]);
    zs.push(b * WRAP_SIN[i]);

    if (i > 0) {
      arc.push(
        arc[i - 1] +
          Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]),
      );
    }
  }

  const scale = panelWidth / arc[WRAP_SAMPLES];

  return {
    halfExtent: a,
    map: (s: number) => {
      const target =
        THREE.MathUtils.clamp(s + panelWidth / 2, 0, panelWidth) /
        scale;

      let lo = 0;
      let hi = WRAP_SAMPLES;

      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;

        if (arc[mid] <= target) {
          lo = mid;
        } else {
          hi = mid;
        }
      }

      const span = arc[hi] - arc[lo];
      const f = span > EPSILON ? (target - arc[lo]) / span : 0;

      return {
        x: xs[lo] + (xs[hi] - xs[lo]) * f,
        z: zs[lo] + (zs[hi] - zs[lo]) * f,
      };
    },
  };
}

/* ------------------------------------------------------------
 * COLUNAS COM PONTOS DE REFERÊNCIA EXATOS
 * ---------------------------------------------------------- */

/**
 * Distribui `segments` segmentos em [0, 1] garantindo que cada
 * knot caia exatamente sobre um vértice. Os segmentos restantes
 * são repartidos proporcionalmente ao tamanho de cada intervalo.
 */
export function distributeWithKnots(
  knots: number[],
  segments: number,
): number[] {
  const points: number[] = [0];

  for (const knot of [...knots].sort((a, b) => a - b)) {
    if (
      knot > points[points.length - 1] + 1e-6 &&
      knot < 1 - 1e-6
    ) {
      points.push(knot);
    }
  }

  points.push(1);

  const intervals = points.length - 1;

  if (segments < intervals) {
    throw new Error(
      'CAIMENT: resolução da malha insuficiente para os pontos de referência da peça.',
    );
  }

  const lengths = points.slice(1).map((p, i) => p - points[i]);
  const extra = segments - intervals;
  const quotas = lengths.map((length) => length * extra);
  const counts = quotas.map((q) => 1 + Math.floor(q));

  let leftover =
    segments - counts.reduce((sum, count) => sum + count, 0);

  const order = quotas
    .map((q, i) => ({ i, fraction: q - Math.floor(q) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (
    let k = 0;
    leftover > 0;
    k = (k + 1) % order.length, leftover--
  ) {
    counts[order[k].i] += 1;
  }

  const result: number[] = [0];

  counts.forEach((count, i) => {
    for (let s = 1; s <= count; s++) {
      result.push(points[i] + (lengths[i] * s) / count);
    }
  });

  result[result.length - 1] = 1;

  return result;
}

/* ------------------------------------------------------------
 * TRIANGULAÇÃO E ARESTAS
 * ---------------------------------------------------------- */

/**
 * Triangulação em grade com diagonais alternadas (xadrez).
 *
 * Com número PAR de colunas o padrão é simétrico entre esquerda
 * e direita, e a alternância evita viés de cisalhamento no tecido.
 *
 * Convenção: linhas crescem em +Y e colunas em +X. O enrolamento
 * base tem normal em -Z; `flip` inverte para painéis frontais (+Z).
 */
export function createGridTriangles(
  rows: number,
  columns: number,
  flip = false,
): GarmentTriangle[] {
  const triangles: GarmentTriangle[] = [];

  const index = (row: number, column: number) =>
    row * (columns + 1) + column;

  const add = (a: number, b: number, c: number) => {
    triangles.push(flip ? { a, b: c, c: b } : { a, b, c });
  };

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const p00 = index(row, column);
      const p01 = index(row, column + 1);
      const p10 = index(row + 1, column);
      const p11 = index(row + 1, column + 1);

      if ((row + column) % 2 === 1) {
        add(p00, p10, p11);
        add(p00, p11, p01);
      } else {
        add(p00, p10, p01);
        add(p01, p10, p11);
      }
    }
  }

  return triangles;
}

export function getColumnEdge(
  rows: number,
  columns: number,
  column: number,
): number[] {
  return Array.from(
    { length: rows + 1 },
    (_, row) => row * (columns + 1) + column,
  );
}

export function getRowEdge(columns: number, row: number): number[] {
  return Array.from(
    { length: columns + 1 },
    (_, column) => row * (columns + 1) + column,
  );
}

/**
 * Pareia duas bordas preservando a sequência dos vértices,
 * invertendo a segunda se as extremidades casarem ao contrário.
 */
export function pairEdgesByPosition(
  panelA: GarmentPanel,
  panelB: GarmentPanel,
  edgeA: number[],
  edgeB: number[],
): { edgeA: number[]; edgeB: number[] } {
  if (edgeA.length !== edgeB.length || edgeA.length < 2) {
    throw new Error(
      `CAIMENT: costura entre ${panelA.id} e ${panelB.id}: quantidade de vértices incompatível.`,
    );
  }

  const firstA = panelA.vertices[edgeA[0]].position;
  const lastA = panelA.vertices[edgeA[edgeA.length - 1]].position;
  const firstB = panelB.vertices[edgeB[0]].position;
  const lastB = panelB.vertices[edgeB[edgeB.length - 1]].position;

  const direct =
    firstA.distanceToSquared(firstB) +
    lastA.distanceToSquared(lastB);

  const reversed =
    firstA.distanceToSquared(lastB) +
    lastA.distanceToSquared(firstB);

  return {
    edgeA: [...edgeA],
    edgeB:
      reversed < direct ? [...edgeB].reverse() : [...edgeB],
  };
}

/* ------------------------------------------------------------
 * PAINEL: MASSA POR ÁREA + GEOMETRIA THREE.JS
 * ---------------------------------------------------------- */

/**
 * Massa relativa por vértice = 1/3 da área dos triângulos vizinhos.
 * Não representa quilogramas: a massa física deve ser calculada
 * depois com os parâmetros do material.
 */
export function computeAreaMasses(
  positions: THREE.Vector3[],
  triangles: GarmentTriangle[],
): number[] {
  const masses = new Array<number>(positions.length).fill(0);

  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (const triangle of triangles) {
    ab.subVectors(positions[triangle.b], positions[triangle.a]);
    ac.subVectors(positions[triangle.c], positions[triangle.a]);

    const share = ab.cross(ac).length() / 2 / 3;

    masses[triangle.a] += share;
    masses[triangle.b] += share;
    masses[triangle.c] += share;
  }

  return masses.map((mass) => Math.max(mass, Number.EPSILON));
}

export interface PanelInput {
  id: string;
  name: string;
  type: GarmentPanelType;
  positions: THREE.Vector3[];
  triangles: GarmentTriangle[];
}

export function createPanel({
  id,
  name,
  type,
  positions,
  triangles,
}: PanelInput): GarmentPanel {
  const masses = computeAreaMasses(positions, triangles);

  const vertices: GarmentVertex[] = positions.map(
    (position, index) => ({
      id: index,
      position: position.clone(),
      initialPosition: position.clone(),
      mass: masses[index],
      pinned: false,
    }),
  );

  const positionArray = new Float32Array(vertices.length * 3);
  const uvArray = new Float32Array(vertices.length * 2);

  vertices.forEach((vertex, index) => {
    positionArray[index * 3] = vertex.position.x;
    positionArray[index * 3 + 1] = vertex.position.y;
    positionArray[index * 3 + 2] = vertex.position.z;

    // UV planar em metros: a textura do tecido mantém escala real.
    uvArray[index * 2] = vertex.position.x;
    uvArray[index * 2 + 1] = vertex.position.y;
  });

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positionArray, 3),
  );

  geometry.setAttribute(
    'uv',
    new THREE.BufferAttribute(uvArray, 2),
  );

  geometry.setIndex(
    triangles.flatMap((triangle) => [
      triangle.a,
      triangle.b,
      triangle.c,
    ]),
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    id,
    name,
    type,
    vertices,
    triangles,
    geometry,
  };
}