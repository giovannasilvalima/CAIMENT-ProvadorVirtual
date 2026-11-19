
import * as THREE from 'three';

import type {
  GarmentFitDefinition,
} from './types';

import type {
  AvatarLandmarkMap,
  AvatarLandmarkName,
} from './AvatarLandmarks';

// ============================================================
// TIPOS
// ============================================================

export interface GarmentPositioningOptions {
  /**
   * Escala uniforme calculada pela altura real do usuário.
   *
   * Exemplo:
   * Avatar normalizado: 3,4 m
   * Altura real: 1,70 m
   * Escala: 3,4 / 1,70 = 2
   *
   * A mesma escala é aplicada nos três eixos.
   */
  uniformScale?: number;

  /**
   * Translação previamente calculada pelo GarmentFitResolver.
   *
   * Quando informada, será utilizada diretamente.
   * Deve estar no referencial local do avatar.
   */
  translation?: THREE.Vector3;

  /**
   * Propriedades mantidas por compatibilidade.
   * Não são utilizadas no posicionamento atual.
   */
  deformationStrength?: number;
  influenceRadius?: number;
  minScale?: number;
  maxScale?: number;

  calculateScale?: boolean;
  calculateTranslation?: boolean;
  applyLocalDeformation?: boolean;

  regionIds?: string[];

  /**
   * Direções externas opcionais para aplicação da folga.
   * Sem uma direção válida, a folga não é aplicada.
   */
  outwardDirections?: Partial<
    Record<AvatarLandmarkName, THREE.Vector3>
  >;
}

export interface GarmentAnchorControl {
  id: string;
  landmark: AvatarLandmarkName;
  source: THREE.Vector3;
  target: THREE.Vector3;
  weight: number;
  region?: string;
}

export interface GarmentPositioningTransform {
  scale: THREE.Vector3;
  translation: THREE.Vector3;
}

export interface GarmentPositioningResult {
  geometry: THREE.BufferGeometry;
  scale: THREE.Vector3;
  translation: THREE.Vector3;
  anchorCount: number;
  deformedVertexCount: number;
  maximumDisplacement: number;
  averageDisplacement: number;
  controls: GarmentAnchorControl[];
}

export interface GarmentPositioningValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingLandmarks: AvatarLandmarkName[];
}

// ============================================================
// CONSTANTES E VALIDAÇÕES BÁSICAS
// ============================================================

const EPSILON = 1e-8;

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isFiniteVector(
  value: THREE.Vector3 | undefined | null,
): value is THREE.Vector3 {
  return Boolean(
    value &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z),
  );
}

function cloneControls(
  controls: GarmentAnchorControl[],
): GarmentAnchorControl[] {
  return controls.map((control) => ({
    ...control,
    source: control.source.clone(),
    target: control.target.clone(),
  }));
}

function validateScale(
  scale: THREE.Vector3,
): boolean {
  return (
    isFiniteVector(scale) &&
    scale.x > 0 &&
    scale.y > 0 &&
    scale.z > 0
  );
}

// ============================================================
// VALIDAÇÃO DO FIT
// ============================================================

function validateFitDefinition(
  fit: GarmentFitDefinition,
): string[] {
  const errors: string[] = [];

  if (!fit) {
    return [
      'CAIMENT: definição de encaixe não informada.',
    ];
  }

  if (
    !Array.isArray(fit.anchors) ||
    fit.anchors.length === 0
  ) {
    errors.push(
      'CAIMENT: definição de encaixe sem âncoras.',
    );
  }

  if (
    !Number.isFinite(fit.clearance) ||
    fit.clearance < 0
  ) {
    errors.push(
      'CAIMENT: folga da roupa inválida.',
    );
  }

  if (!Array.isArray(fit.coverage)) {
    errors.push(
      'CAIMENT: cobertura da roupa inválida.',
    );
  }

  /**
   * fit.scale não é utilizado para dimensionar a roupa.
   *
   * A escala comercial é calculada exclusivamente
   * a partir da altura real do usuário.
   */

  return errors;
}

function validateAnchorDefinitions(
  fit: GarmentFitDefinition,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  if (!Array.isArray(fit?.anchors)) {
    return [
      'CAIMENT: lista de âncoras inválida.',
    ];
  }

  fit.anchors.forEach((anchor, index) => {
    if (
      !anchor ||
      typeof anchor.id !== 'string' ||
      !anchor.id.trim()
    ) {
      errors.push(
        `CAIMENT: identificador inválido na âncora ${index}.`,
      );

      return;
    }

    if (ids.has(anchor.id)) {
      errors.push(
        `CAIMENT: identificador duplicado "${anchor.id}".`,
      );
    }

    ids.add(anchor.id);

    if (!isFiniteVector(anchor.garmentPosition)) {
      errors.push(
        `CAIMENT: posição inválida na âncora "${anchor.id}".`,
      );
    }

    if (
      !anchor.bodyLandmark ||
      typeof anchor.bodyLandmark !== 'string'
    ) {
      errors.push(
        `CAIMENT: landmark não informado na âncora "${anchor.id}".`,
      );
    }

    if (
      anchor.weight !== undefined &&
      (
        !Number.isFinite(anchor.weight) ||
        anchor.weight <= 0
      )
    ) {
      errors.push(
        `CAIMENT: peso inválido na âncora "${anchor.id}".`,
      );
    }
  });

  return errors;
}

// ============================================================
// LANDMARKS NECESSÁRIOS
// ============================================================

export function getRequiredLandmarks(
  fit: GarmentFitDefinition,
): AvatarLandmarkName[] {
  if (!Array.isArray(fit?.anchors)) {
    return [];
  }

  return [
    ...new Set(
      fit.anchors.map(
        (anchor) =>
          anchor.bodyLandmark as AvatarLandmarkName,
      ),
    ),
  ];
}

// ============================================================
// VALIDAÇÃO DA GEOMETRIA
// ============================================================

function validateGeometry(
  geometry: THREE.BufferGeometry,
): string[] {
  const errors: string[] = [];

  if (!geometry) {
    return [
      'CAIMENT: geometria da roupa não informada.',
    ];
  }

  const position = geometry.getAttribute('position');

  if (!position) {
    errors.push(
      'CAIMENT: geometria da roupa não possui vértices.',
    );

    return errors;
  }

  if (position.count === 0) {
    errors.push(
      'CAIMENT: geometria sem vértices.',
    );
  }

  if (position.itemSize !== 3) {
    errors.push(
      'CAIMENT: atributo de posição deve possuir três componentes.',
    );

    return errors;
  }

  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z)
    ) {
      errors.push(
        `CAIMENT: vértice ${index} possui coordenadas inválidas.`,
      );

      break;
    }
  }

  return errors;
}

// ============================================================
// VALIDAÇÃO DO POSICIONAMENTO
// ============================================================

export function validateGarmentPositioning(
  geometry: THREE.BufferGeometry,
  fit: GarmentFitDefinition,
  landmarks: AvatarLandmarkMap,
): GarmentPositioningValidation {
  const errors = [
    ...validateGeometry(geometry),
    ...validateFitDefinition(fit),
    ...validateAnchorDefinitions(fit),
  ];

  const warnings: string[] = [];
  const missingLandmarks: AvatarLandmarkName[] = [];

  if (!landmarks) {
    errors.push(
      'CAIMENT: landmarks do avatar não informados.',
    );
  } else {
    for (const name of getRequiredLandmarks(fit)) {
      if (!isFiniteVector(landmarks[name])) {
        missingLandmarks.push(name);
      }
    }
  }

  if (missingLandmarks.length > 0) {
    warnings.push(
      `CAIMENT: algumas âncoras não possuem landmarks: ${missingLandmarks.join(', ')}.`,
    );
  }

  const availableAnchorCount = Array.isArray(fit?.anchors)
    ? fit.anchors.filter((anchor) => {
        if (!anchor) {
          return false;
        }

        const landmark =
          anchor.bodyLandmark as AvatarLandmarkName;

        return (
          isFiniteVector(landmarks?.[landmark]) &&
          isFiniteVector(anchor.garmentPosition) &&
          Number.isFinite(anchor.weight ?? 1) &&
          (anchor.weight ?? 1) > 0
        );
      }).length
    : 0;

  if (availableAnchorCount === 0) {
    errors.push(
      'CAIMENT: nenhuma âncora possui landmark disponível para posicionamento.',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missingLandmarks,
  };
}

// ============================================================
// CONTROLES DAS ÂNCORAS
// ============================================================

/**
 * Cria controles somente para âncoras com landmarks válidos.
 *
 * source:
 * posição da âncora no espaço local original da roupa.
 *
 * target:
 * posição do landmark no espaço do avatar.
 *
 * A escala é aplicada posteriormente.
 */
export function createAnchorControls(
  fit: GarmentFitDefinition,
  landmarks: AvatarLandmarkMap,
  options: GarmentPositioningOptions = {},
): GarmentAnchorControl[] {
  const errors = [
    ...validateFitDefinition(fit),
    ...validateAnchorDefinitions(fit),
  ];

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const controls: GarmentAnchorControl[] = [];

  for (const anchor of fit.anchors) {
    const landmark =
      anchor.bodyLandmark as AvatarLandmarkName;

    const avatarPosition = landmarks?.[landmark];

    if (
      !isFiniteVector(avatarPosition) ||
      !isFiniteVector(anchor.garmentPosition)
    ) {
      continue;
    }

    const target = avatarPosition.clone();

    const outward =
      options.outwardDirections?.[landmark];

    if (outward !== undefined) {
      if (
        !isFiniteVector(outward) ||
        outward.lengthSq() <= EPSILON
      ) {
        throw new Error(
          `CAIMENT: direção externa inválida para "${landmark}".`,
        );
      }

      target.add(
        outward
          .clone()
          .normalize()
          .multiplyScalar(fit.clearance),
      );
    }

    controls.push({
      id: anchor.id,
      landmark,
      source: anchor.garmentPosition.clone(),
      target,
      weight: anchor.weight ?? 1,
    });
  }

  if (controls.length === 0) {
    throw new Error(
      'CAIMENT: nenhuma âncora pode ser utilizada. Verifique os landmarks extraídos do avatar.',
    );
  }

  return controls;
}

// ============================================================
// ESCALA UNIFORME
// ============================================================

/**
 * Calcula exclusivamente a escala uniforme.
 *
 * Não calcula escala pelas distâncias entre âncoras.
 * Não utiliza fit.scale.
 */
export function calculateGarmentScale(
  _controls: GarmentAnchorControl[],
  _fit: GarmentFitDefinition,
  options: GarmentPositioningOptions = {},
): THREE.Vector3 {
  if (options.calculateScale === false) {
    return new THREE.Vector3(1, 1, 1);
  }

  const uniformScale =
    options.uniformScale ?? 1;

  if (
    !Number.isFinite(uniformScale) ||
    uniformScale <= 0
  ) {
    throw new Error(
      'CAIMENT: escala uniforme inválida. Informe um valor positivo calculado pela altura real do usuário.',
    );
  }

  return new THREE.Vector3(
    uniformScale,
    uniformScale,
    uniformScale,
  );
}

// ============================================================
// TRANSLAÇÃO
// ============================================================

/**
 * Calcula a média ponderada dos deslocamentos.
 *
 * A escala é aplicada às posições source antes
 * do cálculo da translação.
 *
 * Fórmula:
 *
 * translation = média ponderada(
 *   target - source * scale
 * )
 */
export function calculateGarmentTranslation(
  controls: GarmentAnchorControl[],
  scale: THREE.Vector3,
): THREE.Vector3 {
  if (
    !Array.isArray(controls) ||
    controls.length === 0
  ) {
    throw new Error(
      'CAIMENT: não existem controles para calcular a translação.',
    );
  }

  if (!validateScale(scale)) {
    throw new Error(
      'CAIMENT: escala inválida.',
    );
  }

  const translation = new THREE.Vector3();
  let totalWeight = 0;

  for (const control of controls) {
    if (
      !control ||
      !isFiniteVector(control.source) ||
      !isFiniteVector(control.target) ||
      !Number.isFinite(control.weight) ||
      control.weight <= 0
    ) {
      throw new Error(
        `CAIMENT: controle inválido "${control?.id ?? 'desconhecido'}".`,
      );
    }

    const transformedSource = control.source
      .clone()
      .multiply(scale);

    const offset = control.target
      .clone()
      .sub(transformedSource);

    translation.addScaledVector(
      offset,
      control.weight,
    );

    totalWeight += control.weight;
  }

  if (
    !Number.isFinite(totalWeight) ||
    totalWeight <= 0
  ) {
    throw new Error(
      'CAIMENT: soma dos pesos inválida.',
    );
  }

  return translation.divideScalar(totalWeight);
}

// ============================================================
// TRANSFORMAÇÃO COMPLETA
// ============================================================

/**
 * Calcula a transformação absoluta da roupa.
 *
 * Se options.translation existir, ela será utilizada
 * diretamente, sem novo cálculo.
 */
export function calculateGarmentTransform(
  fit: GarmentFitDefinition,
  landmarks: AvatarLandmarkMap,
  options: GarmentPositioningOptions = {},
): GarmentPositioningTransform {
  const controls = createAnchorControls(
    fit,
    landmarks,
    options,
  );

  const scale = calculateGarmentScale(
    controls,
    fit,
    options,
  );

  let translation: THREE.Vector3;

  // A translação do resolver tem prioridade.
  if (options.translation !== undefined) {
    if (!isFiniteVector(options.translation)) {
      throw new Error(
        'CAIMENT: translação fornecida inválida.',
      );
    }

    translation = options.translation.clone();
  } else if (options.calculateTranslation === false) {
    translation = new THREE.Vector3();
  } else {
    translation = calculateGarmentTranslation(
      controls,
      scale,
    );
  }

  return {
    scale,
    translation,
  };
}

// ============================================================
// APLICAÇÃO DA TRANSFORMAÇÃO
// ============================================================

/**
 * Aplica escala e translação à geometria recebida.
 *
 * Esta função modifica a geometria recebida.
 * Para preservar a original, utilize uma cópia.
 */
export function applyGarmentTransform(
  geometry: THREE.BufferGeometry,
  transform: GarmentPositioningTransform,
): THREE.BufferGeometry {
  const validationErrors = validateGeometry(geometry);

  if (validationErrors.length > 0) {
    throw new Error(
      validationErrors.join('\n'),
    );
  }

  if (
    !transform ||
    !validateScale(transform.scale) ||
    !isFiniteVector(transform.translation)
  ) {
    throw new Error(
      'CAIMENT: transformação inválida.',
    );
  }

  const matrix = new THREE.Matrix4().compose(
    transform.translation.clone(),
    new THREE.Quaternion(),
    transform.scale.clone(),
  );

  geometry.applyMatrix4(matrix);

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

// ============================================================
// TRANSFORMAÇÃO DOS CONTROLES
// ============================================================

function transformAnchorControls(
  controls: GarmentAnchorControl[],
  transform: GarmentPositioningTransform,
): GarmentAnchorControl[] {
  return controls.map((control) => ({
    ...control,

    source: control.source
      .clone()
      .multiply(transform.scale)
      .add(transform.translation),

    target: control.target.clone(),
  }));
}

// ============================================================
// DEFORMAÇÃO LOCAL — COMPATIBILIDADE
// ============================================================

/**
 * Mantida somente para compatibilidade com chamadas antigas.
 *
 * A deformação local não faz parte do fluxo atual.
 * O CAIMENT utiliza posicionamento por escala uniforme
 * e translação nesta etapa.
 */
export function applyLocalGarmentDeformation(
  _geometry: THREE.BufferGeometry,
  _controls: GarmentAnchorControl[],
  _options: GarmentPositioningOptions = {},
  _fit?: GarmentFitDefinition,
): {
  geometry: THREE.BufferGeometry;
  deformedVertexCount: number;
  maximumDisplacement: number;
  averageDisplacement: number;
} {
  throw new Error(
    'CAIMENT: deformação local desativada. Utilize somente o posicionamento por escala uniforme e translação.',
  );
}

// ============================================================
// POSICIONAMENTO DE UMA GEOMETRIA
// ============================================================

/**
 * Posiciona uma geometria individual.
 *
 * A geometria original não é modificada.
 * A escala e a translação são aplicadas a uma cópia.
 */
export function positionGarmentOnAvatar(
  sourceGeometry: THREE.BufferGeometry,
  fit: GarmentFitDefinition,
  landmarks: AvatarLandmarkMap,
  options: GarmentPositioningOptions = {},
): GarmentPositioningResult {
  const validation = validateGarmentPositioning(
    sourceGeometry,
    fit,
    landmarks,
  );

  if (!validation.valid) {
    throw new Error(
      validation.errors.join('\n'),
    );
  }

  const controls = createAnchorControls(
    fit,
    landmarks,
    options,
  );

  const transform = calculateGarmentTransform(
    fit,
    landmarks,
    options,
  );

  const geometry = sourceGeometry.clone();

  applyGarmentTransform(
    geometry,
    transform,
  );

  const transformedControls =
    transformAnchorControls(
      controls,
      transform,
    );

  return {
    geometry,

    scale: transform.scale.clone(),

    translation: transform.translation.clone(),

    anchorCount: transformedControls.length,

    deformedVertexCount: 0,

    maximumDisplacement: 0,

    averageDisplacement: 0,

    controls: cloneControls(
      transformedControls,
    ),
  };
}

// ============================================================
// POSICIONAMENTO DE UM GRUPO
// ============================================================

/**
 * Posiciona o grupo da roupa por transformação absoluta.
 *
 * Requisitos:
 * - Âncoras no espaço local neutro do grupo.
 * - Landmarks no espaço local do avatar normalizado.
 * - Geometria da roupa em metros.
 * - Grupo da roupa sem transformações adicionais
 *   de escala ou translação antes deste posicionamento.
 *
 * Não modifica vértices individualmente.
 * Não executa deformação local.
 * Não executa simulação física.
 */
export function positionGarmentGroupOnAvatar(
  garment: THREE.Group,
  fit: GarmentFitDefinition,
  landmarks: AvatarLandmarkMap,
  options: GarmentPositioningOptions = {},
): GarmentPositioningTransform {
  if (!garment) {
    throw new Error(
      'CAIMENT: grupo da roupa não informado.',
    );
  }

  const transform = calculateGarmentTransform(
    fit,
    landmarks,
    options,
  );

  /**
   * Transformação absoluta.
   *
   * Não multiplica a escala anterior.
   * Não soma a translação anterior.
   *
   * A rotação existente é preservada.
   */
  garment.scale.copy(transform.scale);

  garment.position.copy(transform.translation);

  garment.updateMatrix();

  garment.updateMatrixWorld(true);

  return {
    scale: transform.scale.clone(),
    translation: transform.translation.clone(),
  };
}

// ============================================================
// UTILITÁRIOS DE LANDMARKS
// ============================================================

export function calculateLandmarkDistance(
  landmarks: AvatarLandmarkMap,
  first: AvatarLandmarkName,
  second: AvatarLandmarkName,
): number {
  const a = landmarks[first];
  const b = landmarks[second];

  if (
    !isFiniteVector(a) ||
    !isFiniteVector(b)
  ) {
    throw new Error(
      `CAIMENT: landmarks insuficientes entre "${first}" e "${second}".`,
    );
  }

  return a.distanceTo(b);
}

export function calculateLandmarkCenter(
  landmarks: AvatarLandmarkMap,
  first: AvatarLandmarkName,
  second: AvatarLandmarkName,
): THREE.Vector3 {
  const a = landmarks[first];
  const b = landmarks[second];

  if (
    !isFiniteVector(a) ||
    !isFiniteVector(b)
  ) {
    throw new Error(
      `CAIMENT: landmarks insuficientes entre "${first}" e "${second}".`,
    );
  }

  return a
    .clone()
    .add(b)
    .multiplyScalar(0.5);
}

export function calculateLandmarkOffset(
  landmarks: AvatarLandmarkMap,
  source: AvatarLandmarkName,
  target: AvatarLandmarkName,
): THREE.Vector3 {
  const a = landmarks[source];
  const b = landmarks[target];

  if (
    !isFiniteVector(a) ||
    !isFiniteVector(b)
  ) {
    throw new Error(
      `CAIMENT: landmarks insuficientes entre "${source}" e "${target}".`,
    );
  }

  return b.clone().sub(a);
}

// ============================================================
// CENTRO DA GEOMETRIA
// ============================================================

export function getGarmentGeometryCenter(
  geometry: THREE.BufferGeometry,
): THREE.Vector3 {
  if (!geometry?.getAttribute('position')) {
    throw new Error(
      'CAIMENT: geometria inválida para calcular o centro.',
    );
  }

  geometry.computeBoundingBox();

  if (!geometry.boundingBox) {
    throw new Error(
      'CAIMENT: não foi possível calcular os limites da roupa.',
    );
  }

  return geometry.boundingBox.getCenter(
    new THREE.Vector3(),
  );
}

// ============================================================
// EXPORTAÇÃO PADRÃO
// ============================================================

export default positionGarmentOnAvatar;
