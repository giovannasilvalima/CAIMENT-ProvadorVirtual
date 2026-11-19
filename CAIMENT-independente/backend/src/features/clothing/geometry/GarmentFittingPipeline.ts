
import * as THREE from 'three';

import type {
  BodyLandmark,
  BodyLandmarks,
  GarmentFitDefinition,
} from './types';

import {
  analyzeFourPosePhotos,
  type FourPosePhotos,
  type MediaPipePhotoAnalyzerOptions,
} from './MediaPipePhotoAnalyzer';

import {
  alignLandmarksToAvatar,
} from './GarmentAvatarAlignment';

import {
  applyGarmentDeformation,
  type GarmentDeformationOptions,
  type GarmentDeformationResult,
} from './GarmentDeformation';

export interface GarmentFittingPipelineOptions {
  photos: FourPosePhotos;
  avatarBox: THREE.Box3;
  fit: GarmentFitDefinition;
  mediaPipe?: Partial<MediaPipePhotoAnalyzerOptions>;
  deformation?: GarmentDeformationOptions;
}

export interface GarmentFittingPipelineResult {
  geometry: THREE.BufferGeometry;
  landmarks: BodyLandmarks;
  deformation: GarmentDeformationResult;
  avatarBox: THREE.Box3;
}

const REQUIRED_LANDMARKS: BodyLandmark[] = [
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

/**
 * Valida a geometria utilizada na prova virtual.
 *
 * A geometria deve utilizar metros e o sistema de coordenadas
 * do CAIMENT:
 * X = largura
 * Y = altura
 * Z = profundidade
 */
function validateSourceGeometry(
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
      'CAIMENT: geometria da roupa não possui vértices válidos.',
    );
  }

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z)
    ) {
      throw new Error(
        `CAIMENT: vértice ${i} da roupa possui coordenadas inválidas.`,
      );
    }
  }

  const index = geometry.getIndex();

  if (index && index.count < 3) {
    throw new Error(
      'CAIMENT: geometria da roupa não possui triângulos suficientes.',
    );
  }

  geometry.computeBoundingBox();

  const boundingBox = geometry.boundingBox;

  if (
    !boundingBox ||
    boundingBox.isEmpty() ||
    ![
      boundingBox.min.x,
      boundingBox.min.y,
      boundingBox.min.z,
      boundingBox.max.x,
      boundingBox.max.y,
      boundingBox.max.z,
    ].every(Number.isFinite)
  ) {
    throw new Error(
      'CAIMENT: não foi possível calcular os limites válidos da roupa.',
    );
  }
}

/**
 * Valida a caixa delimitadora do avatar.
 *
 * O Box3 deve estar no mesmo referencial espacial
 * utilizado para posicionar os landmarks.
 */
function validateAvatarBox(
  avatarBox: THREE.Box3,
): THREE.Vector3 {
  if (
    !avatarBox ||
    !(avatarBox instanceof THREE.Box3) ||
    avatarBox.isEmpty()
  ) {
    throw new Error(
      'CAIMENT: Box3 do avatar inválido.',
    );
  }

  const values = [
    avatarBox.min.x,
    avatarBox.min.y,
    avatarBox.min.z,
    avatarBox.max.x,
    avatarBox.max.y,
    avatarBox.max.z,
  ];

  if (!values.every(Number.isFinite)) {
    throw new Error(
      'CAIMENT: Box3 do avatar contém coordenadas inválidas.',
    );
  }

  const size = avatarBox.getSize(new THREE.Vector3());

  if (
    size.x <= 0 ||
    size.y <= 0 ||
    size.z <= 0
  ) {
    throw new Error(
      'CAIMENT: dimensões do avatar inválidas.',
    );
  }

  return size;
}

/**
 * Valida os 19 landmarks anatômicos exigidos pelo CAIMENT.
 */
function validateLandmarks(
  landmarks: BodyLandmarks,
): void {
  if (!landmarks) {
    throw new Error(
      'CAIMENT: landmarks anatômicos não foram gerados.',
    );
  }

  for (const name of REQUIRED_LANDMARKS) {
    const point = landmarks[name];

    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    ) {
      throw new Error(
        `CAIMENT: landmark anatômico "${name}" ausente ou inválido.`,
      );
    }
  }
}

/**
 * Valida a definição de ajuste da roupa.
 *
 * clearance é expresso em metros.
 * Para uma folga desejada de 2 mm, o valor correspondente
 * é 0.002.
 *
 * A validação do valor não representa uma verificação física
 * da distância entre a roupa e a superfície corporal.
 */
function validateFit(
  fit: GarmentFitDefinition,
): void {
  if (!fit) {
    throw new Error(
      'CAIMENT: definição de ajuste da roupa não fornecida.',
    );
  }

  if (
    !Array.isArray(fit.anchors) ||
    fit.anchors.length === 0
  ) {
    throw new Error(
      'CAIMENT: a roupa não possui pontos de ancoragem anatômica.',
    );
  }

  if (
    !Array.isArray(fit.coverage) ||
    fit.coverage.length === 0
  ) {
    throw new Error(
      'CAIMENT: regiões de cobertura da roupa não foram definidas.',
    );
  }

  for (const anchor of fit.anchors) {
    if (
      !anchor ||
      typeof anchor.id !== 'string' ||
      anchor.id.trim().length === 0 ||
      !anchor.bodyLandmark ||
      !anchor.garmentPosition ||
      !Number.isFinite(anchor.garmentPosition.x) ||
      !Number.isFinite(anchor.garmentPosition.y) ||
      !Number.isFinite(anchor.garmentPosition.z)
    ) {
      throw new Error(
        'CAIMENT: foi encontrada uma ancoragem anatômica inválida.',
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
        `CAIMENT: peso inválido na ancoragem "${anchor.id}".`,
      );
    }
  }

  if (
    !Number.isFinite(fit.clearance) ||
    fit.clearance < 0
  ) {
    throw new Error(
      'CAIMENT: distância de segurança da roupa inválida.',
    );
  }
}

/**
 * Verifica se os pontos anatômicos utilizados pelas ancoragens
 * realmente existem no conjunto de landmarks.
 */
function validateAnchorLandmarks(
  fit: GarmentFitDefinition,
  landmarks: BodyLandmarks,
): void {
  for (const anchor of fit.anchors) {
    const landmarkName = anchor.bodyLandmark;

    if (
      !REQUIRED_LANDMARKS.includes(landmarkName) ||
      !Object.prototype.hasOwnProperty.call(
        landmarks,
        landmarkName,
      )
    ) {
      throw new Error(
        `CAIMENT: a ancoragem "${anchor.id}" referencia um landmark inexistente.`,
      );
    }

    const point = landmarks[landmarkName];

    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.z)
    ) {
      throw new Error(
        `CAIMENT: o landmark "${landmarkName}" da ancoragem "${anchor.id}" é inválido.`,
      );
    }
  }
}

/**
 * Valida as opções recebidas pelo pipeline.
 */
function validateOptions(
  options: GarmentFittingPipelineOptions,
): void {
  if (!options) {
    throw new Error(
      'CAIMENT: opções do ajuste não foram fornecidas.',
    );
  }

  if (!options.photos) {
    throw new Error(
      'CAIMENT: fotografias para análise não foram fornecidas.',
    );
  }

  if (
    options.mediaPipe?.minVisibility !== undefined &&
    (
      !Number.isFinite(options.mediaPipe.minVisibility) ||
      options.mediaPipe.minVisibility < 0 ||
      options.mediaPipe.minVisibility > 1
    )
  ) {
    throw new Error(
      'CAIMENT: limite de visibilidade do MediaPipe deve estar entre 0 e 1.',
    );
  }
}

/**
 * Fluxo de ajuste da roupa ao avatar CAIMENT.
 *
 * Etapas:
 *
 * 1. Validação da geometria original da roupa.
 * 2. Validação das opções e do Box3 do avatar.
 * 3. Análise das quatro fotografias com MediaPipe.
 * 4. Normalização das estimativas pela altura do avatar.
 * 5. Alinhamento dos landmarks ao espaço do avatar.
 * 6. Validação dos landmarks e das ancoragens.
 * 7. Deformação da geometria da roupa.
 * 8. Validação da geometria resultante.
 *
 * A geometria recebida deve estar no sistema de coordenadas
 * CAIMENT, em metros.
 *
 * IMPORTANTE:
 * O Box3 representa somente os limites externos do avatar.
 * Ele não representa a superfície corporal e não substitui
 * uma verificação de colisão entre a roupa e a malha do corpo.
 *
 * Este pipeline não cria nem atualiza o manequim corporal.
 * Para isso, o fluxo precisa receber as oito medidas do usuário
 * e integrar explicitamente createBodySurfaceMesh.
 */
export async function runGarmentFittingPipeline(
  sourceGeometry: THREE.BufferGeometry,
  options: GarmentFittingPipelineOptions,
): Promise<GarmentFittingPipelineResult> {
  // 1. Validar a geometria original.
  validateSourceGeometry(sourceGeometry);

  // 2. Validar as opções.
  validateOptions(options);

  const avatarSize = validateAvatarBox(
    options.avatarBox,
  );

  validateFit(options.fit);

  // 3. Utilizar a altura do avatar Tripo em metros.
  const avatarHeight = avatarSize.y;

  const mediaPipeOptions: MediaPipePhotoAnalyzerOptions = {
    ...options.mediaPipe,
    avatarHeight,
  };

  // 4. Analisar as quatro fotografias.
  const analyzedLandmarks = await analyzeFourPosePhotos(
    options.photos,
    mediaPipeOptions,
  );

  validateLandmarks(analyzedLandmarks);

  // 5. Alinhar os landmarks ao espaço do avatar.
  const alignment = alignLandmarksToAvatar(
    analyzedLandmarks,
    options.avatarBox,
  );

  if (!alignment || !alignment.landmarks) {
    throw new Error(
      'CAIMENT: não foi possível alinhar os landmarks ao avatar.',
    );
  }

  validateLandmarks(alignment.landmarks);

  // 6. Garantir que todas as ancoragens possuam
  //    uma referência anatômica válida.
  validateAnchorLandmarks(
    options.fit,
    alignment.landmarks,
  );

  // 7. Preservar a geometria original.
  //    A deformação trabalha sobre uma cópia independente.
  const geometryToDeform = sourceGeometry.clone();

  // 8. Aplicar a deformação utilizando os landmarks alinhados.
  const deformation = applyGarmentDeformation(
    geometryToDeform,
    options.fit,
    alignment.landmarks,
    options.deformation,
  );

  if (
    !deformation ||
    !deformation.geometry ||
    !(deformation.geometry instanceof THREE.BufferGeometry)
  ) {
    geometryToDeform.dispose();

    throw new Error(
      'CAIMENT: a deformação não retornou uma geometria válida.',
    );
  }

  // 9. Validar o resultado da deformação.
  try {
    validateSourceGeometry(deformation.geometry);
  } catch (error) {
    deformation.geometry.dispose();

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(
      'CAIMENT: a geometria deformada apresentou um erro de validação.',
    );
  }

  // 10. Entregar os resultados para a próxima etapa.
  return {
    geometry: deformation.geometry,
    landmarks: alignment.landmarks,
    deformation,
    avatarBox: options.avatarBox.clone(),
  };
}
