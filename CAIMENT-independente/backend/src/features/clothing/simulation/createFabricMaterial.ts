
import * as THREE from 'three';
import type { FabricParameters } from '../geometry/types';

export interface FabricMaterialOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  side?: THREE.Side;
  opacity?: number;
  transparent?: boolean;
  wireframe?: boolean;

  /** Ativa ou desativa a trama procedural do tecido. */
  useProceduralTexture?: boolean;

  /** Quantidade de repetições da trama na superfície. */
  textureScale?: number;

  /** Intensidade do relevo microscópico do tecido. */
  bumpScale?: number;

  /** Intensidade do contraste visual da trama. */
  textureStrength?: number;
}

export type FabricPreset =
  | 'cotton'
  | 'jeans'
  | 'linen'
  | 'silk'
  | 'polyester'
  | 'default';

interface FabricPresetConfig {
  roughness: number;
  metalness: number;
  bumpScale: number;
  textureStrength: number;
  textureScale: number;
}

const FABRIC_PRESETS: Record<FabricPreset, FabricPresetConfig> = {
  cotton: {
    roughness: 0.92,
    metalness: 0,
    bumpScale: 0.002,
    textureStrength: 0.8,
    textureScale: 8,
  },

  jeans: {
    roughness: 0.88,
    metalness: 0,
    bumpScale: 0.003,
    textureStrength: 1,
    textureScale: 10,
  },

  linen: {
    roughness: 0.96,
    metalness: 0,
    bumpScale: 0.003,
    textureStrength: 1,
    textureScale: 7,
  },

  silk: {
    roughness: 0.38,
    metalness: 0,
    bumpScale: 0.0005,
    textureStrength: 0.25,
    textureScale: 8,
  },

  polyester: {
    roughness: 0.58,
    metalness: 0,
    bumpScale: 0.001,
    textureStrength: 0.45,
    textureScale: 9,
  },

  default: {
    roughness: 0.85,
    metalness: 0,
    bumpScale: 0.0015,
    textureStrength: 0.65,
    textureScale: 8,
  },
};

/**
 * Cria uma textura procedural de trama.
 *
 * Não depende de imagens externas, Canvas ou arquivos adicionais.
 * A textura é gerada diretamente pelo Three.js.
 */
function createWovenTexture(
  strength: number,
  textureScale: number,
  bump: boolean,
): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);

  const safeStrength = THREE.MathUtils.clamp(strength, 0, 1);
  const safeScale = Math.max(1, textureScale);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;

      const threadSize = 8;

      const warpPosition = x % threadSize;
      const weftPosition = y % threadSize;

      const warpThread = warpPosition < threadSize / 2;
      const weftThread = weftPosition < threadSize / 2;

      const intersection = warpThread === weftThread;

      const threadVariation = intersection ? 7 : -5;

      const waveX = Math.sin((x / threadSize) * Math.PI * 2);
      const waveY = Math.cos((y / threadSize) * Math.PI * 2);

      const waveVariation = (waveX + waveY) * 3;

      let value: number;

      if (bump) {
        const relief = intersection ? 142 : 112;

        value = 128 + (relief - 128) * safeStrength;
        value += waveVariation * safeStrength;
      } else {
        const base = 238;

        value = base + threadVariation * safeStrength;
        value += waveVariation * safeStrength;
      }

      value = THREE.MathUtils.clamp(value, 0, 255);

      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  texture.repeat.set(safeScale, safeScale);

  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  texture.generateMipmaps = true;
  texture.anisotropy = 4;

  texture.colorSpace = bump
    ? THREE.NoColorSpace
    : THREE.SRGBColorSpace;

  texture.needsUpdate = true;

  return texture;
}

/**
 * Cria o material visual do tecido.
 *
 * A textura melhora a aparência da superfície sem alterar
 * a geometria utilizada pela montagem ou simulação física.
 */
export function createFabricMaterial(
  options: FabricMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const {
    color = '#9254e1',
    roughness = 0.85,
    metalness = 0,
    side = THREE.DoubleSide,
    opacity = 1,
    transparent = false,
    wireframe = false,
    useProceduralTexture = true,
    textureScale = 8,
    bumpScale = 0.0015,
    textureStrength = 0.65,
  } = options;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: THREE.MathUtils.clamp(roughness, 0, 1),
    metalness: THREE.MathUtils.clamp(metalness, 0, 1),
    side,
    opacity: THREE.MathUtils.clamp(opacity, 0, 1),
    transparent,
    wireframe,
  });

  if (useProceduralTexture) {
    material.map = createWovenTexture(
      textureStrength,
      textureScale,
      false,
    );

    material.bumpMap = createWovenTexture(
      textureStrength,
      textureScale,
      true,
    );

    material.bumpScale = Math.max(0, bumpScale);
  }

  material.needsUpdate = true;

  return material;
}

/**
 * Cria um material a partir de um tipo de tecido.
 */
export function createFabricMaterialFromPreset(
  preset: FabricPreset,
  color: THREE.ColorRepresentation = '#9254e1',
): THREE.MeshStandardMaterial {
  const config = FABRIC_PRESETS[preset] ?? FABRIC_PRESETS.default;

  return createFabricMaterial({
    color,
    roughness: config.roughness,
    metalness: config.metalness,
    bumpScale: config.bumpScale,
    textureStrength: config.textureStrength,
    textureScale: config.textureScale,
    useProceduralTexture: true,
  });
}

/**
 * Cria um material usando os parâmetros de tecido recebidos.
 *
 * Os parâmetros existentes são preservados e os valores visuais
 * são aproveitados quando estiverem disponíveis.
 */
export function createFabricMaterialFromParameters(
  parameters: FabricParameters,
): THREE.MeshStandardMaterial {
  const values = parameters as unknown as Record<string, unknown>;

  const readNumber = (
    keys: string[],
    fallback: number,
  ): number => {
    for (const key of keys) {
      const value = values[key];

      if (
        typeof value === 'number' &&
        Number.isFinite(value)
      ) {
        return value;
      }
    }

    return fallback;
  };

  const readColor = (): THREE.ColorRepresentation => {
    const candidates = [
      values.color,
      values.cor,
      values.colorHex,
    ];

    for (const candidate of candidates) {
      if (
        typeof candidate === 'string' ||
        typeof candidate === 'number'
      ) {
        return candidate;
      }
    }

    return '#9254e1';
  };

  return createFabricMaterial({
    color: readColor(),

    roughness: readNumber(
      ['roughness', 'rugosidade'],
      FABRIC_PRESETS.default.roughness,
    ),

    metalness: readNumber(
      ['metalness', 'metallicidade'],
      FABRIC_PRESETS.default.metalness,
    ),

    bumpScale: readNumber(
      ['bumpScale', 'textureRelief', 'relevo'],
      FABRIC_PRESETS.default.bumpScale,
    ),

    textureStrength: readNumber(
      ['textureStrength', 'texturaIntensidade'],
      FABRIC_PRESETS.default.textureStrength,
    ),

    textureScale: readNumber(
      ['textureScale', 'texturaEscala'],
      FABRIC_PRESETS.default.textureScale,
    ),
  });
}

/**
 * Aplica um material a todas as malhas de um grupo.
 */
export function applyFabricMaterial(
  group: THREE.Group,
  material: THREE.Material,
): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}
