
import * as THREE from 'three';

import type {
  BodyLandmark,
  BodyLandmarks,
} from './types';

import {
  isAvatarCoordinateSystemNormalized,
} from './AvatarCoordinateSystem';

export type AvatarLandmarkName = BodyLandmark;

export type AvatarLandmarkMap =
  Partial<Record<AvatarLandmarkName, THREE.Vector3>>;

export interface AvatarBodyMeasurements {
  alturaTotal?: number;
  comprimentoInternoPernas?: number;
  comprimentoCinturaOmbros?: number;
  larguraOmbros?: number;

  busto?: number;
  cintura?: number;
  quadril?: number;

  comprimentoBraco?: number;
  comprimentoAntebraco?: number;
  comprimentoPes?: number;

  larguraBusto?: number;
  larguraCintura?: number;
  larguraQuadril?: number;
}

export interface AvatarLandmarkOptions {
  measurements?: AvatarBodyMeasurements;
  suppliedLandmarks?: AvatarLandmarkMap;
  tolerance?: number;
  inferSymmetry?: boolean;
}

export interface AvatarLandmarkExtractionResult {
  landmarks: AvatarLandmarkMap;
  available: AvatarLandmarkName[];
  missing: AvatarLandmarkName[];
  inferred: AvatarLandmarkName[];
  sources: Partial<Record<AvatarLandmarkName, string>>;
  bounds: THREE.Box3;
}

export interface AvatarLandmarkValidation {
  valid: boolean;
  errors: string[];
  missing: AvatarLandmarkName[];
}

interface HorizontalSection {
  y: number;
  minX: number;
  maxX: number;
  centerX: number;
  centerZ: number;
  frontZ: number;
  backZ: number;
  pointCount: number;
}

const ALL_LANDMARKS: AvatarLandmarkName[] = [
  'bodyCenter',
  'neckBase',
  'shoulderCenter',
  'leftShoulder',
  'rightShoulder',
  'bustCenter',
  'waistCenter',
  'hipCenter',
  'leftHip',
  'rightHip',
  'crotchCenter',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
];

const SYMMETRIC_PAIRS: Array<{
  left: AvatarLandmarkName;
  right: AvatarLandmarkName;
  center: AvatarLandmarkName;
}> = [
  {
    left: 'leftShoulder',
    right: 'rightShoulder',
    center: 'shoulderCenter',
  },
  {
    left: 'leftHip',
    right: 'rightHip',
    center: 'hipCenter',
  },
  {
    left: 'leftKnee',
    right: 'rightKnee',
    center: 'bodyCenter',
  },
  {
    left: 'leftAnkle',
    right: 'rightAnkle',
    center: 'bodyCenter',
  },
  {
    left: 'leftElbow',
    right: 'rightElbow',
    center: 'shoulderCenter',
  },
  {
    left: 'leftWrist',
    right: 'rightWrist',
    center: 'shoulderCenter',
  },
];

function isFiniteVector(
  value: THREE.Vector3 | undefined,
): value is THREE.Vector3 {
  return Boolean(
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z),
  );
}

function cloneLandmarkMap(
  source?: AvatarLandmarkMap,
): AvatarLandmarkMap {
  const result: AvatarLandmarkMap = {};

  if (!source) {
    return result;
  }

  for (const name of ALL_LANDMARKS) {
    const point = source[name];

    if (isFiniteVector(point)) {
      result[name] = point.clone();
    }
  }

  return result;
}

function validateMeasurements(
  measurements?: AvatarBodyMeasurements,
): string[] {
  const errors: string[] = [];

  if (!measurements) {
    return errors;
  }

  for (const [name, value] of Object.entries(measurements)) {
    if (
      value !== undefined &&
      (!Number.isFinite(value) || value <= 0)
    ) {
      errors.push(
        `CAIMENT: medida "${name}" precisa ser positiva e expressa em metros.`,
      );
    }
  }

  return errors;
}

function collectBounds(avatar: THREE.Object3D): THREE.Box3 {
  avatar.updateWorldMatrix(true, true);

  const bounds = new THREE.Box3().setFromObject(avatar);

  if (
    bounds.isEmpty() ||
    !isFiniteVector(bounds.min) ||
    !isFiniteVector(bounds.max)
  ) {
    throw new Error(
      'CAIMENT: não foi possível calcular os limites do avatar.',
    );
  }

  return bounds;
}

function getCenter(
  first: THREE.Vector3,
  second: THREE.Vector3,
): THREE.Vector3 {
  return first.clone().add(second).multiplyScalar(0.5);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) * 0.5;
  }

  return sorted[middle];
}

/**
 * Calcula a interseção de uma aresta com um plano horizontal.
 */
function intersectHorizontalPlane(
  a: THREE.Vector3,
  b: THREE.Vector3,
  y: number,
  tolerance: number,
): THREE.Vector3 | null {
  const deltaY = b.y - a.y;

  if (Math.abs(deltaY) <= tolerance) {
    return null;
  }

  const t = (y - a.y) / deltaY;

  if (t < -tolerance || t > 1 + tolerance) {
    return null;
  }

  return new THREE.Vector3(
    a.x + (b.x - a.x) * t,
    y,
    a.z + (b.z - a.z) * t,
  );
}

/**
 * Obtém os pontos de interseção entre os triângulos da malha
 * e um plano horizontal no espaço mundial do avatar.
 *
 * A posição dos vértices considera transformações, morph targets
 * e deformações de malhas que implementam getVertexPosition.
 */
function collectHorizontalSection(
  avatar: THREE.Object3D,
  y: number,
  tolerance: number,
): HorizontalSection | null {
  const intersections: THREE.Vector3[] = [];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  const edgePairs = [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const;

  avatar.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (
      !mesh.isMesh ||
      !mesh.visible ||
      !mesh.geometry
    ) {
      return;
    }

    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');

    if (!position || position.count < 3) {
      return;
    }

    const index = geometry.index;
    const triangleCount = index
      ? Math.floor(index.count / 3)
      : Math.floor(position.count / 3);

    const getIndex = (vertexIndex: number): number => {
      return index
        ? index.getX(vertexIndex)
        : vertexIndex;
    };

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const offset = triangle * 3;

      const ia = getIndex(offset);
      const ib = getIndex(offset + 1);
      const ic = getIndex(offset + 2);

      mesh.getVertexPosition(ia, a);
      mesh.getVertexPosition(ib, b);
      mesh.getVertexPosition(ic, c);

      a.applyMatrix4(mesh.matrixWorld);
      b.applyMatrix4(mesh.matrixWorld);
      c.applyMatrix4(mesh.matrixWorld);

      const vertices = [a, b, c];
      const triangleIntersections: THREE.Vector3[] = [];

      for (const [first, second] of edgePairs) {
        const point = intersectHorizontalPlane(
          vertices[first],
          vertices[second],
          y,
          tolerance,
        );

        if (point) {
          triangleIntersections.push(point);
        }
      }

      for (const point of triangleIntersections) {
        const duplicate = intersections.some(
          (existing) =>
            existing.distanceToSquared(point) <=
            tolerance * tolerance,
        );

        if (!duplicate) {
          intersections.push(point);
        }
      }
    }
  });

  if (intersections.length < 2) {
    return null;
  }

  const xs = intersections.map((point) => point.x);
  const zs = intersections.map((point) => point.z);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    maxX - minX <= tolerance
  ) {
    return null;
  }

  return {
    y,
    minX,
    maxX,
    centerX: (minX + maxX) * 0.5,
    centerZ: median(zs),
    frontZ: Math.max(...zs),
    backZ: Math.min(...zs),
    pointCount: intersections.length,
  };
}

/**
 * Procura uma seção horizontal próxima da altura desejada.
 * A busca evita perder landmarks quando o plano inicial passa
 * exatamente entre triângulos da malha.
 */
function findHorizontalSection(
  avatar: THREE.Object3D,
  desiredY: number,
  bounds: THREE.Box3,
  tolerance: number,
): HorizontalSection | null {
  const height = bounds.max.y - bounds.min.y;

  if (height <= 0) {
    return null;
  }

  const maxSearchDistance = height * 0.025;
  const step = Math.max(height * 0.002, tolerance * 2);

  const candidates: number[] = [desiredY];

  for (
    let distance = step;
    distance <= maxSearchDistance;
    distance += step
  ) {
    candidates.push(desiredY - distance);
    candidates.push(desiredY + distance);
  }

  candidates.sort(
    (a, b) =>
      Math.abs(a - desiredY) - Math.abs(b - desiredY),
  );

  for (const candidateY of candidates) {
    if (
      candidateY <= bounds.min.y ||
      candidateY >= bounds.max.y
    ) {
      continue;
    }

    const section = collectHorizontalSection(
      avatar,
      candidateY,
      tolerance,
    );

    if (section) {
      return section;
    }
  }

  return null;
}

function createSectionCenter(
  section: HorizontalSection,
): THREE.Vector3 {
  return new THREE.Vector3(
    section.centerX,
    section.y,
    section.centerZ,
  );
}

function createSectionSides(
  section: HorizontalSection,
): {
  left: THREE.Vector3;
  right: THREE.Vector3;
} {
  return {
    left: new THREE.Vector3(
      section.minX,
      section.y,
      section.centerZ,
    ),
    right: new THREE.Vector3(
      section.maxX,
      section.y,
      section.centerZ,
    ),
  };
}

function setSectionLandmark(
  avatar: THREE.Object3D,
  bounds: THREE.Box3,
  landmarks: AvatarLandmarkMap,
  sources: Partial<Record<AvatarLandmarkName, string>>,
  name: AvatarLandmarkName,
  heightRatio: number,
  tolerance: number,
): HorizontalSection | null {
  const height = bounds.max.y - bounds.min.y;
  const desiredY = bounds.min.y + height * heightRatio;

  const section = findHorizontalSection(
    avatar,
    desiredY,
    bounds,
    tolerance,
  );

  if (!section) {
    return null;
  }

  landmarks[name] = createSectionCenter(section);
  sources[name] = 'geometry_horizontal_section_estimate';

  return section;
}

function extractGeometryLandmarks(
  avatar: THREE.Object3D,
  bounds: THREE.Box3,
  tolerance: number,
  landmarks: AvatarLandmarkMap,
  sources: Partial<Record<AvatarLandmarkName, string>>,
  measurements?: AvatarBodyMeasurements,
): void {
  const height = bounds.max.y - bounds.min.y;

  if (height <= 0) {
    return;
  }

  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const centerZ = (bounds.min.z + bounds.max.z) * 0.5;

  if (!landmarks.bodyCenter) {
    landmarks.bodyCenter = new THREE.Vector3(
      centerX,
      (bounds.min.y + bounds.max.y) * 0.5,
      centerZ,
    );

    sources.bodyCenter = 'geometry_bounds_center';
  }

  /*
   * As medidas longitudinais são usadas apenas para posicionar
   * os planos de busca quando estão disponíveis.
   *
   * Os valores recebidos por esta interface devem estar em metros.
   */
  const validHeight =
    measurements?.alturaTotal &&
    measurements.alturaTotal > 0
      ? measurements.alturaTotal
      : undefined;

  const normalizedRatio = (value: number): number => {
    return THREE.MathUtils.clamp(value, 0.02, 0.98);
  };

  const shoulderRatio =
    validHeight && measurements?.comprimentoCinturaOmbros
      ? normalizedRatio(
          1 -
          measurements.comprimentoCinturaOmbros /
            validHeight,
        )
      : 0.79;

  const crotchRatio =
    validHeight && measurements?.comprimentoInternoPernas
      ? normalizedRatio(
          measurements.comprimentoInternoPernas /
            validHeight,
        )
      : 0.40;

  const shoulderSection = setSectionLandmark(
    avatar,
    bounds,
    landmarks,
    sources,
    'shoulderCenter',
    shoulderRatio,
    tolerance,
  );

  if (shoulderSection) {
    const sides = createSectionSides(shoulderSection);

    if (!landmarks.leftShoulder) {
      landmarks.leftShoulder = sides.left;
      sources.leftShoulder =
        'geometry_horizontal_section_estimate';
    }

    if (!landmarks.rightShoulder) {
      landmarks.rightShoulder = sides.right;
      sources.rightShoulder =
        'geometry_horizontal_section_estimate';
    }
  }

  const neckSection = setSectionLandmark(
    avatar,
    bounds,
    landmarks,
    sources,
    'neckBase',
    Math.min(shoulderRatio + 0.055, 0.94),
    tolerance,
  );

  if (neckSection && !landmarks.neckBase) {
    landmarks.neckBase = createSectionCenter(neckSection);
  }

  const bustSection = setSectionLandmark(
    avatar,
    bounds,
    landmarks,
    sources,
    'bustCenter',
    0.68,
    tolerance,
  );

  const waistSection = setSectionLandmark(
    avatar,
    bounds,
    landmarks,
    sources,
    'waistCenter',
    0.56,
    tolerance,
  );

  const hipSection = setSectionLandmark(
    avatar,
    bounds,
    landmarks,
    sources,
    'hipCenter',
    Math.max(crotchRatio + 0.055, 0.46),
    tolerance,
  );

  if (hipSection) {
    const sides = createSectionSides(hipSection);

    if (!landmarks.leftHip) {
      landmarks.leftHip = sides.left;
      sources.leftHip =
        'geometry_horizontal_section_estimate';
    }

    if (!landmarks.rightHip) {
      landmarks.rightHip = sides.right;
      sources.rightHip =
        'geometry_horizontal_section_estimate';
    }
  }

  const crotchSection = setSectionLandmark(
    avatar,
    bounds,
    landmarks,
    sources,
    'crotchCenter',
    crotchRatio,
    tolerance,
  );

  const kneeSection = setSectionLandmark(
    avatar,
    bounds,
    landmarks,
    sources,
    'leftKnee',
    0.25,
    tolerance,
  );

  if (kneeSection) {
    const sides = createSectionSides(kneeSection);

    landmarks.leftKnee = sides.left;
    landmarks.rightKnee = sides.right;

    sources.leftKnee =
      'geometry_horizontal_section_estimate';
    sources.rightKnee =
      'geometry_horizontal_section_estimate';
  }

  const ankleSection = setSectionLandmark(
    avatar,
    bounds,
    landmarks,
    sources,
    'leftAnkle',
    0.045,
    tolerance,
  );

  if (ankleSection) {
    const sides = createSectionSides(ankleSection);

    landmarks.leftAnkle = sides.left;
    landmarks.rightAnkle = sides.right;

    sources.leftAnkle =
      'geometry_horizontal_section_estimate';
    sources.rightAnkle =
      'geometry_horizontal_section_estimate';
  }

  /*
   * Cotovelos e punhos são estimados pelas seções laterais.
   * A malha pode não permitir distingui-los do tronco ou das mãos.
   * Por isso, só são preenchidos quando a seção existe.
   */
  const elbowSection = findHorizontalSection(
    avatar,
    bounds.min.y + height * 0.62,
    bounds,
    tolerance,
  );

  if (elbowSection) {
    const sides = createSectionSides(elbowSection);

    landmarks.leftElbow ??= sides.left;
    landmarks.rightElbow ??= sides.right;

    sources.leftElbow ??=
      'geometry_horizontal_section_estimate';
    sources.rightElbow ??=
      'geometry_horizontal_section_estimate';
  }

  const wristSection = findHorizontalSection(
    avatar,
    bounds.min.y + height * 0.49,
    bounds,
    tolerance,
  );

  if (wristSection) {
    const sides = createSectionSides(wristSection);

    landmarks.leftWrist ??= sides.left;
    landmarks.rightWrist ??= sides.right;

    sources.leftWrist ??=
      'geometry_horizontal_section_estimate';
    sources.rightWrist ??=
      'geometry_horizontal_section_estimate';
  }

  /*
   * As referências centrais são mantidas apenas quando a seção
   * correspondente foi encontrada na geometria.
   */
  if (bustSection && !landmarks.bustCenter) {
    landmarks.bustCenter = createSectionCenter(bustSection);
  }

  if (waistSection && !landmarks.waistCenter) {
    landmarks.waistCenter = createSectionCenter(waistSection);
  }

  if (crotchSection && !landmarks.crotchCenter) {
    landmarks.crotchCenter = createSectionCenter(crotchSection);
  }
}

function inferBilateralCenters(
  landmarks: AvatarLandmarkMap,
  sources: Partial<Record<AvatarLandmarkName, string>>,
): void {
  for (const pair of SYMMETRIC_PAIRS) {
    const left = landmarks[pair.left];
    const right = landmarks[pair.right];

    if (
      left &&
      right &&
      !landmarks[pair.center]
    ) {
      landmarks[pair.center] = getCenter(left, right);
      sources[pair.center] = 'derived_bilateral_center';
    }
  }

  if (
    !landmarks.bodyCenter &&
    landmarks.shoulderCenter &&
    landmarks.hipCenter
  ) {
    landmarks.bodyCenter = getCenter(
      landmarks.shoulderCenter,
      landmarks.hipCenter,
    );

    sources.bodyCenter =
      'derived_between_shoulders_and_hips';
  }
}

function inferMissingSide(
  landmarks: AvatarLandmarkMap,
  sources: Partial<Record<AvatarLandmarkName, string>>,
  leftName: AvatarLandmarkName,
  rightName: AvatarLandmarkName,
  centerName: AvatarLandmarkName,
): void {
  const left = landmarks[leftName];
  const right = landmarks[rightName];
  const center = landmarks[centerName];

  if (!center) {
    return;
  }

  if (left && !right) {
    const inferred = left.clone();

    inferred.x = center.x - (left.x - center.x);

    landmarks[rightName] = inferred;
    sources[rightName] = 'symmetry_estimate';
  } else if (right && !left) {
    const inferred = right.clone();

    inferred.x = center.x - (right.x - center.x);

    landmarks[leftName] = inferred;
    sources[leftName] = 'symmetry_estimate';
  }
}

function applySymmetry(
  landmarks: AvatarLandmarkMap,
  sources: Partial<Record<AvatarLandmarkName, string>>,
): void {
  for (const [left, right, center] of [
    ['leftShoulder', 'rightShoulder', 'shoulderCenter'],
    ['leftHip', 'rightHip', 'hipCenter'],
    ['leftKnee', 'rightKnee', 'bodyCenter'],
    ['leftAnkle', 'rightAnkle', 'bodyCenter'],
    ['leftElbow', 'rightElbow', 'shoulderCenter'],
    ['leftWrist', 'rightWrist', 'shoulderCenter'],
  ] as const) {
    inferMissingSide(
      landmarks,
      sources,
      left,
      right,
      center,
    );
  }
}

function validateLandmarkPositions(
  landmarks: AvatarLandmarkMap,
): AvatarLandmarkValidation {
  const errors: string[] = [];

  const missing = ALL_LANDMARKS.filter(
    (name) => !isFiniteVector(landmarks[name]),
  );

  for (const [name, point] of Object.entries(landmarks)) {
    if (!isFiniteVector(point)) {
      errors.push(
        `CAIMENT: landmark "${name}" possui coordenadas inválidas.`,
      );
    }
  }

  return {
    valid: errors.length === 0 && missing.length === 0,
    errors,
    missing,
  };
}

/**
 * Extrai landmarks da geometria do avatar já normalizado.
 *
 * Os pontos geométricos são estimativas obtidas por seções
 * horizontais da malha. Eles não equivalem a joints de um
 * esqueleto rigado nem a medições anatômicas clínicas.
 *
 * Landmarks externos fornecidos em suppliedLandmarks têm
 * prioridade sobre as estimativas geométricas.
 *
 * Coordenadas: espaço mundial do avatar, em metros.
 */
export function extractAvatarLandmarks(
  avatar: THREE.Object3D,
  options: AvatarLandmarkOptions = {},
): AvatarLandmarkExtractionResult {
  if (!avatar) {
    throw new Error('CAIMENT: avatar não informado.');
  }

  if (!isAvatarCoordinateSystemNormalized(avatar)) {
    throw new Error(
      'CAIMENT: normalize o avatar antes de extrair seus landmarks.',
    );
  }

  const measurementErrors = validateMeasurements(
    options.measurements,
  );

  if (measurementErrors.length > 0) {
    throw new Error(measurementErrors.join('\n'));
  }

  if (
    options.tolerance !== undefined &&
    (
      !Number.isFinite(options.tolerance) ||
      options.tolerance <= 0
    )
  ) {
    throw new Error(
      'CAIMENT: tolerância de extração inválida.',
    );
  }

  const bounds = collectBounds(avatar);
  const landmarks = cloneLandmarkMap(
    options.suppliedLandmarks,
  );

  const sources: Partial<
    Record<AvatarLandmarkName, string>
  > = {};

  for (const name of ALL_LANDMARKS) {
    if (landmarks[name]) {
      sources[name] = 'supplied';
    }
  }

  const tolerance =
    options.tolerance ??
    Math.max(
      (bounds.max.y - bounds.min.y) * 0.0005,
      0.0001,
    );

  extractGeometryLandmarks(
    avatar,
    bounds,
    tolerance,
    landmarks,
    sources,
    options.measurements,
  );

  /*
   * Reaplica os landmarks fornecidos para garantir que eles
   * nunca sejam substituídos por uma estimativa geométrica.
   */
  const supplied = cloneLandmarkMap(
    options.suppliedLandmarks,
  );

  for (const name of ALL_LANDMARKS) {
    if (supplied[name]) {
      landmarks[name] = supplied[name]!.clone();
      sources[name] = 'supplied';
    }
  }

  inferBilateralCenters(landmarks, sources);

  if (options.inferSymmetry ?? false) {
    applySymmetry(landmarks, sources);
    inferBilateralCenters(landmarks, sources);
  }

  const available = ALL_LANDMARKS.filter(
    (name) => isFiniteVector(landmarks[name]),
  );

  const missing = ALL_LANDMARKS.filter(
    (name) => !isFiniteVector(landmarks[name]),
  );

  const inferred = ALL_LANDMARKS.filter(
    (name) => {
      const source = sources[name];

      return (
        source === 'symmetry_estimate' ||
        source === 'derived_bilateral_center' ||
        source === 'derived_between_shoulders_and_hips'
      );
    },
  );

  return {
    landmarks,
    available,
    missing,
    inferred,
    sources,
    bounds,
  };
}

export function validateRequiredAvatarLandmarks(
  landmarks: AvatarLandmarkMap,
  required: AvatarLandmarkName[],
): AvatarLandmarkValidation {
  const errors: string[] = [];
  const missing: AvatarLandmarkName[] = [];

  for (const name of required) {
    if (!isFiniteVector(landmarks?.[name])) {
      missing.push(name);

      errors.push(
        `CAIMENT: landmark obrigatório "${name}" não foi fornecido.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    missing,
  };
}

export function toCompleteBodyLandmarks(
  landmarks: AvatarLandmarkMap,
): BodyLandmarks {
  const validation = validateLandmarkPositions(landmarks);

  if (!validation.valid) {
    throw new Error(
      [
        'CAIMENT: não é possível converter landmarks incompletos.',
        ...validation.errors,
        `Landmarks ausentes: ${validation.missing.join(', ')}.`,
      ].join('\n'),
    );
  }

  const result = {} as BodyLandmarks;

  for (const name of ALL_LANDMARKS) {
    result[name] = landmarks[name]!.clone();
  }

  return result;
}

export function getAvatarLandmarkDistance(
  landmarks: AvatarLandmarkMap,
  first: AvatarLandmarkName,
  second: AvatarLandmarkName,
): number {
  const a = landmarks[first];
  const b = landmarks[second];

  if (!isFiniteVector(a) || !isFiniteVector(b)) {
    throw new Error(
      `CAIMENT: referências insuficientes entre "${first}" e "${second}".`,
    );
  }

  return a.distanceTo(b);
}

export function getAvatarLandmarkCenter(
  landmarks: AvatarLandmarkMap,
  first: AvatarLandmarkName,
  second: AvatarLandmarkName,
): THREE.Vector3 {
  const a = landmarks[first];
  const b = landmarks[second];

  if (!isFiniteVector(a) || !isFiniteVector(b)) {
    throw new Error(
      `CAIMENT: referências insuficientes entre "${first}" e "${second}".`,
    );
  }

  return getCenter(a, b);
}

export function cloneAvatarLandmarks(
  landmarks: AvatarLandmarkMap,
): AvatarLandmarkMap {
  return cloneLandmarkMap(landmarks);
}

export const AVATAR_LANDMARK_NAMES =
  Object.freeze([...ALL_LANDMARKS]);

export default extractAvatarLandmarks;
