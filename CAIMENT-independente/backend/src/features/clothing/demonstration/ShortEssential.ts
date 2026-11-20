
import * as THREE from 'three';

export interface ShortEssentialMedidas {
  cintura: number;
  quadril: number;
  comprimentoTotal: number;
  comprimentoEntrepernas: number;
  larguraCoxa: number;
  larguraBarra: number;
  alturaGancho: number;
  alturaCos: number;
  folga?: number;
  material?: THREE.Material;
}

type Perfil = {
  y: number;
  largura: number;
  profundidade: number;
  centroZ?: number;
};

const SEGMENTOS = 40;

function suavizarPerfil(perfil: Perfil[], subdivisoes = 4): Perfil[] {
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
        ),
        centroZ: THREE.MathUtils.lerp(
          a.centroZ ?? 0,
          b.centroZ ?? 0,
          t
        )
      });
    }
  }

  resultado.push(perfil[perfil.length - 1]);
  return resultado;
}

function criarSuperficieFechada(
  perfil: Perfil[],
  centroX: number,
  material: THREE.Material,
  nome: string
): THREE.Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];

  const niveis = suavizarPerfil(perfil);

  for (const nivel of niveis) {
    for (let i = 0; i <= SEGMENTOS; i++) {
      const angulo = (i / SEGMENTOS) * Math.PI * 2;

      vertices.push(
        centroX + Math.cos(angulo) * nivel.largura * 0.5,
        nivel.y,
        (nivel.centroZ ?? 0) +
          Math.sin(angulo) * nivel.profundidade * 0.5
      );
    }
  }

  for (let y = 0; y < niveis.length - 1; y++) {
    for (let x = 0; x < SEGMENTOS; x++) {
      const a = y * (SEGMENTOS + 1) + x;
      const b = a + SEGMENTOS + 1;

      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  const adicionarTampa = (nivel: number, topo: boolean) => {
    const centro = vertices.length / 3;
    const p = niveis[nivel];

    vertices.push(
      centroX,
      p.y,
      p.centroZ ?? 0
    );

    const inicio = nivel * (SEGMENTOS + 1);

    for (let i = 0; i < SEGMENTOS; i++) {
      if (topo) {
        indices.push(centro, inicio + i, inicio + i + 1);
      } else {
        indices.push(centro, inicio + i + 1, inicio + i);
      }
    }
  };

  adicionarTampa(0, false);
  adicionarTampa(niveis.length - 1, true);

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

function criarPerna(
  lado: -1 | 1,
  alturaBarra: number,
  alturaGancho: number,
  larguraCoxa: number,
  larguraBarra: number,
  profundidadeQuadril: number,
  material: THREE.Material
): THREE.Mesh {
  const centroX = lado * larguraCoxa * 0.31;

  const perfil: Perfil[] = [
    {
      y: alturaBarra,
      largura: larguraBarra,
      profundidade: larguraBarra * 0.76
    },
    {
      y: alturaBarra + alturaGancho * 0.08,
      largura: larguraBarra * 0.98,
      profundidade: larguraBarra * 0.75
    },
    {
      y: alturaBarra + alturaGancho * 0.32,
      largura: THREE.MathUtils.lerp(
        larguraBarra,
        larguraCoxa,
        0.28
      ),
      profundidade: profundidadeQuadril * 0.8
    },
    {
      y: alturaBarra + alturaGancho * 0.65,
      largura: THREE.MathUtils.lerp(
        larguraBarra,
        larguraCoxa,
        0.72
      ),
      profundidade: profundidadeQuadril * 0.9
    },
    {
      y: alturaBarra + alturaGancho,
      largura: larguraCoxa,
      profundidade: profundidadeQuadril
    }
  ];

  return criarSuperficieFechada(
    perfil,
    centroX,
    material,
    lado < 0 ? 'PernaEsquerda' : 'PernaDireita'
  );
}

function criarQuadril(
  larguraCintura: number,
  profundidadeCintura: number,
  larguraQuadril: number,
  profundidadeQuadril: number,
  yBase: number,
  yTopo: number,
  material: THREE.Material
): THREE.Mesh {
  const altura = yTopo - yBase;

  const perfil: Perfil[] = [
    {
      y: yBase,
      largura: larguraQuadril * 0.69,
      profundidade: profundidadeQuadril * 0.72
    },
    {
      y: yBase + altura * 0.16,
      largura: larguraQuadril * 0.85,
      profundidade: profundidadeQuadril * 0.87
    },
    {
      y: yBase + altura * 0.42,
      largura: larguraQuadril,
      profundidade: profundidadeQuadril
    },
    {
      y: yBase + altura * 0.68,
      largura: THREE.MathUtils.lerp(
        larguraQuadril,
        larguraCintura,
        0.35
      ),
      profundidade: THREE.MathUtils.lerp(
        profundidadeQuadril,
        profundidadeCintura,
        0.35
      )
    },
    {
      y: yTopo,
      largura: larguraCintura,
      profundidade: profundidadeCintura
    }
  ];

  return criarSuperficieFechada(
    perfil,
    0,
    material,
    'Quadril'
  );
}

function criarCos(
  largura: number,
  profundidade: number,
  y: number,
  altura: number,
  material: THREE.Material
): THREE.Mesh {
  const perfil: Perfil[] = [
    { y, largura, profundidade },
    {
      y: y + altura * 0.12,
      largura: largura * 1.01,
      profundidade: profundidade * 1.01
    },
    {
      y: y + altura * 0.88,
      largura: largura * 1.01,
      profundidade: profundidade * 1.01
    },
    { y: y + altura, largura, profundidade }
  ];

  const mesh = criarSuperficieFechada(
    perfil,
    0,
    material,
    'Cos'
  );

  return mesh;
}

export function criarShortEssential(
  medidas: ShortEssentialMedidas
): THREE.Group {
  const {
    cintura,
    quadril,
    comprimentoTotal,
    comprimentoEntrepernas,
    larguraCoxa,
    larguraBarra,
    alturaGancho,
    alturaCos,
    folga = 4,
    material = new THREE.MeshStandardMaterial({
      color: '#9254e1',
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide
    })
  } = medidas;

  const valores = [
    cintura,
    quadril,
    comprimentoTotal,
    comprimentoEntrepernas,
    larguraCoxa,
    larguraBarra,
    alturaGancho,
    alturaCos,
    folga
  ];

  if (valores.some((v) => !Number.isFinite(v) || v <= 0)) {
    throw new Error(
      'As medidas do short devem ser números positivos e válidos.'
    );
  }

  if (
    comprimentoEntrepernas >= comprimentoTotal ||
    alturaCos >= comprimentoTotal ||
    larguraCoxa <= 0 ||
    larguraBarra <= 0
  ) {
    throw new Error(
      'As medidas de comprimento e largura do short são incompatíveis.'
    );
  }

  const escala = 0.01;

  const cinturaM = (cintura + folga) * escala;
  const quadrilM = (quadril + folga) * escala;

  const coxaM = (larguraCoxa + folga * 0.5) * escala;
  const barraM = (larguraBarra + folga * 0.5) * escala;

  const comprimentoTotalM = comprimentoTotal * escala;
  const comprimentoInternoM = comprimentoEntrepernas * escala;
  const alturaGanchoM = alturaGancho * escala;
  const alturaCosM = alturaCos * escala;

  const alturaExterna = comprimentoTotalM - alturaCosM;

  // O comprimento interno posiciona a virilha em relação à barra.
  const alturaInterna = Math.min(
    comprimentoInternoM,
    alturaExterna * 0.9
  );

  // A altura de gancho também participa da profundidade do cavalo.
  const profundidadeGancho = Math.max(
    alturaGanchoM,
    alturaExterna - alturaInterna
  );

  const yBarra = alturaCosM;
  const yVirilha = yBarra + alturaInterna;
  const yTopo = comprimentoTotalM;

  const larguraCintura = cinturaM / 2.15;
  const profundidadeCintura = larguraCintura * 0.65;

  const larguraQuadril = quadrilM / 2.15;
  const profundidadeQuadril = larguraQuadril * 0.69;

  const grupo = new THREE.Group();
  grupo.name = 'ShortEssential';

  // Pernas independentes com volume oval e abertura própria.
  grupo.add(
    criarPerna(
      -1,
      yBarra,
      alturaInterna,
      coxaM,
      barraM,
      profundidadeQuadril,
      material
    ),
    criarPerna(
      1,
      yBarra,
      alturaInterna,
      coxaM,
      barraM,
      profundidadeQuadril,
      material
    )
  );

  // Quadril arredondado, com volume frontal e traseiro.
  const quadrilMesh = criarQuadril(
    larguraCintura,
    profundidadeCintura,
    larguraQuadril,
    profundidadeQuadril,
    yVirilha - profundidadeGancho * 0.25,
    yTopo - alturaCosM,
    material
  );

  grupo.add(quadrilMesh);

  // Cós separado para representar a faixa superior da peça.
  const cosMesh = criarCos(
    larguraCintura * 1.015,
    profundidadeCintura * 1.015,
    yTopo - alturaCosM,
    alturaCosM,
    material
  );

  grupo.add(cosMesh);

  grupo.userData = {
    garmentType: 'short',
    model: 'essential',
    measurements: {
      cintura,
      quadril,
      comprimentoTotal,
      comprimentoEntrepernas,
      larguraCoxa,
      larguraBarra,
      alturaGancho,
      alturaCos,
      folga
    },
    dimensions: {
      cinturaM,
      quadrilM,
      comprimentoTotalM,
      comprimentoInternoM,
      alturaGanchoM,
      alturaCosM,
      alturaExterna,
      alturaInterna,
      profundidadeGancho,
      larguraCoxa: coxaM,
      larguraBarra: barraM
    }
  };

  grupo.updateMatrixWorld(true);

  return grupo;
}
