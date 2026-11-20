
import * as THREE from 'three';

import {
  type BodyLandmark,
  type BodyRegion,
  type GarmentAnchor,
  type GarmentFitDefinition,
  type GarmentMeshData,
  type GarmentPanel,
  type GarmentRegionDefinition,
} from './types';

const DEFAULT_UPPER_BODY_CLEARANCE = 0.02;

type UpperBodyGarmentType = 'tshirt' | 'dress';

interface PanelBounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
}

interface PanelReference {
  panel: GarmentPanel;
  bounds: PanelBounds;
}

function isFiniteVector(value: THREE.Vector3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function validatePanel(panel: GarmentPanel): void {
  if (!panel.vertices.length) {
    throw new Error(
      `CAIMENT: o painel "${panel.id}" não possui vértices.`,
    );
  }

  for (const vertex of panel.vertices) {
    if (!isFiniteVector(vertex.position)) {
      throw new Error(
        `CAIMENT: o painel "${panel.id}" possui um vértice com posição inválida.`,
      );
    }
  }

  for (const triangle of panel.triangles) {
    const indices = [triangle.a, triangle.b, triangle.c];

    if (
      indices.some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= panel.vertices.length,
      )
    ) {
      throw new Error(
        `CAIMENT: o painel "${panel.id}" possui um triângulo com índices inválidos.`,
      );
    }
  }
}

function getPanelBounds(panel: GarmentPanel): PanelBounds {
  validatePanel(panel);

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const vertex of panel.vertices) {
    min.min(vertex.position);
    max.max(vertex.position);
  }

  return {
    min,
    max,
    center: min.clone().add(max).multiplyScalar(0.5),
  };
}

function getFrontReference(meshData: GarmentMeshData): PanelReference {
  const preferredPanel =
    meshData.panels.find((panel) => panel.id === 'front') ??
    meshData.panels.find((panel) => panel.type === 'front');

  if (!preferredPanel) {
    throw new Error(
      'CAIMENT: não foi encontrado um painel frontal válido para criar o encaixe superior.',
    );
  }

  return {
    panel: preferredPanel,
    bounds: getPanelBounds(preferredPanel),
  };
}

function getNearestVertex(
  panel: GarmentPanel,
  target: THREE.Vector3,
): THREE.Vector3 {
  let nearest: THREE.Vector3 | null = null;
  let minimumDistance = Infinity;

  for (const vertex of panel.vertices) {
    const distance = vertex.position.distanceToSquared(target);

    if (distance < minimumDistance) {
      minimumDistance = distance;
      nearest = vertex.position;
    }
  }

  if (!nearest) {
    throw new Error(
      `CAIMENT: não foi possível obter um vértice válido do painel "${panel.id}".`,
    );
  }

  return nearest.clone();
}

function getFrontPosition(
  reference: PanelReference,
  ratioY: number,
): THREE.Vector3 {
  const { panel, bounds } = reference;
  const ratio = THREE.MathUtils.clamp(ratioY, 0, 1);

  const targetY = THREE.MathUtils.lerp(
    bounds.min.y,
    bounds.max.y,
    ratio,
  );

  return getNearestVertex(
    panel,
    new THREE.Vector3(
      bounds.center.x,
      targetY,
      bounds.max.z,
    ),
  );
}

function getPanelCenter(
  meshData: GarmentMeshData,
  panelId: string,
): THREE.Vector3 | null {
  const panel = meshData.panels.find(
    (candidate) => candidate.id === panelId,
  );

  if (!panel) return null;

  return getPanelBounds(panel).center.clone();
}

function createAnchor(
  id: string,
  bodyLandmark: BodyLandmark,
  garmentPosition: THREE.Vector3,
  weight = 1,
): GarmentAnchor {
  return {
    id,
    bodyLandmark,
    garmentPosition: garmentPosition.clone(),
    weight,
  };
}

function createTShirtAnchors(
  meshData: GarmentMeshData,
  reference: PanelReference,
): GarmentAnchor[] {
  const anchors: GarmentAnchor[] = [
    createAnchor(
      'garment-bust',
      'bustCenter',
      getFrontPosition(reference, 0.65),
      1.2,
    ),
    createAnchor(
      'garment-waist',
      'waistCenter',
      getFrontPosition(reference, 0.35),
    ),
  ];

  const leftShoulder = getPanelCenter(meshData, 'leftSleeve');
  const rightShoulder = getPanelCenter(meshData, 'rightSleeve');

  if (leftShoulder) {
    anchors.push(
      createAnchor(
        'garment-left-shoulder',
        'leftShoulder',
        leftShoulder,
      ),
    );
  }

  if (rightShoulder) {
    anchors.push(
      createAnchor(
        'garment-right-shoulder',
        'rightShoulder',
        rightShoulder,
      ),
    );
  }

  return anchors;
}

function createDressAnchors(
  reference: PanelReference,
): GarmentAnchor[] {
  return [
    createAnchor(
      'garment-bust',
      'bustCenter',
      getFrontPosition(reference, 0.75),
      1.2,
    ),
    createAnchor(
      'garment-waist',
      'waistCenter',
      getFrontPosition(reference, 0.45),
    ),
    createAnchor(
      'garment-hip',
      'hipCenter',
      getFrontPosition(reference, 0.2),
    ),
  ];
}

function createCoverage(
  type: UpperBodyGarmentType,
  meshData: GarmentMeshData,
): BodyRegion[] {
  if (type === 'dress') {
    return [
      'shoulders',
      'chest',
      'abdomen',
      'waist',
      'pelvis',
      'leftThigh',
      'rightThigh',
    ];
  }

  const hasLeftSleeve = meshData.panels.some(
    (panel) => panel.id === 'leftSleeve',
  );

  const hasRightSleeve = meshData.panels.some(
    (panel) => panel.id === 'rightSleeve',
  );

  const coverage: BodyRegion[] = [
    'shoulders',
    'chest',
    'abdomen',
  ];

  if (hasLeftSleeve) coverage.push('leftArm');
  if (hasRightSleeve) coverage.push('rightArm');

  return coverage;
}

function resolveClearance(
  meshData: GarmentMeshData,
  requestedClearance?: number,
): number {
  if (
    requestedClearance !== undefined &&
    (
      !Number.isFinite(requestedClearance) ||
      requestedClearance < 0
    )
  ) {
    throw new Error(
      'CAIMENT: a folga solicitada para o encaixe superior é inválida.',
    );
  }

  if (requestedClearance !== undefined) {
    return requestedClearance;
  }

  const configuredClearance = meshData.fit?.clearance;

  if (
    typeof configuredClearance === 'number' &&
    Number.isFinite(configuredClearance) &&
    configuredClearance >= 0
  ) {
    return configuredClearance;
  }

  return DEFAULT_UPPER_BODY_CLEARANCE;
}

function validateAnchors(anchors: GarmentAnchor[]): void {
  const ids = new Set<string>();

  for (const anchor of anchors) {
    if (ids.has(anchor.id)) {
      throw new Error(
        `CAIMENT: a âncora "${anchor.id}" está duplicada.`,
      );
    }

    ids.add(anchor.id);

    if (!isFiniteVector(anchor.garmentPosition)) {
      throw new Error(
        `CAIMENT: a âncora "${anchor.id}" possui uma posição inválida.`,
      );
    }

    if (
      anchor.weight !== undefined &&
      (
        !Number.isFinite(anchor.weight) ||
        anchor.weight <= 0
      )
    ) {
      throw new Error(
        `CAIMENT: a âncora "${anchor.id}" possui um peso inválido.`,
      );
    }
  }
}

/**
 * Gera regiões de contato usando as regiões já existentes no gerador.
 *
 * Não transforma toda a cobertura em contato: somente regiões explicitamente
 * classificadas como contato ou suporte recebem essa permissão.
 */
function createContactRegions(
  meshData: GarmentMeshData,
  existingRegions: GarmentRegionDefinition[],
): GarmentRegionDefinition[] {
  const regions = [...existingRegions];

  const existingIds = new Set(
    regions.map((region) => region.id),
  );

  const totalVertices = meshData.panels.reduce(
    (total, panel) => total + panel.vertices.length,
    0,
  );

  // A região de contato só é criada quando existe uma região semântica
  // específica que identifica os vértices que devem acompanhar o corpo.
  for (const region of existingRegions) {
    if (
      region.role !== 'contact' &&
      region.role !== 'support'
    ) {
      continue;
    }

    const contactId = `${region.id}-contact`;

    if (existingIds.has(contactId)) continue;

    const validIndices = region.vertexIndices.filter(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < totalVertices,
    );

    if (!validIndices.length) continue;

    regions.push({
      ...region,
      id: contactId,
      name: `${region.name} — contato corporal`,
      vertexIndices: [...validIndices],
      role: 'contact',
    });

    existingIds.add(contactId);
  }

  return regions;
}

function createUpperBodyGarmentFit(
  type: UpperBodyGarmentType,
  meshData: GarmentMeshData,
  requestedClearance?: number,
): GarmentFitDefinition {
  if (type !== 'tshirt' && type !== 'dress') {
    throw new Error(
      `CAIMENT: tipo de roupa "${type}" não suportado pelo encaixe superior.`,
    );
  }

  if (!meshData.panels.length) {
    throw new Error(
      'CAIMENT: não existem painéis para criar o encaixe superior.',
    );
  }

  for (const panel of meshData.panels) {
    validatePanel(panel);
  }

  const reference = getFrontReference(meshData);
  const existingFit = meshData.fit;

  const anchors =
    existingFit?.anchors?.length
      ? existingFit.anchors.map((anchor) => ({
          ...anchor,
          garmentPosition: anchor.garmentPosition.clone(),
        }))
      : type === 'dress'
        ? createDressAnchors(reference)
        : createTShirtAnchors(meshData, reference);

  validateAnchors(anchors);

  const existingRegions = existingFit?.regions ?? [];

  const regions = createContactRegions(
    meshData,
    existingRegions,
  );

  return {
    ...existingFit,

    coverage:
      existingFit?.coverage?.length
        ? [...existingFit.coverage]
        : createCoverage(type, meshData),

    anchors,

    clearance: resolveClearance(
      meshData,
      requestedClearance,
    ),

    regions,

    supports: existingFit?.supports
      ? [...existingFit.supports]
      : [],
  };
}

export {
  DEFAULT_UPPER_BODY_CLEARANCE,
  createUpperBodyGarmentFit,
};

export type {
  UpperBodyGarmentType,
};
