
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export interface ClothSimulationOptions {
  iterations?: number;
  gravity?: number;
  damping?: number;
  stiffness?: number;
  substeps?: number;
  enableGravity?: boolean;
  enabled?: boolean;
  contactDistance?: number;
  bodyClearance?: number;
  contactStrength?: number;
}

export interface ClothParticle {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  acceleration: THREE.Vector3;
  inverseMass: number;
  pinned: boolean;
  restInverseMass: number;
}

export interface ClothConstraint {
  particleA: number;
  particleB: number;
  restLength: number;
  stiffness: number;
  type?: 'structural' | 'seam' | 'bending';
}

export interface ClothSimulationResult {
  positions: Float32Array;
  particles: ClothParticle[];
  constraints: ClothConstraint[];
}

interface WeldConstraintData {
  particleA: number;
  particleB: number;
  restLength?: number;
  stiffness?: number;
}

interface WeldGroupData {
  globalIndices: number[];
}

interface EdgeData {
  opposite: number;
}

const DEFAULT_OPTIONS: Required<ClothSimulationOptions> = {
  iterations: 10,
  gravity: 9.81,
  damping: 0.99,
  stiffness: 0.95,
  substeps: 3,
  enableGravity: true,
  enabled: true,
  contactDistance: 0.05,
  bodyClearance: 0.005,
  contactStrength: 1,
};

const MIN_REST_LENGTH = 0.000001;
const MAX_DELTA_TIME = 1 / 30;
const MIN_MASS = 0.000001;
const POSITION_EPSILON = 0.00001;

export class ClothSimulation {
  readonly particles: ClothParticle[] = [];
  readonly constraints: ClothConstraint[] = [];
  readonly options: Required<ClothSimulationOptions>;

  private readonly gravity: THREE.Vector3;
  private readonly temporaryVector = new THREE.Vector3();
  private readonly constraintDelta = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();

  private geometry: THREE.BufferGeometry | null = null;
  private positionAttribute: THREE.BufferAttribute | null = null;
  private initialPositions: Float32Array | null = null;
  private initialPinnedStates: boolean[] = [];
  private initialInverseMasses: number[] = [];

  private bodyMesh: THREE.Mesh | null = null;
  private garmentObject: THREE.Object3D | null = null;

  private bodyCollisionGeometry: THREE.BufferGeometry | null = null;
  private bodyBVH: MeshBVH | null = null;

  private readonly worldPosition = new THREE.Vector3();
  private readonly localPosition = new THREE.Vector3();
  private readonly correction = new THREE.Vector3();
  private readonly closestPoint = new THREE.Vector3();
  private readonly bodyNormal = new THREE.Vector3();
  private readonly contactDelta = new THREE.Vector3();
  private readonly outwardDirection = new THREE.Vector3();

  private readonly triangleA = new THREE.Vector3();
  private readonly triangleB = new THREE.Vector3();
  private readonly triangleC = new THREE.Vector3();
  private readonly temporaryTriangle = new THREE.Triangle();

  private readonly bodyBounds = new THREE.Box3();
  private readonly inverseGarmentMatrix = new THREE.Matrix4();

  constructor(options: ClothSimulationOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    this.validateOptions();

    this.options.iterations = Math.max(
      1,
      Math.floor(this.options.iterations),
    );

    this.options.substeps = Math.max(
      1,
      Math.floor(this.options.substeps),
    );

    this.options.damping = THREE.MathUtils.clamp(
      this.options.damping,
      0,
      1,
    );

    this.options.stiffness = THREE.MathUtils.clamp(
      this.options.stiffness,
      0,
      1,
    );

    this.options.contactStrength = THREE.MathUtils.clamp(
      this.options.contactStrength,
      0,
      1,
    );

    this.gravity = new THREE.Vector3(
      0,
      this.options.enableGravity
        ? -this.options.gravity
        : 0,
      0,
    );
  }

  private validateOptions(): void {
    const numericOptions: Array<keyof ClothSimulationOptions> = [
      'iterations',
      'gravity',
      'damping',
      'stiffness',
      'substeps',
      'contactDistance',
      'bodyClearance',
      'contactStrength',
    ];

    for (const name of numericOptions) {
      const value = this.options[name];

      if (
        typeof value !== 'number' ||
        !Number.isFinite(value)
      ) {
        throw new Error(
          `ClothSimulation: opção "${name}" deve ser um número finito.`,
        );
      }
    }

    if (
      this.options.gravity < 0 ||
      this.options.iterations < 1 ||
      this.options.substeps < 1 ||
      this.options.contactDistance < 0 ||
      this.options.bodyClearance < 0 ||
      this.options.contactStrength < 0 ||
      this.options.contactStrength > 1
    ) {
      throw new Error(
        'ClothSimulation: opções físicas inválidas.',
      );
    }

    if (
      typeof this.options.enableGravity !== 'boolean' ||
      typeof this.options.enabled !== 'boolean'
    ) {
      throw new Error(
        'ClothSimulation: enableGravity e enabled devem ser booleanos.',
      );
    }
  }

  setBodySurface(
    bodyMesh: THREE.Mesh,
    garmentObject?: THREE.Object3D,
  ): void {
    if (!bodyMesh?.isMesh || !bodyMesh.geometry) {
      throw new Error(
        'ClothSimulation: a superfície corporal precisa ser uma THREE.Mesh válida.',
      );
    }

    if (!this.geometry) {
      throw new Error(
        'ClothSimulation: inicialize a geometria da roupa antes de definir o avatar.',
      );
    }

    this.bodyMesh = bodyMesh;
    this.garmentObject = garmentObject ?? null;

    this.rebuildBodySurface();
  }

  clearBodySurface(): void {
    this.bodyMesh = null;
    this.garmentObject = null;
    this.disposeBodyAcceleration();
  }

  refreshBodySurface(): void {
    if (this.bodyMesh) {
      this.rebuildBodySurface();
    }
  }

  private rebuildBodySurface(): void {
    if (!this.bodyMesh) return;

    this.bodyMesh.updateWorldMatrix(true, false);

    const sourceGeometry = this.bodyMesh.geometry;
    const position = sourceGeometry.getAttribute('position');
    const index = sourceGeometry.getIndex();

    if (!position || position.itemSize !== 3) {
      throw new Error(
        'ClothSimulation: avatar sem atributo position válido.',
      );
    }

    const elementCount = index ? index.count : position.count;

    if (elementCount < 3 || elementCount % 3 !== 0) {
      throw new Error(
        'ClothSimulation: geometria corporal sem triângulos válidos.',
      );
    }

    this.disposeBodyAcceleration();

    const collisionGeometry = sourceGeometry.clone();

    collisionGeometry.applyMatrix4(this.bodyMesh.matrixWorld);

    const collisionPosition =
      collisionGeometry.getAttribute('position');

    if (!collisionPosition || collisionPosition.count < 3) {
      collisionGeometry.dispose();

      throw new Error(
        'ClothSimulation: não foi possível preparar a geometria de colisão.',
      );
    }

    try {
      this.bodyBVH = new MeshBVH(collisionGeometry);
      this.bodyCollisionGeometry = collisionGeometry;

      this.bodyBounds.makeEmpty();

      for (let i = 0; i < collisionPosition.count; i++) {
        this.triangleA.fromBufferAttribute(
          collisionPosition,
          i,
        );

        this.bodyBounds.expandByPoint(this.triangleA);
      }
    } catch (error) {
      collisionGeometry.dispose();

      throw new Error(
        `ClothSimulation: falha ao construir BVH do avatar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private disposeBodyAcceleration(): void {
    this.bodyBVH = null;

    if (this.bodyCollisionGeometry) {
      this.bodyCollisionGeometry.dispose();
      this.bodyCollisionGeometry = null;
    }
  }

  private getVertexMass(
    geometry: THREE.BufferGeometry,
    index: number,
  ): number {
    const massAttribute = geometry.getAttribute('mass');

    if (massAttribute && index < massAttribute.count) {
      const mass = massAttribute.getX(index);

      if (Number.isFinite(mass) && mass > 0) {
        return mass;
      }
    }

    const vertexMasses = geometry.userData.vertexMasses as
      | number[]
      | Float32Array
      | undefined;

    if (vertexMasses && index < vertexMasses.length) {
      const mass = vertexMasses[index];

      if (Number.isFinite(mass) && mass > 0) {
        return mass;
      }
    }

    const masses = geometry.userData.masses as
      | number[]
      | Float32Array
      | undefined;

    if (masses && index < masses.length) {
      const mass = masses[index];

      if (Number.isFinite(mass) && mass > 0) {
        return mass;
      }
    }

    return 1;
  }

  initialize(
    geometry: THREE.BufferGeometry,
    pinnedVertices: number[] = [],
  ): void {
    if (!geometry) {
      throw new Error(
        'ClothSimulation: geometria não informada.',
      );
    }

    const position = geometry.getAttribute('position');

    if (
      !position ||
      position.itemSize !== 3 ||
      position.count < 3
    ) {
      throw new Error(
        'ClothSimulation: geometria sem atributo position válido.',
      );
    }

    if (
      !Array.isArray(pinnedVertices) ||
      pinnedVertices.some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= position.count,
      )
    ) {
      throw new Error(
        'ClothSimulation: existe um índice inválido em pinnedVertices.',
      );
    }

    this.geometry = geometry;
    this.positionAttribute = position as THREE.BufferAttribute;

    this.particles.length = 0;
    this.constraints.length = 0;

    this.initialPinnedStates = [];
    this.initialInverseMasses = [];

    this.initialPositions = new Float32Array(
      position.count * 3,
    );

    const pinnedSet = new Set(pinnedVertices);

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);

      if (![x, y, z].every(Number.isFinite)) {
        throw new Error(
          `ClothSimulation: posição inválida no vértice ${i}.`,
        );
      }

      const offset = i * 3;

      this.initialPositions[offset] = x;
      this.initialPositions[offset + 1] = y;
      this.initialPositions[offset + 2] = z;

      const mass = this.getVertexMass(geometry, i);
      const restInverseMass = 1 / Math.max(mass, MIN_MASS);
      const pinned = pinnedSet.has(i);

      const initialPosition = new THREE.Vector3(x, y, z);

      this.particles.push({
        position: initialPosition.clone(),
        previousPosition: initialPosition.clone(),
        acceleration: new THREE.Vector3(),
        inverseMass: pinned ? 0 : restInverseMass,
        pinned,
        restInverseMass,
      });

      this.initialPinnedStates.push(pinned);
      this.initialInverseMasses.push(restInverseMass);
    }

    this.createConstraints(geometry);
    this.updateGeometry();

    if (this.bodyMesh) {
      this.rebuildBodySurface();
    }
  }

  private addConstraint(
    a: number,
    b: number,
    restLength: number,
    stiffness: number,
    type: 'structural' | 'seam' | 'bending',
    existingEdges: Set<string>,
  ): void {
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a === b ||
      a < 0 ||
      b < 0 ||
      a >= this.particles.length ||
      b >= this.particles.length
    ) {
      return;
    }

    if (
      !Number.isFinite(restLength) ||
      restLength < 0 ||
      !Number.isFinite(stiffness)
    ) {
      return;
    }

    const min = Math.min(a, b);
    const max = Math.max(a, b);
    const key = `${min}:${max}`;

    if (existingEdges.has(key)) return;

    existingEdges.add(key);

    this.constraints.push({
      particleA: min,
      particleB: max,
      restLength,
      stiffness: THREE.MathUtils.clamp(stiffness, 0, 1),
      type,
    });
  }

  private getGeometricEdgeKey(
    a: THREE.Vector3,
    b: THREE.Vector3,
  ): string {
    const quantize = (value: number) =>
      Math.round(value / POSITION_EPSILON);

    const pointA = [
      quantize(a.x),
      quantize(a.y),
      quantize(a.z),
    ].join(',');

    const pointB = [
      quantize(b.x),
      quantize(b.y),
      quantize(b.z),
    ].join(',');

    return pointA < pointB
      ? `${pointA}|${pointB}`
      : `${pointB}|${pointA}`;
  }

  private createBendingConstraints(
    geometry: THREE.BufferGeometry,
    existingEdges: Set<string>,
  ): void {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();

    const edgeMap = new Map<string, EdgeData[]>();
    const elementCount = index ? index.count : position.count;

    for (let i = 0; i < elementCount; i += 3) {
      const ids = [
        index ? index.getX(i) : i,
        index ? index.getX(i + 1) : i + 1,
        index ? index.getX(i + 2) : i + 2,
      ];

      const [a, b, c] = ids;

      if (
        ids.some(
          (id) =>
            !Number.isInteger(id) ||
            id < 0 ||
            id >= position.count,
        )
      ) {
        continue;
      }

      const edges: Array<[number, number, number]> = [
        [a, b, c],
        [b, c, a],
        [c, a, b],
      ];

      for (const [edgeA, edgeB, opposite] of edges) {
        this.triangleA.fromBufferAttribute(position, edgeA);
        this.triangleB.fromBufferAttribute(position, edgeB);

        const key = this.getGeometricEdgeKey(
          this.triangleA,
          this.triangleB,
        );

        const entries = edgeMap.get(key) ?? [];

        entries.push({ opposite });
        edgeMap.set(key, entries);
      }
    }

    const bendingStiffness = THREE.MathUtils.clamp(
      this.options.stiffness * 0.35,
      0.15,
      0.65,
    );

    for (const entries of edgeMap.values()) {
      if (entries.length !== 2) continue;

      const first = entries[0];
      const second = entries[1];

      if (first.opposite === second.opposite) continue;

      const restLength = this.particles[
        first.opposite
      ].position.distanceTo(
        this.particles[second.opposite].position,
      );

      if (
        !Number.isFinite(restLength) ||
        restLength <= MIN_REST_LENGTH
      ) {
        continue;
      }

      this.addConstraint(
        first.opposite,
        second.opposite,
        restLength,
        bendingStiffness,
        'bending',
        existingEdges,
      );
    }
  }

  private createConstraints(
    geometry: THREE.BufferGeometry,
  ): void {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();

    const existingEdges = new Set<string>();
    const elementCount = index ? index.count : position.count;

    if (elementCount % 3 !== 0) {
      throw new Error(
        'ClothSimulation: a geometria possui uma quantidade inválida de índices para triângulos.',
      );
    }

    for (let i = 0; i < elementCount; i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;

      for (const vertexIndex of [a, b, c]) {
        if (
          !Number.isInteger(vertexIndex) ||
          vertexIndex < 0 ||
          vertexIndex >= this.particles.length
        ) {
          throw new Error(
            `ClothSimulation: índice inválido no triângulo ${i / 3}.`,
          );
        }
      }

      this.addStructuralConstraint(a, b, existingEdges);
      this.addStructuralConstraint(b, c, existingEdges);
      this.addStructuralConstraint(c, a, existingEdges);
    }

    this.createBendingConstraints(geometry, existingEdges);

    const weldConstraints = geometry.userData.weldConstraints as
      | WeldConstraintData[]
      | undefined;

    if (Array.isArray(weldConstraints)) {
      for (const weld of weldConstraints) {
        if (!weld) continue;

        if (
          !Number.isInteger(weld.particleA) ||
          !Number.isInteger(weld.particleB) ||
          weld.particleA < 0 ||
          weld.particleB < 0 ||
          weld.particleA >= this.particles.length ||
          weld.particleB >= this.particles.length
        ) {
          throw new Error(
            'ClothSimulation: weldConstraint referencia uma partícula inexistente.',
          );
        }

        this.addConstraint(
          weld.particleA,
          weld.particleB,
          weld.restLength ?? 0,
          weld.stiffness ?? this.options.stiffness,
          'seam',
          existingEdges,
        );
      }
    }

    if (
      !Array.isArray(weldConstraints) ||
      weldConstraints.length === 0
    ) {
      const weldGroups = geometry.userData.weldGroups as
        | WeldGroupData[]
        | undefined;

      if (Array.isArray(weldGroups)) {
        for (const group of weldGroups) {
          if (
            !Array.isArray(group.globalIndices) ||
            group.globalIndices.length < 2
          ) {
            continue;
          }

          const first = group.globalIndices[0];

          for (
            let i = 1;
            i < group.globalIndices.length;
            i++
          ) {
            this.addConstraint(
              first,
              group.globalIndices[i],
              0,
              1,
              'seam',
              existingEdges,
            );
          }
        }
      }
    }
  }

  private addStructuralConstraint(
    a: number,
    b: number,
    existingEdges: Set<string>,
  ): void {
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a === b ||
      a < 0 ||
      b < 0 ||
      a >= this.particles.length ||
      b >= this.particles.length
    ) {
      return;
    }

    const restLength = this.particles[a].position.distanceTo(
      this.particles[b].position,
    );

    if (
      !Number.isFinite(restLength) ||
      restLength <= MIN_REST_LENGTH
    ) {
      return;
    }

    this.addConstraint(
      a,
      b,
      restLength,
      this.options.stiffness,
      'structural',
      existingEdges,
    );
  }

  pinParticle(index: number): void {
    const particle = this.particles[index];

    if (!particle) return;

    particle.pinned = true;
    particle.inverseMass = 0;
    particle.previousPosition.copy(particle.position);
    particle.acceleration.set(0, 0, 0);
  }

  unpinParticle(index: number): void {
    const particle = this.particles[index];

    if (!particle) return;

    particle.pinned = false;
    particle.inverseMass = particle.restInverseMass;
    particle.previousPosition.copy(particle.position);
    particle.acceleration.set(0, 0, 0);
  }

  movePinnedParticle(
    index: number,
    position: THREE.Vector3,
  ): void {
    const particle = this.particles[index];

    if (
      !particle ||
      !particle.pinned ||
      !position ||
      ![position.x, position.y, position.z].every(
        Number.isFinite,
      )
    ) {
      return;
    }

    particle.position.copy(position);
    particle.previousPosition.copy(position);
    particle.acceleration.set(0, 0, 0);
  }

  applyForce(
    index: number,
    force: THREE.Vector3,
  ): void {
    const particle = this.particles[index];

    if (
      !particle ||
      particle.pinned ||
      !force ||
      ![force.x, force.y, force.z].every(Number.isFinite)
    ) {
      return;
    }

    particle.acceleration.addScaledVector(
      force,
      particle.inverseMass,
    );
  }

  private integrate(deltaTime: number): void {
    const dtSquared = deltaTime * deltaTime;

    for (const particle of this.particles) {
      if (particle.pinned) continue;

      this.temporaryVector
        .subVectors(
          particle.position,
          particle.previousPosition,
        )
        .multiplyScalar(this.options.damping);

      this.previousPosition.copy(particle.position);

      particle.position
        .add(this.temporaryVector)
        .addScaledVector(particle.acceleration, dtSquared);

      particle.previousPosition.copy(this.previousPosition);
      particle.acceleration.set(0, 0, 0);
    }
  }

  private solveConstraints(): void {
    for (const constraint of this.constraints) {
      const particleA = this.particles[constraint.particleA];
      const particleB = this.particles[constraint.particleB];

      if (!particleA || !particleB) continue;

      const inverseMassA = particleA.inverseMass;
      const inverseMassB = particleB.inverseMass;
      const totalInverseMass = inverseMassA + inverseMassB;

      if (totalInverseMass <= 0) continue;

      this.constraintDelta.subVectors(
        particleB.position,
        particleA.position,
      );

      const distance = this.constraintDelta.length();

      if (
        !Number.isFinite(distance) ||
        distance <= MIN_REST_LENGTH
      ) {
        continue;
      }

      const difference =
        (distance - constraint.restLength) / distance;

      this.constraintDelta.multiplyScalar(
        difference * constraint.stiffness,
      );

      if (!particleA.pinned) {
        particleA.position.addScaledVector(
          this.constraintDelta,
          inverseMassA / totalInverseMass,
        );
      }

      if (!particleB.pinned) {
        particleB.position.addScaledVector(
          this.constraintDelta,
          -inverseMassB / totalInverseMass,
        );
      }
    }
  }

  /**
   * Orienta a normal do triângulo para fora do volume aproximado
   * do avatar. A orientação original dos triângulos não é confiável
   * em todos os modelos GLB/GLTF.
   */
  private orientBodyNormal(
    normal: THREE.Vector3,
    surfacePoint: THREE.Vector3,
    particlePosition: THREE.Vector3,
    signedDistance: number,
  ): boolean {
    if (
      !Number.isFinite(normal.x) ||
      !Number.isFinite(normal.y) ||
      !Number.isFinite(normal.z) ||
      normal.lengthSq() < 1e-12
    ) {
      return false;
    }

    normal.normalize();

    // Quando a partícula está fora do corpo, a direção entre
    // a superfície e a partícula é a referência mais confiável.
    if (signedDistance > POSITION_EPSILON) {
      this.outwardDirection
        .subVectors(particlePosition, surfacePoint);

      if (this.outwardDirection.lengthSq() > 1e-12) {
        this.outwardDirection.normalize();

        if (normal.dot(this.outwardDirection) < 0) {
          normal.negate();
        }

        return true;
      }
    }

    // Quando a partícula já está dentro da superfície, sua
    // direção não pode determinar o lado externo. Usamos o
    // centro do volume do avatar como referência aproximada.
    this.outwardDirection
      .subVectors(surfacePoint, this.bodyBounds.getCenter(this.temporaryVector));

    if (this.outwardDirection.lengthSq() > 1e-12) {
      this.outwardDirection.normalize();

      if (normal.dot(this.outwardDirection) < 0) {
        normal.negate();
      }

      return true;
    }

    return true;
  }

  /**
   * Corrige partículas próximas ou penetrando o avatar.
   *
   * A consulta BVH é feita em coordenadas mundiais.
   * As posições da roupa continuam em coordenadas locais.
   *
   * A consulta sem limite de distância permite encontrar também
   * partículas que já atravessaram a superfície corporal.
   */
  private solveSurfaceContact(): void {
    if (!this.bodyBVH || !this.bodyCollisionGeometry) {
      return;
    }

    const contactDistance = this.options.contactDistance;
    const clearance = this.options.bodyClearance;
    const strength = this.options.contactStrength;

    if (strength <= 0) {
      return;
    }

    let garmentMatrix: THREE.Matrix4 | null = null;

    if (this.garmentObject) {
      this.garmentObject.updateWorldMatrix(true, false);

      garmentMatrix = this.garmentObject.matrixWorld;

      this.inverseGarmentMatrix
        .copy(garmentMatrix)
        .invert();
    }

    const bodyPosition =
      this.bodyCollisionGeometry.getAttribute('position');

    const bodyIndex = this.bodyCollisionGeometry.getIndex();

    for (const particle of this.particles) {
      if (particle.pinned || particle.inverseMass <= 0) {
        continue;
      }

      this.worldPosition.copy(particle.position);

      if (garmentMatrix) {
        this.worldPosition.applyMatrix4(garmentMatrix);
      }

      // Não limitar a busca a contactDistance:
      // isso permite detectar penetrações mais profundas.
      const result = this.bodyBVH.closestPointToPoint(
        this.worldPosition,
        undefined,
        0,
        Infinity,
      );

      if (!result || !Number.isFinite(result.distance)) {
        continue;
      }

      this.closestPoint.copy(result.point);

      const faceOffset = result.faceIndex * 3;

      const ia = bodyIndex
        ? bodyIndex.getX(faceOffset)
        : faceOffset;

      const ib = bodyIndex
        ? bodyIndex.getX(faceOffset + 1)
        : faceOffset + 1;

      const ic = bodyIndex
        ? bodyIndex.getX(faceOffset + 2)
        : faceOffset + 2;

      if (
        ia < 0 ||
        ib < 0 ||
        ic < 0 ||
        ia >= bodyPosition.count ||
        ib >= bodyPosition.count ||
        ic >= bodyPosition.count
      ) {
        continue;
      }

      this.triangleA.fromBufferAttribute(bodyPosition, ia);
      this.triangleB.fromBufferAttribute(bodyPosition, ib);
      this.triangleC.fromBufferAttribute(bodyPosition, ic);

      this.temporaryTriangle.set(
        this.triangleA,
        this.triangleB,
        this.triangleC,
      );

      this.temporaryTriangle.getNormal(this.bodyNormal);

      if (
        !Number.isFinite(this.bodyNormal.x) ||
        !Number.isFinite(this.bodyNormal.y) ||
        !Number.isFinite(this.bodyNormal.z) ||
        this.bodyNormal.lengthSq() < 1e-12
      ) {
        continue;
      }

      this.contactDelta.subVectors(
        this.worldPosition,
        this.closestPoint,
      );

      const rawSignedDistance = this.contactDelta.dot(
        this.bodyNormal,
      );

      if (
        !this.orientBodyNormal(
          this.bodyNormal,
          this.closestPoint,
          this.worldPosition,
          rawSignedDistance,
        )
      ) {
        continue;
      }

      const signedDistance = this.contactDelta.dot(
        this.bodyNormal,
      );

      if (!Number.isFinite(signedDistance)) {
        continue;
      }

      // Partículas externas muito distantes não precisam
      // participar da correção.
      if (
        signedDistance >= clearance &&
        result.distance > contactDistance
      ) {
        continue;
      }

      if (signedDistance >= clearance) {
        continue;
      }

      const requiredCorrection =
        (clearance - signedDistance) * strength;

      if (
        !Number.isFinite(requiredCorrection) ||
        requiredCorrection <= 0
      ) {
        continue;
      }

      // Limita o deslocamento por iteração para evitar saltos
      // bruscos quando uma partícula está muito penetrada.
      const maxCorrection = Math.max(
        contactDistance,
        clearance,
        0.01,
      );

      const correctionAmount = Math.min(
        requiredCorrection,
        maxCorrection,
      );

      this.correction
        .copy(this.bodyNormal)
        .multiplyScalar(correctionAmount);

      this.worldPosition.add(this.correction);

      if (garmentMatrix) {
        this.localPosition
          .copy(this.worldPosition)
          .applyMatrix4(this.inverseGarmentMatrix);
      } else {
        this.localPosition.copy(this.worldPosition);
      }

      const localCorrection = this.localPosition.sub(
        particle.position,
      );

      particle.position.add(localCorrection);
      particle.previousPosition.add(localCorrection);
    }
  }

  private updateGeometry(): void {
    if (!this.positionAttribute || !this.geometry) {
      return;
    }

    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];

      this.positionAttribute.setXYZ(
        i,
        particle.position.x,
        particle.position.y,
        particle.position.z,
      );
    }

    this.positionAttribute.needsUpdate = true;

    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();
  }

  step(deltaTime: number): void {
    if (
      !this.options.enabled ||
      this.particles.length === 0
    ) {
      return;
    }

    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const safeDelta = Math.min(deltaTime, MAX_DELTA_TIME);
    const substepDelta = safeDelta / this.options.substeps;

    for (
      let substep = 0;
      substep < this.options.substeps;
      substep++
    ) {
      for (const particle of this.particles) {
        if (!particle.pinned) {
          particle.acceleration.add(this.gravity);
        }
      }

      this.integrate(substepDelta);

      for (
        let iteration = 0;
        iteration < this.options.iterations;
        iteration++
      ) {
        this.solveConstraints();
        this.solveSurfaceContact();
      }
    }

    this.updateGeometry();
  }

  reset(): void {
    if (
      !this.geometry ||
      !this.positionAttribute ||
      !this.initialPositions
    ) {
      return;
    }

    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      const offset = i * 3;

      particle.position.set(
        this.initialPositions[offset],
        this.initialPositions[offset + 1],
        this.initialPositions[offset + 2],
      );

      particle.previousPosition.copy(particle.position);
      particle.acceleration.set(0, 0, 0);

      const initiallyPinned =
        this.initialPinnedStates[i] ?? false;

      particle.pinned = initiallyPinned;

      particle.restInverseMass =
        this.initialInverseMasses[i] ?? 1;

      particle.inverseMass = initiallyPinned
        ? 0
        : particle.restInverseMass;
    }

    this.updateGeometry();
  }

  getPositions(): Float32Array {
    const result = new Float32Array(
      this.particles.length * 3,
    );

    for (let i = 0; i < this.particles.length; i++) {
      const position = this.particles[i].position;
      const offset = i * 3;

      result[offset] = position.x;
      result[offset + 1] = position.y;
      result[offset + 2] = position.z;
    }

    return result;
  }

  getResult(): ClothSimulationResult {
    return {
      positions: this.getPositions(),

      particles: this.particles.map((particle) => ({
        position: particle.position.clone(),
        previousPosition: particle.previousPosition.clone(),
        acceleration: particle.acceleration.clone(),
        inverseMass: particle.inverseMass,
        pinned: particle.pinned,
        restInverseMass: particle.restInverseMass,
      })),

      constraints: this.constraints.map((constraint) => ({
        ...constraint,
      })),
    };
  }

  dispose(): void {
    this.particles.length = 0;
    this.constraints.length = 0;

    this.initialPinnedStates = [];
    this.initialInverseMasses = [];

    this.disposeBodyAcceleration();

    this.bodyMesh = null;
    this.garmentObject = null;

    this.geometry = null;
    this.positionAttribute = null;
    this.initialPositions = null;
  }
}
