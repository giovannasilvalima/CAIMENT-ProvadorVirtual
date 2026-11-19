// ============================================================
// CAIMENT - EDITOR CORPORAL
// ============================================================
//
// Controla as medidas editáveis:
// - alterar as medidas;
// - destacar a medida selecionada;
// - enviar as alterações para a página que estiver utilizando
//   o editor.
//
// Cada medida tem uma ilustração mostrando em qual região de
// uma roupa ela deve ser tirada, para que a pessoa consiga
// as medidas usando uma peça que já tem em casa.
// A bolinha (controle deslizante) ao lado serve apenas como
// alternativa a digitar o valor.
//
// ============================================================

import { useState } from "react";

import {
  type EditableMeasurements,
} from "../../types/measurements";

import {
  defaultUnisexMeasurements,
} from "../../data/bodyMeasurement";

// ============================================================
// PROPRIEDADES DO COMPONENTE
// ============================================================
//
// A página que utilizar o BodyEditor poderá receber:
// - as medidas atuais.
//
// Isso será utilizado posteriormente pela página de cadastro
// para salvar as medidas no Firebase.
//
// ============================================================

interface BodyEditorProps {
  medidasIniciais?: EditableMeasurements;
  onChange?: (
    medidas: EditableMeasurements
  ) => void;
}

// ============================================================
// CORES
// ============================================================

const COR = {
  destaque: "#9254e1",
  destaqueSuave: "rgba(146, 84, 225, 0.15)",
  roupa: "#f1ebfb",
  roupaContorno: "#c9b5ee",
  detalhe: "#d9cdf2",
  fundoImagem: "#faf8fc",
  borda: "#ddd5df",
  titulo: "#262423",
  rotulo: "#402b47",
  texto: "#6f6870",
};

// ============================================================
// DESENHOS DAS PEÇAS (coordenadas em um quadro de 160 x 160)
// ============================================================

const FORMA_CAMISETA =
  "M 62 18 L 40 28 L 12 56 L 28 74 L 42 62 L 42 142 " +
  "L 118 142 L 118 62 L 132 74 L 148 56 L 120 28 " +
  "L 98 18 Q 80 34 62 18 Z";

const FORMA_CALCA =
  "M 48 18 L 112 18 L 120 148 L 88 148 L 80 70 " +
  "L 72 148 L 40 148 Z";

// Camiseta vista de frente, esticada sobre uma superfície
function Camiseta() {
  return (
    <g>
      <path
        d={FORMA_CAMISETA}
        fill={COR.roupa}
        stroke={COR.roupaContorno}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Costuras das cavas */}
      <path
        d="M 40 28 Q 46 48 42 62"
        fill="none"
        stroke={COR.detalhe}
        strokeWidth={1.5}
      />
      <path
        d="M 120 28 Q 114 48 118 62"
        fill="none"
        stroke={COR.detalhe}
        strokeWidth={1.5}
      />
    </g>
  );
}

// Calça vista de frente, esticada sobre uma superfície
function Calca() {
  return (
    <g>
      <path
        d={FORMA_CALCA}
        fill={COR.roupa}
        stroke={COR.roupaContorno}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Cós e braguilha */}
      <path
        d="M 48.4 28 L 111.6 28 M 80 28 L 80 52"
        fill="none"
        stroke={COR.detalhe}
        strokeWidth={1.5}
      />
    </g>
  );
}

// Pessoa em pé (usada só para a altura total)
function Pessoa() {
  return (
    <g fill={COR.roupa} stroke={COR.roupaContorno} strokeWidth={2}>
      <circle cx={80} cy={26} r={12} />
      <rect x={64} y={44} width={32} height={56} rx={12} />
      <rect x={52} y={46} width={9} height={50} rx={4.5} />
      <rect x={99} y={46} width={9} height={50} rx={4.5} />
      <rect x={66} y={94} width={12} height={54} rx={5} />
      <rect x={82} y={94} width={12} height={54} rx={5} />
    </g>
  );
}

// ------------------------------------------------------------
// Linhas de medida (o trecho que a pessoa deve medir)
// ------------------------------------------------------------

function CotaHorizontal({
  x1,
  x2,
  y,
}: {
  x1: number;
  x2: number;
  y: number;
}) {
  return (
    <g
      stroke={COR.destaque}
      strokeWidth={3}
      strokeLinecap="round"
    >
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - 6} x2={x1} y2={y + 6} />
      <line x1={x2} y1={y - 6} x2={x2} y2={y + 6} />
    </g>
  );
}

function CotaVertical({
  x,
  y1,
  y2,
}: {
  x: number;
  y1: number;
  y2: number;
}) {
  return (
    <g
      stroke={COR.destaque}
      strokeWidth={3}
      strokeLinecap="round"
    >
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <line x1={x - 6} y1={y1} x2={x + 6} y2={y1} />
      <line x1={x - 6} y1={y2} x2={x + 6} y2={y2} />
    </g>
  );
}

function Guia({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={COR.destaque}
      strokeWidth={1.2}
      strokeDasharray="3 3"
      opacity={0.7}
    />
  );
}

// ------------------------------------------------------------
// Escolhe o desenho de cada medida
// ------------------------------------------------------------

function Ilustracao({
  chave,
  descricao,
}: {
  chave: keyof EditableMeasurements;
  descricao: string;
}) {
  let desenho: React.ReactNode = null;

  switch (chave) {
    case "altura":
      desenho = (
        <>
          <Pessoa />
          <Guia x1={44} y1={14} x2={126} y2={14} />
          <Guia x1={36} y1={148} x2={126} y2={148} />
          <CotaVertical x={120} y1={14} y2={148} />
        </>
      );
      break;

    case "ombros":
      desenho = (
        <>
          <Camiseta />
          <CotaHorizontal x1={40} x2={120} y={29} />
        </>
      );
      break;

    case "torax":
      desenho = (
        <>
          <Camiseta />
          <CotaHorizontal x1={42} x2={118} y={66} />
        </>
      );
      break;

    case "busto":
      desenho = (
        <>
          <Camiseta />
          <CotaHorizontal x1={42} x2={118} y={84} />
        </>
      );
      break;

    case "cintura":
      desenho = (
        <>
          <Calca />
          <CotaHorizontal x1={48.5} x2={111.5} y={21} />
        </>
      );
      break;

    case "quadril":
      desenho = (
        <>
          <Calca />
          <CotaHorizontal x1={46} x2={114} y={50} />
        </>
      );
      break;

    case "alturaPeCintura":
      desenho = (
        <>
          <Calca />
          <Guia x1={26} y1={18} x2={48} y2={18} />
          <Guia x1={26} y1={148} x2={40} y2={148} />
          <CotaVertical x={28} y1={18} y2={148} />
        </>
      );
      break;

    case "alturaCinturaOmbros":
      desenho = (
        <>
          <Camiseta />
          <CotaVertical x={104} y1={22} y2={142} />
        </>
      );
      break;

    default:
      break;
  }

  return (
    <svg
      viewBox="0 0 160 160"
      width="100%"
      height="100%"
      role="img"
      aria-label={descricao}
    >
      {desenho}
    </svg>
  );
}

// ============================================================
// LISTA DE MEDIDAS
// ============================================================
//
// Ordem, nomes e limites de cada medida.
// Os limites (minimo / maximo) são os mesmos que já eram
// usados pelas bolinhas do boneco.
//
// ============================================================

interface ItemMedida {
  chave: keyof EditableMeasurements;
  titulo: string;
  peca: string;
  instrucao: string;
  descricaoImagem: string;
  minimo: number;
  maximo: number;
}

const ITENS_MEDIDAS: ItemMedida[] = [
  {
    chave: "altura",
    titulo: "Altura",
    peca: "Você",
    instrucao:
      "Em pé, sem sapatos e encostado na parede, meça do chão até o topo da cabeça.",
    descricaoImagem:
      "Pessoa em pé com a altura total destacada",
    minimo: 130,
    maximo: 220,
  },
  {
    chave: "ombros",
    titulo: "Ombros",
    peca: "Camiseta",
    instrucao:
      "Com a camiseta esticada sobre uma superfície plana, meça em linha reta de uma costura do ombro até a outra.",
    descricaoImagem:
      "Camiseta com a largura dos ombros destacada",
    minimo: 25,
    maximo: 60,
  },
  {
    chave: "torax",
    titulo: "Tórax",
    peca: "Camiseta",
    instrucao:
      "Meça de lado a lado, logo abaixo das axilas, e multiplique por 2.",
    descricaoImagem:
      "Camiseta com a largura abaixo das axilas destacada",
    minimo: 50,
    maximo: 140,
  },
  {
    chave: "busto",
    titulo: "Busto",
    peca: "Camiseta ou blusa",
    instrucao:
      "Meça de lado a lado na altura da parte mais cheia do busto, um pouco abaixo do tórax, e multiplique por 2.",
    descricaoImagem:
      "Camiseta com a largura na altura do busto destacada",
    minimo: 50,
    maximo: 150,
  },
  {
    chave: "cintura",
    titulo: "Cintura",
    peca: "Calça",
    instrucao:
      "Meça a parte de cima do cós, de ponta a ponta, com a calça esticada, e multiplique por 2.",
    descricaoImagem:
      "Calça com a largura do cós destacada",
    minimo: 45,
    maximo: 130,
  },
  {
    chave: "quadril",
    titulo: "Quadril",
    peca: "Calça",
    instrucao:
      "Meça de lado a lado na parte mais larga do quadril, cerca de 20 cm abaixo do cós, e multiplique por 2.",
    descricaoImagem:
      "Calça com a largura do quadril destacada",
    minimo: 60,
    maximo: 150,
  },
  {
    chave: "alturaPeCintura",
    titulo: "Pernas - chão até cintura",
    peca: "Calça",
    instrucao:
      "Meça pela lateral da calça, do cós até a barra, com a peça esticada.",
    descricaoImagem:
      "Calça com o comprimento do cós até a barra destacado",
    minimo: 70,
    maximo: 140,
  },
  {
    chave: "alturaCinturaOmbros",
    titulo: "Tronco - cintura até ombros",
    peca: "Camiseta",
    instrucao:
      "Meça do ombro, perto do pescoço, até a barra. Use uma peça que termine na cintura.",
    descricaoImagem:
      "Camiseta com o comprimento do ombro até a barra destacado",
    minimo: 30,
    maximo: 70,
  },
];

// ============================================================
// COMPONENTE
// ============================================================

export function BodyEditor({
  medidasIniciais,
  onChange,
}: BodyEditorProps) {

  // ==========================================================
  // MEDIDAS ATUAIS
  // ==========================================================
  //
  // Guarda as medidas editadas pelo usuário.

  const [medidas, setMedidas] =
    useState<EditableMeasurements>({
      ...defaultUnisexMeasurements,
      ...medidasIniciais,

      // ========================================================
      // COMPATIBILIDADE COM CADASTROS ANTIGOS
      // ========================================================
      //
      // Caso o usuário já tenha cadastro anterior à introdução
      // dessas medidas, usamos o valor padrão.
      //
      // BUSTO:
      // será utilizado pela Shape Key "Busto".
      //
      // OMBROS:
      // será utilizado pela Shape Key "Ombros".
      // ========================================================

      busto:
        medidasIniciais?.busto ??
        defaultUnisexMeasurements.busto,

      ombros:
        medidasIniciais?.ombros ??
        defaultUnisexMeasurements.ombros,

      alturaPeCintura:
        medidasIniciais?.alturaPeCintura ??
        defaultUnisexMeasurements.alturaPeCintura,

      alturaCinturaOmbros:
        medidasIniciais?.alturaCinturaOmbros ??
        defaultUnisexMeasurements.alturaCinturaOmbros,
    });

  // ==========================================================
  // MEDIDA SELECIONADA
  // ==========================================================
  //
  // Guarda qual medida está sendo editada/visualizada.
  // Ela fica destacada na tela.
  //
  // Inicialmente, a medida selecionada é a altura.
  //
  // ==========================================================

  const [medidaSelecionada, setMedidaSelecionada] =
    useState<keyof EditableMeasurements>("altura");

  // ==========================================================
  // ALTERAÇÃO DE UMA MEDIDA
  // ==========================================================
  //
  // Atualiza uma medida específica sem apagar as outras.
  //
  // ==========================================================

  function alterarMedida(
    nome: keyof EditableMeasurements,
    valor: number
  ) {

    setMedidas((medidasAtuais) => {

      // ------------------------------------------------------
      // Cria uma nova versão das medidas.
      // ------------------------------------------------------

      const novasMedidas = {
        ...medidasAtuais,
        [nome]: valor,
      };

      // ------------------------------------------------------
      // Informa para o componente externo quais são as
      // medidas atualizadas.
      //
      // Isso será utilizado pela página de cadastro para
      // manter os dados que deverão ser salvos.
      // ------------------------------------------------------

      onChange?.(novasMedidas);

      return novasMedidas;
    });
  }

  // ==========================================================
  // INTERFACE DO EDITOR
  // ==========================================================
  //
  // 1. Título e orientação;
  // 2. Um cartão por medida, com:
  //    - ilustração da peça de roupa;
  //    - explicação de onde medir;
  //    - campo para digitar;
  //    - bolinha para ajustar sem digitar.
  //
  // A lógica das medidas continua exatamente a mesma.
  // ==========================================================

  return (
    <div
      style={{
        // Ocupa toda a largura disponível.
        width: "100%",

        // Evita que o editor fique grande demais
        // em telas muito largas.
        maxWidth: "1000px",

        // Centraliza o editor.
        margin: "0 auto",

        // Mantém um espaçamento interno.
        padding: "8px",

        // Garante que padding não aumente
        // a largura total do elemento.
        boxSizing: "border-box",
      }}
    >

      {/* ======================================================
          TÍTULO DO EDITOR
          ====================================================== */}

      <div
        style={{
          marginBottom: "20px",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "22px",
            fontWeight: 600,
            color: COR.titulo,
          }}
        >
          Personalizar seu corpo
        </h2>

        <p
          style={{
            marginTop: "6px",
            marginBottom: 0,
            fontSize: "14px",
            lineHeight: 1.5,
            color: COR.texto,
          }}
        >
          Veja na imagem onde medir em uma roupa sua e
          digite o valor, ou arraste a bolinha ao lado.
          Estique bem a peça sobre uma superfície plana
          antes de medir.
        </p>
      </div>

      {/* ======================================================
          LISTA DE MEDIDAS
          ====================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "16px",
        }}
      >

        {ITENS_MEDIDAS.map((item) => {

          const selecionado =
            medidaSelecionada === item.chave;

          const valorAtual = medidas[item.chave] as
            | number
            | undefined;

          return (
            <div
              key={item.chave}
              onClick={() =>
                setMedidaSelecionada(item.chave)
              }
              style={{
                display: "grid",
                gridTemplateColumns: "132px 1fr",
                gap: "16px",
                padding: "14px",
                boxSizing: "border-box",
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                border: `1px solid ${
                  selecionado
                    ? COR.destaque
                    : COR.borda
                }`,
                boxShadow: selecionado
                  ? `0 0 0 3px ${COR.destaqueSuave}`
                  : "none",
                transition:
                  "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
            >

              {/* ============================================
                  IMAGEM DA PEÇA
                  ============================================ */}

              <div
                style={{
                  position: "relative",
                  width: "132px",
                  height: "132px",
                  backgroundColor: COR.fundoImagem,
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                <Ilustracao
                  chave={item.chave}
                  descricao={item.descricaoImagem}
                />

                <span
                  style={{
                    position: "absolute",
                    left: "6px",
                    bottom: "6px",
                    padding: "2px 7px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: COR.rotulo,
                    backgroundColor:
                      "rgba(255, 255, 255, 0.92)",
                    borderRadius: "6px",
                  }}
                >
                  {item.peca}
                </span>
              </div>

              {/* ============================================
                  TEXTO, CAMPO E BOLINHA
                  ============================================ */}

              <div
                style={{
                  minWidth: 0,
                }}
              >

                <label
                  htmlFor={item.chave}
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: COR.rotulo,
                  }}
                >
                  {item.titulo}
                </label>

                <p
                  style={{
                    margin: "0 0 10px 0",
                    fontSize: "12.5px",
                    lineHeight: 1.45,
                    color: COR.texto,
                  }}
                >
                  {item.instrucao}
                </p>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >

                  <input
                    id={item.chave}
                    type="number"
                    min="1"
                    value={valorAtual ?? ""}
                    onChange={(event) =>
                      alterarMedida(
                        item.chave,
                        Number(event.target.value)
                      )
                    }
                    onFocus={() =>
                      setMedidaSelecionada(item.chave)
                    }
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: `1px solid ${COR.borda}`,
                      borderRadius: "10px",
                      outline: "none",
                      fontSize: "14px",
                      color: COR.titulo,
                      boxSizing: "border-box",
                    }}
                  />

                  <span
                    style={{
                      fontSize: "13px",
                      color: COR.texto,
                    }}
                  >
                    cm
                  </span>

                </div>

                {/* Bolinha: alternativa a digitar */}
                <input
                  type="range"
                  min={item.minimo}
                  max={item.maximo}
                  step={0.5}
                  value={valorAtual ?? item.minimo}
                  onChange={(event) =>
                    alterarMedida(
                      item.chave,
                      Number(event.target.value)
                    )
                  }
                  onFocus={() =>
                    setMedidaSelecionada(item.chave)
                  }
                  onPointerDown={() =>
                    setMedidaSelecionada(item.chave)
                  }
                  aria-label={`Ajustar ${item.titulo} arrastando`}
                  style={{
                    width: "100%",
                    marginTop: "12px",
                    accentColor: COR.destaque,
                    cursor: "grab",
                  }}
                />

              </div>

            </div>
          );
        })}

      </div>

    </div>
  );
}