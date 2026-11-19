
import * as THREE from 'three';

import {
  FilesetResolver,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';

import type {
  BodyLandmarks,
} from './types';

import {
  createBodyLandmarksFromMediaPipe,
  type PoseView,
  type MediaPipeWorldLandmark,
} from './MediaPipePoseAdapter';

export type FourPosePhotos = Record<PoseView, Blob>;

export interface MediaPipePhotoAnalyzerOptions {
  avatarHeight: number;
  modelAssetPath?: string;
  wasmPath?: string;
  minVisibility?: number;
}

const DEFAULT_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

const DEFAULT_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';

const POSE_VIEWS: PoseView[] = [
  'front',
  'back',
  'left',
  'right',
];

function average(values: readonly number[]): number {
  const validValues = values.filter(Number.isFinite);

  if (validValues.length === 0) {
    throw new Error(
      'CAIMENT: não existem valores válidos para calcular a média.',
    );
  }

  return validValues.reduce(
    (sum, value) => sum + value,
    0,
  ) / validValues.length;
}

function validatePhotos(photos: FourPosePhotos): void {
  if (!photos) {
    throw new Error(
      'CAIMENT: fotografias do corpo não foram fornecidas.',
    );
  }

  for (const view of POSE_VIEWS) {
    const photo = photos[view];

    if (
      !(photo instanceof Blob) ||
      photo.size === 0
    ) {
      throw new Error(
        `CAIMENT: fotografia da vista "${view}" inválida ou ausente.`,
      );
    }
  }
}

function validateLandmarks(
  landmarks: BodyLandmarks,
  view: PoseView,
): void {
  if (!landmarks) {
    throw new Error(
      `CAIMENT: landmarks não foram gerados na vista "${view}".`,
    );
  }

  const keys = Object.keys(
    landmarks,
  ) as Array<keyof BodyLandmarks>;

  for (const key of keys) {
    const point = landmarks[key];

    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    ) {
      throw new Error(
        `CAIMENT: landmark "${String(key)}" inválido na vista "${view}".`,
      );
    }
  }
}

/**
 * Combina as quatro vistas no sistema de coordenadas CAIMENT.
 *
 * Cada fotografia possui seu próprio referencial.
 * Por isso, não somamos diretamente os vetores 3D completos.
 *
 * Combinação:
 *
 * X = média das vistas frontal e traseira.
 * Y = média das vistas frontal e traseira.
 * Z = média das vistas laterais esquerda e direita.
 *
 * A combinação pressupõe que o MediaPipePoseAdapter normalize
 * corretamente os eixos e a orientação anatômica de cada vista.
 *
 * Os landmarks derivados pelo adapter também são combinados,
 * mas continuam sendo estimativas, não detecções independentes.
 */
function combineFourViews(
  views: Record<PoseView, BodyLandmarks>,
): BodyLandmarks {
  const result = {} as BodyLandmarks;

  const keys = Object.keys(
    views.front,
  ) as Array<keyof BodyLandmarks>;

  for (const key of keys) {
    const front = views.front[key];
    const back = views.back[key];
    const left = views.left[key];
    const right = views.right[key];

    if (!front || !back || !left || !right) {
      throw new Error(
        `CAIMENT: não foi possível combinar o landmark "${String(key)}" nas quatro vistas.`,
      );
    }

    /**
     * A frente e a traseira são usadas para reconstruir
     * largura e altura.
     *
     * Os dois referenciais são normalizados individualmente
     * pelo adapter antes desta combinação.
     */
    const x = average([
      front.x,
      back.x,
    ]);

    const y = average([
      front.y,
      back.y,
    ]);

    /**
     * As vistas laterais fornecem a profundidade.
     *
     * A média reduz diferenças entre as duas observações,
     * desde que ambas estejam orientadas para frente +Z.
     */
    const z = average([
      left.z,
      right.z,
    ]);

    result[key] = new THREE.Vector3(
      x,
      y,
      z,
    );
  }

  return result;
}

/**
 * Analisa as quatro fotografias com MediaPipe Pose Landmarker.
 *
 * Fotografias necessárias:
 * - front: vista frontal;
 * - back: vista traseira;
 * - left: vista lateral esquerda;
 * - right: vista lateral direita.
 *
 * A altura do avatar Tripo é utilizada para normalizar
 * as estimativas de escala.
 */
export async function analyzeFourPosePhotos(
  photos: FourPosePhotos,
  options: MediaPipePhotoAnalyzerOptions,
): Promise<BodyLandmarks> {
  if (
    !options ||
    !Number.isFinite(options.avatarHeight) ||
    options.avatarHeight <= 0
  ) {
    throw new Error(
      'CAIMENT: altura do avatar inválida.',
    );
  }

  validatePhotos(photos);

  const minVisibility = THREE.MathUtils.clamp(
    options.minVisibility ?? 0.35,
    0,
    1,
  );

  const vision = await FilesetResolver.forVisionTasks(
    options.wasmPath ?? DEFAULT_WASM,
  );

  const landmarker = await PoseLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath:
          options.modelAssetPath ?? DEFAULT_MODEL,
      },

      runningMode: 'IMAGE',
      numPoses: 1,

      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    },
  );

  const views = {} as Record<PoseView, BodyLandmarks>;

  try {
    for (const view of POSE_VIEWS) {
      let bitmap: ImageBitmap | null = null;

      try {
        bitmap = await createImageBitmap(
          photos[view],
        );

        if (
          bitmap.width === 0 ||
          bitmap.height === 0
        ) {
          throw new Error(
            `CAIMENT: imagem da vista "${view}" possui dimensões inválidas.`,
          );
        }

        const detection = landmarker.detect(bitmap);

        if (
          !detection.worldLandmarks ||
          detection.worldLandmarks.length === 0
        ) {
          throw new Error(
            `CAIMENT: MediaPipe não identificou o corpo na foto "${view}".`,
          );
        }

        const worldLandmarks =
          detection.worldLandmarks[0] as MediaPipeWorldLandmark[];

        const landmarks =
          createBodyLandmarksFromMediaPipe(
            worldLandmarks,
            {
              view,
              avatarHeight: options.avatarHeight,
              minVisibility,
            },
          );

        validateLandmarks(
          landmarks,
          view,
        );

        views[view] = landmarks;
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }

        throw new Error(
          `CAIMENT: falha ao analisar a fotografia "${view}".`,
        );
      } finally {
        bitmap?.close();
      }
    }

    /**
     * Confirma que todas as fotografias foram analisadas.
     */
    for (const view of POSE_VIEWS) {
      if (!views[view]) {
        throw new Error(
          `CAIMENT: a vista "${view}" não foi processada.`,
        );
      }
    }

    const combinedLandmarks = combineFourViews(views);

    validateLandmarks(
      combinedLandmarks,
      'front',
    );

    return combinedLandmarks;
  } finally {
    landmarker.close();
  }
}
