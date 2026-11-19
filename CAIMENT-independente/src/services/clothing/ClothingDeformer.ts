import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * CAIMENT — ClothingDeformer
 *
 * Deforma SOMENTE as shape keys da roupa.
 * O AvatarViewer continua responsável por carregar, orientar e posicionar
 * o GLB resultante sobre o avatar.
 *
 * Referência da camiseta unissex M informada:
 * - largura da peça: 52 cm
 * - comprimento/altura da peça: 69 cm
 * - manga: 22 cm
 *
 * Referência geométrica do GLB antes da deformação:
 * X = largura:      0.499 m
 * Y = profundidade: 0.297 m
 * Z = altura:       0.699 m
 *
 * Atenção: largura/altura/manga da tabela são medidas da peça.
 * As medidas recebidas em ClothingMeasurements são medidas corporais.
 * Não são grandezas intercambiáveis.
 */

export interface ClothingMeasurements {
  altura: number;
  ombros: number;
  torax: number;
  busto: number;
  cintura: number;
  quadril: number;
}

export interface DeformedClothing {
  object: THREE.Object3D;
  url: string;
  revoke: () => void;
}

const GARMENT_M = {
  widthCm: 52,
  lengthCm: 69,
  sleeveCm: 22,
  depthCm: 29.7,
};

const BODY_REFERENCE = {
  shoulder: 42,
  torso: 45,
  bust: 86,
  waist: 68,
};

/**
 * Capacidades usadas para mapear diferenças corporais para 0–1.
 * São limites de controle do código, não alegações de centímetros
 * exatos produzidos pela geometria da shape key.
 */
const INFLUENCE_RANGE = {
  waist: 20,
  torso: 15,
  shoulders: 10,
  bust: 15,
  hipsVsBust: 30,
};

const SHAPE_KEYS = {
  Cintura: 'Cintura',
  Torax: 'Tórax',
  Manga: 'Manga',
  Ombros: 'Ombros',
  Gola: 'Gola',
  Caimento: 'Caimento',
  Barra: 'Barra',
  AjusteLateral: 'Ajuste lateral',
  Busto: 'Busto',
};

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

const clamp01 = (value: number) =>
  THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);

export class ClothingDeformer {
  private readonly loader = new GLTFLoader();

  async deform(
    originalGlbUrl: string,
    measurements: ClothingMeasurements,
  ): Promise<DeformedClothing> {
    this.validateMeasurements(measurements);

    console.log('👕 Iniciando deformação da roupa — camiseta M');
    console.log('📏 Medidas corporais recebidas:', measurements);
    console.log('👕 Referência da peça M:', GARMENT_M);

    const gltf = await this.load(originalGlbUrl);
    const clothing = cloneSkeleton(gltf.scene);

    clothing.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const mesh = child as MorphMesh;

      if (mesh.geometry) {
        mesh.geometry = mesh.geometry.clone();
      }

      this.applyShapeKeys(mesh, measurements);
    });

    this.bakeMorphTargets(clothing);

    const url = await this.exportAsGlb(clothing);

    console.log('✅ Roupa deformada e exportada.');

    return {
      object: clothing,
      url,
      revoke: () => URL.revokeObjectURL(url),
    };
  }

  private validateMeasurements(measurements: ClothingMeasurements) {
    const required: (keyof ClothingMeasurements)[] = [
      'altura',
      'ombros',
      'torax',
      'busto',
      'cintura',
      'quadril',
    ];

    for (const key of required) {
      const value = measurements[key];

      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(
          `Medida corporal inválida em "${key}": ${String(value)}`,
        );
      }
    }
  }

  private load(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          console.log('📦 GLB carregado:', url);

          gltf.scene.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;

            const mesh = child as MorphMesh;
            console.log('👕 Mesh encontrada:', mesh.name);

            if (mesh.morphTargetDictionary) {
              console.log('🎛️ Shape Keys:', mesh.morphTargetDictionary);
            }

            if (mesh.morphTargetInfluences) {
              console.log('🎚️ Influências iniciais:', mesh.morphTargetInfluences);
            }
          });

          resolve(gltf);
        },
        undefined,
        (error) => {
          console.error('❌ Erro ao carregar GLB:', error);
          reject(error);
        },
      );
    });
  }

  private applyShapeKeys(
    mesh: MorphMesh,
    measurements: ClothingMeasurements,
  ) {
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;

    if (!dictionary || !influences) return;

    const setShapeKey = (name: string, value: number) => {
      const index = dictionary[name];

      if (index === undefined) {
        // Algumas malhas podem não conter todas as shape keys.
        console.warn(`⚠️ Shape Key "${name}" não encontrada nesta malha.`);
        return;
      }

      influences[index] = clamp01(value);

      console.log(
        `🎛️ ${name}: ${(influences[index] * 100).toFixed(0)}%`,
      );
    };

    // Cintura: a chave descrita estreita a região da cintura.
    // Ativa progressivamente quando a cintura corporal é menor que a referência.
    const cinturaDelta = BODY_REFERENCE.waist - measurements.cintura;
    const cinturaInfluence = clamp01(cinturaDelta / INFLUENCE_RANGE.waist);
    setShapeKey(SHAPE_KEYS.Cintura, cinturaInfluence);

    // Tórax: aumenta progressivamente para valores corporais acima da referência.
    const toraxDelta = measurements.torax - BODY_REFERENCE.torso;
    const toraxInfluence = clamp01(toraxDelta / INFLUENCE_RANGE.torso);
    setShapeKey(SHAPE_KEYS.Torax, toraxInfluence);

    // Ombros e manga usam a diferença em relação à referência cadastrada.
    const shoulderDelta = measurements.ombros - BODY_REFERENCE.shoulder;
    const shoulderIncrease = clamp01(shoulderDelta / INFLUENCE_RANGE.shoulders);
    const shoulderDifference = clamp01(
      Math.abs(shoulderDelta) / INFLUENCE_RANGE.shoulders,
    );

    setShapeKey(SHAPE_KEYS.Manga, shoulderDifference);
    setShapeKey(SHAPE_KEYS.Ombros, shoulderIncrease);
    setShapeKey(SHAPE_KEYS.Gola, shoulderIncrease);

    // Busto: a própria shape key existente atua na região frontal,
    // conforme a descrição do modelo. O valor varia com a diferença corporal.
    const bustDelta = measurements.busto - BODY_REFERENCE.bust;
    const bustInfluence = clamp01(bustDelta / INFLUENCE_RANGE.bust);
    setShapeKey(SHAPE_KEYS.Busto, bustInfluence);

    // Caimento permanece em zero para preservar a dimensão-base do GLB,
    // conforme a configuração atual informada para esta camiseta.
    setShapeKey(SHAPE_KEYS.Caimento, 0);

    // Barra: varia quando o quadril difere do busto. O cálculo anterior
    // era feito, mas o resultado não era aplicado; agora ele é aplicado.
    const hipBustDelta = measurements.quadril - measurements.busto;
    const barraInfluence = clamp01(
      Math.abs(hipBustDelta) / INFLUENCE_RANGE.hipsVsBust,
    );
    setShapeKey(SHAPE_KEYS.Barra, barraInfluence);

    // Ajuste lateral também considera a diferença entre quadril e busto.
    const ajusteLateralInfluence = clamp01(
      (Math.abs(hipBustDelta) - 20) / INFLUENCE_RANGE.hipsVsBust,
    );
    setShapeKey(SHAPE_KEYS.AjusteLateral, ajusteLateralInfluence);
  }

  /**
   * Aplica as influências às posições dos vértices e exporta uma malha
   * já deformada, para o AvatarViewer não precisar controlar shape keys.
   */
  private bakeMorphTargets(object: THREE.Object3D) {
    object.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;

      const mesh = child as MorphMesh;
      if (
        !mesh.geometry ||
        !mesh.morphTargetInfluences ||
        !mesh.morphTargetDictionary
      ) {
        return;
      }

      const geometry = mesh.geometry;
      const position = geometry.attributes.position;
      const morphAttributes = geometry.morphAttributes.position;

      if (!position || !morphAttributes?.length) return;

      const basePositions = position.array;
      const resultPositions = new Float32Array(basePositions.length);
      resultPositions.set(basePositions);

      const influences = mesh.morphTargetInfluences;
      const relative = geometry.morphTargetsRelative;

      morphAttributes.forEach((morphAttribute, morphIndex) => {
        const influence = influences[morphIndex] ?? 0;
        if (influence === 0) return;

        const morphArray = morphAttribute.array;

        for (let i = 0; i < resultPositions.length; i += 3) {
          if (relative) {
            resultPositions[i] += morphArray[i] * influence;
            resultPositions[i + 1] += morphArray[i + 1] * influence;
            resultPositions[i + 2] += morphArray[i + 2] * influence;
          } else {
            resultPositions[i] = THREE.MathUtils.lerp(
              basePositions[i],
              morphArray[i],
              influence,
            );
            resultPositions[i + 1] = THREE.MathUtils.lerp(
              basePositions[i + 1],
              morphArray[i + 1],
              influence,
            );
            resultPositions[i + 2] = THREE.MathUtils.lerp(
              basePositions[i + 2],
              morphArray[i + 2],
              influence,
            );
          }
        }
      });

      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(resultPositions, 3),
      );

      geometry.deleteAttribute('normal');
      geometry.computeVertexNormals();

      geometry.morphAttributes.position = [];
      mesh.morphTargetInfluences = [];
      mesh.morphTargetDictionary = {};
    });
  }

  private exportAsGlb(object: THREE.Object3D): Promise<string> {
    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();

      exporter.parse(
        object,
        (result) => {
          if (!(result instanceof ArrayBuffer)) {
            reject(new Error('O GLTFExporter não retornou um GLB.'));
            return;
          }

          const blob = new Blob([result], {
            type: 'model/gltf-binary',
          });

          resolve(URL.createObjectURL(blob));
        },
        (error) => {
          console.error('❌ Erro ao exportar GLB:', error);
          reject(error);
        },
        { binary: true },
      );
    });
  }
}
