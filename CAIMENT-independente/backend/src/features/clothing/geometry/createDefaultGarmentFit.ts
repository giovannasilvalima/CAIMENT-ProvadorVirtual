
import * as THREE from 'three';

import type {
  BodyLandmark,
  BodyRegion,
  GarmentFitDefinition,
  GarmentMeshData,
  GarmentPanel,
  GarmentPanelType,
} from './types';

type GarmentType = 'tshirt' | 'short' | 'dress' | 'pants';

interface PanelBounds {
  bounds: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

interface AnchorDefinition {
  id: string;
  bodyLandmark: BodyLandmark;
  garmentPosition: THREE.Vector3;
  weight: number;
}

interface GarmentFitParts {
  coverage: BodyRegion[];
  anchors: AnchorDefinition[];
}

const SUPPORTED_TYPES: GarmentType[] = [
  'tshirt',
  'short',
  'dress',
  'pants',
];

function validatePanel(panel: GarmentPanel): void {
  if (
    !panel ||
    !panel.id ||
    !Array.isArray(panel.vertices) ||
    panel.vertices.length === 0
  ) {
    throw new Error(
      `CAIMENT: painel "${panel?.name ?? 'desconhecido'}" inválido ou sem vértices.`,
    );
  }

  for (let index = 0; index < panel.vertices.length; index++) {
    const vertex = panel.vertices[index];
    const position = vertex?.position;

    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new Error(
        `CAIMENT: vértice ${index} inválido no painel "${panel.name}".`,
      );
    }
  }
}

function getPanelBounds(panels: GarmentPanel[]): THREE.Box3 {
  if (panels.length === 0) {
    throw new Error(
      'CAIMENT: nenhum painel foi fornecido para calcular o encaixe.',
    );
  }

  const bounds = new THREE.Box3();

  for (const panel of panels) {
    validatePanel(panel);

    for (const vertex of panel.vertices) {
      bounds.expandByPoint(vertex.position);
    }
  }

  if (bounds.isEmpty()) {
    throw new Error(
      'CAIMENT: não foi possível calcular os limites da roupa.',
    );
  }

  return bounds;
}

function getBounds(panels: GarmentPanel[]): PanelBounds {
  const bounds = getPanelBounds(panels);

  return {
    bounds,
    center: bounds.getCenter(new THREE.Vector3()),
    size: bounds.getSize(new THREE.Vector3()),
  };
}

function createAnchor(
  id: string,
  bodyLandmark: BodyLandmark,
  garmentPosition: THREE.Vector3,
  weight = 1,
): AnchorDefinition {
  if (
    !Number.isFinite(weight) ||
    weight <= 0
  ) {
    throw new Error(
      `CAIMENT: peso inválido na âncora "${id}".`,
    );
  }

  return {
    id,
    bodyLandmark,
    garmentPosition: garmentPosition.clone(),
    weight,
  };
}

function getPanelCenter(
  panel: GarmentPanel,
): THREE.Vector3 {
  return getPanelBounds([panel]).getCenter(
    new THREE.Vector3(),
  );
}

function getPanelsByType(
  panels: GarmentPanel[],
  types: GarmentPanelType[],
): GarmentPanel[] {
  return panels.filter((panel) =>
    types.includes(panel.type),
  );
}

function getReferencePanels(
  type: GarmentType,
  panels: GarmentPanel[],
): GarmentPanel[] {
  switch (type) {
    case 'tshirt':
      return getPanelsByType(
        panels,
        ['front', 'back'],
      );

    case 'dress':
      return getPanelsByType(
        panels,
        ['front', 'back', 'skirtFront', 'skirtBack'],
      );

    case 'short':
    case 'pants':
      return getPanelsByType(
        panels,
        ['front', 'back', 'leftLeg', 'rightLeg'],
      );
  }
}

function getPanelReference(
  panels: GarmentPanel[],
  type: GarmentPanelType,
): THREE.Vector3 | null {
  const panel = panels.find(
    (item) => item.type === type,
  );

  return panel
    ? getPanelCenter(panel)
    : null;
}

function getFrontReference(
  panels: GarmentPanel[],
  fallback: THREE.Vector3,
): THREE.Vector3 {
  const frontPanels = getPanelsByType(
    panels,
    ['front', 'skirtFront'],
  );

  if (frontPanels.length === 0) {
    return fallback.clone();
  }

  const bounds = getPanelBounds(frontPanels);
  const center = bounds.getCenter(new THREE.Vector3());

  return new THREE.Vector3(
    center.x,
    center.y,
    bounds.max.z,
  );
}

/**
 * Obtém uma referência lateral a partir da geometria disponível.
 *
 * Quando existem painéis individuais para as pernas, eles são
 * utilizados. Caso contrário, a posição é obtida dos limites
 * laterais dos painéis da peça.
 */
function getSideReference(
  panels: GarmentPanel[],
  side: 'left' | 'right',
  fallback: THREE.Vector3,
): THREE.Vector3 {
  const panelType: GarmentPanelType =
    side === 'left'
      ? 'leftLeg'
      : 'rightLeg';

  const panel = panels.find(
    (item) => item.type === panelType,
  );

  if (panel) {
    return getPanelCenter(panel);
  }

  const bounds = getPanelBounds(panels);

  return new THREE.Vector3(
    side === 'left'
      ? bounds.min.x
      : bounds.max.x,
    fallback.y,
    fallback.z,
  );
}

/**
 * Obtém uma referência frontal em uma altura específica
 * utilizando os vértices dos painéis recebidos.
 *
 * A função também funciona com painéis individuais de perna,
 * sem exigir que sejam classificados como front ou skirtFront.
 */
function getFrontPointAtHeight(
  panels: GarmentPanel[],
  height: number,
  fallback: THREE.Vector3,
): THREE.Vector3 {
  if (panels.length === 0) {
    return fallback.clone();
  }

  const bounds = getPanelBounds(panels);

  const tolerance = Math.max(
    bounds.getSize(new THREE.Vector3()).y * 0.08,
    1e-6,
  );

  const candidates = panels.flatMap(
    (panel) => panel.vertices
      .map((vertex) => vertex.position)
      .filter((position) =>
        Math.abs(position.y - height) <= tolerance,
      ),
  );

  if (candidates.length === 0) {
    return new THREE.Vector3(
      bounds.getCenter(new THREE.Vector3()).x,
      height,
      bounds.max.z,
    );
  }

  const candidateBounds = new THREE.Box3();

  for (const point of candidates) {
    candidateBounds.expandByPoint(point);
  }

  return new THREE.Vector3(
    candidateBounds.getCenter(new THREE.Vector3()).x,
    height,
    candidateBounds.max.z,
  );
}

function createTShirtFit(
  panels: GarmentPanel[],
  reference: PanelBounds,
): GarmentFitParts {
  const front = getFrontReference(
    panels,
    reference.center,
  );

  const leftSleeve = getPanelReference(
    panels,
    'leftSleeve',
  );

  const rightSleeve = getPanelReference(
    panels,
    'rightSleeve',
  );

  const anchors: AnchorDefinition[] = [
    createAnchor(
      'garment-bust',
      'bustCenter',
      front,
    ),
    createAnchor(
      'garment-waist',
      'waistCenter',
      reference.center,
    ),
  ];

  if (leftSleeve) {
    anchors.push(
      createAnchor(
        'garment-left-shoulder',
        'leftShoulder',
        leftSleeve,
      ),
    );
  }

  if (rightSleeve) {
    anchors.push(
      createAnchor(
        'garment-right-shoulder',
        'rightShoulder',
        rightSleeve,
      ),
    );
  }

  const coverage: BodyRegion[] = [
    'shoulders',
    'chest',
    'abdomen',
  ];

  // Regatas não possuem cobertura de mangas.
  // Camisetas com painéis de manga incluem os braços.
  if (leftSleeve || rightSleeve) {
    coverage.push(
      'leftArm',
      'rightArm',
    );
  }

  return {
    coverage,
    anchors,
  };
}

function createDressFit(
  panels: GarmentPanel[],
  reference: PanelBounds,
): GarmentFitParts {
  const front = getFrontReference(
    panels,
    reference.center,
  );

  const skirtPanels = getPanelsByType(
    panels,
    ['skirtFront', 'skirtBack'],
  );

  const hipReference = skirtPanels.length > 0
    ? getBounds(skirtPanels).center
    : reference.center;

  return {
    coverage: [
      'shoulders',
      'chest',
      'abdomen',
      'waist',
      'pelvis',
      'leftThigh',
      'rightThigh',
    ],
    anchors: [
      createAnchor(
        'garment-bust',
        'bustCenter',
        front,
      ),
      createAnchor(
        'garment-waist',
        'waistCenter',
        reference.center,
      ),
      createAnchor(
        'garment-hip',
        'hipCenter',
        hipReference,
      ),
    ],
  };
}

function createLowerBodyFit(
  type: 'short' | 'pants',
  panels: GarmentPanel[],
  reference: PanelBounds,
): GarmentFitParts {
  const front = getFrontReference(
    panels,
    reference.center,
  );

  const leftReference = getSideReference(
    panels,
    'left',
    reference.center,
  );

  const rightReference = getSideReference(
    panels,
    'right',
    reference.center,
  );

  const anchors: AnchorDefinition[] = [
    createAnchor(
      'garment-waist',
      'waistCenter',
      new THREE.Vector3(
        reference.center.x,
        reference.bounds.max.y,
        reference.center.z,
      ),
    ),
    createAnchor(
      'garment-left-hip',
      'leftHip',
      leftReference,
    ),
    createAnchor(
      'garment-right-hip',
      'rightHip',
      rightReference,
    ),
    createAnchor(
      'garment-crotch',
      'crotchCenter',
      front,
    ),
  ];

  if (type === 'pants') {
    const legDefinitions = [
      {
        side: 'left' as const,
        landmark: 'leftKnee' as const,
        ankleLandmark: 'leftAnkle' as const,
        panelType: 'leftLeg' as const,
      },
      {
        side: 'right' as const,
        landmark: 'rightKnee' as const,
        ankleLandmark: 'rightAnkle' as const,
        panelType: 'rightLeg' as const,
      },
    ];

    for (const definition of legDefinitions) {
      const legPanel = panels.find(
        (panel) => panel.type === definition.panelType,
      );

      if (!legPanel) {
        continue;
      }

      const bounds = getPanelBounds([legPanel]);
      const center = bounds.getCenter(new THREE.Vector3());

      const kneeHeight = THREE.MathUtils.clamp(
        center.y,
        bounds.min.y,
        bounds.max.y,
      );

      const kneePosition = getFrontPointAtHeight(
        [legPanel],
        kneeHeight,
        center,
      );

      const anklePosition = new THREE.Vector3(
        center.x,
        bounds.min.y,
        center.z,
      );

      anchors.push(
        createAnchor(
          `garment-${definition.side}-knee`,
          definition.landmark,
          kneePosition,
        ),
        createAnchor(
          `garment-${definition.side}-ankle`,
          definition.ankleLandmark,
          anklePosition,
        ),
      );
    }
  }

  const coverage: BodyRegion[] = [
    'pelvis',
    'leftThigh',
    'rightThigh',
  ];

  if (type === 'pants') {
    coverage.push(
      'leftLeg',
      'rightLeg',
    );
  }

  return {
    coverage,
    anchors,
  };
}

/**
 * Cria referências geométricas iniciais da roupa.
 *
 * As posições são derivadas dos vértices e limites reais
 * dos painéis recebidos pelo gerador.
 *
 * Não altera as dimensões recebidas da loja.
 *
 * A folga é reaproveitada de meshData.fit quando já existe.
 * Caso contrário, utiliza 0.02 m como folga inicial de
 * segurança, não como dimensão da peça.
 *
 * O ajuste anatômico definitivo depende da deformação e
 * da resolução de colisão com o corpo.
 */
export function createDefaultGarmentFit(
  type: string,
  meshData: GarmentMeshData,
): GarmentFitDefinition {
  if (
    !meshData ||
    !Array.isArray(meshData.panels)
  ) {
    throw new Error(
      'CAIMENT: dados geométricos da roupa inválidos.',
    );
  }

  if (
    !SUPPORTED_TYPES.includes(type as GarmentType)
  ) {
    throw new Error(
      `CAIMENT: tipo de roupa "${type}" não suportado para criação do encaixe.`,
    );
  }

  if (meshData.panels.length === 0) {
    throw new Error(
      'CAIMENT: a roupa não possui painéis.',
    );
  }

  for (const panel of meshData.panels) {
    validatePanel(panel);
  }

  const garmentType = type as GarmentType;

  const referencePanels = getReferencePanels(
    garmentType,
    meshData.panels,
  );

  const panels = referencePanels.length > 0
    ? referencePanels
    : meshData.panels;

  const reference = getBounds(panels);

  let fit: GarmentFitParts;

  switch (garmentType) {
    case 'tshirt':
      fit = createTShirtFit(
        panels,
        reference,
      );
      break;

    case 'dress':
      fit = createDressFit(
        panels,
        reference,
      );
      break;

    case 'short':
    case 'pants':
      fit = createLowerBodyFit(
        garmentType,
        panels,
        reference,
      );
      break;
  }

  if (fit.anchors.length === 0) {
    throw new Error(
      'CAIMENT: não foi possível criar referências geométricas para a roupa.',
    );
  }

  const clearance =
    meshData.fit?.clearance ?? 0.02;

  if (
    !Number.isFinite(clearance) ||
    clearance < 0
  ) {
    throw new Error(
      'CAIMENT: folga de segurança da roupa inválida.',
    );
  }

  return {
    coverage: fit.coverage,
    anchors: fit.anchors,
    clearance,
  };
}

export default createDefaultGarmentFit;
