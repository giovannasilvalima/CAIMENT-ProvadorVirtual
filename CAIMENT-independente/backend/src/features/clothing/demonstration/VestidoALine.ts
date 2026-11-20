
import * as THREE from 'three';

export interface VestidoALineMedidas {
  busto: number;
  cintura: number;
  quadril: number;
  larguraOmbros: number;
  comprimento: number;
  comprimentoSaia: number;
  larguraBarra: number;
  comprimentoAlca: number;
  larguraAlca: number;
  folga?: number;
  material?: THREE.Material;
}

type Perfil = {
  y: number;
  largura: number;
  profundidade: number;
};

const SEGMENTOS = 48;

function interpolarPerfil(perfil: Perfil[], subdivisoes = 5): Perfil[] {
  const resultado: Perfil[] = [];

  for (let i = 0; i < perfil.length - 1; i++) {
    const a = perfil[i];
    const b = perfil[i + 1];

    for (let j = 0; j < subdivisoes; j++) {
      const t = j / subdivisoes;

      resultado.push({
        y: THREE.MathUtils.lerp(a.y, b.y, t),
        largura: THREE.MathUtils.lerp(a.largura, b.largura, t),
        profundidade: THREE.MathUtils.lerp(
          a.profundidade,
          b.profundidade,
          t
        )
      });
    }
  }

  resultado.push(perfil[perfil.length - 1]);
  return resultado;
}

function criarSuperficie(
  perfilOriginal: Perfil[],
  material: THREE.Material,
  nome: string,
  fecharBase = true,
  fecharTopo = true
): THREE.Mesh {
  const perfil = interpolarPerfil(perfilOriginal);
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const nivel of perfil) {
    for (let i = 0; i <= SEGMENTOS; i++) {
      const angulo = (i / SEGMENTOS) * Math.PI * 2;

      vertices.push(
        Math.cos(angulo) * nivel.largura * 0.5,
        nivel.y,
        Math.sin(angulo) * nivel.profundidade * 0.5
      );
    }
  }

  for (let y = 0; y < perfil.length - 1; y++) {
    for (let x = 0; x < SEGMENTOS; x++) {
      const a = y * (SEGMENTOS + 1) + x;
      const b = a + SEGMENTOS + 1;

      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  const adicionarTampa = (nivel: number, topo: boolean) => {
    const centro = vertices.length / 3;
    const y = perfil[nivel].y;

    vertices.push(0, y, 0);

    const inicio = nivel * (SEGMENTOS + 1);

    for (let i = 0; i < SEGMENTOS; i++) {
      if (topo) {
        indices.push(centro, inicio + i, inicio + i + 1);
      } else {
        indices.push(centro, inicio + i + 1, inicio + i);
      }
    }
  };

  if (fecharBase) adicionarTampa(0, false);
  if (fecharTopo) adicionarTampa(perfil.length - 1, true);

  const geometria = new THREE.BufferGeometry();

  geometria.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );

  geometria.setIndex(indices);
  geometria.computeVertexNormals();
  geometria.computeBoundingBox();
  geometria.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometria, material);
  mesh.name = nome;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

function criarAlca(
  lado: -1 | 1,
  larguraOmbros: number,
  larguraAlca: number,
  comprimentoAlca: number,
  alturaTopo: number,
  material: THREE.Material
): THREE.Mesh {
  const largura = larguraAlca;
  const espessura = Math.max(larguraAlca * 0.45, 0.004);

  const xBase = lado * larguraOmbros * 0.34;
  const zBase = 0;

  const geometria = new THREE.BufferGeometry();

  const pontos = [
    new THREE.Vector3(
      xBase - largura / 2,
      alturaTopo - comprimentoAlca,
      zBase
    ),
    new THREE.Vector3(
      xBase + largura / 2,
      alturaTopo - comprimentoAlca,
      zBase
    ),
    new THREE.Vector3(
      xBase + largura / 2,
      alturaTopo,
      zBase
    ),
    new THREE.Vector3(
      xBase - largura / 2,
      alturaTopo,
      zBase
    )
  ];

  const vertices: number[] = [];
  const indices: number[] = [];

  const frente = espessura * 0.5;
  const tras = -espessura * 0.5;

  for (const z of [frente, tras]) {
    for (const ponto of pontos) {
      vertices.push(ponto.x, ponto.y, ponto.z + z);
    }
  }

  indices.push(
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0
  );

  geometria.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );

  geometria.setIndex(indices);
  geometria.computeVertexNormals();

  const mesh = new THREE.Mesh(geometria, material);
  mesh.name = lado < 0 ? 'AlcaEsquerda' : 'AlcaDireita';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function criarVestidoALine(
  medidas: VestidoALineMedidas
): THREE.Group {
  const {
    busto,
    cintura,
    quadril,
    larguraOmbros,
    comprimento,
    comprimentoSaia,
    larguraBarra,
    comprimentoAlca,
    larguraAlca,
    folga = 4,
    material = new THREE.MeshStandardMaterial({
      color: '#b3ff79',
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide
    })
  } = medidas;

  const valores = [
    busto,
    cintura,
    quadril,
    larguraOmbros,
    comprimento,
    comprimentoSaia,
    larguraBarra,
    comprimentoAlca,
    larguraAlca,
    folga
  ];

  if (valores.some((v) => !Number.isFinite(v) || v <= 0)) {
    throw new Error(
      'As medidas do vestido devem ser números positivos e válidos.'
    );
  }

  if (
    comprimentoSaia >= comprimento ||
    comprimentoAlca >= comprimento ||
    larguraBarra <= cintura * 0.5
  ) {
    throw new Error(
      'As proporções do vestido A-line são incompatíveis.'
    );
  }

  const s = 0.01;

  const bustoM = (busto + folga) * s;
  const cinturaM = (cintura + folga) * s;
  const quadrilM = (quadril + folga) * s;
  const barraM = (larguraBarra + folga) * s;

  const ombrosM = larguraOmbros * s;
  const alturaTotal = comprimento * s;
  const alturaSaia = comprimentoSaia * s;
  const alturaCorpete = alturaTotal - alturaSaia;

  const alcaAltura = comprimentoAlca * s;
  const alcaLargura = larguraAlca * s;

  const larguraBusto = bustoM / 3.15;
  const profundidadeBusto = bustoM / 3.7;

  const larguraCintura = cinturaM / 3.15;
  const profundidadeCintura = cinturaM / 3.7;

  const larguraQuadril = quadrilM / 3.15;
  const profundidadeQuadril = quadrilM / 3.7;

  const larguraOmbro = Math.max(
    ombrosM,
    larguraBusto * 0.9
  );

  const larguraTopo = Math.min(
    larguraOmbro * 0.48,
    larguraBusto * 0.55
  );

  const profundidadeTopo = profundidadeBusto * 0.72;

  const yCintura = alturaCorpete * 0.48;
  const yBusto = alturaCorpete * 0.79;
  const yAxila = alturaCorpete * 0.88;

  const grupo = new THREE.Group();
  grupo.name = 'VestidoALine';

  // Corpete: cintura definida, busto mais amplo e ombros estreitos.
  const perfilCorpete: Perfil[] = [
    {
      y: 0,
      largura: larguraCintura,
      profundidade: profundidadeCintura
    },
    {
      y: yCintura,
      largura: larguraCintura * 1.01,
      profundidade: profundidadeCintura
    },
    {
      y: yBusto,
      largura: larguraBusto,
      profundidade: profundidadeBusto
    },
    {
      y: yAxila,
      largura: larguraBusto * 0.98,
      profundidade: profundidadeBusto * 0.92
    },
    {
      y: alturaCorpete,
      largura: larguraTopo,
      profundidade: profundidadeTopo
    }
  ];

  const corpete = criarSuperficie(
    perfilCorpete,
    material,
    'Corpete',
    false,
    false
  );

  grupo.add(corpete);

  // Saia evasê: começa na cintura, acompanha o quadril e abre
  // progressivamente até a barra.
  const perfilSaia: Perfil[] = [
    {
      y: 0,
      largura: larguraCintura * 1.015,
      profundidade: profundidadeCintura * 1.015
    },
    {
      y: alturaSaia * 0.16,
      largura: THREE.MathUtils.lerp(
        larguraCintura,
        larguraQuadril,
        0.68
      ),
      profundidade: THREE.MathUtils.lerp(
        profundidadeCintura,
        profundidadeQuadril,
        0.68
      )
    },
    {
      y: alturaSaia * 0.34,
      largura: larguraQuadril,
      profundidade: profundidadeQuadril
    },
    {
      y: alturaSaia * 0.62,
      largura: THREE.MathUtils.lerp(
        larguraQuadril,
        barraM,
        0.48
      ),
      profundidade: THREE.MathUtils.lerp(
        profundidadeQuadril,
        barraM * 0.66,
        0.48
      )
    },
    {
      y: alturaSaia,
      largura: barraM,
      profundidade: barraM * 0.68
    }
  ];

  const saia = criarSuperficie(
    perfilSaia,
    material,
    'SaiaALine',
    true,
    false
  );

  saia.position.y = alturaCorpete;
  grupo.add(saia);

  // Alças com largura e espessura próprias.
  const pontoAlca = alturaTotal - alcaAltura * 0.35;

  grupo.add(
    criarAlca(
      -1,
      larguraOmbro,
      alcaLargura,
      alcaAltura,
      pontoAlca,
      material
    ),
    criarAlca(
      1,
      larguraOmbro,
      alcaLargura,
      alcaAltura,
      pontoAlca,
      material
    )
  );

  grupo.userData = {
    garmentType: 'dress',
    model: 'a-line',
    measurements: {
      busto,
      cintura,
      quadril,
      larguraOmbros,
      comprimento,
      comprimentoSaia,
      larguraBarra,
      comprimentoAlca,
      larguraAlca,
      folga
    },
    dimensions: {
      bustoM,
      cinturaM,
      quadrilM,
      alturaTotal,
      alturaCorpete,
      alturaSaia,
      larguraBarra: barraM,
      alcaAltura,
      alcaLargura
    }
  };

  grupo.updateMatrixWorld(true);

  return grupo;
}
