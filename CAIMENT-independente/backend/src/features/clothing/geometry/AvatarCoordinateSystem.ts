
import * as THREE from 'three';

export type AvatarAxis = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

export type AvatarLengthUnit =
  | 'meters'
  | 'centimeters'
  | 'millimeters';

export interface AvatarCoordinateSystemDefinition {
  unit: AvatarLengthUnit;
  up: AvatarAxis;
  right: AvatarAxis;
  forward: AvatarAxis;
  origin: 'avatar_floor_center' | 'avatar_center' | 'model_origin';
  targetHeight?: number;
}

export interface AvatarCoordinateSystemOptions {
  definition?: Partial<AvatarCoordinateSystemDefinition>;
  targetHeight?: number;
  centerHorizontally?: boolean;
  placeOnGround?: boolean;
}

export interface AvatarCoordinateSystemResult {
  group: THREE.Group;
  transformation: THREE.Matrix4;
  bounds: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  unitScale: number;
  modelScale: number;
  definition: AvatarCoordinateSystemDefinition;
}

export interface AvatarCoordinateValidation {
  valid: boolean;
  errors: string[];
}

const DEFAULT_DEFINITION: AvatarCoordinateSystemDefinition = {
  unit: 'meters',
  up: '+Y',
  right: '+X',
  forward: '+Z',
  origin: 'avatar_floor_center',
};

const AXIS_VECTORS: Record<AvatarAxis, THREE.Vector3> = {
  '+X': new THREE.Vector3(1, 0, 0),
  '-X': new THREE.Vector3(-1, 0, 0),
  '+Y': new THREE.Vector3(0, 1, 0),
  '-Y': new THREE.Vector3(0, -1, 0),
  '+Z': new THREE.Vector3(0, 0, 1),
  '-Z': new THREE.Vector3(0, 0, -1),
};

const UNIT_TO_METERS: Record<AvatarLengthUnit, number> = {
  meters: 1,
  centimeters: 0.01,
  millimeters: 0.001,
};

function isFiniteVector(value: THREE.Vector3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function cloneDefinition(
  definition?: Partial<AvatarCoordinateSystemDefinition>,
): AvatarCoordinateSystemDefinition {
  return {
    ...DEFAULT_DEFINITION,
    ...definition,
  };
}

export function validateAvatarCoordinateSystem(
  definition: AvatarCoordinateSystemDefinition,
): AvatarCoordinateValidation {
  const errors: string[] = [];

  if (!definition) {
    return {
      valid: false,
      errors: ['CAIMENT: sistema de coordenadas não informado.'],
    };
  }

  if (!(definition.unit in UNIT_TO_METERS)) {
    errors.push('CAIMENT: unidade de comprimento não suportada.');
  }

  const axes = [
    definition.up,
    definition.right,
    definition.forward,
  ];

  if (axes.some((axis) => !axis || !(axis in AXIS_VECTORS))) {
    errors.push('CAIMENT: um ou mais eixos são inválidos.');
  } else {
    const up = AXIS_VECTORS[definition.up];
    const right = AXIS_VECTORS[definition.right];
    const forward = AXIS_VECTORS[definition.forward];

    if (
      Math.abs(up.dot(right)) > 1e-6 ||
      Math.abs(up.dot(forward)) > 1e-6 ||
      Math.abs(right.dot(forward)) > 1e-6
    ) {
      errors.push(
        'CAIMENT: os eixos up, right e forward precisam ser ortogonais.',
      );
    }

    const handedness = new THREE.Vector3()
      .crossVectors(right, up)
      .dot(forward);

    if (Math.abs(handedness - 1) > 1e-6) {
      errors.push(
        'CAIMENT: os eixos precisam formar um sistema destro válido.',
      );
    }
  }

  if (
    ![
      'avatar_floor_center',
      'avatar_center',
      'model_origin',
    ].includes(definition.origin)
  ) {
    errors.push('CAIMENT: origem espacial não suportada.');
  }

  if (
    definition.targetHeight !== undefined &&
    (
      !Number.isFinite(definition.targetHeight) ||
      definition.targetHeight <= 0
    )
  ) {
    errors.push('CAIMENT: altura de destino inválida.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getUnitScale(unit: AvatarLengthUnit): number {
  const scale = UNIT_TO_METERS[unit];

  if (!Number.isFinite(scale)) {
    throw new Error(`CAIMENT: unidade "${unit}" não suportada.`);
  }

  return scale;
}

export function convertToMeters(
  value: number,
  unit: AvatarLengthUnit,
): number {
  if (!Number.isFinite(value)) {
    throw new Error('CAIMENT: medida inválida.');
  }

  return value * getUnitScale(unit);
}

export function convertFromMeters(
  value: number,
  unit: AvatarLengthUnit,
): number {
  if (!Number.isFinite(value)) {
    throw new Error('CAIMENT: medida inválida.');
  }

  return value / getUnitScale(unit);
}

export function getAvatarAxes(
  definition: AvatarCoordinateSystemDefinition = DEFAULT_DEFINITION,
): {
  up: THREE.Vector3;
  right: THREE.Vector3;
  forward: THREE.Vector3;
} {
  const validation = validateAvatarCoordinateSystem(definition);

  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }

  return {
    up: AXIS_VECTORS[definition.up].clone(),
    right: AXIS_VECTORS[definition.right].clone(),
    forward: AXIS_VECTORS[definition.forward].clone(),
  };
}

/**
 * Converte coordenadas da base de origem para:
 * X = largura, Y = altura, Z = profundidade.
 *
 * Os vetores recebidos representam as direções dos eixos
 * padronizados expressas no sistema de origem.
 * A transposta da base realiza a conversão correta.
 */
export function createCoordinateConversionMatrix(
  definition: AvatarCoordinateSystemDefinition = DEFAULT_DEFINITION,
): THREE.Matrix4 {
  const axes = getAvatarAxes(definition);

  const sourceBasis = new THREE.Matrix4().makeBasis(
    axes.right,
    axes.up,
    axes.forward,
  );

  return sourceBasis.transpose();
}

export function convertPointToAvatarSpace(
  point: THREE.Vector3,
  definition: AvatarCoordinateSystemDefinition = DEFAULT_DEFINITION,
): THREE.Vector3 {
  if (!isFiniteVector(point)) {
    throw new Error('CAIMENT: ponto de coordenadas inválido.');
  }

  return point
    .clone()
    .applyMatrix4(createCoordinateConversionMatrix(definition))
    .multiplyScalar(getUnitScale(definition.unit));
}

export function convertDirectionToAvatarSpace(
  direction: THREE.Vector3,
  definition: AvatarCoordinateSystemDefinition = DEFAULT_DEFINITION,
): THREE.Vector3 {
  if (!isFiniteVector(direction)) {
    throw new Error('CAIMENT: vetor direcional inválido.');
  }

  const converted = direction
    .clone()
    .applyMatrix3(
      new THREE.Matrix3().setFromMatrix4(
        createCoordinateConversionMatrix(definition),
      ),
    );

  if (converted.lengthSq() > 0) {
    converted.normalize();
  }

  return converted;
}

export function calculateAvatarBounds(
  object: THREE.Object3D,
): THREE.Box3 {
  if (!object) {
    throw new Error('CAIMENT: modelo do avatar não informado.');
  }

  object.updateWorldMatrix(true, true);

  const bounds = new THREE.Box3().setFromObject(object);

  if (
    bounds.isEmpty() ||
    !isFiniteVector(bounds.min) ||
    !isFiniteVector(bounds.max)
  ) {
    throw new Error('CAIMENT: limites do avatar inválidos.');
  }

  return bounds;
}

export function normalizeAvatarCoordinateSystem(
  source: THREE.Object3D,
  options: AvatarCoordinateSystemOptions = {},
): AvatarCoordinateSystemResult {
  if (!source) {
    throw new Error('CAIMENT: modelo Tripo não informado.');
  }

  const definition = cloneDefinition(options.definition);

  if (options.targetHeight !== undefined) {
    definition.targetHeight = options.targetHeight;
  }

  const validation = validateAvatarCoordinateSystem(definition);

  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }

  // Captura a transformação mundial antes de clonar.
  source.updateWorldMatrix(true, true);

  const model = source.clone(true);

  model.name = source.name || 'TripoAvatar';

  // Incorpora a transformação mundial do objeto recebido.
  source.matrixWorld.decompose(
    model.position,
    model.quaternion,
    model.scale,
  );

  model.updateMatrix();

  const wrapper = new THREE.Group();
  wrapper.name = 'CAIMENT_NormalizedAvatar';
  wrapper.add(model);

  const unitScale = getUnitScale(definition.unit);
  const conversion = createCoordinateConversionMatrix(definition);

  const unitAndAxisMatrix = new THREE.Matrix4()
    .makeScale(unitScale, unitScale, unitScale)
    .multiply(conversion);

  model.applyMatrix4(unitAndAxisMatrix);
  model.updateMatrixWorld(true);

  let bounds = calculateAvatarBounds(model);
  const originalHeight = bounds.max.y - bounds.min.y;

  if (!Number.isFinite(originalHeight) || originalHeight <= 1e-8) {
    throw new Error('CAIMENT: altura geométrica do avatar inválida.');
  }

  let modelScale = 1;

  if (definition.targetHeight !== undefined) {
    modelScale = definition.targetHeight / originalHeight;

    model.scale.multiplyScalar(modelScale);
    model.updateMatrixWorld(true);

    bounds = calculateAvatarBounds(model);
  }

  const centerHorizontally =
    options.centerHorizontally ??
    definition.origin !== 'model_origin';

  const placeOnGround =
    options.placeOnGround ??
    definition.origin === 'avatar_floor_center';

  const translation = new THREE.Vector3();

  if (definition.origin === 'avatar_center') {
    translation.copy(
      bounds.getCenter(new THREE.Vector3()).negate(),
    );
  } else {
    if (centerHorizontally) {
      translation.x = -(bounds.min.x + bounds.max.x) / 2;
      translation.z = -(bounds.min.z + bounds.max.z) / 2;
    }

    if (placeOnGround) {
      translation.y = -bounds.min.y;
    }
  }

  model.position.add(translation);
  model.updateMatrixWorld(true);

  bounds = calculateAvatarBounds(model);

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  if (
    !isFiniteVector(size) ||
    !isFiniteVector(center) ||
    size.x <= 0 ||
    size.y <= 0 ||
    size.z <= 0
  ) {
    throw new Error('CAIMENT: dimensões finais do avatar inválidas.');
  }

  const scaleMatrix = new THREE.Matrix4().makeScale(
    modelScale,
    modelScale,
    modelScale,
  );

  const translationMatrix = new THREE.Matrix4()
    .makeTranslation(
      translation.x,
      translation.y,
      translation.z,
    );

  // Transformação de normalização, sem substituir as
  // transformações originais internas da hierarquia.
  const transformation = translationMatrix
    .multiply(scaleMatrix)
    .multiply(unitAndAxisMatrix);

  const normalizedDefinition: AvatarCoordinateSystemDefinition = {
    ...definition,
    unit: 'meters',
    up: '+Y',
    right: '+X',
    forward: '+Z',
  };

  wrapper.userData.coordinateSystem = normalizedDefinition;
  wrapper.userData.normalized = true;
  wrapper.userData.avatarBounds = bounds.clone();
  wrapper.userData.avatarSize = size.clone();

  return {
    group: wrapper,
    transformation,
    bounds,
    size,
    center,
    unitScale,
    modelScale,
    definition: normalizedDefinition,
  };
}

export function isAvatarCoordinateSystemNormalized(
  object: THREE.Object3D,
): boolean {
  const definition = object?.userData?.coordinateSystem;

  return (
    object?.userData?.normalized === true &&
    definition?.unit === 'meters' &&
    definition?.up === '+Y' &&
    definition?.right === '+X' &&
    definition?.forward === '+Z'
  );
}

export const DEFAULT_AVATAR_COORDINATE_SYSTEM =
  Object.freeze({ ...DEFAULT_DEFINITION });

export default normalizeAvatarCoordinateSystem;
