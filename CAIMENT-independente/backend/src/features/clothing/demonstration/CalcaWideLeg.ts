
import * as THREE from 'three';

export interface CalcaWideLegMedidas {
  cintura: number;
  quadril: number;
  comprimentoTotal: number;
  comprimentoEntrepernas: number;
  larguraCoxa: number;
  larguraJoelho: number;
  larguraBarra: number;
  alturaGancho: number;
  alturaCos: number;
  folga?: number;
  material?: THREE.Material;
}

function criarSilhuetaCalca(
  cintura: number,
  quadril: number,
  coxa: number,
  joelho: number,
  barra: number,
  alturaTotal: number,
  alturaEntrepernas: number,
  alturaQuadril: number,
  alturaCos: number
): THREE.Shape {
  const shape = new THREE.Shape();

  const meiaCintura = cintura / 2;
  const meiaQuadril = quadril / 2;

  const meiaCoxa = coxa / 2;
  const meiaJoelho = joelho / 2;
  const meiaBarra = barra / 2;

  const alturaGancho = alturaEntrepernas;

  const centroPerna = Math.max(
    meiaCoxa * 0.58,
    meiaBarra * 0.48
  );

  const distanciaPernas = Math.max(
    0.025,
    Math.min(meiaCoxa * 0.48, meiaQuadril * 0.2)
  );

  const xExternoCoxa = centroPerna + meiaCoxa;
  const xExternoJoelho = centroPerna + meiaJoelho;
  const xExternoBarra = centroPerna + meiaBarra;

  const xInternoBarra = centroPerna - meiaBarra;
  const xInternoCoxa = centroPerna - meiaCoxa;

  const yQuadril = alturaTotal - alturaCos - alturaQuadril;
  const yCoxa = alturaGancho + alturaQuadril * 0.65;
  const yJoelho = alturaGancho * 0.48;

  // Começa na cintura esquerda.
  shape.moveTo(-meiaCintura, alturaTotal);

  // Lateral esquerda: cintura e quadril.
  shape.bezierCurveTo(
    -meiaCintura * 1.04,
    alturaTotal - alturaCos * 0.25,
    -meiaQuadril,
    alturaTotal - alturaCos - alturaQuadril * 0.15,
    -meiaQuadril,
    yQuadril
  );

  shape.bezierCurveTo(
    -meiaQuadril,
    yQuadril - alturaQuadril * 0.45,
    -xExternoCoxa,
    yCoxa + alturaQuadril * 0.1,
    -xExternoCoxa,
    yCoxa
  );

  // Coxa esquerda.
  shape.bezierCurveTo(
    -xExternoCoxa,
    yCoxa * 0.8,
    -xExternoJoelho,
    yJoelho + alturaQuadril * 0.12,
    -xExternoJoelho,
    yJoelho
  );

  // Joelho e abertura da barra esquerda.
  shape.bezierCurveTo(
    -xExternoJoelho,
    yJoelho * 0.65,
    -xExternoBarra,
    alturaGancho * 0.18,
    -xExternoBarra,
    0
  );

  // Barra esquerda.
  shape.lineTo(-distanciaPernas + xInternoBarra, 0);

  // Parte interna da perna esquerda.
  shape.bezierCurveTo(
    -distanciaPernas + xInternoBarra * 0.98,
    alturaGancho * 0.18,
    -distanciaPernas + xInternoCoxa * 0.9,
    yCoxa * 0.72,
    -distanciaPernas,
    alturaGancho
  );

  // Gancho central arredondado.
  shape.bezierCurveTo(
    -distanciaPernas * 0.8,
    alturaGancho + alturaQuadril * 0.13,
    -distanciaPernas * 0.35,
    alturaGancho + alturaQuadril * 0.16,
    0,
    alturaGancho + alturaQuadril * 0.13
  );

  shape.bezierCurveTo(
    distanciaPernas * 0.35,
    alturaGancho + alturaQuadril * 0.16,
    distanciaPernas * 0.8,
    alturaGancho + alturaQuadril * 0.13,
    distanciaPernas,
    alturaGancho
  );

  // Parte interna da perna direita.
  shape.bezierCurveTo(
    distanciaPernas + xInternoCoxa * 0.9,
    yCoxa * 0.72,
    distanciaPernas + xInternoBarra * 0.98,
    alturaGancho * 0.18,
    distanciaPernas + xInternoBarra,
    0
  );

  // Barra direita.
  shape.lineTo(xExternoBarra, 0);

  // Lateral externa direita.
  shape.bezierCurveTo(
    xExternoBarra,
    alturaGancho * 0.18,
    xExternoJoelho,
    yJoelho * 0.65,
    xExternoJoelho,
    yJoelho
  );

  shape.bezierCurveTo(
    xExternoJoelho,
    yJoelho + alturaQuadril * 0.12,
    xExternoCoxa,
    yCoxa * 0.8,
    xExternoCoxa,
    yCoxa
  );

  shape.bezierCurveTo(
    xExternoCoxa,
    yCoxa + alturaQuadril * 0.1,
    meiaQuadril,
    yQuadril - alturaQuadril * 0.45,
    meiaQuadril,
    yQuadril
  );

  shape.bezierCurveTo(
    meiaQuadril,
    alturaTotal - alturaCos - alturaQuadril * 0.15,
    meiaCintura * 1.04,
    alturaTotal - alturaCos * 0.25,
    meiaCintura,
    alturaTotal
  );

  shape.closePath();

  return shape;
}

function criarGeometriaCalca(
  shape: THREE.Shape,
  profundidade: number,
  material: THREE.Material,
  nome: string,
  bevelSize: number
): THREE.Mesh {
  const geometria = new THREE.ExtrudeGeometry(shape, {
    depth: profundidade,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize,
    bevelThickness: bevelSize,
    curveSegments: 16
  });

  // Centraliza a profundidade em Z.
  geometria.translate(0, 0, -profundidade / 2);

  geometria.computeVertexNormals();
  geometria.computeBoundingBox();
  geometria.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometria, material);

  mesh.name = nome;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

function criarCos(
  largura: number,
  profundidade: number,
  y: number,
  altura: number,
  material: THREE.Material
): THREE.Mesh {
  const geometria = new THREE.CylinderGeometry(
    1,
    1,
    altura,
    64,
    1,
    true
  );

  const posicao = geometria.getAttribute('position');

  for (let i = 0; i < posicao.count; i++) {
    const x = posicao.getX(i);
    const z = posicao.getZ(i);

    posicao.setXYZ(
      i,
      x * largura * 0.5,
      posicao.getY(i),
      z * profundidade * 0.5
    );
  }

  geometria.computeVertexNormals();

  const mesh = new THREE.Mesh(geometria, material);

  mesh.name = 'CosCalca';
  mesh.position.y = y + altura / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function criarCalcaWideLeg(
  medidas: CalcaWideLegMedidas
): THREE.Group {
  const {
    cintura,
    quadril,
    comprimentoTotal,
    comprimentoEntrepernas,
    larguraCoxa,
    larguraJoelho,
    larguraBarra,
    alturaGancho,
    alturaCos,
    folga = 4,
    material = new THREE.MeshStandardMaterial({
      color: '#402b47',
      roughness: 0.85,
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
    larguraJoelho,
    larguraBarra,
    alturaGancho,
    alturaCos,
    folga
  ];

  if (
    valores.some(
      (valor) => !Number.isFinite(valor) || valor <= 0
    )
  ) {
    throw new Error(
      'As medidas da calça precisam ser números positivos e válidos.'
    );
  }

  if (
    comprimentoEntrepernas >= comprimentoTotal ||
    alturaCos >= comprimentoTotal
  ) {
    throw new Error(
      'As medidas de comprimento da calça são incompatíveis.'
    );
  }

  const escala = 0.01;

  const total = comprimentoTotal * escala;
  const entrepernas = comprimentoEntrepernas * escala;
  const cos = alturaCos * escala;
  const gancho = alturaGancho * escala;

  const cinturaM = (cintura + folga) * escala;
  const quadrilM = (quadril + folga) * escala;

  // Reduz o volume do quadril sem eliminar sua transição anatômica.
  const larguraQuadril = (quadrilM / 2.15) * 0.82;

  const larguraCintura = (cinturaM / 2.15) * 0.92;

  // Abertura progressiva das pernas.
  const coxaM = (larguraCoxa + folga * 0.5) * escala * 1.3;
  const joelhoM = (larguraJoelho + folga * 0.5) * escala * 1.65;
  const barraM = (larguraBarra + folga * 0.5) * escala * 1.9;

  const alturaQuadril = Math.max(
    gancho,
    (total - cos - entrepernas) * 0.45
  );

  const profundidade = Math.max(
    larguraQuadril * 0.58,
    coxaM * 0.48
  );

  const shape = criarSilhuetaCalca(
    larguraCintura,
    larguraQuadril,
    coxaM,
    joelhoM,
    barraM,
    total,
    entrepernas,
    alturaQuadril,
    cos
  );

  const grupo = new THREE.Group();
  grupo.name = 'CalcaWideLeg';

  const corpo = criarGeometriaCalca(
    shape,
    profundidade,
    material,
    'CorpoCalcaWideLeg',
    0.008
  );

  grupo.add(corpo);

  // Cós separado, acompanhando a largura da cintura.
  const cosMesh = criarCos(
    larguraCintura,
    profundidade * 0.98,
    total - cos,
    Math.max(cos, 0.015),
    material
  );

  grupo.add(cosMesh);

  grupo.userData = {
    garmentType: 'pants',
    model: 'wide-leg',
    measurements: {
      cintura,
      quadril,
      comprimentoTotal,
      comprimentoEntrepernas,
      larguraCoxa,
      larguraJoelho,
      larguraBarra,
      alturaGancho,
      alturaCos,
      folga
    },
    dimensions: {
      total,
      entrepernas,
      larguraCintura,
      larguraQuadril,
      larguraCoxa: coxaM,
      larguraJoelho: joelhoM,
      larguraBarra: barraM,
      profundidade,
      alturaQuadril
    }
  };

  grupo.updateMatrixWorld(true);

  return grupo;
}
