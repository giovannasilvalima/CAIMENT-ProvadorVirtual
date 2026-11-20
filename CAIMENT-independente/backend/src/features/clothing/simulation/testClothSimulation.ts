
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { ClothSimulation } from './ClothSimulation.ts';
import { normalizeAvatarCoordinateSystem } from '../geometry/AvatarCoordinateSystem.ts';

interface GLTFDocument {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }>;
  meshes?: Array<{
    primitives?: Array<{
      mode?: number;
      attributes?: { POSITION?: number };
      indices?: number;
    }>;
  }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
  }>;
  bufferViews?: Array<{
    byteOffset?: number;
    byteStride?: number;
  }>;
}

const GLB_PATH = join(homedir(), 'Downloads', 'avatar-tripo.glb');

const AVATAR_TARGET_HEIGHT = 3.4;
const AVATAR_ROTATION_Y = -Math.PI / 2;

function readGLB(path: string): {
  document: GLTFDocument;
  binary: Buffer;
} {
  const file = readFileSync(path);

  if (file.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Arquivo inválido: não é um GLB.');
  }

  if (file.readUInt32LE(4) !== 2) {
    throw new Error('Versão GLB não suportada.');
  }

  let offset = 12;
  let document: GLTFDocument | null = null;
  let binary: Buffer | null = null;

  while (offset < file.length) {
    const chunkLength = file.readUInt32LE(offset);
    const chunkType = file.readUInt32LE(offset + 4);
    const chunk = file.subarray(
      offset + 8,
      offset + 8 + chunkLength,
    );

    if (chunkType === 0x4E4F534A) {
      document = JSON.parse(
        chunk.toString('utf8'),
      ) as GLTFDocument;
    }

    if (chunkType === 0x004E4942) {
      binary = chunk;
    }

    offset += 8 + chunkLength;
  }

  if (!document || !binary) {
    throw new Error('GLB sem JSON ou bloco binário válido.');
  }

  return { document, binary };
}

function readAccessor(
  document: GLTFDocument,
  binary: Buffer,
  accessorIndex: number,
): number[] {
  const accessor = document.accessors?.[accessorIndex];

  if (!accessor || accessor.bufferView === undefined) {
    throw new Error(`Accessor ${accessorIndex} não encontrado.`);
  }

  const view = document.bufferViews?.[accessor.bufferView];

  if (!view) {
    throw new Error(
      `BufferView do accessor ${accessorIndex} não encontrado.`,
    );
  }

  const componentSizes: Record<number, number> = {
    5121: 1,
    5123: 2,
    5125: 4,
    5126: 4,
  };

  const componentSize = componentSizes[accessor.componentType];

  if (!componentSize) {
    throw new Error(
      `Tipo de componente não suportado: ${accessor.componentType}.`,
    );
  }

  const componentsPerElement: Record<string, number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT4: 16,
  };

  const componentCount = componentsPerElement[accessor.type];

  if (!componentCount) {
    throw new Error(`Tipo de accessor não suportado: ${accessor.type}.`);
  }

  const elementSize = componentSize * componentCount;
  const stride = view.byteStride ?? elementSize;

  const start =
    (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

  const data = new DataView(
    binary.buffer,
    binary.byteOffset,
    binary.byteLength,
  );

  const result: number[] = [];

  for (let i = 0; i < accessor.count; i++) {
    const elementOffset = start + i * stride;

    for (let component = 0; component < componentCount; component++) {
      const position = elementOffset + component * componentSize;

      let value: number;

      switch (accessor.componentType) {
        case 5121:
          value = data.getUint8(position);
          break;
        case 5123:
          value = data.getUint16(position, true);
          break;
        case 5125:
          value = data.getUint32(position, true);
          break;
        case 5126:
          value = data.getFloat32(position, true);
          break;
        default:
          throw new Error('Componente não suportado.');
      }

      result.push(value);
    }
  }

  return result;
}

function getNodeMatrix(
  node: NonNullable<GLTFDocument['nodes']>[number],
): THREE.Matrix4 {
  if (node.matrix) {
    return new THREE.Matrix4().fromArray(node.matrix);
  }

  const position = new THREE.Vector3().fromArray(
    node.translation ?? [0, 0, 0],
  );

  const rotation = new THREE.Quaternion().fromArray(
    node.rotation ?? [0, 0, 0, 1],
  );

  const scale = new THREE.Vector3().fromArray(
    node.scale ?? [1, 1, 1],
  );

  return new THREE.Matrix4().compose(
    position,
    rotation,
    scale,
  );
}

function loadAvatarGeometry(path: string): THREE.BufferGeometry {
  const { document, binary } = readGLB(path);

  const positions: number[] = [];
  const indices: number[] = [];

  const nodes = document.nodes ?? [];
  const meshes = document.meshes ?? [];

  function processMesh(
    meshIndex: number,
    worldMatrix: THREE.Matrix4,
  ): void {
    const mesh = meshes[meshIndex];

    if (!mesh) {
      throw new Error(`Mesh ${meshIndex} não encontrado.`);
    }

    for (const primitive of mesh.primitives ?? []) {
      if (primitive.mode !== undefined && primitive.mode !== 4) {
        continue;
      }

      const positionAccessor = primitive.attributes?.POSITION;

      if (positionAccessor === undefined) {
        continue;
      }

      const vertexPositions = readAccessor(
        document,
        binary,
        positionAccessor,
      );

      if (vertexPositions.length % 3 !== 0) {
        throw new Error('Geometria POSITION inválida.');
      }

      const baseVertex = positions.length / 3;
      const vertexCount = vertexPositions.length / 3;

      const point = new THREE.Vector3();

      for (let i = 0; i < vertexPositions.length; i += 3) {
        point.set(
          vertexPositions[i],
          vertexPositions[i + 1],
          vertexPositions[i + 2],
        );

        point.applyMatrix4(worldMatrix);

        positions.push(point.x, point.y, point.z);
      }

      const primitiveIndices =
        primitive.indices !== undefined
          ? readAccessor(
              document,
              binary,
              primitive.indices,
            )
          : Array.from(
              { length: vertexCount },
              (_, i) => i,
            );

      if (primitiveIndices.length % 3 !== 0) {
        throw new Error(
          'Quantidade inválida de índices triangulares.',
        );
      }

      for (const index of primitiveIndices) {
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= vertexCount
        ) {
          throw new Error(`Índice de vértice inválido: ${index}.`);
        }

        indices.push(baseVertex + index);
      }
    }
  }

  function traverse(
    nodeIndex: number,
    parentMatrix: THREE.Matrix4,
  ): void {
    const node = nodes[nodeIndex];

    if (!node) {
      throw new Error(`Nó ${nodeIndex} não encontrado.`);
    }

    const worldMatrix = parentMatrix
      .clone()
      .multiply(getNodeMatrix(node));

    if (node.mesh !== undefined) {
      processMesh(node.mesh, worldMatrix);
    }

    for (const child of node.children ?? []) {
      traverse(child, worldMatrix);
    }
  }

  const sceneIndex = document.scene ?? 0;
  const scene = document.scenes?.[sceneIndex];

  if (!scene?.nodes?.length) {
    throw new Error('Cena principal do GLB não encontrada.');
  }

  const identity = new THREE.Matrix4();

  for (const rootNode of scene.nodes) {
    traverse(rootNode, identity);
  }

  if (positions.length === 0 || indices.length === 0) {
    throw new Error('Nenhum triângulo foi extraído do avatar.');
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );

  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function findBodyMesh(
  normalizedAvatar: THREE.Object3D,
): THREE.Mesh {
  let bodyMesh: THREE.Mesh | null = null;

  normalizedAvatar.traverse((child) => {
    if (!bodyMesh && child instanceof THREE.Mesh) {
      bodyMesh = child;
    }
  });

  if (!bodyMesh) {
    throw new Error(
      'Nenhum Mesh encontrado no avatar normalizado.',
    );
  }

  return bodyMesh;
}

function createGarmentGeometry(
  surfacePoint: THREE.Vector3,
  normal: THREE.Vector3,
  offset: number,
): THREE.BufferGeometry {
  const center = surfacePoint
    .clone()
    .addScaledVector(normal, offset);

  const tangent = new THREE.Vector3(1, 0, 0);

  if (Math.abs(normal.dot(tangent)) > 0.9) {
    tangent.set(0, 0, 1);
  }

  tangent.cross(normal).normalize();

  const bitangent = new THREE.Vector3()
    .crossVectors(normal, tangent)
    .normalize();

  const size = 0.012;

  const a = center.clone().addScaledVector(tangent, -size);
  const b = center.clone().addScaledVector(tangent, size);
  const c = center.clone().addScaledVector(bitangent, size);

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        a.x, a.y, a.z,
        b.x, b.y, b.z,
        c.x, c.y, c.z,
      ],
      3,
    ),
  );

  return geometry;
}

function findSurfacePoint(
  bodyMesh: THREE.Mesh,
): {
  point: THREE.Vector3;
  normal: THREE.Vector3;
} {
  bodyMesh.updateWorldMatrix(true, false);

  const bounds = new THREE.Box3().setFromObject(bodyMesh);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];

  const raycaster = new THREE.Raycaster();
  const distance = size.length() * 2;

  for (const direction of directions) {
    raycaster.set(center, direction);
    raycaster.far = distance;

    const intersections = raycaster.intersectObject(
      bodyMesh,
      false,
    );

    if (intersections.length === 0) {
      continue;
    }

    const hit = intersections[0];

    if (!hit.face) {
      continue;
    }

    const normal = hit.face.normal.clone();

    normal.transformDirection(bodyMesh.matrixWorld).normalize();

    if (normal.dot(hit.point.clone().sub(center)) < 0) {
      normal.negate();
    }

    return {
      point: hit.point.clone(),
      normal,
    };
  }

  throw new Error(
    'Não foi possível encontrar uma superfície do avatar para o teste.',
  );
}

function runCollisionTest(
  name: string,
  bodyMesh: THREE.Mesh,
  surfacePoint: THREE.Vector3,
  normal: THREE.Vector3,
  offset: number,
  shouldCorrect: boolean,
): void {
  const garmentGeometry = createGarmentGeometry(
    surfacePoint,
    normal,
    offset,
  );

  const simulation = new ClothSimulation({
    iterations: 1,
    substeps: 1,
    stiffness: 0,
    enableGravity: false,
    contactDistance: 0.05,
    bodyClearance: 0.005,
    contactStrength: 1,
  });

  try {
    simulation.initialize(garmentGeometry);

    const buildStart = performance.now();

    // O mesh já pertence ao avatar normalizado.
    // A simulação deve considerar sua matrixWorld.
    simulation.setBodySurface(bodyMesh);

    const buildTime = performance.now() - buildStart;

    const before = simulation.getPositions();

    const simulationStart = performance.now();

    simulation.step(1 / 60);

    const simulationTime =
      performance.now() - simulationStart;

    const after = simulation.getPositions();

    let totalDisplacement = 0;

    for (let i = 0; i < before.length; i += 3) {
      const dx = after[i] - before[i];
      const dy = after[i + 1] - before[i + 1];
      const dz = after[i + 2] - before[i + 2];

      totalDisplacement += Math.sqrt(
        dx * dx + dy * dy + dz * dz,
      );
    }

    const corrected = totalDisplacement > 0.0001;
    const passed = corrected === shouldCorrect;

    console.log(`\n--- ${name} ---`);
    console.log(`Resultado: ${passed ? 'PASSOU' : 'FALHOU'}`);
    console.log(
      `Deslocamento: ${totalDisplacement.toFixed(6)} m`,
    );
    console.log(
      `Construção da BVH: ${buildTime.toFixed(3)} ms`,
    );
    console.log(
      `Simulação: ${simulationTime.toFixed(3)} ms`,
    );

    if (!passed) {
      throw new Error(`O teste "${name}" falhou.`);
    }
  } finally {
    simulation.dispose();
    garmentGeometry.dispose();
  }
}

function main(): void {
  console.log('======================================');
  console.log('CAIMENT — BVH COM AVATAR NORMALIZADO');
  console.log('======================================');

  console.log(`\nCarregando: ${GLB_PATH}`);

  const avatarGeometry = loadAvatarGeometry(GLB_PATH);

  const avatarMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
  });

  const sourceAvatar = new THREE.Mesh(
    avatarGeometry,
    avatarMaterial,
  );

  // Mesma rotação aplicada no AvatarViewer.
  sourceAvatar.rotation.set(
    0,
    AVATAR_ROTATION_Y,
    0,
  );

  sourceAvatar.updateMatrixWorld(true);

  // Utiliza a implementação real do CAIMENT.
  const normalized = normalizeAvatarCoordinateSystem(
    sourceAvatar,
    {
      targetHeight: AVATAR_TARGET_HEIGHT,
      centerHorizontally: true,
      placeOnGround: true,
    },
  );

  normalized.group.updateMatrixWorld(true);

  const bodyMesh = findBodyMesh(normalized.group);

  bodyMesh.updateWorldMatrix(true, false);

  const bounds = new THREE.Box3().setFromObject(
    normalized.group,
  );

  const dimensions = bounds.getSize(
    new THREE.Vector3(),
  );

  console.log('\n--- Normalização real do CAIMENT ---');
  console.log(`Altura desejada: ${AVATAR_TARGET_HEIGHT.toFixed(3)} m`);
  console.log(`Altura final: ${dimensions.y.toFixed(3)} m`);
  console.log(`Largura final: ${dimensions.x.toFixed(3)} m`);
  console.log(`Profundidade final: ${dimensions.z.toFixed(3)} m`);
  console.log(`Conversão de unidade: ${normalized.unitScale}`);
  console.log(`Escala de normalização: ${normalized.modelScale}`);
  console.log(
    `Centro final: ${normalized.center.toArray().map(v => v.toFixed(3)).join(', ')}`,
  );
  console.log(`Piso Y: ${bounds.min.y.toFixed(6)} m`);

  if (Math.abs(dimensions.y - AVATAR_TARGET_HEIGHT) > 0.001) {
    throw new Error(
      'A altura final do avatar não corresponde a 3,4 m.',
    );
  }

  if (Math.abs(bounds.min.y) > 0.001) {
    throw new Error(
      'O avatar normalizado não está apoiado no chão.',
    );
  }

  try {
    const surface = findSurfacePoint(bodyMesh);

    console.log('\n--- Superfície do avatar normalizado ---');
    console.log(
      `X: ${surface.point.x.toFixed(3)} | ` +
      `Y: ${surface.point.y.toFixed(3)} | ` +
      `Z: ${surface.point.z.toFixed(3)}`,
    );

    runCollisionTest(
      'Correção de penetração no avatar normalizado',
      bodyMesh,
      surface.point,
      surface.normal,
      -0.01,
      true,
    );

    runCollisionTest(
      'Preservação da folga no avatar normalizado',
      bodyMesh,
      surface.point,
      surface.normal,
      0.15,
      false,
    );

    console.log('\n======================================');
    console.log('TODOS OS TESTES PASSARAM!');
    console.log('BVH validada na escala real do CAIMENT.');
    console.log('Avatar com 3,4 m e pés no chão.');
    console.log('======================================');
  } finally {
    normalized.group.clear();
    avatarGeometry.dispose();
    avatarMaterial.dispose();
  }
}

main();
