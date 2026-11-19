# FitSense independente

Esta pasta contém uma primeira extração independente das quatro páginas FitSense que estavam dentro do projeto CAIMENT.

## Requisitos
- Node.js compatível com Vite 8
- npm

## Executar
1. Abra um terminal nesta pasta.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e ajuste `VITE_CAIMENT_URL` para o endereço em que o CAIMENT estiver rodando.
4. Execute `npm run dev`.

## Rotas
- `/` — página inicial
- `/fitsense/produtos` — catálogo
- `/fitsense/produtos/:id` — produto
- `/fitsense/carrinho` — carrinho

## Observações importantes
- Esta é uma extração inicial: as páginas e os produtos foram preservados como estavam no ZIP original. A redução do catálogo para quatro produtos será feita na próxima etapa, em conjunto com a padronização das medidas e dos dados de integração.
- O botão de experimentação ainda precisa concluir a integração entre origens diferentes. O armazenamento `sessionStorage` do CAIMENT não é compartilhado entre domínios/portas. Não considere esta cópia pronta para produção antes de implementarmos o contrato de integração.
- Imagens de produtos usam URLs externas do Unsplash, como na versão original.
- O carrinho usa `localStorage` do navegador e, portanto, fica independente do CAIMENT.


## Catálogo FitSense e API local

O catálogo de demonstração contém quatro produtos fictícios: Camiseta Essential, Calça Wide Leg, Vestido Serena e Short Casual. As medidas P/M/G são **valores ilustrativos de referência**, criados para o TCC; não são medidas verificadas de fabricantes ou peças comerciais.

### Executar

Abra dois terminais na pasta do projeto:

Terminal 1 — API:
```bash
npm run dev:api
```

Terminal 2 — loja:
```bash
npm run dev
```

A API usa o servidor HTTP nativo do Node.js e não exige Express nem banco de dados. O arquivo `server/data/products.json` é a fonte de dados do catálogo nesta versão.

### Endpoints

- `GET http://localhost:3001/api/health`
- `GET http://localhost:3001/api/products`
- `GET http://localhost:3001/api/products/1`
- `GET http://localhost:3001/api/products/1/sizes`

### Convenção das medidas

Cada medida contém valor, unidade, tipo (`circumference`, `linear` ou `length`) e ponto de referência (`landmark`). Circunferências são medidas ao redor da peça; medidas lineares são medidas de uma extremidade à outra; comprimentos seguem o ponto inicial e final descrito. Não converter largura plana em circunferência sem uma regra explícita.
