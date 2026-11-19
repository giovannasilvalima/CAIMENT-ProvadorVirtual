
import * as THREE from 'three';

import type {
  BodyLandmark,
  BodyLandmarks,
} from './types';

export type PoseView = 'front' | 'back' | 'left' | 'right';

export interface MediaPipeWorldLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface MediaPipeAdapterOptions {
  view: PoseView;
  avatarHeight: number;
  minVisibility?: number;
}

const INDEX = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/**
 * Margem estimada entre o nariz e o topo da cabeça.
 * Não representa uma medição anatômica.
 */
const HEAD_HEIGHT_FACTOR = 0.12;

function midpoint(
  a: THREE.Vector3,
  b: THREE.Vector3,
): THREE.Vector3 {
  return a.clone().add(b).multiplyScalar(0.5);
}

function interpolate(
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  return a.clone().lerp(b, t);
}

function readLandmark(
  landmarks: MediaPipeWorldLandmark[],
  index: number,
  minVisibility: number,
): THREE.Vector3 {
  const point = landmarks[index];

  if (
    !point ||
    ![point.x, point.y, point.z].every(Number.isFinite) ||
    (point.visibility ?? 1) < minVisibility
  ) {
    throw new Error(
      `CAIMENT: landmark MediaPipe ${index} ausente ou com baixa visibilidade.`,
    );
  }

  return new THREE.Vector3(
    point.x,
    point.y,
    point.z,
  );
}

/**
 * Converte uma pose individual para o sistema de coordenadas CAIMENT.
 *
 * Sistema CAIMENT:
 * X = largura
 * Y = altura
 * Z = profundidade
 * Frente = +Z
 *
 * avatarHeight corresponde à altura total do avatar em metros.
 *
 * IMPORTANTE:
 * Cada fotografia possui seu próprio referencial.
 * Esta função normaliza os eixos de cada vista, mas não substitui
 * a calibração e a combinação das quatro fotografias.
 *
 * Nas vistas laterais:
 * - X da imagem representa principalmente profundidade corporal.
 * - Z do MediaPipe representa principalmente a largura corporal.
 */
export function createBodyLandmarksFromMediaPipe(
  worldLandmarks: MediaPipeWorldLandmark[],
  options: MediaPipeAdapterOptions,
): BodyLandmarks {
  const { view, avatarHeight } = options;

  const minVisibility = THREE.MathUtils.clamp(
    options.minVisibility ?? 0.35,
    0,
    1,
  );

  if (
    !Number.isFinite(avatarHeight) ||
    avatarHeight <= 0
  ) {
    throw new Error(
      'CAIMENT: altura do avatar inválida.',
    );
  }

  if (
    !worldLandmarks ||
    worldLandmarks.length <= INDEX.rightAnkle
  ) {
    throw new Error(
      'CAIMENT: conjunto de landmarks MediaPipe incompleto.',
    );
  }

  const raw = {
    nose: readLandmark(
      worldLandmarks,
      INDEX.nose,
      minVisibility,
    ),

    leftShoulder: readLandmark(
      worldLandmarks,
      INDEX.leftShoulder,
      minVisibility,
    ),

    rightShoulder: readLandmark(
      worldLandmarks,
      INDEX.rightShoulder,
      minVisibility,
    ),

    leftElbow: readLandmark(
      worldLandmarks,
      INDEX.leftElbow,
      minVisibility,
    ),

    rightElbow: readLandmark(
      worldLandmarks,
      INDEX.rightElbow,
      minVisibility,
    ),

    leftWrist: readLandmark(
      worldLandmarks,
      INDEX.leftWrist,
      minVisibility,
    ),

    rightWrist: readLandmark(
      worldLandmarks,
      INDEX.rightWrist,
      minVisibility,
    ),

    leftHip: readLandmark(
      worldLandmarks,
      INDEX.leftHip,
      minVisibility,
    ),

    rightHip: readLandmark(
      worldLandmarks,
      INDEX.rightHip,
      minVisibility,
    ),

    leftKnee: readLandmark(
      worldLandmarks,
      INDEX.leftKnee,
      minVisibility,
    ),

    rightKnee: readLandmark(
      worldLandmarks,
      INDEX.rightKnee,
      minVisibility,
    ),

    leftAnkle: readLandmark(
      worldLandmarks,
      INDEX.leftAnkle,
      minVisibility,
    ),

    rightAnkle: readLandmark(
      worldLandmarks,
      INDEX.rightAnkle,
      minVisibility,
    ),
  };

  const hipCenterRaw = midpoint(
    raw.leftHip,
    raw.rightHip,
  );

  const ankleCenterRaw = midpoint(
    raw.leftAnkle,
    raw.rightAnkle,
  );

  const measuredHeight = Math.abs(
    raw.nose.y - ankleCenterRaw.y,
  );

  if (
    !Number.isFinite(measuredHeight) ||
    measuredHeight < 0.1
  ) {
    throw new Error(
      'CAIMENT: não foi possível estimar a altura da pose.',
    );
  }

  /**
   * O nariz não representa o topo da cabeça.
   * A margem adicional é uma estimativa usada somente para escala.
   */
  const estimatedTotalHeight =
    measuredHeight * (1 + HEAD_HEIGHT_FACTOR);

  const scale = avatarHeight / estimatedTotalHeight;

  /**
   * Determina a orientação horizontal dos ombros.
   * Isso evita inverter a largura nas vistas frontal e traseira.
   */
  const horizontalSign =
    Math.sign(
      raw.rightShoulder.x - raw.leftShoulder.x,
    ) || 1;

  /**
   * Determina para qual lado da imagem está voltada a frente
   * do corpo nas fotografias laterais.
   */
  const sideFrontSign =
    Math.sign(
      raw.nose.x - hipCenterRaw.x,
    ) || 1;

  /**
   * Normaliza os pontos para:
   * X = largura
   * Y = altura
   * Z = profundidade
   */
  const toCaiment = (
    point: THREE.Vector3,
  ): THREE.Vector3 => {
    const relative = point.clone().sub(hipCenterRaw);

    let x: number;
    let z: number;

    if (view === 'left' || view === 'right') {
      /**
       * Na vista lateral, a profundidade do MediaPipe
       * é utilizada para recuperar a largura corporal.
       *
       * As duas vistas recebem sinais opostos para que
       * a lateral esquerda e a direita sejam normalizadas
       * para o mesmo referencial do CAIMENT.
       */
      const lateralSign = view === 'left' ? -1 : 1;

      x =
        relative.z *
        lateralSign *
        scale;

      /**
       * A posição horizontal da imagem representa
       * a profundidade corporal na vista lateral.
       */
      z =
        relative.x *
        sideFrontSign *
        scale;
    } else {
      /**
       * Nas vistas frontal e traseira:
       * X da imagem representa a largura.
       */
      x =
        relative.x *
        horizontalSign *
        scale;

      /**
       * O eixo Z do MediaPipe representa a profundidade
       * observada pela câmera.
       *
       * A inversão depende da vista para manter
       * a frente do corpo no sentido +Z.
       */
      z =
        relative.z *
        (view === 'front' ? -1 : 1) *
        scale;
    }

    return new THREE.Vector3(
      x,
      (point.y - ankleCenterRaw.y) * scale,
      z,
    );
  };

  const leftShoulder = toCaiment(raw.leftShoulder);
  const rightShoulder = toCaiment(raw.rightShoulder);

  const leftHip = toCaiment(raw.leftHip);
  const rightHip = toCaiment(raw.rightHip);

  const leftKnee = toCaiment(raw.leftKnee);
  const rightKnee = toCaiment(raw.rightKnee);

  const leftAnkle = toCaiment(raw.leftAnkle);
  const rightAnkle = toCaiment(raw.rightAnkle);

  const leftElbow = toCaiment(raw.leftElbow);
  const rightElbow = toCaiment(raw.rightElbow);

  const leftWrist = toCaiment(raw.leftWrist);
  const rightWrist = toCaiment(raw.rightWrist);

  const shoulderCenter = midpoint(
    leftShoulder,
    rightShoulder,
  );

  const hipCenter = midpoint(
    leftHip,
    rightHip,
  );

  const kneeCenter = midpoint(
    leftKnee,
    rightKnee,
  );

  /**
   * Estes pontos são derivados por interpolação.
   * Não são landmarks anatômicos detectados diretamente.
   */
  const waistCenter = interpolate(
    shoulderCenter,
    hipCenter,
    0.55,
  );

  const bustCenter = interpolate(
    shoulderCenter,
    hipCenter,
    0.27,
  );

  const crotchCenter = interpolate(
    hipCenter,
    kneeCenter,
    0.16,
  );

  const bodyCenter = interpolate(
    shoulderCenter,
    hipCenter,
    0.5,
  );

  const landmarks: BodyLandmarks = {
    bodyCenter,

    neckBase: shoulderCenter.clone().add(
      new THREE.Vector3(
        0,
        0.07 * scale,
        0,
      ),
    ),

    shoulderCenter,
    leftShoulder,
    rightShoulder,

    bustCenter,
    waistCenter,

    hipCenter,
    leftHip,
    rightHip,

    crotchCenter,

    leftKnee,
    rightKnee,

    leftAnkle,
    rightAnkle,

    leftElbow,
    rightElbow,

    leftWrist,
    rightWrist,
  };

  return landmarks;
}

/**
 * Cria uma cópia independente dos landmarks.
 */
export function cloneBodyLandmarks(
  landmarks: BodyLandmarks,
): BodyLandmarks {
  const result = {} as BodyLandmarks;

  for (const key of Object.keys(landmarks) as BodyLandmark[]) {
    result[key] = landmarks[key].clone();
  }

  return result;
}
