
import * as THREE from 'three';

export interface ClothSimulationOptions {
  /** Número de iterações das restrições por subpasso. */
  iterations?: number;

  /** Intensidade da gravidade em m/s². */
  gravity?: number;

  /** Resistência ao movimento do tecido. */
  damping?: number;

  /** Rigidez das conexões entre partículas. */
  stiffness?: number;

  /** Quantidade de subpassos físicos por atualização. */
  substeps?: number;

  /** Ativa ou desativa a gravidade. */
  enableGravity?: boolean;

  /** Ativa ou desativa a simulação. */
  enabled?: boolean;
}

export interface ClothParticle {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  acceleration: THREE.Vector3;
  inverseMass: number;
  pinned: boolean;
}

export interface ClothConstraint {
  particleA: number;
  particleB: number;
  restLength: number;
  stiffness: number;
}

export interface ClothSimulationResult {
  positions: Float32Array;
  particles: ClothParticle[];
  constraints: ClothConstraint[];
}

const DEFAULT_OPTIONS: Required<ClothSimulationOptions> = {
  iterations: 8,
  gravity: 9.81,
  damping: 0.985,
  stiffness: 0.9,
  substeps: 2,
  enableGravity: true,
  enabled: true,
};

const MIN_REST_LENGTH = 0.000001;
const MAX_DELTA_TIME = 1 / 30;

export class ClothSimulation {
  readonly particles: ClothParticle[] = [];

  readonly constraints: ClothConstraint[] = [];

  readonly options: Required<ClothSimulationOptions>;

  private readonly gravity: THREE.Vector3;

  private readonly temporaryVector = new THREE.Vector3();

  private readonly constraintDelta = new THREE.Vector3();

  private geometry: THREE.BufferGeometry | null = null;

  private positionAttribute: THREE.BufferAttribute | null = null;

  /**
   * Cópia imutável das posições iniciais.
   *
   * É utilizada pelo reset para restaurar a geometria
   * original, mesmo depois de várias atualizações físicas.
   */
  private initialPositions: Float32Array | null = null;

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

    this.gravity = new THREE.Vector3(
      0,
      this.options.enableGravity
        ? -this.options.gravity
        : 0,
      0,
    );
  }

  /**
   * Valida as opções recebidas.
   */
  private validateOptions(): void {
    const numericOptions: Array<
      keyof Pick<
        ClothSimulationOptions,
        | 'iterations'
        | 'gravity'
        | 'damping'
        | 'stiffness'
        | 'substeps'
      >
    > = [
      'iterations',
      'gravity',
      'damping',
      'stiffness',
      'substeps',
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

    if (this.options.gravity < 0) {
      throw new Error(
        'ClothSimulation: a gravidade não pode ser negativa.',
      );
    }

    if (this.options.iterations < 1) {
      throw new Error(
        'ClothSimulation: iterations deve ser maior ou igual a 1.',
      );
    }

    if (this.options.substeps < 1) {
      throw new Error(
        'ClothSimulation: substeps deve ser maior ou igual a 1.',
      );
    }
  }

  /**
   * Inicializa a simulação a partir de uma geometria Three.js.
   *
   * Cada vértice da geometria representa uma partícula.
   * As arestas dos triângulos geram as restrições estruturais.
   */
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

    if (pinnedVertices.some(
      (index) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= position.count,
    )) {
      throw new Error(
        'ClothSimulation: existe um índice inválido em pinnedVertices.',
      );
    }

    this.geometry = geometry;

    this.positionAttribute =
      position as THREE.BufferAttribute;

    this.particles.length = 0;
    this.constraints.length = 0;

    this.initialPositions = new Float32Array(
      position.count * 3,
    );

    const pinnedSet = new Set(pinnedVertices);

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
          `ClothSimulation: posição inválida no vértice ${i}.`,
        );
      }

      const offset = i * 3;

      this.initialPositions[offset] = x;
      this.initialPositions[offset + 1] = y;
      this.initialPositions[offset + 2] = z;

      const initialPosition = new THREE.Vector3(
        x,
        y,
        z,
      );

      const pinned = pinnedSet.has(i);

      this.particles.push({
        position: initialPosition.clone(),
        previousPosition: initialPosition.clone(),
        acceleration: new THREE.Vector3(),
        inverseMass: pinned ? 0 : 1,
        pinned,
      });
    }

    this.createConstraints(geometry);

    this.updateGeometry();
  }

  /**
   * Cria conexões estruturais usando as arestas dos triângulos.
   *
   * Cada conexão é criada apenas uma vez.
   */
  private createConstraints(
    geometry: THREE.BufferGeometry,
  ): void {
    const position = geometry.getAttribute('position');

    const index = geometry.getIndex();

    const edges = new Set<string>();

    const addConstraint = (
      a: number,
      b: number,
    ): void => {
      if (
        !Number.isInteger(a) ||
        !Number.isInteger(b) ||
        a === b
      ) {
        return;
      }

      if (
        a < 0 ||
        b < 0 ||
        a >= this.particles.length ||
        b >= this.particles.length
      ) {
        return;
      }

      const min = Math.min(a, b);
      const max = Math.max(a, b);

      const key = `${min}:${max}`;

      if (edges.has(key)) {
        return;
      }

      edges.add(key);

      const particleA = this.particles[min];
      const particleB = this.particles[max];

      if (!particleA || !particleB) {
        return;
      }

      const restLength = particleA.position.distanceTo(
        particleB.position,
      );

      if (
        !Number.isFinite(restLength) ||
        restLength <= MIN_REST_LENGTH
      ) {
        return;
      }

      this.constraints.push({
        particleA: min,
        particleB: max,
        restLength,
        stiffness: this.options.stiffness,
      });
    };

    const elementCount = index
      ? index.count
      : position.count;

    if (elementCount % 3 !== 0) {
      throw new Error(
        'ClothSimulation: a geometria possui uma quantidade inválida de índices para triângulos.',
      );
    }

    const triangleCount = elementCount / 3;

    for (let i = 0; i < triangleCount; i++) {
      const offset = i * 3;

      const a = index
        ? index.getX(offset)
        : offset;

      const b = index
        ? index.getX(offset + 1)
        : offset + 1;

      const c = index
        ? index.getX(offset + 2)
        : offset + 2;

      addConstraint(a, b);
      addConstraint(b, c);
      addConstraint(c, a);
    }
  }

  /**
   * Fixa uma partícula no espaço.
   */
  pinParticle(index: number): void {
    const particle = this.particles[index];

    if (!particle) {
      return;
    }

    particle.pinned = true;
    particle.inverseMass = 0;

    particle.previousPosition.copy(
      particle.position,
    );

    particle.acceleration.set(0, 0, 0);
  }

  /**
   * Libera uma partícula anteriormente fixada.
   */
  unpinParticle(index: number): void {
    const particle = this.particles[index];

    if (!particle) {
      return;
    }

    particle.pinned = false;
    particle.inverseMass = 1;

    particle.previousPosition.copy(
      particle.position,
    );
  }

  /**
   * Atualiza a posição de uma partícula fixa.
   */
  movePinnedParticle(
    index: number,
    position: THREE.Vector3,
  ): void {
    const particle = this.particles[index];

    if (
      !particle ||
      !particle.pinned ||
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      return;
    }

    particle.position.copy(position);

    particle.previousPosition.copy(position);

    particle.acceleration.set(0, 0, 0);
  }

  /**
   * Aplica uma força a uma partícula.
   *
   * A força é acumulada como aceleração e considerada
   * no próximo passo físico.
   */
  applyForce(
    index: number,
    force: THREE.Vector3,
  ): void {
    const particle = this.particles[index];

    if (
      !particle ||
      particle.pinned ||
      !force ||
      !Number.isFinite(force.x) ||
      !Number.isFinite(force.y) ||
      !Number.isFinite(force.z)
    ) {
      return;
    }

    particle.acceleration.addScaledVector(
      force,
      particle.inverseMass,
    );
  }

  /**
   * Integração Verlet.
   */
  private integrate(deltaTime: number): void {
    const dtSquared = deltaTime * deltaTime;

    for (const particle of this.particles) {
      if (particle.pinned) {
        continue;
      }

      this.temporaryVector
        .subVectors(
          particle.position,
          particle.previousPosition,
        )
        .multiplyScalar(this.options.damping);

      const currentPosition = particle.position.clone();

      particle.position
        .add(this.temporaryVector)
        .addScaledVector(
          particle.acceleration,
          dtSquared,
        );

      particle.previousPosition.copy(
        currentPosition,
      );

      particle.acceleration.set(0, 0, 0);
    }
  }

  /**
   * Resolve as distâncias entre partículas conectadas.
   */
  private solveConstraints(): void {
    for (const constraint of this.constraints) {
      const particleA =
        this.particles[constraint.particleA];

      const particleB =
        this.particles[constraint.particleB];

      if (!particleA || !particleB) {
        continue;
      }

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

      const inverseMassA = particleA.inverseMass;
      const inverseMassB = particleB.inverseMass;

      const totalInverseMass =
        inverseMassA + inverseMassB;

      if (totalInverseMass <= 0) {
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
   * Atualiza a geometria visual com as posições simuladas.
   */
  private updateGeometry(): void {
    if (
      !this.positionAttribute ||
      !this.geometry
    ) {
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

  /**
   * Executa um passo da simulação.
   */
  step(deltaTime: number): void {
    if (
      !this.options.enabled ||
      this.particles.length === 0
    ) {
      return;
    }

    if (
      !Number.isFinite(deltaTime) ||
      deltaTime <= 0
    ) {
      return;
    }

    const safeDelta = Math.min(
      deltaTime,
      MAX_DELTA_TIME,
    );

    const substepDelta =
      safeDelta / this.options.substeps;

    for (
      let substep = 0;
      substep < this.options.substeps;
      substep++
    ) {
      for (const particle of this.particles) {
        if (particle.pinned) {
          continue;
        }

        particle.acceleration.add(this.gravity);
      }

      this.integrate(substepDelta);

      for (
        let iteration = 0;
        iteration < this.options.iterations;
        iteration++
      ) {
        this.solveConstraints();
      }
    }

    this.updateGeometry();
  }

  /**
   * Restaura a geometria e as partículas para
   * as posições armazenadas na inicialização.
   */
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

      const original = new THREE.Vector3(
        this.initialPositions[offset],
        this.initialPositions[offset + 1],
        this.initialPositions[offset + 2],
      );

      particle.position.copy(original);

      particle.previousPosition.copy(original);

      particle.acceleration.set(0, 0, 0);
    }

    this.updateGeometry();
  }

  /**
   * Retorna uma cópia das posições atuais.
   */
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

  /**
   * Retorna os dados atuais da simulação.
   */
  getResult(): ClothSimulationResult {
    return {
      positions: this.getPositions(),
      particles: this.particles,
      constraints: this.constraints,
    };
  }

  /**
   * Libera as referências internas.
   *
   * Não descarta a geometria Three.js, pois ela pertence
   * ao sistema responsável pela montagem da roupa.
   */
  dispose(): void {
    this.particles.length = 0;
    this.constraints.length = 0;

    this.geometry = null;
    this.positionAttribute = null;
    this.initialPositions = null;
  }
}
