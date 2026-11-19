# CAIMENT — Provador Virtual

Aplicação independente de provador virtual. O CAIMENT funciona sem a loja FitSense: a loja demonstrativa é um projeto separado e outras lojas podem enviar produtos usando o contrato de integração descrito abaixo.

## Requisitos

- Node.js 20 ou superior (recomendado)
- npm
- Projeto Firebase configurado (Authentication, Firestore e Storage)
- Chave da API do Tripo para geração real de avatares

## Configuração

1. Na raiz do projeto, crie seu arquivo local `.env` copiando `.env.example`.
2. Preencha as variáveis do Firebase e a chave do Tripo. Não compartilhe o `.env`, não o envie ao GitHub e não o inclua em ZIPs.
3. Instale as dependências:

```bash
npm install
```

## Como executar

Abra dois terminais na pasta do CAIMENT.

**Terminal 1 — backend (porta 3001):**

```bash
npm run server
```

**Terminal 2 — frontend (Vite):**

```bash
npm run dev
```

Abra o endereço informado pelo Vite, normalmente `http://localhost:5173`.

O endpoint `GET http://localhost:3001/api/health` deve responder com status `ok`.

## Build de produção

```bash
npm run build
npm run preview
```

## Integração com lojas

O CAIMENT não contém mais páginas ou rotas da FitSense. Uma loja parceira abre o provador enviando o produto pela query string `caiment_product`, com o conteúdo JSON codificado em URL.

Exemplo de payload:

```ts
const product = {
  id: "SKU-001",
  name: "Camiseta Essential",
  category: "upper",
  price: 89.90,
  image: "https://loja.exemplo/imagens/camiseta.jpg",
  size: "M",
  color: "Preta",
  clothingModel: "https://loja.exemplo/modelos/camiseta.glb"
};

const url = new URL("/provador", CAIMENT_URL);
url.searchParams.set("caiment_product", JSON.stringify(product));
window.location.href = url.toString();
```

Campos reconhecidos atualmente:
- `id` e `name`: identificação do produto (obrigatórios).
- `category`: categoria da peça.
- `price`: preço numérico.
- `image`: URL da imagem de apresentação.
- `size` e `color`: tamanho e cor selecionados.
- `clothingModel`: URL do modelo 3D, quando disponível.

O usuário precisa estar autenticado no CAIMENT para carregar o provador. O recebimento do produto pela URL está implementado, mas a compatibilidade de cada modelo 3D ainda depende do formato, escala, orientação e estrutura da malha enviados pela loja.

## Estrutura principal

- `backend/src`: aplicação React, páginas, componentes, Firebase e visualização 3D.
- `server`: API Express e integração com Tripo.
- `public/models`: modelos 3D utilizados pelo projeto.

## Observações de segurança

- `.env` e arquivos de credenciais são locais e não devem ser compartilhados.
- `TRIPO_API_KEY` é usada exclusivamente pelo backend.
- As variáveis `VITE_FIREBASE_*` são configurações do Firebase destinadas ao cliente; a segurança dos dados deve ser aplicada pelas regras do Firebase.
- A versão independente não inclui o histórico Git do repositório original.
