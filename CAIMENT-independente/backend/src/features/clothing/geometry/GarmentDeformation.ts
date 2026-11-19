
import * as THREE from 'three';

import type {
  BodyLandmark,
  BodyLandmarks,
  BodyRegion,
  GarmentFitDefinition,
} from './types';

export interface GarmentDeformationOptions {
  /**
   * Intensidade total da deformação.
   * 0 = geometria original.
   * 1 = deformação integral calculada.
   */
  strength?: number;

  /**
   * Raio máximo de influência das âncoras, em metros.
   */
  influenceRadius?: number;

  /**
   * Escala uniforme calculada pela altura real do usuário.
   *
   * Exemplo:
   * avatar normalizado = 3.4 m
   * usuário = 1.70 m
   * escala = 3.4 / 1.70 = 2
   *
   * Não altera as proporções da roupa.
   */
  uniformScale?: number;

  /**
   * Corrige a posição de um ponto para afastá-lo
   * da superfície corporal.
   *
   * Deve receber e devolver coordenadas no mesmo
   * referencial da geometria.
   */
  bodyCollision?: {
    resolve(position: THREE.Vector3): THREE.Vector3 | null;
  };

  /**
   * Mantidos por compatibilidade com chamadas antigas.
   * Não são utilizados para calcular escala por eixo.
   */
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
  bodyRegion: BodyRegion;
  vertices: Set<number>;
}

const EPSILON = 1e-8;
const MIN_INFLUENCE = 1e-7;

/**
 * Associação entre landmarks e regiões corporais.
 */
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
    throw new Error(
      'CAIMENT: geometria da roupa inválida.',
    );
  }

  const position = geometry.getAttribute('position');

  if (
    !position ||
    position.itemSize !== 3 ||
    position.count < 3
  ) {
    throw new Error(
      'CAIMENT: geometria sem vértices válidos.',
    );
  }

  for (let index = 0; index < position.count; index++) {
    if (
      !Number.isFinite(position.getX(index)) ||
      !Number.isFinite(position.getY(index)) ||
      !Number.isFinite(position.getZ(index))
    ) {
      throw new Error(
        `CAIMENT: vértice ${index} possui coordenadas inválidas.`,
      );
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
    throw new Error(
      'CAIMENT: peça sem âncoras anatômicas.',
    );
  }

  if (
    !Number.isFinite(fit.clearance) ||
    fit.clearance < 0
  ) {
    throw new Error(
      'CAIMENT: folga da roupa inválida.',
    );
  }

  if (!landmarks || !isFiniteVector(landmarks.bodyCenter)) {
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
      throw new Error(
        'CAIMENT: âncora sem identificador válido.',
      );
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

    const bodyPoint = landmarks[anchor.bodyLandmark];

    if (!isFiniteVector(bodyPoint)) {
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
    throw new Error(
      'CAIMENT: escala uniforme inválida.',
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
    throw new Error(
      'CAIMENT: raio de influência inválido.',
    );
  }

  if (fit.regions) {
    for (const region of fit.regions) {
      if (
        !region?.id ||
        !Array.isArray(region.vertexIndices)
      ) {
        throw new Error(
          'CAIMENT: definição de região da roupa inválida.',
        );
      }

      for (const index of region.vertexIndices) {
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= position.count
        ) {
          throw new Error(
            `CAIMENT: índice de vértice inválido na região "${region.id}".`,
          );
        }
      }
    }
  }
}

// ============================================================
// DIREÇÃO EXTERNA
// ============================================================

/**
 * Estima uma direção externa a partir do centro corporal.
 *
 * O resolvedor de colisão pode fornecer uma correção
 * mais precisa da superfície corporal.
 */
function calculateOutwardDirection(
  bodyPoint: THREE.Vector3,
  bodyCenter: THREE.Vector3,
  garmentPosition: THREE.Vector3,
): THREE.Vector3 {
  const direction = bodyPoint
    .clone()
    .sub(bodyCenter);

  if (direction.lengthSq() <= EPSILON) {
    direction
      .copy(garmentPosition)
      .sub(bodyCenter);
  }

  if (direction.lengthSq() <= EPSILON) {
    return new THREE.Vector3();
  }

  return direction.normalize();
}

// ============================================================
// REGIÕES DA GEOMETRIA
// ============================================================

function createRegionVertexMaps(
  fit: GarmentFitDefinition,
): RegionVertexMap[] {
  if (!fit.regions?.length) {
    return [];
  }

  return fit.regions.map((region) => ({
    bodyRegion: region.bodyRegion,
    vertices: new Set(region.vertexIndices),
  }));
}

function getVertexBodyRegion(
  vertexIndex: number,
  regions: RegionVertexMap[],
): BodyRegion | null {
  for (const region of regions) {
    if (region.vertices.has(vertexIndex)) {
      return region.bodyRegion;
    }
  }

  return null;
}

// ============================================================
// TRANSFORMAÇÃO UNIFORME
// ============================================================

/**
 * Calcula a translação global ponderada pelas âncoras.
 *
 * A escala permanece uniforme nos três eixos.
 */
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
    if (control.weight <= 0) {
      continue;
    }

    const scaledSource = control.source
      .clone()
      .multiplyScalar(uniformScale);

    const offset = control.target
      .clone()
      .sub(scaledSource);

    translation.addScaledVector(
      offset,
      control.weight,
    );

    totalWeight += control.weight;
  }

  if (totalWeight <= EPSILON) {
    throw new Error(
      'CAIMENT: não existem pesos válidos para calcular o posicionamento.',
    );
  }

  translation.divideScalar(totalWeight);

  return {
    scale,
    translation,
  };
}

// ============================================================
// CONTROLES DA DEFORMAÇÃO
// ============================================================

function createControls(
  fit: GarmentFitDefinition,
  landmarks: BodyLandmarks,
  bodyCollision: GarmentDeformationOptions['bodyCollision'],
): Control[] {
  const controls: Control[] = [];

  for (const anchor of fit.anchors) {
    const bodyPoint = landmarks[anchor.bodyLandmark];
    const weight = anchor.weight ?? 1;

    if (weight <= 0) {
      continue;
    }

    const direction = calculateOutwardDirection(
      bodyPoint,
      landmarks.bodyCenter,
      anchor.garmentPosition,
    );

    const target = bodyPoint
      .clone()
      .addScaledVector(
        direction,
        fit.clearance,
      );

    if (bodyCollision) {
      const projected = bodyCollision.resolve(
        target.clone(),
      );

      if (projected !== null) {
        if (!isFiniteVector(projected)) {
          throw new Error(
            `CAIMENT: resolvedor de colisão retornou posição inválida para a âncora "${anchor.id}".`,
          );
        }

        target.copy(projected);
      }
    }

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
      'CAIMENT: nenhuma âncora possui peso positivo para deformação.',
    );
  }

  return controls;
}

// ============================================================
// INFLUÊNCIA LOCAL
// ============================================================

/**
 * Peso espacial com suporte limitado.
 *
 * Diferentemente da gaussiana anterior, a influência
 * desaparece completamente fora do raio definido.
 *
 * Isso evita que uma âncora altere partes distantes
 * da roupa.
 */
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

  // Transição suave até o limite do raio.
  const smoothFalloff =
    remaining * remaining *
    (3 - 2 * remaining);

  // Maior influência nas proximidades da âncora.
  const gaussian =
    Math.exp(-4 * distanceSquared / radiusSquared);

  return smoothFalloff * gaussian;
}

/**
 * Calcula o deslocamento local de um vértice.
 *
 * Prioriza controles da região correspondente.
 * Quando não existem controles regionais, utiliza
 * os controles disponíveis, respeitando o raio espacial.
 */
function calculateVertexResidual(
  position: THREE.Vector3,
  controls: Control[],
  region: BodyRegion | null,
  radiusSquared: number,
): THREE.Vector3 {
  const matchingControls = region
    ? controls.filter(
        (control) => control.bodyRegion === region,
      )
    : [];

  const activeControls =
    matchingControls.length > 0
      ? matchingControls
      : controls;

  const residual = new THREE.Vector3();

  let influenceSum = 0;

  for (const control of activeControls) {
    const distanceSquared =
      position.distanceToSquared(
        control.influencePosition,
      );

    const spatialInfluence = calculateSpatialInfluence(
      distanceSquared,
      radiusSquared,
    );

    if (spatialInfluence <= MIN_INFLUENCE) {
      continue;
    }

    const influence =
      spatialInfluence * control.weight;

    residual.addScaledVector(
      control.residual,
      influence,
    );

    influenceSum += influence;
  }

  if (influenceSum > EPSILON) {
    residual.divideScalar(influenceSum);
  }

  return residual;
}

// ============================================================
// DEFORMAÇÃO PRINCIPAL
// ============================================================

/**
 * Deforma a geometria da roupa em relação aos landmarks
 * do avatar.
 *
 * A geometria original não é modificada.
 *
 * A escala uniforme preserva as proporções da peça.
 * A translação posiciona a roupa pelas âncoras.
 * A deformação local distribui os deslocamentos.
 *
 * A intensidade controla o resultado completo:
 * 0 = geometria original.
 * 1 = geometria posicionada e deformada.
 */
export function applyGarmentDeformation(
  sourceGeometry: THREE.BufferGeometry,
  fit: GarmentFitDefinition,
  landmarks: BodyLandmarks,
  options: GarmentDeformationOptions = {},
): GarmentDeformationResult {
  validate(
    sourceGeometry,
    fit,
    landmarks,
    options,
  );

  const strength = options.strength ?? 1;
  const uniformScale = options.uniformScale ?? 1;

  const sourcePosition =
    sourceGeometry.getAttribute('position');

  const sourceBounds = new THREE.Box3()
    .setFromBufferAttribute(
      sourcePosition as THREE.BufferAttribute,
    );

  const diagonal = sourceBounds
    .getSize(new THREE.Vector3())
    .length();

  const radius = options.influenceRadius ??
    Math.max(diagonal * 0.34, 0.025);

  if (
    !Number.isFinite(radius) ||
    radius <= 0
  ) {
    throw new Error(
      'CAIMENT: raio de influência inválido.',
    );
  }

  const radiusSquared = radius * radius;

  const geometry = sourceGeometry.clone();

  const position = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute;

  const regions = createRegionVertexMaps(fit);

  const controls = createControls(
    fit,
    landmarks,
    options.bodyCollision,
  );

  const transform = calculateTransform(
    controls,
    uniformScale,
  );

  // Coloca os controles no mesmo referencial da geometria.
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

  for (let index = 0; index < position.count; index++) {
    original.fromBufferAttribute(
      position,
      index,
    );

    // Transformação uniforme e posicionamento global.
    transformed
      .copy(original)
      .multiply(transform.scale)
      .add(transform.translation);

    const vertexRegion = getVertexBodyRegion(
      index,
      regions,
    );

    residual.copy(
      calculateVertexResidual(
        transformed,
        controls,
        vertexRegion,
        radiusSquared,
      ),
    );

    // Posição candidata com deformação local.
    candidate
      .copy(transformed)
      .add(residual);

    // Colisão aplicada à posição candidata.
    if (options.bodyCollision && strength > 0) {
      const projected = options.bodyCollision.resolve(
        candidate.clone(),
      );

      if (projected !== null) {
        if (!isFiniteVector(projected)) {
          throw new Error(
            `CAIMENT: resolvedor de colisão retornou posição inválida no vértice ${index}.`,
          );
        }

        candidate.copy(projected);
      }
    }

    /*
     * Mistura a geometria original com o resultado.
     *
     * Assim, strength = 0 preserva exatamente a geometria
     * original, inclusive sem aplicar escala ou translação.
     */
    finalPosition
      .copy(original)
      .lerp(candidate, strength);

    const displacement =
      finalPosition.distanceTo(original);

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
    collisionApplied: Boolean(options.bodyCollision),
    regionalInfluenceApplied: regions.length > 0,
    localizedInfluence: true,
  };

  return {
    geometry,
    deformedVertexCount,
    maximumDisplacement,

    averageDisplacement:
      totalDisplacement /
      Math.max(position.count, 1),

    scale: transform.scale.clone(),
    translation: transform.translation.clone(),
  };
}

export default applyGarmentDeformation;
