// ============================================================
// CAIMENT - CORPO UNISSEX
// Arquivo: UnisexBody.tsx
// ============================================================
//
// Esta versão muda SOMENTE o visual:
//  - corpo com gradiente, contorno unificado e sombra suave
//  - guias horizontais mostrando onde cada medida é tirada
//  - réguas laterais para altura, pé → cintura e cintura → ombros
//  - leitura no topo com o nome e o valor da medida selecionada
//
// Todos os cálculos (larguras, escala, posições) e os
// MeasurementPoint continuam exatamente como antes.
// ============================================================

import { MeasurementPoint } from "./MeasurementPoint";

import type {
  EditableMeasurements,
  MeasurementName,
} from "../../types/measurements";

// ============================================================
// PROPRIEDADES
// ============================================================

interface UnisexBodyProps {
  medidas: EditableMeasurements;
  medidaSelecionada?: string;

  onSelectMeasurement?: (
    medida: keyof EditableMeasurements
  ) => void;

  onChangeMeasurement?: (
    medida: MeasurementName,
    valor: number
  ) => void;
}

// ============================================================
// CORES (troque aqui para ajustar o tema inteiro)
// ============================================================

const COR = {
  painelTopo: "#FFFFFF",
  painelFundo: "#F4F1FC",   // caiment-purple-50
  painelBorda: "#E9E4F5",   // caiment-line

  peleClara: "#f6ebe2",
  peleBase: "#ead8cc",
  peleSombra: "#dcc4b5",
  contorno: "#cbb2a2",

  guia: "#A98EE8",          // caiment-purple-300
  guiaForte: "#5A2FB8",     // caiment-purple-600
  destaque: "#6E42D1",      // caiment-purple-500
  texto: "#221B33",         // caiment-ink
  textoSuave: "#6E6580",    // caiment-ink-soft
};

const ID_GRADIENTE = "caiment-unissex-pele";
const ID_SOMBRA = "caiment-unissex-sombra";
const ID_PARTES = "caiment-unissex-partes";

// ============================================================
// NOMES AMIGÁVEIS
// ============================================================

const NOMES: Record<string, string> = {
  ombros: "Ombros",
  torax: "Tórax",
  busto: "Busto",
  cintura: "Cintura",
  quadril: "Quadril",
  altura: "Altura total",
  alturaPeCintura: "Altura do pé à cintura",
  alturaCinturaOmbros: "Altura da cintura aos ombros",
};

// ============================================================
// FUNÇÃO AUXILIAR
// ============================================================

function limitar(
  valor: number,
  minimo: number,
  maximo: number
) {
  return Math.max(
    minimo,
    Math.min(maximo, valor)
  );
}

// ============================================================
// COMPONENTE
// ============================================================

export function UnisexBody({
  medidas,
  medidaSelecionada,
  onSelectMeasurement,
  onChangeMeasurement,
}: UnisexBodyProps) {

  // ==========================================================
  // CENTRO DO CORPO
  // ==========================================================

  const centro = 140;

  // ==========================================================
  // LARGURAS (lógica original, sem alterações)
  // ==========================================================

  const larguraOmbros = limitar(
    92 + (medidas.ombros - 40) * 3,
    70,
    160
  );

  const larguraTorax = limitar(
    82 + ((medidas.torax ?? 88) - 88) * 2.2,
    65,
    145
  );

  const larguraBusto = limitar(
    82 + ((medidas.busto ?? 88) - 88) * 2.2,
    65,
    155
  );

  const larguraCintura = limitar(
    62 + ((medidas.cintura ?? 70) - 70) * 2,
    50,
    120
  );

  const larguraQuadril = limitar(
    96 + ((medidas.quadril ?? 96) - 96) * 2,
    75,
    150
  );

  // ==========================================================
  // ESCALA DA ALTURA
  // ==========================================================

  const escalaAltura = limitar(
    medidas.altura / 165,
    0.78,
    1.18
  );

  // ==========================================================
  // POSIÇÕES VERTICAIS
  // ==========================================================

  const peY = 510;

  const cabecaY =
    peY - 465 * escalaAltura;

  const pescocoTopoY =
    cabecaY + 60 * escalaAltura;

  const pescocoBaseY =
    cabecaY + 88 * escalaAltura;

  const ombroY =
    cabecaY + 98 * escalaAltura;

  const toraxY =
    cabecaY + 165 * escalaAltura;

  const bustoY =
    cabecaY + 185 * escalaAltura;

  const cinturaY =
    cabecaY + 235 * escalaAltura;

  const quadrilY =
    cabecaY + 292 * escalaAltura;

  const finalQuadrilY =
    cabecaY + 320 * escalaAltura;

  // ==========================================================
  // POSIÇÃO DOS BRAÇOS E PERNAS
  // ==========================================================

  const inicioBracoEsquerdo =
    centro - larguraOmbros / 2;

  const inicioBracoDireito =
    centro + larguraOmbros / 2;

  const inicioPernaY =
    finalQuadrilY;

  const finalPernaY =
    peY;

  // ==========================================================
  // APOIO VISUAL (somente desenho)
  // ==========================================================

  const topoCabecaY = cabecaY - 5 * escalaAltura;
  const chaoY = peY + 8;

  const reguaEsquerdaX = 28;
  const reguaDireitaX = 252;

  // Faixas horizontais: onde cada medida do tronco é tirada
  const faixas = [
    { id: "ombros", y: ombroY, largura: larguraOmbros },
    { id: "torax", y: toraxY, largura: larguraTorax },
    { id: "busto", y: bustoY, largura: larguraBusto },
    { id: "cintura", y: cinturaY, largura: larguraCintura },
    { id: "quadril", y: quadrilY, largura: larguraQuadril },
  ];

  const temSelecao =
    !!medidaSelecionada && !!NOMES[medidaSelecionada];

  const valorSelecionado = medidaSelecionada
    ? (medidas as unknown as Record<string, number | undefined>)[
        medidaSelecionada
      ]
    : undefined;

  const textoLeitura = temSelecao
    ? `${NOMES[medidaSelecionada as string]} · ${
        valorSelecionado ?? "—"
      } cm`
    : "";

  const larguraLeitura = textoLeitura.length * 5.8 + 22;

  const selecionada = (id: string) =>
    medidaSelecionada === id;

  // ==========================================================
  // RENDERIZAÇÃO
  // ==========================================================

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "320px",
        aspectRatio: "320 / 590",
        margin: "0 auto",
        borderRadius: "24px",
        border: `1px solid ${COR.painelBorda}`,
        background: `radial-gradient(ellipse at 50% 30%, ${COR.painelTopo} 0%, ${COR.painelFundo} 100%)`,
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
        overflow: "hidden",
      }}
    >

      {/* ====================================================
          CORPO SVG
          ==================================================== */}

      <svg
        viewBox="0 0 280 520"
        width="100%"
        height="100%"
        aria-label="Modelo corporal unissex"
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: "none" }}
      >

        <defs>
          {/* Pele com leve volume: bordas mais escuras, centro claro */}
          <linearGradient
            id={ID_GRADIENTE}
            gradientUnits="userSpaceOnUse"
            x1="30"
            y1="0"
            x2="250"
            y2="0"
          >
            <stop offset="0" stopColor={COR.peleSombra} />
            <stop offset="0.35" stopColor={COR.peleBase} />
            <stop offset="0.5" stopColor={COR.peleClara} />
            <stop offset="0.65" stopColor={COR.peleBase} />
            <stop offset="1" stopColor={COR.peleSombra} />
          </linearGradient>

          <filter
            id={ID_SOMBRA}
            x="-20%"
            y="-10%"
            width="140%"
            height="130%"
          >
            <feDropShadow
              dx="0"
              dy="3"
              stdDeviation="4"
              floodColor="#0f172a"
              floodOpacity="0.16"
            />
          </filter>

          {/* ================================================
              PARTES DO CORPO (mesma geometria de antes)
              Usadas duas vezes: contorno e preenchimento,
              assim o contorno envolve o corpo todo e não
              aparecem linhas nas emendas.
              ================================================ */}

          <g id={ID_PARTES}>

            {/* CABEÇA */}
            <ellipse
              cx={centro}
              cy={cabecaY + 30 * escalaAltura}
              rx={29 * escalaAltura}
              ry={35 * escalaAltura}
            />

            {/* PESCOÇO */}
            <path
              d={`
                M ${centro - 16} ${pescocoTopoY}
                L ${centro - 16} ${pescocoBaseY}
                C ${centro - 16} ${pescocoBaseY + 5}
                  ${centro - 10} ${pescocoBaseY + 8}
                  ${centro} ${pescocoBaseY + 8}
                C ${centro + 10} ${pescocoBaseY + 8}
                  ${centro + 16} ${pescocoBaseY + 5}
                  ${centro + 16} ${pescocoBaseY}
                L ${centro + 16} ${pescocoTopoY}
                Z
              `}
            />

            {/* TRONCO DINÂMICO: ombros → tórax → busto → cintura → quadril */}
            <path
              d={`
                M ${centro - larguraOmbros / 2} ${ombroY}

                C ${centro - larguraOmbros / 2 - 7} ${ombroY + 5}
                  ${centro - larguraTorax / 2 - 5} ${ombroY + 18}
                  ${centro - larguraTorax / 2} ${toraxY - 45 * escalaAltura}

                L ${centro - larguraTorax / 2 + 7} ${toraxY}

                C ${centro - larguraTorax / 2 + 8} ${toraxY + 12 * escalaAltura}
                  ${centro - larguraBusto / 2 - 2} ${bustoY - 18 * escalaAltura}
                  ${centro - larguraBusto / 2} ${bustoY}

                C ${centro - larguraBusto / 2 + 3} ${bustoY + 18 * escalaAltura}
                  ${centro - larguraCintura / 2 - 4} ${cinturaY - 20 * escalaAltura}
                  ${centro - larguraCintura / 2} ${cinturaY}

                C ${centro - larguraCintura / 2 - 2} ${cinturaY + 16 * escalaAltura}
                  ${centro - larguraQuadril / 2 + 5} ${quadrilY - 8 * escalaAltura}
                  ${centro - larguraQuadril / 2} ${quadrilY}

                C ${centro - larguraQuadril / 2 + 10} ${quadrilY + 14 * escalaAltura}
                  ${centro - larguraQuadril / 2 + 24} ${finalQuadrilY}
                  ${centro} ${finalQuadrilY}

                C ${centro + larguraQuadril / 2 - 24} ${finalQuadrilY}
                  ${centro + larguraQuadril / 2 - 10} ${quadrilY + 14 * escalaAltura}
                  ${centro + larguraQuadril / 2} ${quadrilY}

                C ${centro + larguraQuadril / 2 - 5} ${quadrilY - 8 * escalaAltura}
                  ${centro + larguraCintura / 2 + 2} ${cinturaY + 16 * escalaAltura}
                  ${centro + larguraCintura / 2} ${cinturaY}

                C ${centro + larguraCintura / 2 + 4} ${cinturaY - 20 * escalaAltura}
                  ${centro + larguraBusto / 2 - 3} ${bustoY + 18 * escalaAltura}
                  ${centro + larguraBusto / 2} ${bustoY}

                C ${centro + larguraBusto / 2 + 2} ${bustoY - 18 * escalaAltura}
                  ${centro + larguraTorax / 2 - 8} ${toraxY + 12 * escalaAltura}
                  ${centro + larguraTorax / 2 - 7} ${toraxY}

                L ${centro + larguraTorax / 2} ${toraxY - 45 * escalaAltura}

                C ${centro + larguraTorax / 2 + 5} ${ombroY + 18}
                  ${centro + larguraOmbros / 2 + 7} ${ombroY + 5}
                  ${centro + larguraOmbros / 2} ${ombroY}

                Z
              `}
            />

            {/* BRAÇO ESQUERDO */}
            <path
              d={`
                M ${inicioBracoEsquerdo} ${ombroY}
                C ${inicioBracoEsquerdo - 13} ${ombroY + 5}
                  ${inicioBracoEsquerdo - 23} ${ombroY + 16}
                  ${inicioBracoEsquerdo - 30} ${ombroY + 32}
                C ${inicioBracoEsquerdo - 36} ${ombroY + 47}
                  ${inicioBracoEsquerdo - 40} ${ombroY + 66}
                  ${inicioBracoEsquerdo - 42} ${ombroY + 88}
                L ${inicioBracoEsquerdo - 52} ${ombroY + 173}
                C ${inicioBracoEsquerdo - 54} ${ombroY + 189}
                  ${inicioBracoEsquerdo - 47} ${ombroY + 201}
                  ${inicioBracoEsquerdo - 36} ${ombroY + 204}
                C ${inicioBracoEsquerdo - 25} ${ombroY + 207}
                  ${inicioBracoEsquerdo - 17} ${ombroY + 199}
                  ${inicioBracoEsquerdo - 15} ${ombroY + 186}
                L ${inicioBracoEsquerdo - 4} ${ombroY + 105}
                L ${inicioBracoEsquerdo + 7} ${ombroY + 48}
                C ${inicioBracoEsquerdo + 10} ${ombroY + 30}
                  ${inicioBracoEsquerdo + 8} ${ombroY + 13}
                  ${inicioBracoEsquerdo} ${ombroY}
                Z
              `}
            />

            {/* BRAÇO DIREITO */}
            <path
              d={`
                M ${inicioBracoDireito} ${ombroY}
                C ${inicioBracoDireito + 13} ${ombroY + 5}
                  ${inicioBracoDireito + 23} ${ombroY + 16}
                  ${inicioBracoDireito + 30} ${ombroY + 32}
                C ${inicioBracoDireito + 36} ${ombroY + 47}
                  ${inicioBracoDireito + 40} ${ombroY + 66}
                  ${inicioBracoDireito + 42} ${ombroY + 88}
                L ${inicioBracoDireito + 52} ${ombroY + 173}
                C ${inicioBracoDireito + 54} ${ombroY + 189}
                  ${inicioBracoDireito + 47} ${ombroY + 201}
                  ${inicioBracoDireito + 36} ${ombroY + 204}
                C ${inicioBracoDireito + 25} ${ombroY + 207}
                  ${inicioBracoDireito + 17} ${ombroY + 199}
                  ${inicioBracoDireito + 15} ${ombroY + 186}
                L ${inicioBracoDireito + 4} ${ombroY + 105}
                L ${inicioBracoDireito - 7} ${ombroY + 48}
                C ${inicioBracoDireito - 10} ${ombroY + 30}
                  ${inicioBracoDireito - 8} ${ombroY + 13}
                  ${inicioBracoDireito} ${ombroY}
                Z
              `}
            />

            {/* PERNA ESQUERDA */}
            <path
              d={`
                M ${centro - 48} ${inicioPernaY - 24}
                C ${centro - 51} ${inicioPernaY + 10}
                  ${centro - 53} ${inicioPernaY + 55}
                  ${centro - 54} ${inicioPernaY + 100}
                L ${centro - 56} ${finalPernaY - 38}
                C ${centro - 56} ${finalPernaY - 21}
                  ${centro - 48} ${finalPernaY - 10}
                  ${centro - 34} ${finalPernaY - 8}
                C ${centro - 22} ${finalPernaY - 7}
                  ${centro - 14} ${finalPernaY - 15}
                  ${centro - 14} ${finalPernaY - 28}
                L ${centro - 12} ${inicioPernaY + 90}
                L ${centro - 6} ${inicioPernaY + 20}
                C ${centro - 20} ${inicioPernaY + 17}
                  ${centro - 36} ${inicioPernaY + 5}
                  ${centro - 48} ${inicioPernaY - 24}
                Z
              `}
            />

            {/* PERNA DIREITA */}
            <path
              d={`
                M ${centro + 48} ${inicioPernaY - 24}
                C ${centro + 51} ${inicioPernaY + 10}
                  ${centro + 53} ${inicioPernaY + 55}
                  ${centro + 54} ${inicioPernaY + 100}
                L ${centro + 56} ${finalPernaY - 38}
                C ${centro + 56} ${finalPernaY - 21}
                  ${centro + 48} ${finalPernaY - 10}
                  ${centro + 34} ${finalPernaY - 8}
                C ${centro + 22} ${finalPernaY - 7}
                  ${centro + 14} ${finalPernaY - 15}
                  ${centro + 14} ${finalPernaY - 28}
                L ${centro + 12} ${inicioPernaY + 90}
                L ${centro + 6} ${inicioPernaY + 20}
                C ${centro + 20} ${inicioPernaY + 17}
                  ${centro + 36} ${inicioPernaY + 5}
                  ${centro + 48} ${inicioPernaY - 24}
                Z
              `}
            />

            {/* PÉ ESQUERDO */}
            <path
              d={`
                M ${centro - 56} ${finalPernaY - 40}
                C ${centro - 61} ${finalPernaY - 28}
                  ${centro - 62} ${finalPernaY - 16}
                  ${centro - 58} ${finalPernaY - 7}
                C ${centro - 53} ${finalPernaY + 4}
                  ${centro - 41} ${finalPernaY + 9}
                  ${centro - 26} ${finalPernaY + 7}
                L ${centro - 10} ${finalPernaY + 5}
                C ${centro - 5} ${finalPernaY + 4}
                  ${centro - 3} ${finalPernaY - 1}
                  ${centro - 6} ${finalPernaY - 5}
                C ${centro - 11} ${finalPernaY - 12}
                  ${centro - 20} ${finalPernaY - 15}
                  ${centro - 32} ${finalPernaY - 16}
                L ${centro - 34} ${finalPernaY - 37}
                Z
              `}
            />

            {/* PÉ DIREITO */}
            <path
              d={`
                M ${centro + 56} ${finalPernaY - 40}
                C ${centro + 61} ${finalPernaY - 28}
                  ${centro + 62} ${finalPernaY - 16}
                  ${centro + 58} ${finalPernaY - 7}
                C ${centro + 53} ${finalPernaY + 4}
                  ${centro + 41} ${finalPernaY + 9}
                  ${centro + 26} ${finalPernaY + 7}
                L ${centro + 10} ${finalPernaY + 5}
                C ${centro + 5} ${finalPernaY + 4}
                  ${centro + 3} ${finalPernaY - 1}
                  ${centro + 6} ${finalPernaY - 5}
                C ${centro + 11} ${finalPernaY - 12}
                  ${centro + 20} ${finalPernaY - 15}
                  ${centro + 32} ${finalPernaY - 16}
                L ${centro + 34} ${finalPernaY - 37}
                Z
              `}
            />
          </g>
        </defs>

        {/* ==================================================
            CHÃO (sombra sob os pés)
            ================================================== */}

        <ellipse
          cx={centro}
          cy={chaoY + 2}
          rx={78}
          ry={6}
          fill="#0f172a"
          opacity={0.07}
        />

        {/* ==================================================
            RÉGUAS LATERAIS (ficam atrás do corpo)
            ==================================================

            Esquerda:
              linha fina  = altura total
              trecho forte = do pé até a cintura
            Direita:
              trecho da cintura até os ombros
            ================================================== */}

        {/* Altura total */}
        <g
          stroke={
            selecionada("altura") ? COR.destaque : COR.guia
          }
          strokeWidth={selecionada("altura") ? 2 : 1}
          strokeLinecap="round"
          opacity={selecionada("altura") ? 1 : 0.7}
        >
          <line
            x1={reguaEsquerdaX}
            y1={topoCabecaY}
            x2={reguaEsquerdaX}
            y2={chaoY}
          />
          <line
            x1={reguaEsquerdaX - 5}
            y1={topoCabecaY}
            x2={reguaEsquerdaX + 5}
            y2={topoCabecaY}
          />
          <line
            x1={reguaEsquerdaX - 5}
            y1={chaoY}
            x2={reguaEsquerdaX + 5}
            y2={chaoY}
          />
        </g>

        {/* Pé → cintura */}
        <g
          stroke={
            selecionada("alturaPeCintura")
              ? COR.destaque
              : COR.guiaForte
          }
          strokeWidth={
            selecionada("alturaPeCintura") ? 4 : 2.5
          }
          strokeLinecap="round"
          opacity={selecionada("alturaPeCintura") ? 1 : 0.45}
        >
          <line
            x1={reguaEsquerdaX}
            y1={cinturaY}
            x2={reguaEsquerdaX}
            y2={chaoY}
          />
          <line
            x1={reguaEsquerdaX}
            y1={cinturaY}
            x2={reguaEsquerdaX + 9}
            y2={cinturaY}
            strokeWidth={1.5}
          />
        </g>

        {/* Cintura → ombros */}
        <g
          stroke={
            selecionada("alturaCinturaOmbros")
              ? COR.destaque
              : COR.guiaForte
          }
          strokeWidth={
            selecionada("alturaCinturaOmbros") ? 4 : 2.5
          }
          strokeLinecap="round"
          opacity={
            selecionada("alturaCinturaOmbros") ? 1 : 0.45
          }
        >
          <line
            x1={reguaDireitaX}
            y1={ombroY}
            x2={reguaDireitaX}
            y2={cinturaY}
          />
          <line
            x1={reguaDireitaX - 9}
            y1={cinturaY}
            x2={reguaDireitaX}
            y2={cinturaY}
            strokeWidth={1.5}
          />
          <line
            x1={reguaDireitaX - 9}
            y1={ombroY}
            x2={reguaDireitaX}
            y2={ombroY}
            strokeWidth={1.5}
          />
        </g>

        {/* ==================================================
            EIXO CENTRAL
            ================================================== */}

        <line
          x1={centro}
          y1={topoCabecaY - 6}
          x2={centro}
          y2={chaoY}
          stroke={COR.guia}
          strokeWidth={0.8}
          strokeDasharray="2 5"
          opacity={0.45}
        />

        {/* ==================================================
            CORPO: contorno + preenchimento
            ================================================== */}

        <use
          href={`#${ID_PARTES}`}
          fill="none"
          stroke={COR.contorno}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />

        <use
          href={`#${ID_PARTES}`}
          fill={`url(#${ID_GRADIENTE})`}
          filter={`url(#${ID_SOMBRA})`}
        />

        {/* ==================================================
            GUIAS DE MEDIDA NO TRONCO
            Linha pontilhada mostrando a largura de cada
            região. A selecionada fica em destaque.
            ================================================== */}

        {faixas.map((faixa) => {
          const ativa = selecionada(faixa.id);
          const x1 = centro - faixa.largura / 2;
          const x2 = centro + faixa.largura / 2;

          return (
            <g
              key={faixa.id}
              stroke={ativa ? COR.destaque : COR.guia}
              strokeLinecap="round"
              opacity={ativa ? 1 : 0.5}
            >
              <line
                x1={x1}
                y1={faixa.y}
                x2={x2}
                y2={faixa.y}
                strokeWidth={ativa ? 2 : 1}
                strokeDasharray={ativa ? undefined : "3 4"}
              />
              <line
                x1={x1}
                y1={faixa.y - 4}
                x2={x1}
                y2={faixa.y + 4}
                strokeWidth={ativa ? 2 : 1}
              />
              <line
                x1={x2}
                y1={faixa.y - 4}
                x2={x2}
                y2={faixa.y + 4}
                strokeWidth={ativa ? 2 : 1}
              />
            </g>
          );
        })}

        {/* ==================================================
            LEITURA NO TOPO
            Nome e valor da medida selecionada, ou uma
            dica quando nada está selecionado.
            ================================================== */}

        {temSelecao ? (
          <g>
            <rect
              x={centro - larguraLeitura / 2}
              y={6}
              width={larguraLeitura}
              height={22}
              rx={11}
              fill={COR.destaque}
            />
            <text
              x={centro}
              y={21}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#ffffff"
              style={{ fontFamily: "inherit" }}
            >
              {textoLeitura}
            </text>
          </g>
        ) : (
          <text
            x={centro}
            y={20}
            textAnchor="middle"
            fontSize={10.5}
            fill={COR.textoSuave}
            style={{ fontFamily: "inherit" }}
          >
            Toque em um ponto para ajustar
          </text>
        )}

      </svg>

      {/* ====================================================
          PONTOS DE MEDIÇÃO (inalterados)
          ==================================================== */}

      <MeasurementPoint
        medida="ombros"
        x={50}
        y={22}
        valor={medidas.ombros}
        valorBase={40}
        valorMinimo={25}
        valorMaximo={60}
        selecionado={
          medidaSelecionada === "ombros"
        }
        onClick={() =>
          onSelectMeasurement?.("ombros")
        }
        onChange={onChangeMeasurement}
      />

      <MeasurementPoint
        medida="torax"
        x={50}
        y={36}
        valor={medidas.torax ?? 0}
        valorBase={88}
        valorMinimo={50}
        valorMaximo={140}
        selecionado={
          medidaSelecionada === "torax"
        }
        onClick={() =>
          onSelectMeasurement?.("torax")
        }
        onChange={onChangeMeasurement}
      />

      <MeasurementPoint
        medida="busto"
        x={50}
        y={42}
        valor={medidas.busto ?? 0}
        valorBase={88}
        valorMinimo={50}
        valorMaximo={150}
        selecionado={
          medidaSelecionada === "busto"
        }
        onClick={() =>
          onSelectMeasurement?.("busto")
        }
        onChange={onChangeMeasurement}
      />

      <MeasurementPoint
        medida="cintura"
        x={50}
        y={50}
        valor={medidas.cintura ?? 0}
        valorBase={70}
        valorMinimo={45}
        valorMaximo={130}
        selecionado={
          medidaSelecionada === "cintura"
        }
        onClick={() =>
          onSelectMeasurement?.("cintura")
        }
        onChange={onChangeMeasurement}
      />

      <MeasurementPoint
        medida="quadril"
        x={50}
        y={60}
        valor={medidas.quadril ?? 0}
        valorBase={96}
        valorMinimo={60}
        valorMaximo={150}
        selecionado={
          medidaSelecionada === "quadril"
        }
        onClick={() =>
          onSelectMeasurement?.("quadril")
        }
        onChange={onChangeMeasurement}
      />

      <MeasurementPoint
        medida="altura"
        x={10}
        y={50}
        valor={medidas.altura}
        valorBase={165}
        valorMinimo={130}
        valorMaximo={220}
        selecionado={
          medidaSelecionada === "altura"
        }
        onClick={() =>
          onSelectMeasurement?.("altura")
        }
        onChange={onChangeMeasurement}
      />

      <MeasurementPoint
        medida="alturaPeCintura"
        x={10}
        y={72}
        valor={medidas.alturaPeCintura}
        valorBase={95}
        valorMinimo={70}
        valorMaximo={140}
        selecionado={
          medidaSelecionada === "alturaPeCintura"
        }
        onClick={() =>
          onSelectMeasurement?.("alturaPeCintura")
        }
        onChange={onChangeMeasurement}
      />

      <MeasurementPoint
        medida="alturaCinturaOmbros"
        x={90}
        y={30}
        valor={medidas.alturaCinturaOmbros}
        valorBase={45}
        valorMinimo={30}
        valorMaximo={70}
        selecionado={
          medidaSelecionada === "alturaCinturaOmbros"
        }
        onClick={() =>
          onSelectMeasurement?.("alturaCinturaOmbros")
        }
        onChange={onChangeMeasurement}
      />

    </div>
  );
}