
import * as THREE from 'three';

import type {
  BodyLandmark,
  BodyLandmarks,
} from './types';

export interface GarmentAvatarAlignmentResult {
  landmarks: BodyLandmarks;
  translation: THREE.Vector3;
  avatarCenter: THREE.Vector3;
  avatarSize: THREE.Vector3;
}

function validateLandmarks(landmarks: BodyLandmarks): void {
  if (!landmarks?.bodyCenter) {
    throw new Error(
      'CAIMENT: centro corporal não encontrado.',
    );
  }

  if (!landmarks.leftAnkle || !landmarks.rightAnkle) {
    throw new Error(
      'CAIMENT: landmarks dos tornozelos não encontrados.',
    );
  }

  for (const key of Object.keys(landmarks) as BodyLandmark[]) {
    const point = landmarks[key];

    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    ) {
      throw new Error(
        `CAIMENT: landmark "${key}" inválido.`,
      );
    }
  }
}

function validateAvatarBox(avatarBox: THREE.Box3): void {
  if (!avatarBox || avatarBox.isEmpty()) {
    throw new Error(
      'CAIMENT: Box3 do avatar está vazio.',
    );
  }

  const size = avatarBox.getSize(new THREE.Vector3());

  if (
    !Number.isFinite(size.x) ||
    !Number.isFinite(size.y) ||
    !Number.isFinite(size.z) ||
    size.x <= 0 ||
    size.y <= 0 ||
    size.z <= 0
  ) {
    throw new Error(
      'CAIMENT: dimensões inválidas no Box3 do avatar.',
    );
  }
}

/**
 * Alinha as referências corporais ao Box3 do avatar.
 *
 * As referências já devem estar na escala do avatar.
 *
 * Esta função não altera a escala dos landmarks.
 * Ela corrige somente a posição do corpo no espaço do Tripo:
 *
 * X: centraliza o corpo no avatar.
 * Y: posiciona os tornozelos no nível do chão.
 * Z: centraliza a profundidade do corpo no avatar.
 */
export function alignLandmarksToAvatar(
  landmarks: BodyLandmarks,
  avatarBox: THREE.Box3,
): GarmentAvatarAlignmentResult {
  validateLandmarks(landmarks);
  validateAvatarBox(avatarBox);

  const avatarSize = avatarBox.getSize(
    new THREE.Vector3(),
  );

  const avatarCenter = avatarBox.getCenter(
    new THREE.Vector3(),
  );

  // Centro entre os dois tornozelos.
  const ankleCenter = landmarks.leftAnkle
    .clone()
    .add(landmarks.rightAnkle)
    .multiplyScalar(0.5);

  // Translação necessária para encaixar o corpo no avatar.
  const translation = new THREE.Vector3(
    avatarCenter.x - landmarks.bodyCenter.x,
    avatarBox.min.y - ankleCenter.y,
    avatarCenter.z - landmarks.bodyCenter.z,
  );

  // Clona todos os landmarks para não modificar os originais.
  const aligned = {} as BodyLandmarks;

  for (const key of Object.keys(landmarks) as BodyLandmark[]) {
    aligned[key] = landmarks[key]
      .clone()
      .add(translation);
  }

  return {
    landmarks: aligned,
    translation,
    avatarCenter,
    avatarSize,
  };
}

/**
 * Aplica o mesmo alinhamento a um grupo de roupa.
 *
 * Use somente quando o grupo ainda estiver no espaço
 * original CAIMENT e não tiver recebido essa translação.
 *
 * Não aplicar novamente se a geometria já tiver sido
 * transformada pelo GarmentDeformation.
 */
export function alignGarmentGroupToAvatar(
  garment: THREE.Object3D,
  translation: THREE.Vector3,
): void {
  if (!garment) {
    throw new Error(
      'CAIMENT: grupo de roupa não fornecido.',
    );
  }

  if (
    !Number.isFinite(translation.x) ||
    !Number.isFinite(translation.y) ||
    !Number.isFinite(translation.z)
  ) {
    throw new Error(
      'CAIMENT: translação de alinhamento inválida.',
    );
  }

  garment.position.add(translation);
  garment.updateMatrixWorld(true);
}
