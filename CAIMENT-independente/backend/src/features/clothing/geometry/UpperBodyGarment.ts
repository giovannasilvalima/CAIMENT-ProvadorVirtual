
import * as THREE from 'three';

import {
  type BodyLandmark,
  type BodyRegion,
  type GarmentAnchor,
  type GarmentFitDefinition,
  type GarmentMeshData,
  type GarmentPanel,
} from './types';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

/**
 * Folga padrão do encaixe superior.
 *
 * Unidade: metros.
 *
 * O valor segue a referência utilizada pelo encaixe inferior.
 * Pode ser substituído por uma folga positiva recebida
 * nos metadados da peça.
 */
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

// ============================================================
// VALIDAÇÃO
// ============================================================

function isFiniteVector(
  value: THREE.Vector3,
): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function validatePanel(
  panel: GarmentPanel,
): void {
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
}

// ============================================================
// LIMITES GEOMÉTRICOS
// ============================================================

function getPanelBounds(
  panel: GarmentPanel,
): PanelBounds {
  validatePanel(panel);

  const min = new THREE.Vector3(
    Infinity,
    Infinity,
    Infinity,
  );

  const max = new THREE.Vector3(
    -Infinity,
    -Infinity,
    -Infinity,
  );

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

// ============================================================
// REFERÊNCIA FRONTAL
// ============================================================

/**
 * Prioriza os painéis frontais reais dos geradores.
 *
 * Regata:
 * - front
 * - back
 *
 * Vestido:
 * - front
 * - back
 * - skirtFront
 * - skirtBack, quando disponíveis
 */
function getFrontReference(
  meshData: GarmentMeshData,
): PanelReference {
  const preferredIds = [
    'front',
    'skirtFront',
  ];

  for (const id of preferredIds) {
    const panel = meshData.panels.find(
      (candidate) => candidate.id === id,
    );

    if (panel) {
      return {
        panel,
        bounds: getPanelBounds(panel),
      };
    }
  }

  const frontPanel = meshData.panels.find(
    (panel) => panel.type === 'front',
  );

  if (frontPanel) {
    return {
      panel: frontPanel,
      bounds: getPanelBounds(frontPanel),
    };
  }

  throw new Error(
    'CAIMENT: não foi encontrado um painel frontal válido para criar o encaixe superior.',
  );
}

// ============================================================
// OBTENÇÃO DE POSIÇÕES
// ============================================================

/**
 * Obtém o vértice real mais próximo de uma posição-alvo.
 *
 * A posição retornada pertence à geometria original.
 * Nenhuma coordenada é criada artificialmente.
 */
function getNearestVertex(
  panel: GarmentPanel,
  target: THREE.Vector3,
): THREE.Vector3 {
  let nearest: THREE.Vector3 | null = null;
  let minimumDistance = Infinity;

  for (const vertex of panel.vertices) {
    const distance =
      vertex.position.distanceToSquared(target);

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

/**
 * Localiza uma posição na região frontal da peça.
 *
 * ratioY representa a posição relativa entre a base e o topo
 * da geometria original.
 */
function getFrontPosition(
  reference: PanelReference,
  ratioY: number,
): THREE.Vector3 {
  const { panel, bounds } = reference;

  const ratio = THREE.MathUtils.clamp(
    ratioY,
    0,
    1,
  );

  const targetY = THREE.MathUtils.lerp(
    bounds.min.y,
    bounds.max.y,
    ratio,
  );

  const target = new THREE.Vector3(
    bounds.center.x,
    targetY,
    bounds.max.z,
  );

  return getNearestVertex(panel, target);
}

// ============================================================
// CENTRO DE PAINÉIS AUXILIARES
// ============================================================

function getPanelCenter(
  meshData: GarmentMeshData,
  panelId: string,
): THREE.Vector3 | null {
  const panel = meshData.panels.find(
    (candidate) => candidate.id === panelId,
  );

  if (!panel) {
    return null;
  }

  return getPanelBounds(panel).center.clone();
}

// ============================================================
// ÂNCORAS
// ============================================================

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

/**
 * Cria âncoras para regatas.
 *
 * Regatas não recebem âncoras artificiais de mangas ou braços.
 * Os ombros só são associados quando existem painéis reais
 * correspondentes.
 */
function createTShirtAnchors(
  meshData: GarmentMeshData,
  reference: PanelReference,
): GarmentAnchor[] {
  const anchors: GarmentAnchor[] = [];

  const bust = getFrontPosition(
    reference,
    0.65,
  );

  const waist = getFrontPosition(
    reference,
    0.35,
  );

  anchors.push(
    createAnchor(
      'garment-bust',
      'bustCenter',
      bust,
      1.2,
    ),
    createAnchor(
      'garment-waist',
      'waistCenter',
      waist,
      1,
    ),
  );

  const leftSleeve = getPanelCenter(
    meshData,
    'leftSleeve',
  );

  const rightSleeve = getPanelCenter(
    meshData,
    'rightSleeve',
  );

  if (leftSleeve) {
    anchors.push(
      createAnchor(
        'garment-left-shoulder',
        'leftShoulder',
        leftSleeve,
        1,
      ),
    );
  }

  if (rightSleeve) {
    anchors.push(
      createAnchor(
        'garment-right-shoulder',
        'rightShoulder',
        rightSleeve,
        1,
      ),
    );
  }

  return anchors;
}

/**
 * Cria âncoras para vestidos quando o gerador ainda não
 * forneceu uma definição própria.
 *
 * Quando o gerador já fornece âncoras, elas são preservadas.
 */
function createDressAnchors(
  reference: PanelReference,
): GarmentAnchor[] {
  const bust = getFrontPosition(
    reference,
    0.75,
  );

  const waist = getFrontPosition(
    reference,
    0.45,
  );

  const hip = getFrontPosition(
    reference,
    0,
  );

  return [
    createAnchor(
      'garment-bust',
      'bustCenter',
      bust,
      1.2,
    ),
    createAnchor(
      'garment-waist',
      'waistCenter',
      waist,
      1,
    ),
    createAnchor(
      'garment-hip',
      'hipCenter',
      hip,
      1,
    ),
  ];
}

// ============================================================
// COBERTURA ANATÔMICA
// ============================================================

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

  if (hasLeftSleeve) {
    coverage.push('leftArm');
  }

  if (hasRightSleeve) {
    coverage.push('rightArm');
  }

  return coverage;
}

// ============================================================
// FOLGA
// ============================================================

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

  const configuredClearance =
    meshData.fit?.clearance;

  if (
    typeof configuredClearance === 'number' &&
    Number.isFinite(configuredClearance) &&
    configuredClearance > 0
  ) {
    return configuredClearance;
  }

  return DEFAULT_UPPER_BODY_CLEARANCE;
}

// ============================================================
// VALIDAÇÃO DAS ÂNCORAS EXISTENTES
// ============================================================

function validateAnchors(
  anchors: GarmentAnchor[],
): void {
  for (const anchor of anchors) {
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

// ============================================================
// CONSTRUTOR UNIVERSAL DO ENCAIXE SUPERIOR
// ============================================================

/**
 * Cria a definição de encaixe para regatas e vestidos.
 *
 * Responsabilidades:
 * - preservar âncoras já produzidas pelo gerador;
 * - criar âncoras quando não existem;
 * - validar os painéis utilizados;
 * - definir a cobertura anatômica;
 * - resolver a folga em metros;
 * - preservar propriedades adicionais do fit original.
 *
 * Não modifica os vértices da geometria.
 * Não aplica escala ou translação.
 * Não realiza deformação.
 */
function createUpperBodyGarmentFit(
  type: UpperBodyGarmentType,
  meshData: GarmentMeshData,
  requestedClearance?: number,
): GarmentFitDefinition {
  if (
    type !== 'tshirt' &&
    type !== 'dress'
  ) {
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
          garmentPosition:
            anchor.garmentPosition.clone(),
        }))
      : type === 'dress'
        ? createDressAnchors(reference)
        : createTShirtAnchors(meshData, reference);

  validateAnchors(anchors);

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
  };
}

// ============================================================
// EXPORTAÇÃO
// ============================================================

export {
  DEFAULT_UPPER_BODY_CLEARANCE,
  createUpperBodyGarmentFit,
};

export type {
  UpperBodyGarmentType,
};
