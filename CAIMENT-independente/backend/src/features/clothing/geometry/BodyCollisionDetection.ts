
import * as THREE from 'three';
import {
  acceleratedRaycast,
  MeshBVH,
} from 'three-mesh-bvh';

// ============================================================
// CAIMENT — BODY COLLISION SYSTEM
// ============================================================
// Responsabilidades:
// - Preparar a geometria real do avatar Tripo.
// - Aceitar avatares compostos por várias meshes.
// - Construir uma estrutura espacial reutilizável.
// - Detectar vértices da roupa no interior do avatar.
// - Corrigir somente as regiões em interseção.
// - Preservar o volume e a modelagem original da roupa.
//
// Independente de ClothSimulation.
// Não utiliza medidas corporais ou medidas da loja.
// ============================================================

export interface BodyCollisionOptions {
  clearance?: number;
  maxCorrectionDistance?: number;
  surfaceTolerance?: number;
  recomputeNormals?: boolean;
}

export interface BodyCollisionResult {
  processedMeshes: number;
  correctedMeshes: number;
  processedVertices: number;
  correctedVertices: number;
  skippedMeshes: number;
  correctionApplied: boolean;
}

interface ResolvedOptions {
  clearance: number;
  maxCorrectionDistance: number;
  surfaceTolerance: number;
  recomputeNormals: boolean;
}

interface CollisionSurface {
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  boundsTree: MeshBVH;
  bounds: THREE.Box3;
  raycaster: THREE.Raycaster;
  nearestPoint: THREE.Vector3;
  rayDirection: THREE.Vector3;
}

interface NearestSurfacePoint {
  point: THREE.Vector3;
  distance: number;
}

const DEFAULT_OPTIONS: ResolvedOptions = {
  clearance: 0.008,
  maxCorrectionDistance: 0.12,
  surfaceTolerance: 0.0005,
  recomputeNormals: true,
};

const EPSILON = 1e-8;

// Direção não alinhada aos eixos principais.
// Ajuda a reduzir casos degenerados na contagem de cruzamentos.
const INTERIOR_RAY_DIRECTION = new THREE.Vector3(
  1,
  0.37139067,
  0.52917312,
).normalize();

// ============================================================
// VALIDAÇÃO
// ============================================================

function isValidVector(vector: THREE.Vector3): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

function resolveOptions(
  options: BodyCollisionOptions,
): ResolvedOptions {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return {
    clearance: Math.max(0, resolved.clearance),
    maxCorrectionDistance: Math.max(
      0,
      resolved.maxCorrectionDistance,
    ),
    surfaceTolerance: Math.max(
      0,
      resolved.surfaceTolerance,
    ),
    recomputeNormals: resolved.recomputeNormals,
  };
}

// ============================================================
// COLETA DAS MALHAS DO AVATAR
// ============================================================

function collectAvatarMeshes(
  avatar: THREE.Object3D,
): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  avatar.updateMatrixWorld(true);

  avatar.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh) {
      return;
    }

    if (!mesh.visible) {
      return;
    }

    if (mesh.userData.collisionIgnored === true) {
      return;
    }

    if (!mesh.geometry) {
      return;
    }

    const position = mesh.geometry.getAttribute('position');

    if (!position || position.count < 3) {
      return;
    }

    meshes.push(mesh);
  });

  return meshes;
}

// ============================================================
// EXTRAÇÃO DOS VÉRTICES DO AVATAR
// ============================================================

function appendMeshTriangles(
  mesh: THREE.Mesh,
  output: number[],
): void {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute | null;

  if (!position) {
    return;
  }

  const index = geometry.getIndex();
  const vertexCount = index ? index.count : position.count;

  const drawStart = Math.max(
    0,
    geometry.drawRange.start,
  );

  const drawCount = Number.isFinite(geometry.drawRange.count)
    ? geometry.drawRange.count
    : vertexCount;

  const drawEnd = Math.min(
    vertexCount,
    drawStart + drawCount,
  );

  const start = Math.ceil(drawStart / 3) * 3;
  const end = Math.floor(drawEnd / 3) * 3;

  const localPoint = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();

  const skinnedMesh = mesh as THREE.SkinnedMesh;
  const isSkinned = skinnedMesh.isSkinnedMesh === true;

  if (isSkinned) {
    skinnedMesh.skeleton?.update();
  }

  for (let offset = start; offset + 2 < end; offset += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const sourceIndex = index
        ? index.getX(offset + corner)
        : offset + corner;

      if (
        sourceIndex < 0 ||
        sourceIndex >= position.count
      ) {
        continue;
      }

      if (isSkinned) {
        skinnedMesh.getVertexPosition(
          sourceIndex,
          localPoint,
        );
      } else {
        localPoint.fromBufferAttribute(
          position,
          sourceIndex,
        );
      }

      worldPoint
        .copy(localPoint)
        .applyMatrix4(mesh.matrixWorld);

      if (!isValidVector(worldPoint)) {
        continue;
      }

      output.push(
        worldPoint.x,
        worldPoint.y,
        worldPoint.z,
      );
    }
  }
}

// ============================================================
// CONSTRUÇÃO DA SUPERFÍCIE DE COLISÃO
// ============================================================

function createCollisionSurface(
  avatar: THREE.Object3D,
): CollisionSurface | null {
  const avatarMeshes = collectAvatarMeshes(avatar);

  if (avatarMeshes.length === 0) {
    return null;
  }

  const vertices: number[] = [];

  for (const mesh of avatarMeshes) {
    appendMeshTriangles(mesh, vertices);
  }

  if (vertices.length < 9) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();

  const boundsTree = new MeshBVH(geometry);

  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(
    geometry,
    material,
  );

  mesh.matrixAutoUpdate = false;
  mesh.matrix.identity();
  mesh.matrixWorld.identity();

  // O Raycaster utilizará a aceleração da BVH.
  mesh.raycast = acceleratedRaycast;

  const raycaster = new THREE.Raycaster();

  raycaster.near = 0;
  raycaster.far = Infinity;

  return {
    geometry,
    mesh,
    boundsTree,
    bounds: geometry.boundingBox!.clone(),
    raycaster,
    nearestPoint: new THREE.Vector3(),
    rayDirection: INTERIOR_RAY_DIRECTION.clone(),
  };
}

// ============================================================
// DETECÇÃO DE PONTO INTERNO
// ============================================================

function isPointInsideAvatar(
  point: THREE.Vector3,
  surface: CollisionSurface,
): boolean {
  if (!surface.bounds.containsPoint(point)) {
    return false;
  }

  surface.raycaster.set(
    point,
    surface.rayDirection,
  );

  const intersections =
    surface.raycaster.intersectObject(
      surface.mesh,
      false,
    );

  if (intersections.length === 0) {
    return false;
  }

  // Agrupa cruzamentos praticamente coincidentes.
  // Isso reduz duplicações causadas por vértices e arestas.
  let uniqueIntersections = 0;
  let previousDistance = -Infinity;

  for (const intersection of intersections) {
    const distance = intersection.distance;

    if (
      Math.abs(distance - previousDistance) > 0.00001
    ) {
      uniqueIntersections++;
      previousDistance = distance;
    }
  }

  // Regra de paridade para superfícies fechadas:
  // número ímpar de cruzamentos = interior.
  return uniqueIntersections % 2 === 1;
}

// ============================================================
// LOCALIZAÇÃO DA SUPERFÍCIE MAIS PRÓXIMA
// ============================================================

function findNearestSurface(
  point: THREE.Vector3,
  surface: CollisionSurface,
): NearestSurfacePoint | null {
  const hit = surface.boundsTree.closestPointToPoint(
    point,
    undefined,
    0,
    Infinity,
  );

  if (!hit || !hit.point || !Number.isFinite(hit.distance)) {
    return null;
  }

  surface.nearestPoint.copy(hit.point);

  return {
    point: surface.nearestPoint.clone(),
    distance: hit.distance,
  };
}

// ============================================================
// CORREÇÃO DE UM VÉRTICE
// ============================================================

function correctVertex(
  worldPosition: THREE.Vector3,
  surface: CollisionSurface,
  options: ResolvedOptions,
): THREE.Vector3 | null {
  if (!isPointInsideAvatar(worldPosition, surface)) {
    return null;
  }

  const nearest = findNearestSurface(
    worldPosition,
    surface,
  );

  if (!nearest) {
    return null;
  }

  if (
    nearest.distance <= options.surfaceTolerance ||
    nearest.distance > options.maxCorrectionDistance
  ) {
    return null;
  }

  // Para um ponto interno, o vetor que vai do ponto
  // interno até a superfície mais próxima indica
  // a direção local de saída do corpo.
  const outwardDirection = nearest.point
    .clone()
    .sub(worldPosition);

  if (outwardDirection.lengthSq() <= EPSILON) {
    return null;
  }

  outwardDirection.normalize();

  const correctedPosition = nearest.point
    .clone()
    .addScaledVector(
      outwardDirection,
      options.clearance,
    );

  if (!isValidVector(correctedPosition)) {
    return null;
  }

  return correctedPosition;
}

// ============================================================
// CORREÇÃO DE UMA MALHA DA ROUPA
// ============================================================

function correctGarmentMesh(
  garmentMesh: THREE.Mesh,
  surface: CollisionSurface,
  options: ResolvedOptions,
): {
  processed: number;
  corrected: number;
  skipped: boolean;
} {
  const geometry = garmentMesh.geometry;

  const position = geometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute | null;

  if (!position || position.count === 0) {
    return {
      processed: 0,
      corrected: 0,
      skipped: true,
    };
  }

  // A geometria de uma SkinnedMesh é controlada pelo esqueleto.
  // Não modificamos diretamente seus vértices.
  if (
    (garmentMesh as THREE.SkinnedMesh).isSkinnedMesh
  ) {
    return {
      processed: 0,
      corrected: 0,
      skipped: true,
    };
  }

  garmentMesh.updateWorldMatrix(true, false);

  const determinant = garmentMesh.matrixWorld.determinant();

  if (
    !Number.isFinite(determinant) ||
    Math.abs(determinant) <= EPSILON
  ) {
    return {
      processed: 0,
      corrected: 0,
      skipped: true,
    };
  }

  const inverseWorldMatrix = garmentMesh.matrixWorld
    .clone()
    .invert();

  const worldPosition = new THREE.Vector3();
  const localPosition = new THREE.Vector3();

  let correctedCount = 0;

  for (let index = 0; index < position.count; index++) {
    localPosition.fromBufferAttribute(
      position,
      index,
    );

    worldPosition
      .copy(localPosition)
      .applyMatrix4(garmentMesh.matrixWorld);

    if (!isValidVector(worldPosition)) {
      continue;
    }

    const correctedWorldPosition = correctVertex(
      worldPosition,
      surface,
      options,
    );

    if (!correctedWorldPosition) {
      continue;
    }

    const correctedLocalPosition =
      correctedWorldPosition
        .applyMatrix4(inverseWorldMatrix);

    position.setXYZ(
      index,
      correctedLocalPosition.x,
      correctedLocalPosition.y,
      correctedLocalPosition.z,
    );

    correctedCount++;
  }

  if (correctedCount > 0) {
    position.needsUpdate = true;

    if (options.recomputeNormals) {
      geometry.computeVertexNormals();
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  return {
    processed: position.count,
    corrected: correctedCount,
    skipped: false,
  };
}

// ============================================================
// CLASSE PRINCIPAL
// ============================================================

export class BodyCollisionSystem {
  private surface: CollisionSurface | null = null;

  private disposed = false;

  /**
   * Prepara a superfície do avatar.
   *
   * Deve ser chamado depois que o avatar estiver
   * carregado e com suas transformações atualizadas.
   *
   * A estrutura espacial é reutilizada nas correções.
   */
  setAvatar(avatar: THREE.Object3D): boolean {
    this.disposeSurface();

    if (!avatar) {
      return false;
    }

    avatar.updateMatrixWorld(true);

    const surface = createCollisionSurface(avatar);

    if (!surface) {
      console.warn(
        'CAIMENT: não foi possível preparar a geometria do avatar.',
      );

      return false;
    }

    this.surface = surface;
    this.disposed = false;

    return true;
  }

  /**
   * Corrige a roupa utilizando a superfície
   * previamente preparada pelo setAvatar().
   */
  correctGarmentCollisions(
    garment: THREE.Object3D,
    customOptions: BodyCollisionOptions = {},
  ): BodyCollisionResult {
    const result: BodyCollisionResult = {
      processedMeshes: 0,
      correctedMeshes: 0,
      processedVertices: 0,
      correctedVertices: 0,
      skippedMeshes: 0,
      correctionApplied: false,
    };

    if (
      this.disposed ||
      !this.surface ||
      !garment
    ) {
      console.warn(
        'CAIMENT: BodyCollisionSystem ainda não foi preparado.',
      );

      return result;
    }

    if (
      garment === this.surface.mesh
    ) {
      return result;
    }

    const options = resolveOptions(customOptions);

    garment.updateMatrixWorld(true);

    const garmentMeshes: THREE.Mesh[] = [];

    garment.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (!mesh.isMesh || !mesh.visible) {
        return;
      }

      if (mesh.userData.collisionIgnored === true) {
        return;
      }

      garmentMeshes.push(mesh);
    });

    for (const mesh of garmentMeshes) {
      const correction = correctGarmentMesh(
        mesh,
        this.surface,
        options,
      );

      if (correction.skipped) {
        result.skippedMeshes++;
        continue;
      }

      result.processedMeshes++;
      result.processedVertices += correction.processed;
      result.correctedVertices += correction.corrected;

      if (correction.corrected > 0) {
        result.correctedMeshes++;
      }
    }

    result.correctionApplied =
      result.correctedVertices > 0;

    garment.updateMatrixWorld(true);

    return result;
  }

  /**
   * Libera a BVH e a geometria temporária.
   */
  private disposeSurface(): void {
    if (!this.surface) {
      return;
    }

    this.surface.geometry.dispose();

    const material = this.surface.mesh.material;

    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material.dispose();
    }

    this.surface = null;
  }

  /**
   * Libera todos os recursos do sistema.
   */
  dispose(): void {
    this.disposeSurface();
    this.disposed = true;
  }
}

// ============================================================
// FUNÇÃO DE COMPATIBILIDADE
// ============================================================

/**
 * Atalho para chamadas pontuais.
 *
 * Para várias correções com o mesmo avatar,
 * prefira instanciar BodyCollisionSystem e reutilizar
 * setAvatar(), evitando reconstruir a BVH.
 */
export function correctGarmentCollisions(
  garment: THREE.Object3D,
  avatar: THREE.Object3D,
  customOptions: BodyCollisionOptions = {},
): BodyCollisionResult {
  const system = new BodyCollisionSystem();

  const result: BodyCollisionResult = {
    processedMeshes: 0,
    correctedMeshes: 0,
    processedVertices: 0,
    correctedVertices: 0,
    skippedMeshes: 0,
    correctionApplied: false,
  };

  try {
    if (!garment || !avatar || garment === avatar) {
      console.warn(
        'CAIMENT: avatar ou roupa inválidos.',
      );

      return result;
    }

    if (!system.setAvatar(avatar)) {
      return result;
    }

    const correction = system.correctGarmentCollisions(
      garment,
      customOptions,
    );

    console.log(
      'CAIMENT — BODY COLLISION RESULT',
      correction,
    );

    return correction;
  } finally {
    system.dispose();
  }
}
