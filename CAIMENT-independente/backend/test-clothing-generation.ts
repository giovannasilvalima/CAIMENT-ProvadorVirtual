
import {
  createGarment,
} from './src/features/clothing';

import type {
  TShirtMeasurements,
} from './src/features/clothing/geometry/types';

/**
 * ============================================================
 * DADOS EXCLUSIVOS DE TESTE
 * ============================================================
 *
 * Não são dimensões padrão do CAIMENT.
 * São somente uma entrada controlada para validar
 * a geração estrutural da geometria da regata.
 */

const testMeasurements: TShirtMeasurements = {
  width: 0.48,
  height: 0.70,
  depth: 0.18,
  shoulderWidth: 0.38,
  sleeveLength: 0.12,
  sleeveWidth: 0.12,
  neckWidth: 0.14,
};

/**
 * ============================================================
 * ASSERT
 * ============================================================
 */

let passedChecks = 0;

function check(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`FALHA: ${message}`);
  }

  passedChecks++;

  console.log(`OK: ${message}`);
}

/**
 * ============================================================
 * TESTE DE GERAÇÃO
 * ============================================================
 */

console.log(
  '\n=== TESTE DE GERAÇÃO DA REGATA ===\n',
);

const garment = createGarment({
  id: 'teste-regata-001',
  name: 'Regata Essential - Teste',
  type: 'tshirt',
  measurements: { ...testMeasurements },
});

const meshData = garment.meshData;

/**
 * ============================================================
 * 1. IDENTIFICAÇÃO DA PEÇA
 * ============================================================
 */

check(
  garment.id === 'teste-regata-001',
  'Identificação da peça',
);

check(
  garment.type === 'tshirt',
  'Tipo de roupa',
);

/**
 * ============================================================
 * 2. GRUPO THREE.JS
 * ============================================================
 */

check(
  garment.group.isGroup,
  'Grupo Three.js criado',
);

check(
  garment.group.children.length > 0,
  'Grupo possui objetos',
);

/**
 * ============================================================
 * 3. PAINÉIS
 * ============================================================
 *
 * O gerador atual da regata deve criar:
 * - painel frontal;
 * - painel traseiro;
 * - gola.
 */

check(
  meshData.panels.length === 3,
  'Existem três painéis da regata',
);

for (const panel of meshData.panels) {
  check(
    panel.vertices.length > 0,
    `Painel ${panel.name} possui vértices`,
  );

  check(
    panel.triangles.length > 0,
    `Painel ${panel.name} possui triângulos`,
  );

  const position = panel.geometry.getAttribute('position');

  check(
    position !== undefined && position.count > 0,
    `Geometria do painel ${panel.name} possui posições`,
  );

  if (!position) {
    throw new Error(
      `FALHA: Geometria do painel ${panel.name} não possui posições.`,
    );
  }

  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);

    check(
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z),
      `Coordenadas válidas no painel ${panel.name}, vértice ${index}`,
    );
  }
}

/**
 * ============================================================
 * 4. COSTURAS
 * ============================================================
 */

check(
  meshData.seams.length > 0,
  'Existem definições de costuras',
);

for (const seam of meshData.seams) {
  const panelA = meshData.panels.find(
    (panel) => panel.id === seam.panelAId,
  );

  const panelB = meshData.panels.find(
    (panel) => panel.id === seam.panelBId,
  );

  check(
    panelA !== undefined,
    `Painel A encontrado na costura ${seam.name}`,
  );

  check(
    panelB !== undefined,
    `Painel B encontrado na costura ${seam.name}`,
  );

  if (!panelA || !panelB) {
    throw new Error(
      `FALHA: Painéis da costura ${seam.name} não encontrados.`,
    );
  }

  check(
    seam.edgeA.length > 0 &&
    seam.edgeB.length > 0,
    `Costura ${seam.name} possui vértices`,
  );

  check(
    seam.edgeA.length === seam.edgeB.length,
    `Costura ${seam.name} possui correspondência de vértices`,
  );

  check(
    seam.edgeA.every(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < panelA.vertices.length,
    ),
    `Índices da primeira borda válidos em ${seam.name}`,
  );

  check(
    seam.edgeB.every(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < panelB.vertices.length,
    ),
    `Índices da segunda borda válidos em ${seam.name}`,
  );
}

/**
 * ============================================================
 * 5. MEDIDAS PRESERVADAS
 * ============================================================
 *
 * Confirma que as dimensões recebidas não foram alteradas
 * durante a criação da peça.
 */

check(
  garment.measurements.width === testMeasurements.width,
  'Largura original preservada',
);

check(
  garment.measurements.height === testMeasurements.height,
  'Altura original preservada',
);

check(
  garment.measurements.depth === testMeasurements.depth,
  'Profundidade original preservada',
);

check(
  garment.measurements.shoulderWidth ===
    testMeasurements.shoulderWidth,
  'Largura dos ombros preservada',
);

check(
  garment.measurements.neckWidth ===
    testMeasurements.neckWidth,
  'Largura do decote preservada',
);

check(
  garment.measurements.sleeveLength ===
    testMeasurements.sleeveLength,
  'Comprimento de referência da alça preservado',
);

check(
  garment.measurements.sleeveWidth ===
    testMeasurements.sleeveWidth,
  'Largura de referência da alça preservada',
);

/**
 * ============================================================
 * 6. CONTAGEM DA GEOMETRIA
 * ============================================================
 */

check(
  meshData.vertexCount > 0,
  'Quantidade total de vértices válida',
);

check(
  meshData.triangleCount > 0,
  'Quantidade total de triângulos válida',
);

/**
 * ============================================================
 * 7. RESULTADO
 * ============================================================
 */

console.log('\n=== RESULTADO ===');

console.log(
  'Painéis:',
  meshData.panels.length,
);

console.log(
  'Costuras:',
  meshData.seams.length,
);

console.log(
  'Vértices:',
  meshData.vertexCount,
);

console.log(
  'Triângulos:',
  meshData.triangleCount,
);

console.log(
  'Verificações aprovadas:',
  passedChecks,
);

console.log(
  '\nTESTE ESTRUTURAL CONCLUÍDO COM SUCESSO.',
);
