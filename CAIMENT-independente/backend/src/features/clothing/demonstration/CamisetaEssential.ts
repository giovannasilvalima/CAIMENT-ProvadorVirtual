
import * as THREE from 'three';

export interface CamisetaEssentialMedidas {
  busto: number;
  cintura: number;
  larguraOmbros: number;
  comprimento: number;
  comprimentoManga: number;
  circunferenciaManga: number;
  circunferenciaGola: number;
  folga?: number;
  segmentos?: number;
  material?: THREE.Material;
}

type PerfilTorso = {
  y: number;
  largura: number;
  profundidade: number;
  centroZ?: number;
};

const PI2 = Math.PI * 2;

function criarMaterialPadrao(): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: '#9254e1',
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide
  });
}

function interpolarPerfil(
  perfil: PerfilTorso[],
  subdivisoes = 6
): PerfilTorso[] {
  const resultado: PerfilTorso[] = [];

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

  resultado.push({ ...perfil[perfil.length - 1] });

  return resultado;
}

/**
 * Cria o tronco e fecha sua borda superior.
 *
 * A superfície superior conecta diretamente a região frontal
 * à região traseira, formando uma borda plana em vez de deixar
 * o tubo aberto.
 */
function criarTronco(
  perfil: PerfilTorso[],
  segmentos: number,
  material: THREE.Material
): THREE.Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];

  const perfilSuave = interpolarPerfil(perfil, 8);

  for (const nivel of perfilSuave) {
    for (let i = 0; i <= segmentos; i++) {
      const angulo = (i / segmentos) * PI2;

      const x = Math.cos(angulo) * nivel.largura * 0.5;
      const z =
        (nivel.centroZ ?? 0) +
        Math.sin(angulo) * nivel.profundidade * 0.5;

      vertices.push(x, nivel.y, z);
    }
  }

  // Superfície lateral do tronco.
  for (let y = 0; y < perfilSuave.length - 1; y++) {
    for (let x = 0; x < segmentos; x++) {
      const a = y * (segmentos + 1) + x;
      const b = a + segmentos + 1;

      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  // Fecha a borda superior com uma superfície plana.
  const ultimoNivel = perfilSuave.length - 1;
  const inicioBordaSuperior = ultimoNivel * (segmentos + 1);

  const nivelSuperior = perfilSuave[ultimoNivel];

  const indiceCentroSuperior = vertices.length / 3;

  vertices.push(
    0,
    nivelSuperior.y,
    nivelSuperior.centroZ ?? 0
  );

  for (let i = 0; i < segmentos; i++) {
    const atual = inicioBordaSuperior + i;
    const proximo = inicioBordaSuperior + i + 1;

    indices.push(
      indiceCentroSuperior,
      atual,
      proximo
    );
  }

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

  mesh.name = 'TroncoCamiseta';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

function criarManga(
  lado: -1 | 1,
  larguraOmbros: number,
  comprimentoManga: number,
  circunferenciaManga: number,
  segmentos: number,
  material: THREE.Material
): THREE.Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];

  const comprimento = comprimentoManga;

  const raioBase = Math.max(
    larguraOmbros * 0.105,
    circunferenciaManga / PI2 * 0.95
  );

  const raioPonta = circunferenciaManga / PI2;

  const niveis = 12;
  const circulo = Math.max(16, segmentos);

  const inicio = new THREE.Vector3(
    lado * larguraOmbros * 0.405,
    0,
    0
  );

  const fim = new THREE.Vector3(
    lado * (larguraOmbros * 0.405 + comprimento * 0.88),
    -comprimento * 0.72,
    0
  );

  const eixo = new THREE.Vector3()
    .subVectors(fim, inicio)
    .normalize();

  const referencia = new THREE.Vector3(0, 0, 1);

  const eixoX = new THREE.Vector3()
    .crossVectors(eixo, referencia)
    .normalize();

  const eixoZ = new THREE.Vector3()
    .crossVectors(eixoX, eixo)
    .normalize();

  for (let i = 0; i <= niveis; i++) {
    const t = i / niveis;

    const centro = new THREE.Vector3().lerpVectors(
      inicio,
      fim,
      t
    );

    const raio = THREE.MathUtils.lerp(
      raioBase,
      raioPonta,
      t
    );

    for (let j = 0; j <= circulo; j++) {
      const angulo = (j / circulo) * PI2;

      const deslocamentoX =
        Math.cos(angulo) * raio * 0.92;

      const deslocamentoZ =
        Math.sin(angulo) * raio;

      const ponto = centro.clone()
        .addScaledVector(eixoX, deslocamentoX)
        .addScaledVector(eixoZ, deslocamentoZ);

      vertices.push(ponto.x, ponto.y, ponto.z);
    }
  }

  for (let i = 0; i < niveis; i++) {
    for (let j = 0; j < circulo; j++) {
      const a = i * (circulo + 1) + j;
      const b = a + circulo + 1;

      indices.push(a, a + 1, b);
      indices.push(a + 1, b + 1, b);
    }
  }

  const geometria = new THREE.BufferGeometry();

  geometria.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );

  geometria.setIndex(indices);
  geometria.computeVertexNormals();
  geometria.computeBoundingBox();
  geometria.computeBoundingSphere();

  const manga = new THREE.Mesh(geometria, material);

  manga.name = lado < 0 ? 'MangaEsquerda' : 'MangaDireita';
  manga.castShadow = true;
  manga.receiveShadow = true;

  return manga;
}

function criarGola(
  largura: number,
  profundidade: number,
  altura: number,
  espessura: number,
  segmentos: number,
  material: THREE.Material
): THREE.Mesh {
  const geometria = new THREE.TorusGeometry(
    1,
    espessura,
    10,
    segmentos
  );

  geometria.scale(
    largura * 0.5,
    profundidade * 0.5,
    1
  );

  geometria.rotateX(Math.PI / 2);

  const gola = new THREE.Mesh(geometria, material);

  gola.position.set(0, altura, 0);
  gola.name = 'Gola';
  gola.castShadow = true;
  gola.receiveShadow = true;

  return gola;
}

export function criarCamisetaEssential(
  medidas: CamisetaEssentialMedidas
): THREE.Group {
  const {
    busto,
    cintura,
    larguraOmbros,
    comprimento,
    comprimentoManga,
    circunferenciaManga,
    circunferenciaGola,
    folga = 4,
    segmentos = 32,
    material = criarMaterialPadrao()
  } = medidas;

  const valores = [
    busto,
    cintura,
    larguraOmbros,
    comprimento,
    comprimentoManga,
    circunferenciaManga,
    circunferenciaGola,
    folga,
    segmentos
  ];

  if (
    valores.some(
      (valor) => !Number.isFinite(valor) || valor <= 0
    )
  ) {
    throw new Error(
      'As medidas da camiseta devem ser números positivos e válidos.'
    );
  }

  if (segmentos < 8) {
    throw new Error(
      'A camiseta precisa de pelo menos 8 segmentos de geometria.'
    );
  }

  if (cintura > busto * 1.5 || busto > cintura * 2) {
    throw new Error(
      'As medidas de busto e cintura são incompatíveis.'
    );
  }

  const grupo = new THREE.Group();
  grupo.name = 'CamisetaEssential';

  const escala = 0.01;

  const bustoM = (busto + folga) * escala;
  const cinturaM = (cintura + folga) * escala;
  const ombrosM = larguraOmbros * escala;
  const comprimentoM = comprimento * escala;
  const mangaM = comprimentoManga * escala;
  const mangaCircM = (circunferenciaManga + folga) * escala;
  const golaM = circunferenciaGola * escala;

  const larguraBusto = bustoM / 3.15;
  const profundidadeBusto = bustoM / 3.65;

  const larguraCintura = cinturaM / 3.15;
  const profundidadeCintura = cinturaM / 3.65;

  const larguraOmbrosGeometria = Math.max(
    ombrosM,
    larguraBusto * 0.88
  );

  const alturaBarra = 0;
  const alturaCintura = comprimentoM * 0.32;
  const alturaBusto = comprimentoM * 0.68;
  const alturaOmbro = comprimentoM * 0.97;
  const alturaGola = comprimentoM;

  // A borda superior fica muito achatada no eixo Z.
  const profundidadeOmbros = profundidadeBusto * 0.03;
  const profundidadeGola = profundidadeBusto * 0.015;

  const larguraGola = Math.min(
    golaM / Math.PI,
    larguraOmbrosGeometria * 0.46
  );

  // Pontos intermediários para uma transição progressiva.
  const alturaTransicao1 = THREE.MathUtils.lerp(
    alturaBusto,
    alturaOmbro,
    0.28
  );

  const alturaTransicao2 = THREE.MathUtils.lerp(
    alturaBusto,
    alturaOmbro,
    0.58
  );

  const alturaTransicao3 = THREE.MathUtils.lerp(
    alturaBusto,
    alturaOmbro,
    0.82
  );

  const larguraTransicao1 = THREE.MathUtils.lerp(
    larguraBusto,
    larguraOmbrosGeometria,
    0.16
  );

  const larguraTransicao2 = THREE.MathUtils.lerp(
    larguraBusto,
    larguraOmbrosGeometria,
    0.42
  );

  const larguraTransicao3 = THREE.MathUtils.lerp(
    larguraBusto,
    larguraOmbrosGeometria,
    0.76
  );

  // A profundidade diminui gradualmente até a borda superior.
  const profundidadeTransicao1 = THREE.MathUtils.lerp(
    profundidadeBusto,
    profundidadeOmbros,
    0.35
  );

  const profundidadeTransicao2 = THREE.MathUtils.lerp(
    profundidadeBusto,
    profundidadeOmbros,
    0.70
  );

  const profundidadeTransicao3 = THREE.MathUtils.lerp(
    profundidadeBusto,
    profundidadeOmbros,
    0.90
  );

  const perfil: PerfilTorso[] = [
    {
      y: alturaBarra,
      largura: larguraCintura * 1.03,
      profundidade: profundidadeCintura * 1.03
    },
    {
      y: alturaCintura,
      largura: larguraCintura,
      profundidade: profundidadeCintura
    },
    {
      y: alturaBusto,
      largura: larguraBusto,
      profundidade: profundidadeBusto
    },
    {
      y: alturaTransicao1,
      largura: larguraTransicao1,
      profundidade: profundidadeTransicao1
    },
    {
      y: alturaTransicao2,
      largura: larguraTransicao2,
      profundidade: profundidadeTransicao2
    },
    {
      y: alturaTransicao3,
      largura: larguraTransicao3,
      profundidade: profundidadeTransicao3
    },
    {
      y: alturaOmbro,
      largura: larguraOmbrosGeometria,
      profundidade: profundidadeOmbros
    },
    {
      y: alturaGola,
      largura: larguraGola,
      profundidade: profundidadeGola
    }
  ];

  grupo.add(
    criarTronco(
      perfil,
      segmentos,
      material
    )
  );

  grupo.add(
    criarManga(
      -1,
      larguraOmbrosGeometria,
      mangaM,
      mangaCircM,
      segmentos,
      material
    ),
    criarManga(
      1,
      larguraOmbrosGeometria,
      mangaM,
      mangaCircM,
      segmentos,
      material
    )
  );

  grupo.add(
    criarGola(
      larguraGola,
      profundidadeGola,
      alturaGola,
      Math.max(0.004, mangaCircM * 0.035),
      segmentos,
      material
    )
  );

  grupo.userData = {
    garmentType: 'tshirt',
    model: 'essential',

    measurements: {
      busto,
      cintura,
      larguraOmbros,
      comprimento,
      comprimentoManga,
      circunferenciaManga,
      circunferenciaGola,
      folga
    },

    dimensions: {
      bustoM,
      cinturaM,
      larguraOmbros: larguraOmbrosGeometria,
      comprimentoM,
      mangaM,
      mangaCircM,
      golaM,
      profundidadeOmbros,
      profundidadeGola
    }
  };

  grupo.updateMatrixWorld(true);

  return grupo;
}
