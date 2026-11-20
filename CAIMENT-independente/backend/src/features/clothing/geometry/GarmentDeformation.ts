
import * as THREE from 'three';

import type {
  BodyLandmark,
  BodyLandmarks,
  BodyRegion,
  GarmentFitDefinition,
  GarmentRegionDefinition,
  GarmentSupportDefinition,
} from './types';

export interface GarmentDeformationOptions {
  /** 0 = geometria original; 1 = resultado completo. */
  strength?: number;

  /** Raio máximo de influência das âncoras, em metros. */
  influenceRadius?: number;

  /** Escala uniforme calculada pela altura real do usuário. */
  uniformScale?: number;

  /**
   * Retorna a posição corrigida na superfície corporal.
   * A deformação utiliza somente X e Z dessa posição.
   */
  bodyCollision?: {
    resolve(position: THREE.Vector3): THREE.Vector3 | null;
  };

  /** Mantidos por compatibilidade. */
  minScale?: number;
  maxScale?: number;
}

export interface GarmentDeformationResult {
  geometry: THREE.BufferGeometry;
  deformedVertexCount: number;
  maximumDisplacement: number;
  averageDisplacement: number;
  scale: THREE.Vector3;
  translation: THREE.Vector3;
}

interface Control {
  id: string;
  source: THREE.Vector3;
  influencePosition: THREE.Vector3;
  target: THREE.Vector3;
  weight: number;
  residual: THREE.Vector3;
  landmark: BodyLandmark;
  bodyRegion: BodyRegion;
}

interface RegionVertexMap {
  id: string;
  bodyRegion: BodyRegion;
  role: GarmentRegionDefinition['role'];
  support?: GarmentSupportDefinition;
  vertices: Set<number>;
}

const EPSILON = 1e-8;
const MIN_INFLUENCE = 1e-7;

const LANDMARK_REGIONS: Record<BodyLandmark, BodyRegion> = {
  bodyCenter: 'chest',
  neckBase: 'neck',
  shoulderCenter: 'shoulders',
  leftShoulder: 'shoulders',
  rightShoulder: 'shoulders',
  bustCenter: 'chest',
  waistCenter: 'waist',
  hipCenter: 'pelvis',
  leftHip: 'pelvis',
  rightHip: 'pelvis',
  crotchCenter: 'pelvis',
  leftKnee: 'leftLeg',
  rightKnee: 'rightLeg',
  leftAnkle: 'leftFoot',
  rightAnkle: 'rightFoot',
  leftElbow: 'leftArm',
  rightElbow: 'rightArm',
  leftWrist: 'leftForearm',
  rightWrist: 'rightForearm',
};

// ============================================================
// VALIDAÇÕES
// ============================================================

function isFiniteVector(
  value: THREE.Vector3 | undefined | null,
): value is THREE.Vector3 {
  return Boolean(
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z),
  );
}

function validateGeometry(
  geometry: THREE.BufferGeometry,
): void {
  if (
    !geometry ||
    !(geometry instanceof THREE.BufferGeometry)
  ) {
    throw new Error('CAIMENT: geometria da roupa inválida.');
  }

  const position = geometry.getAttribute('position');

  if (
    !position ||
    position.itemSize !== 3 ||
    position.count < 3
  ) {
    throw new Error('CAIMENT: geometria sem vértices válidos.');
  }

  for (let i = 0; i < position.count; i++) {
    if (
      !Number.isFinite(position.getX(i)) ||
      !Number.isFinite(position.getY(i)) ||
      !Number.isFinite(position.getZ(i))
    ) {
      throw new Error(
        `CAIMENT: vértice ${i} possui coordenadas inválidas.`,
      );
    }
  }

  const index = geometry.getIndex();

  if (index) {
    for (let i = 0; i < index.count; i++) {
      const vertexIndex = index.getX(i);

      if (
        !Number.isInteger(vertexIndex) ||
        vertexIndex < 0 ||
        vertexIndex >= position.count
      ) {
        throw new Error(
          `CAIMENT: índice de geometria inválido na posição ${i}.`,
        );
      }
    }
  }
}

function validate(
  geometry: THREE.BufferGeometry,
  fit: GarmentFitDefinition,
  landmarks: BodyLandmarks,
  options: GarmentDeformationOptions,
): void {
  validateGeometry(geometry);

  if (
    !fit ||
    !Array.isArray(fit.anchors) ||
    fit.anchors.length === 0
  ) {
    throw new Error('CAIMENT: peça sem âncoras anatômicas.');
  }

  if (
    !Number.isFinite(fit.clearance) ||
    fit.clearance < 0
  ) {
    throw new Error('CAIMENT: folga da roupa inválida.');
  }

  if (
    !landmarks ||
    !isFiniteVector(landmarks.bodyCenter)
  ) {
    throw new Error(
      'CAIMENT: centro corporal inválido ou ausente.',
    );
  }

  const position = geometry.getAttribute('position');
  const anchorIds = new Set<string>();

  for (const anchor of fit.anchors) {
    if (
      !anchor ||
      typeof anchor.id !== 'string' ||
      !anchor.id.trim()
    ) {
      throw new Error('CAIMENT: âncora sem identificador válido.');
    }

    if (anchorIds.has(anchor.id)) {
      throw new Error(
        `CAIMENT: identificador de âncora duplicado "${anchor.id}".`,
      );
    }

    anchorIds.add(anchor.id);

    if (!isFiniteVector(anchor.garmentPosition)) {
      throw new Error(
        `CAIMENT: posição inválida na âncora "${anchor.id}".`,
      );
    }

    if (!isFiniteVector(landmarks[anchor.bodyLandmark])) {
      throw new Error(
        `CAIMENT: landmark "${anchor.bodyLandmark}" ausente ou inválido.`,
      );
    }

    if (
      anchor.weight !== undefined &&
      (
        !Number.isFinite(anchor.weight) ||
        anchor.weight < 0
      )
    ) {
      throw new Error(
        `CAIMENT: peso inválido na âncora "${anchor.id}".`,
      );
    }
  }

  if (
    options.uniformScale !== undefined &&
    (
      !Number.isFinite(options.uniformScale) ||
      options.uniformScale <= 0
    )
  ) {
    throw new Error('CAIMENT: escala uniforme inválida.');
  }

  if (
    options.minScale !== undefined &&
    (
      !Number.isFinite(options.minScale) ||
      options.minScale <= 0
    )
  ) {
    throw new Error('CAIMENT: minScale inválido.');
  }

  if (
    options.maxScale !== undefined &&
    (
      !Number.isFinite(options.maxScale) ||
      options.maxScale <= 0
    )
  ) {
    throw new Error('CAIMENT: maxScale inválido.');
  }

  if (
    options.minScale !== undefined &&
    options.maxScale !== undefined &&
    options.minScale > options.maxScale
  ) {
    throw new Error(
      'CAIMENT: minScale não pode ser maior que maxScale.',
    );
  }

  if (
    options.strength !== undefined &&
    (
      !Number.isFinite(options.strength) ||
      options.strength < 0 ||
      options.strength > 1
    )
  ) {
    throw new Error(
      'CAIMENT: intensidade da deformação deve estar entre 0 e 1.',
    );
  }

  if (
    options.influenceRadius !== undefined &&
    (
      !Number.isFinite(options.influenceRadius) ||
      options.influenceRadius <= 0
    )
  ) {
    throw new Error('CAIMENT: raio de influência inválido.');
  }

  if (fit.regions) {
    const regionIds = new Set<string>();

    for (const region of fit.regions) {
      if (
        !region?.id ||
        !Array.isArray(region.vertexIndices) ||
        regionIds.has(region.id)
      ) {
        throw new Error(
          'CAIMENT: definição de região da roupa inválida ou duplicada.',
        );
      }

      regionIds.add(region.id);

      for (const vertexIndex of region.vertexIndices) {
        if (
          !Number.isInteger(vertexIndex) ||
          vertexIndex < 0 ||
          vertexIndex >= position.count
        ) {
          throw new Error(
            `CAIMENT: índice de vértice inválido na região "${region.id}".`,
          );
        }
      }
    }
  }

  if (fit.supports) {
    const regionIds = new Set(
      (fit.regions ?? []).map((region) => region.id),
    );

    const supportIds = new Set<string>();

    for (const support of fit.supports) {
      if (
        !support?.id ||
        supportIds.has(support.id) ||
        !regionIds.has(support.garmentRegionId) ||
        !Number.isFinite(support.strength) ||
        support.strength < 0 ||
        support.strength > 1
      ) {
        throw new Error(
          `CAIMENT: suporte da roupa "${support?.id ?? 'desconhecido'}" inválido.`,
        );
      }

      supportIds.add(support.id);
    }
  }
}

// ============================================================
// DIREÇÃO EXTERNA
// ============================================================

function calculateOutwardDirection(
  bodyPoint: THREE.Vector3,
  bodyCenter: THREE.Vector3,
  garmentPosition: THREE.Vector3,
): THREE.Vector3 {
  const direction = bodyPoint.clone().sub(bodyCenter);

  if (direction.lengthSq() <= EPSILON) {
    direction.copy(garmentPosition).sub(bodyCenter);
  }

  if (direction.lengthSq() <= EPSILON) {
    return new THREE.Vector3();
  }

  return direction.normalize();
}

// ============================================================
// REGIÕES E SUPORTES
// ============================================================

function createRegionVertexMaps(
  fit: GarmentFitDefinition,
): RegionVertexMap[] {
  if (!fit.regions?.length) {
    return [];
  }

  return fit.regions.map((region) => ({
    id: region.id,
    bodyRegion: region.bodyRegion,
    role: region.role,
    support: fit.supports?.find(
      (support) => support.garmentRegionId === region.id,
    ),
    vertices: new Set(region.vertexIndices),
  }));
}

function getVertexRegion(
  vertexIndex: number,
  regions: RegionVertexMap[],
): RegionVertexMap | null {
  // Regiões de contato têm prioridade sobre regiões genéricas.
  let fallback: RegionVertexMap | null = null;

  for (const region of regions) {
    if (!region.vertices.has(vertexIndex)) {
      continue;
    }

    if (canResolveCollision(region)) {
      return region;
    }

    fallback ??= region;
  }

  return fallback;
}

function canFollowBody(region: RegionVertexMap): boolean {
  if (region.support?.mode === 'hang') {
    return false;
  }

  return (
    region.role === 'contact' ||
    region.support?.mode === 'contact' ||
    region.support?.mode === 'wrap'
  );
}

function canResolveCollision(region: RegionVertexMap): boolean {
  if (region.support?.mode === 'hang') {
    return false;
  }

  return (
    region.role === 'contact' ||
    region.support?.mode === 'contact' ||
    region.support?.mode === 'wrap'
  );
}

function getRegionInfluenceStrength(
  region: RegionVertexMap,
): number {
  return region.support?.strength ?? 1;
}

// ============================================================
// DISTÂNCIA HORIZONTAL
// ============================================================

function calculateHorizontalDistanceSquared(
  a: THREE.Vector3,
  b: THREE.Vector3,
): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;

  return dx * dx + dz * dz;
}

// ============================================================
// TRANSFORMAÇÃO GLOBAL
// ============================================================

function calculateTransform(
  controls: Control[],
  uniformScale: number,
): {
  scale: THREE.Vector3;
  translation: THREE.Vector3;
} {
  const scale = new THREE.Vector3(
    uniformScale,
    uniformScale,
    uniformScale,
  );

  const translation = new THREE.Vector3();
  let totalWeight = 0;

  for (const control of controls) {
    if (control.weight <= 0) continue;

    const scaledSource = control.source
      .clone()
      .multiplyScalar(uniformScale);

    const offset = control.target.clone().sub(scaledSource);

    translation.addScaledVector(offset, control.weight);
    totalWeight += control.weight;
  }

  if (totalWeight <= EPSILON) {
    throw new Error(
      'CAIMENT: não existem pesos válidos para posicionar a roupa.',
    );
  }

  translation.divideScalar(totalWeight);

  return { scale, translation };
}

// ============================================================
// CONTROLES ANATÔMICOS
// ============================================================

function createControls(
  fit: GarmentFitDefinition,
  landmarks: BodyLandmarks,
): Control[] {
  const controls: Control[] = [];

  for (const anchor of fit.anchors) {
    const bodyPoint = landmarks[anchor.bodyLandmark];
    const weight = anchor.weight ?? 1;

    if (weight <= 0) continue;

    const direction = calculateOutwardDirection(
      bodyPoint,
      landmarks.bodyCenter,
      anchor.garmentPosition,
    );

    const target = bodyPoint
      .clone()
      .addScaledVector(direction, fit.clearance);

    controls.push({
      id: anchor.id,
      source: anchor.garmentPosition.clone(),
      influencePosition: anchor.garmentPosition.clone(),
      target,
      weight,
      residual: new THREE.Vector3(),
      landmark: anchor.bodyLandmark,
      bodyRegion: LANDMARK_REGIONS[anchor.bodyLandmark],
    });
  }

  if (controls.length === 0) {
    throw new Error(
      'CAIMENT: nenhuma âncora possui peso positivo.',
    );
  }

  return controls;
}

// ============================================================
// INFLUÊNCIA LOCAL
// ============================================================

function calculateSpatialInfluence(
  distanceSquared: number,
  radiusSquared: number,
): number {
  if (
    distanceSquared >= radiusSquared ||
    radiusSquared <= EPSILON
  ) {
    return 0;
  }

  const normalizedDistance = Math.sqrt(
    Math.max(0, distanceSquared / radiusSquared),
  );

  const remaining = 1 - normalizedDistance;

  const smoothFalloff =
    remaining * remaining * (3 - 2 * remaining);

  const gaussian = Math.exp(
    -4 * distanceSquared / radiusSquared,
  );

  return smoothFalloff * gaussian;
}

function calculateVertexResidual(
  position: THREE.Vector3,
  controls: Control[],
  region: RegionVertexMap | null,
  radiusSquared: number,
): THREE.Vector3 {
  const residual = new THREE.Vector3();

  if (!region || !canFollowBody(region)) {
    return residual;
  }

  let influenceSum = 0;

  for (const control of controls) {
    if (control.bodyRegion !== region.bodyRegion) {
      continue;
    }

    const distanceSquared =
      calculateHorizontalDistanceSquared(
        position,
        control.influencePosition,
      );

    const spatialInfluence = calculateSpatialInfluence(
      distanceSquared,
      radiusSquared,
    );

    if (spatialInfluence <= MIN_INFLUENCE) {
      continue;
    }

    const influence = spatialInfluence * control.weight;

    residual.addScaledVector(control.residual, influence);
    influenceSum += influence;
  }

  if (influenceSum > EPSILON) {
    residual.divideScalar(influenceSum);

    residual.multiplyScalar(
      getRegionInfluenceStrength(region),
    );

    // A deformação local não altera o comprimento vertical.
    residual.y = 0;
  }

  return residual;
}

// ============================================================
// COLISÃO
// ============================================================

function resolveHorizontalCollision(
  candidate: THREE.Vector3,
  resolver: GarmentDeformationOptions['bodyCollision'],
): THREE.Vector3 | null {
  if (!resolver) {
    return null;
  }

  const projected = resolver.resolve(candidate.clone());

  if (projected === null) {
    return null;
  }

  if (!isFiniteVector(projected)) {
    throw new Error(
      'CAIMENT: resolvedor de colisão retornou posição inválida.',
    );
  }

  const dx = projected.x - candidate.x;
  const dz = projected.z - candidate.z;

  if (dx * dx + dz * dz <= EPSILON) {
    return null;
  }

  return new THREE.Vector3(
    projected.x,
    candidate.y,
    projected.z,
  );
}

// ============================================================
// DEFORMAÇÃO PRINCIPAL
// ============================================================

export function applyGarmentDeformation(
  sourceGeometry: THREE.BufferGeometry,
  fit: GarmentFitDefinition,
  landmarks: BodyLandmarks,
  options: GarmentDeformationOptions = {},
): GarmentDeformationResult {
  validate(sourceGeometry, fit, landmarks, options);

  const strength = options.strength ?? 1;
  const requestedScale = options.uniformScale ?? 1;

  const uniformScale = THREE.MathUtils.clamp(
    requestedScale,
    options.minScale ?? 0.000001,
    options.maxScale ?? Number.MAX_VALUE,
  );

  const sourcePosition = sourceGeometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute;

  const sourceBounds = new THREE.Box3()
    .setFromBufferAttribute(sourcePosition);

  const diagonal = sourceBounds
    .getSize(new THREE.Vector3())
    .length();

  const radius =
    options.influenceRadius ??
    Math.max(diagonal * 0.25, 0.025);

  const radiusSquared = radius * radius;

  const geometry = sourceGeometry.clone();

  const position = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute;

  const regions = createRegionVertexMaps(fit);
  const controls = createControls(fit, landmarks);

  const transform = calculateTransform(
    controls,
    uniformScale,
  );

  // Converte os controles para o referencial final da roupa.
  for (const control of controls) {
    control.influencePosition
      .copy(control.source)
      .multiply(transform.scale)
      .add(transform.translation);

    control.residual
      .copy(control.target)
      .sub(control.influencePosition);
  }

  const original = new THREE.Vector3();
  const transformed = new THREE.Vector3();
  const residual = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  const finalPosition = new THREE.Vector3();

  let maximumDisplacement = 0;
  let totalDisplacement = 0;
  let deformedVertexCount = 0;
  let collisionApplied = false;
  let locallyDeformedVertexCount = 0;

  for (let index = 0; index < position.count; index++) {
    original.fromBufferAttribute(position, index);

    // 1. Escala e posicionamento global.
    transformed
      .copy(original)
      .multiply(transform.scale)
      .add(transform.translation);

    const vertexRegion = getVertexRegion(index, regions);

    // 2. Ajuste localizado somente nas regiões de contato.
    residual.copy(
      calculateVertexResidual(
        transformed,
        controls,
        vertexRegion,
        radiusSquared,
      ),
    );

    if (residual.lengthSq() > EPSILON) {
      locallyDeformedVertexCount++;
    }

    candidate.copy(transformed).add(residual);

    // 3. Correção de colisão somente em regiões de contato.
    if (
      strength > 0 &&
      options.bodyCollision &&
      vertexRegion &&
      canResolveCollision(vertexRegion)
    ) {
      const projected = resolveHorizontalCollision(
        candidate,
        options.bodyCollision,
      );

      if (projected !== null) {
        collisionApplied = true;
        candidate.copy(projected);
      }
    }

    // 4. Intensidade final.
    finalPosition
      .copy(original)
      .lerp(candidate, strength);

    const displacement = finalPosition.distanceTo(original);

    if (displacement > EPSILON) {
      deformedVertexCount++;
    }

    maximumDisplacement = Math.max(
      maximumDisplacement,
      displacement,
    );

    totalDisplacement += displacement;

    position.setXYZ(
      index,
      finalPosition.x,
      finalPosition.y,
      finalPosition.z,
    );
  }

  position.needsUpdate = true;

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  geometry.userData.garmentDeformationApplied = true;

  geometry.userData.garmentDeformation = {
    controlPointCount: controls.length,
    strength,
    influenceRadius: radius,
    uniformScale,
    scale: transform.scale.toArray(),
    translation: transform.translation.toArray(),
    collisionApplied,
    regionalInfluenceApplied:
      locallyDeformedVertexCount > 0,
    localizedInfluence: true,
    deformationAxes: ['x', 'z'],
    preservedVerticalModeling: true,
    collisionAxes: ['x', 'z'],
    locallyDeformedVertexCount,
    contactRegions: regions.filter(canResolveCollision).length,
    bodyFollowingRegions: regions.filter(canFollowBody).length,
    preservedHangRegions: regions.filter(
      (region) => region.support?.mode === 'hang',
    ).length,
    supportCount: fit.supports?.length ?? 0,
  };

  return {
    geometry,
    deformedVertexCount,
    maximumDisplacement,
    averageDisplacement:
      totalDisplacement / Math.max(position.count, 1),
    scale: transform.scale.clone(),
    translation: transform.translation.clone(),
  };
}

export default applyGarmentDeformation;
