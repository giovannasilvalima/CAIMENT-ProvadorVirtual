
import * as THREE from 'three';

import type {
  GarmentMeshData,
  GarmentPanel,
  GarmentSeam,
  GarmentRegionDefinition,
  GarmentFitDefinition,
  GarmentBoundaryDefinition,
} from './types';

import {
  createFabricMaterial,
  type FabricMaterialOptions,
} from '../simulation/createFabricMaterial';

export interface AssembleGarmentOptions {
  material?: THREE.Material;
  fabric?: FabricMaterialOptions;
}

export interface AssembledGarment {
  group: THREE.Group;
  geometry: THREE.BufferGeometry;
  panels: GarmentPanel[];
  seams: GarmentSeam[];
  vertexCount: number;
  triangleCount: number;
}

interface AssembledRegion {
  id: string;
  name: string;
  bodyRegion: GarmentRegionDefinition['bodyRegion'];
  role: GarmentRegionDefinition['role'];
  vertexIndices: number[];
}

interface ResolvedSeam {
  seam: GarmentSeam;
  panelA: GarmentPanel;
  panelB: GarmentPanel;
  edgeA: number[];
  edgeB: number[];
  maximumInitialGap: number;
  averageInitialGap: number;
}

interface WeldGroup {
  root: string;
  globalIndices: number[];
}

interface BoundaryEdge {
  panelId: string;
  panelName: string;
  vertexIndices: [number, number];
  globalVertexIndices: [number, number];
  boundaryId?: string;
  boundaryName?: string;
  role?: GarmentBoundaryDefinition['role'];
  finish?: GarmentBoundaryDefinition['finish'];
}

interface PanelEdgeOccurrence {
  a: number;
  b: number;
  count: number;
}

interface SeamVisualReference {
  id: string;
  name: string;
  panelAId: string;
  edgeA: number[];
}

interface WeldConstraintData {
  particleA: number;
  particleB: number;
  restLength: number;
  stiffness: number;
  type: 'seam';
}

const EPSILON = 1e-7;

/* -------------------------------------------------------------------------- */
/*                                  UTILITÁRIOS                               */
/* -------------------------------------------------------------------------- */

function createEdgeKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function createPanelEdgeOccurrences(
  panel: GarmentPanel,
): Map<string, PanelEdgeOccurrence> {
  const occurrences = new Map<string, PanelEdgeOccurrence>();

  for (const triangle of panel.triangles) {
    const edges: Array<[number, number]> = [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a],
    ];

    for (const [a, b] of edges) {
      const key = createEdgeKey(a, b);
      const existing = occurrences.get(key);

      if (existing) {
        existing.count++;
      } else {
        occurrences.set(key, { a, b, count: 1 });
      }
    }
  }

  return occurrences;
}

/* -------------------------------------------------------------------------- */
/*                                  VALIDAÇÃO                                 */
/* -------------------------------------------------------------------------- */

function validatePanel(panel: GarmentPanel): void {
  if (!panel || !panel.id?.trim()) {
    throw new Error('CAIMENT: painel com ID inválido.');
  }

  if (
    !panel.name?.trim() ||
    !Array.isArray(panel.vertices) ||
    !Array.isArray(panel.triangles) ||
    panel.vertices.length < 3 ||
    panel.triangles.length === 0
  ) {
    throw new Error(
      `CAIMENT: painel "${panel.name || panel.id}" sem dados suficientes.`,
    );
  }

  for (let i = 0; i < panel.vertices.length; i++) {
    const vertex = panel.vertices[i];
    const position = vertex?.position;

    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new Error(
        `CAIMENT: posição inválida no vértice ${i} do painel "${panel.name}".`,
      );
    }

    if (
      vertex.mass !== undefined &&
      (!Number.isFinite(vertex.mass) || vertex.mass <= 0)
    ) {
      throw new Error(
        `CAIMENT: massa inválida no vértice ${i} do painel "${panel.name}".`,
      );
    }
  }

  for (let i = 0; i < panel.triangles.length; i++) {
    const { a, b, c } = panel.triangles[i];

    for (const index of [a, b, c]) {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= panel.vertices.length
      ) {
        throw new Error(
          `CAIMENT: índice inválido no triângulo ${i} do painel "${panel.name}".`,
        );
      }
    }

    if (a === b || b === c || c === a) {
      throw new Error(
        `CAIMENT: triângulo com índices repetidos no painel "${panel.name}".`,
      );
    }
  }
}

function validateSeam(
  seam: GarmentSeam,
  panelA: GarmentPanel,
  panelB: GarmentPanel,
): void {
  if (
    !seam.id?.trim() ||
    !seam.name?.trim() ||
    !Array.isArray(seam.edgeA) ||
    !Array.isArray(seam.edgeB) ||
    seam.edgeA.length < 2 ||
    seam.edgeA.length !== seam.edgeB.length ||
    !Number.isFinite(seam.stiffness) ||
    seam.stiffness < 0 ||
    seam.stiffness > 1
  ) {
    throw new Error(
      `CAIMENT: configuração inválida na costura "${seam.name}".`,
    );
  }

  if (panelA.id === panelB.id) {
    throw new Error(
      `CAIMENT: a costura "${seam.name}" não pode conectar o painel a ele mesmo.`,
    );
  }

  if (
    new Set(seam.edgeA).size !== seam.edgeA.length ||
    new Set(seam.edgeB).size !== seam.edgeB.length
  ) {
    throw new Error(
      `CAIMENT: a costura "${seam.name}" contém vértices repetidos na mesma borda.`,
    );
  }

  for (const index of seam.edgeA) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= panelA.vertices.length
    ) {
      throw new Error(
        `CAIMENT: índice inválido na costura "${seam.name}", painel A.`,
      );
    }
  }

  for (const index of seam.edgeB) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= panelB.vertices.length
    ) {
      throw new Error(
        `CAIMENT: índice inválido na costura "${seam.name}", painel B.`,
      );
    }
  }
}

function validateSeamBoundary(
  seam: GarmentSeam,
  panel: GarmentPanel,
  edge: number[],
  occurrences: Map<string, PanelEdgeOccurrence>,
): void {
  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[i];
    const b = edge[i + 1];
    const occurrence = occurrences.get(createEdgeKey(a, b));

    if (!occurrence) {
      throw new Error(
        `CAIMENT: o segmento ${a}-${b} da costura "${seam.name}" não existe na triangulação do painel "${panel.name}".`,
      );
    }

    if (occurrence.count !== 1) {
      throw new Error(
        `CAIMENT: o segmento ${a}-${b} da costura "${seam.name}" não pertence a uma borda aberta do painel "${panel.name}".`,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                         CORRESPONDÊNCIA DAS COSTURAS                       */
/* -------------------------------------------------------------------------- */

function calculateEdgeDistance(
  edgeA: number[],
  edgeB: number[],
  panelA: GarmentPanel,
  panelB: GarmentPanel,
): {
  total: number;
  maximum: number;
  average: number;
} {
  let total = 0;
  let maximum = 0;

  for (let i = 0; i < edgeA.length; i++) {
    const positionA = panelA.vertices[edgeA[i]].position;
    const positionB = panelB.vertices[edgeB[i]].position;
    const distance = positionA.distanceTo(positionB);

    total += distance;
    maximum = Math.max(maximum, distance);
  }

  return {
    total,
    maximum,
    average: total / edgeA.length,
  };
}

function resolveSeamCorrespondence(
  seam: GarmentSeam,
  panelA: GarmentPanel,
  panelB: GarmentPanel,
): ResolvedSeam {
  const edgeA = [...seam.edgeA];
  const directEdgeB = [...seam.edgeB];
  const reversedEdgeB = [...seam.edgeB].reverse();

  const direct = calculateEdgeDistance(
    edgeA,
    directEdgeB,
    panelA,
    panelB,
  );

  const reversed = calculateEdgeDistance(
    edgeA,
    reversedEdgeB,
    panelA,
    panelB,
  );

  const useReversed = reversed.total < direct.total;
  const edgeB = useReversed ? reversedEdgeB : directEdgeB;
  const correspondence = useReversed ? reversed : direct;

  return {
    seam,
    panelA,
    panelB,
    edgeA,
    edgeB,
    maximumInitialGap: correspondence.maximum,
    averageInitialGap: correspondence.average,
  };
}

/* -------------------------------------------------------------------------- */
/*                              REGIÕES SEMÂNTICAS                            */
/* -------------------------------------------------------------------------- */

function assembleSemanticRegions(
  fit: GarmentFitDefinition | undefined,
  totalVertexCount: number,
): AssembledRegion[] {
  if (!fit?.regions?.length) {
    return [];
  }

  const ids = new Set<string>();

  return fit.regions.map((region) => {
    if (!region.id?.trim() || ids.has(region.id)) {
      throw new Error(
        `CAIMENT: ID de região inválido ou duplicado: "${region.id}".`,
      );
    }

    ids.add(region.id);

    if (
      !Array.isArray(region.vertexIndices) ||
      region.vertexIndices.length === 0
    ) {
      throw new Error(
        `CAIMENT: região "${region.name}" sem vértices.`,
      );
    }

    const indices = new Set<number>();

    for (const index of region.vertexIndices) {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= totalVertexCount
      ) {
        throw new Error(
          `CAIMENT: índice global inválido na região "${region.name}": ${index}.`,
        );
      }

      indices.add(index);
    }

    return {
      id: region.id,
      name: region.name,
      bodyRegion: region.bodyRegion,
      role: region.role,
      vertexIndices: [...indices],
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                           INTEGRIDADE DOS TRIÂNGULOS                       */
/* -------------------------------------------------------------------------- */

function isDegenerateTriangle(
  positions: number[],
  a: number,
  b: number,
  c: number,
): boolean {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];

  const bx = positions[b * 3];
  const by = positions[b * 3 + 1];
  const bz = positions[b * 3 + 2];

  const cx = positions[c * 3];
  const cy = positions[c * 3 + 1];
  const cz = positions[c * 3 + 2];

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;

  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;

  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;

  const areaSquared =
    crossX * crossX +
    crossY * crossY +
    crossZ * crossZ;

  return (
    !Number.isFinite(areaSquared) ||
    areaSquared <= EPSILON * EPSILON
  );
}

/* -------------------------------------------------------------------------- */
/*                             GRUPOS DE COSTURA                              */
/* -------------------------------------------------------------------------- */

function createDisjointSet() {
  const parents = new Map<string, string>();

  function find(key: string): string {
    const parent = parents.get(key);

    if (!parent) {
      parents.set(key, key);
      return key;
    }

    if (parent === key) {
      return key;
    }

    const root = find(parent);
    parents.set(key, root);

    return root;
  }

  function connect(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);

    if (rootA !== rootB) {
      parents.set(rootB, rootA);
    }
  }

  return { parents, find, connect };
}

function createWeldGroups(
  panels: GarmentPanel[],
  panelOffsets: Map<string, number>,
  find: (key: string) => string,
  parents: Map<string, string>,
): WeldGroup[] {
  const groups = new Map<string, number[]>();

  for (const panel of panels) {
    const offset = panelOffsets.get(panel.id);

    if (offset === undefined) continue;

    for (let vertexIndex = 0; vertexIndex < panel.vertices.length; vertexIndex++) {
      const key = `${panel.id}:${vertexIndex}`;

      if (!parents.has(key)) continue;

      const root = find(key);
      const globalIndex = offset + vertexIndex;
      const group = groups.get(root) ?? [];

      group.push(globalIndex);
      groups.set(root, group);
    }
  }

  return [...groups.entries()]
    .filter(([, indices]) => indices.length > 1)
    .map(([root, globalIndices]) => ({ root, globalIndices }));
}

/**
 * Cria vínculos físicos entre vértices correspondentes.
 *
 * Os vértices NÃO são deslocados durante a montagem.
 * A ClothSimulation aproxima os pares usando restLength = 0.
 */
function createWeldConstraints(
  resolvedSeams: ResolvedSeam[],
  panelOffsets: Map<string, number>,
): WeldConstraintData[] {
  const constraints: WeldConstraintData[] = [];
  const seen = new Set<string>();

  for (const resolved of resolvedSeams) {
    const offsetA = panelOffsets.get(resolved.panelA.id);
    const offsetB = panelOffsets.get(resolved.panelB.id);

    if (offsetA === undefined || offsetB === undefined) continue;

    for (let i = 0; i < resolved.edgeA.length; i++) {
      const particleA = offsetA + resolved.edgeA[i];
      const particleB = offsetB + resolved.edgeB[i];

      const key = `${Math.min(particleA, particleB)}:${Math.max(
        particleA,
        particleB,
      )}`;

      if (seen.has(key)) continue;

      seen.add(key);

      constraints.push({
        particleA,
        particleB,
        restLength: 0,
        stiffness: resolved.seam.stiffness,
        type: 'seam',
      });
    }
  }

  return constraints;
}

/* -------------------------------------------------------------------------- */
/*                              NORMAIS DAS COSTURAS                          */
/* -------------------------------------------------------------------------- */

function smoothWeldedNormals(
  geometry: THREE.BufferGeometry,
  groups: WeldGroup[],
): void {
  const normalAttribute = geometry.getAttribute(
    'normal',
  ) as THREE.BufferAttribute | undefined;

  if (!normalAttribute) return;

  for (const group of groups) {
    if (group.globalIndices.length < 2) continue;

    const average = new THREE.Vector3();

    for (const globalIndex of group.globalIndices) {
      average.x += normalAttribute.getX(globalIndex);
      average.y += normalAttribute.getY(globalIndex);
      average.z += normalAttribute.getZ(globalIndex);
    }

    if (average.lengthSq() <= EPSILON * EPSILON) continue;

    average.normalize();

    for (const globalIndex of group.globalIndices) {
      normalAttribute.setXYZ(
        globalIndex,
        average.x,
        average.y,
        average.z,
      );
    }
  }

  normalAttribute.needsUpdate = true;
}

/* -------------------------------------------------------------------------- */
/*                            BORDAS ABERTAS                                  */
/* -------------------------------------------------------------------------- */

function detectOpenBoundaryEdges(
  panels: GarmentPanel[],
  resolvedSeams: ResolvedSeam[],
  panelOffsets: Map<string, number>,
): BoundaryEdge[] {
  const sewnEdgesByPanel = new Map<string, Set<string>>();

  for (const resolved of resolvedSeams) {
    const panelAEdges =
      sewnEdgesByPanel.get(resolved.panelA.id) ?? new Set<string>();

    const panelBEdges =
      sewnEdgesByPanel.get(resolved.panelB.id) ?? new Set<string>();

    for (let i = 0; i < resolved.edgeA.length - 1; i++) {
      panelAEdges.add(
        createEdgeKey(resolved.edgeA[i], resolved.edgeA[i + 1]),
      );

      panelBEdges.add(
        createEdgeKey(resolved.edgeB[i], resolved.edgeB[i + 1]),
      );
    }

    sewnEdgesByPanel.set(resolved.panelA.id, panelAEdges);
    sewnEdgesByPanel.set(resolved.panelB.id, panelBEdges);
  }

  const result: BoundaryEdge[] = [];

  for (const panel of panels) {
    const occurrences = createPanelEdgeOccurrences(panel);
    const sewnEdges =
      sewnEdgesByPanel.get(panel.id) ?? new Set<string>();

    const offset = panelOffsets.get(panel.id);

    if (offset === undefined) continue;

    for (const [key, occurrence] of occurrences) {
      if (occurrence.count !== 1 || sewnEdges.has(key)) continue;

      result.push({
        panelId: panel.id,
        panelName: panel.name,
        vertexIndices: [occurrence.a, occurrence.b],
        globalVertexIndices: [
          offset + occurrence.a,
          offset + occurrence.b,
        ],
      });
    }
  }

  return result;
}

function classifyOpenBoundaryEdges(
  openBoundaryEdges: BoundaryEdge[],
  boundaries: GarmentBoundaryDefinition[] | undefined,
  panels: GarmentPanel[],
): BoundaryEdge[] {
  if (!boundaries?.length) return openBoundaryEdges;

  const panelMap = new Map(panels.map((panel) => [panel.id, panel]));
  const boundaryIds = new Set<string>();
  const classifiedSegments = new Set<string>();
  const edgeMap = new Map<string, BoundaryEdge>();

  for (const edge of openBoundaryEdges) {
    const key = `${edge.panelId}:${createEdgeKey(
      edge.vertexIndices[0],
      edge.vertexIndices[1],
    )}`;

    edgeMap.set(key, edge);
  }

  for (const boundary of boundaries) {
    if (
      !boundary.id?.trim() ||
      !boundary.name?.trim() ||
      boundaryIds.has(boundary.id)
    ) {
      throw new Error(
        `CAIMENT: ID ou nome de borda inválido ou duplicado: "${boundary.id}".`,
      );
    }

    boundaryIds.add(boundary.id);

    const panel = panelMap.get(boundary.panelId);

    if (!panel) {
      throw new Error(
        `CAIMENT: borda "${boundary.name}" referencia painel inexistente "${boundary.panelId}".`,
      );
    }

    if (
      !Array.isArray(boundary.vertexIndices) ||
      boundary.vertexIndices.length < 2
    ) {
      throw new Error(
        `CAIMENT: borda "${boundary.name}" precisa conter pelo menos dois vértices.`,
      );
    }

    for (const index of boundary.vertexIndices) {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= panel.vertices.length
      ) {
        throw new Error(
          `CAIMENT: índice local inválido na borda "${boundary.name}": ${index}.`,
        );
      }
    }

    for (let i = 0; i < boundary.vertexIndices.length - 1; i++) {
      const a = boundary.vertexIndices[i];
      const b = boundary.vertexIndices[i + 1];

      if (a === b) {
        throw new Error(
          `CAIMENT: a borda "${boundary.name}" contém um segmento com vértices repetidos.`,
        );
      }

      const segmentKey =
        `${boundary.panelId}:${createEdgeKey(a, b)}`;

      if (classifiedSegments.has(segmentKey)) {
        throw new Error(
          `CAIMENT: o segmento ${a}-${b} do painel "${panel.name}" foi classificado mais de uma vez.`,
        );
      }

      const edge = edgeMap.get(segmentKey);

      if (!edge) {
        throw new Error(
          `CAIMENT: o segmento ${a}-${b} da borda "${boundary.name}" não corresponde a uma borda aberta detectada no painel "${panel.name}".`,
        );
      }

      classifiedSegments.add(segmentKey);

      edge.boundaryId = boundary.id;
      edge.boundaryName = boundary.name;
      edge.role = boundary.role;
      edge.finish = boundary.finish;
    }
  }

  return openBoundaryEdges;
}

/* -------------------------------------------------------------------------- */
/*                            GEOMETRIA MONTADA                               */
/* -------------------------------------------------------------------------- */

function createAssembledGeometry(
  meshData: GarmentMeshData,
): THREE.BufferGeometry {
  const panelMap = new Map<string, GarmentPanel>();
  const panelOffsets = new Map<string, number>();

  const positions: number[] = [];
  const masses: number[] = [];
  const indices: number[] = [];

  for (const panel of meshData.panels) {
    if (panelMap.has(panel.id)) {
      throw new Error(
        `CAIMENT: ID de painel duplicado: "${panel.id}".`,
      );
    }

    validatePanel(panel);

    panelMap.set(panel.id, panel);
    panelOffsets.set(panel.id, positions.length / 3);

    for (const vertex of panel.vertices) {
      positions.push(
        vertex.position.x,
        vertex.position.y,
        vertex.position.z,
      );

      // Massa individual usada pela simulação física.
      masses.push(vertex.mass ?? 1);
    }
  }

  const panelEdgeOccurrences = new Map<
    string,
    Map<string, PanelEdgeOccurrence>
  >();

  for (const panel of meshData.panels) {
    panelEdgeOccurrences.set(
      panel.id,
      createPanelEdgeOccurrences(panel),
    );
  }

  const resolvedSeams: ResolvedSeam[] = [];
  const seamIds = new Set<string>();

  for (const seam of meshData.seams) {
    if (seamIds.has(seam.id)) {
      throw new Error(
        `CAIMENT: ID de costura duplicado: "${seam.id}".`,
      );
    }

    seamIds.add(seam.id);

    const panelA = panelMap.get(seam.panelAId);
    const panelB = panelMap.get(seam.panelBId);

    if (!panelA || !panelB) {
      throw new Error(
        `CAIMENT: costura "${seam.name}" referencia painel inexistente.`,
      );
    }

    validateSeam(seam, panelA, panelB);

    const resolved = resolveSeamCorrespondence(
      seam,
      panelA,
      panelB,
    );

    validateSeamBoundary(
      seam,
      panelA,
      resolved.edgeA,
      panelEdgeOccurrences.get(panelA.id)!,
    );

    validateSeamBoundary(
      seam,
      panelB,
      resolved.edgeB,
      panelEdgeOccurrences.get(panelB.id)!,
    );

    resolvedSeams.push(resolved);
  }

  const disjointSet = createDisjointSet();

  for (const resolved of resolvedSeams) {
    for (let i = 0; i < resolved.edgeA.length; i++) {
      disjointSet.connect(
        `${resolved.panelA.id}:${resolved.edgeA[i]}`,
        `${resolved.panelB.id}:${resolved.edgeB[i]}`,
      );
    }
  }

  const weldGroups = createWeldGroups(
    meshData.panels,
    panelOffsets,
    disjointSet.find,
    disjointSet.parents,
  );

  /*
   * IMPORTANTE:
   * Não fazemos média nem deslocamento das posições dos vértices.
   * Isso preserva a modelagem original de cada painel e evita
   * triângulos degenerados causados pelo colapso das costuras.
   */

  for (const panel of meshData.panels) {
    const offset = panelOffsets.get(panel.id)!;

    for (let i = 0; i < panel.triangles.length; i++) {
      const triangle = panel.triangles[i];

      const a = offset + triangle.a;
      const b = offset + triangle.b;
      const c = offset + triangle.c;

      if (isDegenerateTriangle(positions, a, b, c)) {
        throw new Error(
          `CAIMENT: triângulo degenerado no painel "${panel.name}", triângulo ${i}. Verifique a geometria original do painel.`,
        );
      }

      indices.push(a, b, c);
    }
  }

  if (indices.length === 0) {
    throw new Error('CAIMENT: montagem sem triângulos.');
  }

  const totalVertexCount = positions.length / 3;

  const assembledRegions = assembleSemanticRegions(
    meshData.fit,
    totalVertexCount,
  );

  const detectedBoundaryEdges = detectOpenBoundaryEdges(
    meshData.panels,
    resolvedSeams,
    panelOffsets,
  );

  const openBoundaryEdges = classifyOpenBoundaryEdges(
    detectedBoundaryEdges,
    meshData.boundaries,
    meshData.panels,
  );

  const weldConstraints = createWeldConstraints(
    resolvedSeams,
    panelOffsets,
  );

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );

  // Atributo lido diretamente pela ClothSimulation.
  geometry.setAttribute(
    'mass',
    new THREE.Float32BufferAttribute(masses, 1),
  );

  geometry.setIndex(indices);

  geometry.userData.vertexMasses = new Float32Array(masses);
  geometry.userData.panelOffsets = Object.fromEntries(panelOffsets);
  geometry.userData.seams = meshData.seams;
  geometry.userData.garmentFit = meshData.fit ?? null;
  geometry.userData.assembledGarmentRegions = assembledRegions;
  geometry.userData.coordinateSystem = meshData.coordinateSystem ?? null;

  geometry.userData.seamDiagnostics = resolvedSeams.map((resolved) => ({
    id: resolved.seam.id,
    name: resolved.seam.name,
    vertexCount: resolved.edgeA.length,
    maximumInitialGap: resolved.maximumInitialGap,
    averageInitialGap: resolved.averageInitialGap,
    stiffness: resolved.seam.stiffness,
  }));

  geometry.userData.resolvedSeamEdges = resolvedSeams.map((resolved) => ({
    id: resolved.seam.id,
    name: resolved.seam.name,
    panelAId: resolved.panelA.id,
    edgeA: [...resolved.edgeA],
  }));

  geometry.userData.weldGroups = weldGroups.map((group) => ({
    root: group.root,
    globalIndices: [...group.globalIndices],
  }));

  geometry.userData.weldConstraints = weldConstraints;
  geometry.userData.openBoundaryEdges = openBoundaryEdges;
  geometry.userData.openBoundaryEdgeCount = openBoundaryEdges.length;

  geometry.userData.classifiedBoundaryEdgeCount =
    openBoundaryEdges.filter((edge) => edge.role !== undefined).length;

  geometry.userData.unclassifiedBoundaryEdgeCount =
    openBoundaryEdges.filter((edge) => edge.role === undefined).length;

  geometry.userData.openBoundaryEdgesByPanel =
    openBoundaryEdges.reduce(
      (result: Record<string, BoundaryEdge[]>, edge) => {
        result[edge.panelId] ??= [];
        result[edge.panelId].push(edge);
        return result;
      },
      {},
    );

  geometry.userData.boundaryDefinitions = meshData.boundaries ?? [];

  geometry.computeVertexNormals();
  smoothWeldedNormals(geometry, weldGroups);

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  geometry.userData.weldedVertexGroupCount = weldGroups.length;

  geometry.userData.weldedVertexCount = weldGroups.reduce(
    (total, group) => total + group.globalIndices.length,
    0,
  );

  geometry.userData.weldConstraintCount = weldConstraints.length;
  geometry.userData.vertexMassCount = masses.length;

  return geometry;
}

/* -------------------------------------------------------------------------- */
/*                         DETALHES VISUAIS DAS COSTURAS                      */
/* -------------------------------------------------------------------------- */

function createSeamVisualDetails(
  geometry: THREE.BufferGeometry,
  fabricColor: THREE.ColorRepresentation,
): THREE.Group | null {
  const resolvedSeams =
    geometry.userData.resolvedSeamEdges as
      | SeamVisualReference[]
      | undefined;

  const positionAttribute = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute | undefined;

  const normalAttribute = geometry.getAttribute(
    'normal',
  ) as THREE.BufferAttribute | undefined;

  const panelOffsets =
    geometry.userData.panelOffsets as
      | Record<string, number>
      | undefined;

  if (!resolvedSeams?.length || !positionAttribute || !panelOffsets) {
    return null;
  }

  const detailsGroup = new THREE.Group();

  detailsGroup.name = 'GarmentVisualDetails';
  detailsGroup.userData.isVisualOnly = true;
  detailsGroup.userData.excludeFromClothSimulation = true;

  const boundingRadius = geometry.boundingSphere?.radius ?? 0;

  const surfaceOffset = Math.max(
    boundingRadius * 0.00035,
    EPSILON * 10,
  );

  const seamColor = new THREE.Color(fabricColor).multiplyScalar(0.62);

  const seamMaterial = new THREE.LineBasicMaterial({
    color: seamColor,
    transparent: true,
    opacity: 0.72,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });

  let createdLineCount = 0;

  for (const seam of resolvedSeams) {
    const panelOffset = panelOffsets[seam.panelAId];

    if (
      !Number.isInteger(panelOffset) ||
      !Array.isArray(seam.edgeA) ||
      seam.edgeA.length < 2
    ) {
      continue;
    }

    const points: THREE.Vector3[] = [];

    for (const localIndex of seam.edgeA) {
      const globalIndex = panelOffset + localIndex;

      if (
        !Number.isInteger(globalIndex) ||
        globalIndex < 0 ||
        globalIndex >= positionAttribute.count
      ) {
        continue;
      }

      const point = new THREE.Vector3(
        positionAttribute.getX(globalIndex),
        positionAttribute.getY(globalIndex),
        positionAttribute.getZ(globalIndex),
      );

      if (normalAttribute) {
        const normal = new THREE.Vector3(
          normalAttribute.getX(globalIndex),
          normalAttribute.getY(globalIndex),
          normalAttribute.getZ(globalIndex),
        );

        if (normal.lengthSq() > EPSILON * EPSILON) {
          point.addScaledVector(normal.normalize(), surfaceOffset);
        }
      }

      points.push(point);
    }

    if (points.length < 2) continue;

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setFromPoints(points);

    const line = new THREE.Line(lineGeometry, seamMaterial);

    line.name = `GarmentSeam_${seam.id}`;
    line.userData.isVisualOnly = true;
    line.userData.excludeFromClothSimulation = true;
    line.userData.seamId = seam.id;
    line.userData.seamName = seam.name;

    line.userData.sourceVertexIndices = seam.edgeA.map(
      (index) => panelOffset + index,
    );

    detailsGroup.add(line);
    createdLineCount++;
  }

  if (createdLineCount === 0) {
    seamMaterial.dispose();
    return null;
  }

  detailsGroup.userData.seamLineCount = createdLineCount;
  detailsGroup.userData.seamMaterial = seamMaterial;

  return detailsGroup;
}

/* -------------------------------------------------------------------------- */
/*                     ATUALIZAÇÃO DOS DETALHES VISUAIS                       */
/* -------------------------------------------------------------------------- */

export function updateGarmentVisualDetails(
  group: THREE.Group,
): void {
  const details = group.getObjectByName('GarmentVisualDetails');
  const physicalMesh = group.getObjectByName('AssembledGarmentMesh');

  if (!details || !(physicalMesh instanceof THREE.Mesh)) return;

  const geometry = physicalMesh.geometry;

  const positionAttribute = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute | undefined;

  const normalAttribute = geometry.getAttribute(
    'normal',
  ) as THREE.BufferAttribute | undefined;

  if (!positionAttribute) return;

  const surfaceOffset = Math.max(
    (geometry.boundingSphere?.radius ?? 0) * 0.00035,
    EPSILON * 10,
  );

  details.updateMatrixWorld(true);

  const inverseDetailsMatrix = new THREE.Matrix4()
    .copy(details.matrixWorld)
    .invert();

  for (const child of details.children) {
    if (!(child instanceof THREE.Line)) continue;

    const indices = child.userData.sourceVertexIndices as
      | number[]
      | undefined;

    if (!indices?.length) continue;

    const lineGeometry = child.geometry;

    const linePosition = lineGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute | undefined;

    if (!linePosition || linePosition.count !== indices.length) {
      continue;
    }

    for (let i = 0; i < indices.length; i++) {
      const globalIndex = indices[i];

      if (
        globalIndex < 0 ||
        globalIndex >= positionAttribute.count
      ) {
        continue;
      }

      const point = new THREE.Vector3(
        positionAttribute.getX(globalIndex),
        positionAttribute.getY(globalIndex),
        positionAttribute.getZ(globalIndex),
      );

      if (normalAttribute) {
        const normal = new THREE.Vector3(
          normalAttribute.getX(globalIndex),
          normalAttribute.getY(globalIndex),
          normalAttribute.getZ(globalIndex),
        );

        if (normal.lengthSq() > EPSILON * EPSILON) {
          point.addScaledVector(normal.normalize(), surfaceOffset);
        }
      }

      physicalMesh.localToWorld(point);
      point.applyMatrix4(inverseDetailsMatrix);

      linePosition.setXYZ(i, point.x, point.y, point.z);
    }

    linePosition.needsUpdate = true;
    lineGeometry.computeBoundingSphere();
  }
}

/* -------------------------------------------------------------------------- */
/*                              MONTAGEM PRINCIPAL                            */
/* -------------------------------------------------------------------------- */

export function assembleGarment(
  meshData: GarmentMeshData,
  options: AssembleGarmentOptions = {},
): AssembledGarment {
  if (
    !meshData ||
    !Array.isArray(meshData.panels) ||
    meshData.panels.length === 0
  ) {
    throw new Error(
      'CAIMENT: não é possível montar uma roupa sem painéis.',
    );
  }

  if (!Array.isArray(meshData.seams)) {
    throw new Error('CAIMENT: lista de costuras inválida.');
  }

  const geometry = createAssembledGeometry(meshData);
  const fabricOptions = options.fabric;

  const material =
    options.material ??
    createFabricMaterial({
      ...fabricOptions,
      color: fabricOptions?.color ?? '#9254e1',
      roughness: fabricOptions?.roughness ?? 0.85,
      metalness: fabricOptions?.metalness ?? 0,
      side: fabricOptions?.side ?? THREE.DoubleSide,
      opacity: fabricOptions?.opacity ?? 1,
      transparent: fabricOptions?.transparent ?? false,
      wireframe: fabricOptions?.wireframe ?? false,
    });

  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = 'AssembledGarmentMesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isPhysicalGarmentMesh = true;
  mesh.userData.isVisualOnly = false;

  const group = new THREE.Group();

  group.name = 'AssembledGarment';
  group.add(mesh);

  const visualDetails = createSeamVisualDetails(
    geometry,
    fabricOptions?.color ?? '#9254e1',
  );

  if (visualDetails) {
    group.add(visualDetails);
  }

  group.userData.meshData = meshData;
  group.userData.isAssembled = true;
  group.userData.garmentFit = meshData.fit ?? null;

  group.userData.assembledGarmentRegions =
    geometry.userData.assembledGarmentRegions;

  group.userData.seamDiagnostics = geometry.userData.seamDiagnostics;

  group.userData.weldedVertexGroupCount =
    geometry.userData.weldedVertexGroupCount;

  group.userData.weldedVertexCount =
    geometry.userData.weldedVertexCount;

  group.userData.weldGroups = geometry.userData.weldGroups;
  group.userData.weldConstraints = geometry.userData.weldConstraints;

  group.userData.weldConstraintCount =
    geometry.userData.weldConstraintCount;

  group.userData.vertexMasses = geometry.userData.vertexMasses;
  group.userData.vertexMassCount = geometry.userData.vertexMassCount;

  group.userData.openBoundaryEdges = geometry.userData.openBoundaryEdges;

  group.userData.openBoundaryEdgeCount =
    geometry.userData.openBoundaryEdgeCount;

  group.userData.classifiedBoundaryEdgeCount =
    geometry.userData.classifiedBoundaryEdgeCount;

  group.userData.unclassifiedBoundaryEdgeCount =
    geometry.userData.unclassifiedBoundaryEdgeCount;

  group.userData.boundaryDefinitions =
    geometry.userData.boundaryDefinitions;

  group.userData.hasVisualSeamDetails = Boolean(visualDetails);

  group.updateMatrixWorld(true);

  return {
    group,
    geometry,
    panels: meshData.panels,
    seams: meshData.seams,
    vertexCount: geometry.getAttribute('position').count,
    triangleCount: geometry.index ? geometry.index.count / 3 : 0,
  };
}
