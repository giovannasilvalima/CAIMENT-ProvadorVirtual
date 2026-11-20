# CAIMENT-ProvadorVirtual
### Provador Virtual 3D integrado ao FitSense

**Trabalho de Conclusão de Curso (TCC) — 2026**  
**ETEC de Taboão da Serra | Técnico em Desenvolvimento de Sistemas**

---

## Sobre o projeto

O **CAIMENT** é um projeto escolar desenvolvido como Trabalho de Conclusão de Curso, com a proposta de desenvolver um provador virtual tridimensional capaz de representar o corpo do usuário por meio de um avatar 3D personalizado e permitir a visualização de diferentes peças de roupa nesse modelo.

O projeto busca explorar a aplicação da modelagem tridimensional, visão computacional e desenvolvimento de sistemas para contribuir com a experiência de compras no comércio eletrônico.

O repositório reúne duas aplicações que trabalham em conjunto:

- **CAIMENT:** sistema responsável pela experiência de experimentação virtual, criação do avatar, processamento das medidas corporais e geração e visualização de roupas 3D.
- **FitSense:** loja virtual demonstrativa desenvolvida para apresentar a integração do CAIMENT com um ambiente de comércio eletrônico.

A proposta é demonstrar como um provador virtual pode ser integrado a lojas online, permitindo que informações dos produtos sejam encaminhadas ao sistema de experimentação.

## Objetivos

- Desenvolver um provador virtual utilizando tecnologias tridimensionais.
- Criar avatares personalizados a partir de fotografias e informações corporais.
- Trabalhar com medidas antropométricas para representar as proporções do usuário.
- Desenvolver geometrias tridimensionais de diferentes categorias de roupas.
- Ajustar as peças às características corporais do avatar.
- Explorar técnicas de detecção de colisões e simulação de tecidos.
- Integrar o provador virtual a uma loja demonstrativa.
- Investigar aplicações da modelagem 3D no comércio eletrônico.

## Aplicações do projeto

### CAIMENT — Provador Virtual

O CAIMENT é a aplicação principal do projeto.

Entre seus principais módulos estão:

**1. Gerenciamento de usuários**
- Cadastro e autenticação.
- Organização das informações dos usuários.
- Armazenamento de dados utilizando Firebase.

**2. Criação do avatar 3D**

Integração com Tripo AI para geração de modelos tridimensionais a partir de fotografias.

O fluxo contempla:
- Recebimento de fotografias em diferentes ângulos.
- Envio das imagens para processamento.
- Geração do modelo tridimensional.
- Carregamento e visualização do avatar.

**3. Medidas corporais**

Utilização de informações antropométricas para representar as proporções do corpo, incluindo altura, ombros, busto, cintura, quadril, braços, pernas e outras dimensões necessárias à construção corporal.

O projeto também contempla o desenvolvimento de estimativas de medidas por visão computacional.

**4. Geração de roupas 3D**

Desenvolvimento de uma arquitetura de geração geométrica para diferentes categorias de vestuário:

- Regatas.
- Shorts.
- Vestidos.
- Calças.

A estrutura trabalha com dimensões, painéis, costuras, materiais e montagem das peças, buscando permitir a criação dinâmica de diferentes modelos.

**5. Ajuste e simulação**

Desenvolvimento de mecanismos para trabalhar com:
- Posicionamento das roupas no avatar.
- Referências anatômicas.
- Detecção de colisões.
- Deformação geométrica.
- Preservação de volumes e folgas.
- Simulação do comportamento dos tecidos.

Esses mecanismos estão em desenvolvimento e aprimoramento para alcançar resultados mais precisos.

### FitSense — Loja virtual demonstrativa

O FitSense é a aplicação utilizada para demonstrar a integração do CAIMENT com uma loja virtual.

A loja permite apresentar produtos, selecionar peças e tamanhos e encaminhar as informações necessárias ao provador virtual.

**Fluxo de integração:**

1. O usuário acessa a loja FitSense.
2. Escolhe uma peça de roupa.
3. Seleciona o tamanho desejado.
4. Solicita a experimentação virtual.
5. As informações do produto são encaminhadas ao CAIMENT.
6. O CAIMENT utiliza os dados recebidos no processo de geração e visualização da roupa.

A integração demonstra a possibilidade de utilizar o CAIMENT em conjunto com diferentes plataformas de comércio eletrônico.

---

## Tecnologias utilizadas

| Área | Tecnologias |
|---|---|
| Frontend | React, TypeScript e Vite |
| Interface | Tailwind CSS e Lucide React |
| Modelagem 3D | Three.js |
| Renderização 3D | React Three Fiber e React Three Drei |
| Visão computacional | MediaPipe |
| Geração de avatar | Tripo AI |
| Backend | Node.js e Express |
| Armazenamento e autenticação | Firebase |
| Processamento de imagens | Multer |
| Navegação | React Router |
| Versionamento | Git e GitHub |

## Estrutura do repositório

```text
CAIMENT-ProvadorVirtual/
│
├── CAIMENT-independente/
│   ├── backend/
│   ├── public/
│   ├── server/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── FitSense/
│   ├── server/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── .vscode/
│
└── README.md
```

## Como executar o projeto

### Pré-requisitos

- Node.js.
- npm.
- Git.
- Credenciais e configurações dos serviços externos utilizados.

### 1. Clonar o repositório

```bash
git clone https://github.com/giovannasilvalima/CAIMENT-ProvadorVirtual.git
```

### 2. Acessar a pasta

```bash
cd CAIMENT-ProvadorVirtual
```

### 3. Executar o CAIMENT

Entre na pasta da aplicação:

```bash
cd CAIMENT-independente
```

Instale as dependências:

```bash
npm install
```

Configure as variáveis de ambiente necessárias, incluindo a chave de API do Tripo e as credenciais do Firebase.

Inicie o backend em um terminal:

```bash
npm run server
```

Inicie o frontend em outro terminal:

```bash
npm run dev
```

O backend utiliza a porta `3001`. O frontend utiliza a porta padrão do Vite, normalmente `5173`.

### 4. Executar o FitSense

Em outro terminal, acesse a pasta principal do repositório:

```bash
cd FitSense
```

Instale as dependências:

```bash
npm install
```

Inicie a API:

```bash
npm run dev:api
```

Em outro terminal, inicie a loja:

```bash
npm run dev
```

O FitSense está configurado para utilizar a porta `5174`.

### Endereços locais

| Aplicação | Endereço |
|---|---|
| CAIMENT | http://localhost:5173 |
| Backend CAIMENT | http://localhost:3001 |
| FitSense | http://localhost:5174 |

**Observação:** as funcionalidades que dependem de serviços externos precisam das respectivas credenciais configuradas. Não compartilhe chaves privadas ou arquivos `.env` no repositório.

---

## Estado do desenvolvimento

O CAIMENT é um projeto acadêmico em desenvolvimento. Suas aplicações e módulos possuem diferentes níveis de implementação e continuam passando por ajustes e aprimoramentos.

Os principais desafios técnicos envolvem:

- Precisão na representação corporal tridimensional.
- Integração entre avatar, medidas e geometria das roupas.
- Desenvolvimento de diferentes modelos de vestuário.
- Ajuste das peças considerando características anatômicas e de modelagem.
- Detecção de colisões e simulação de tecidos.
- Comunicação entre o provador virtual e a loja demonstrativa.

O objetivo é desenvolver uma solução funcional que demonstre a viabilidade da experimentação virtual de roupas utilizando modelos tridimensionais personalizados.

## Contexto acadêmico

O **CAIMENT-ProvadorVirtual** foi desenvolvido como Trabalho de Conclusão de Curso do curso Técnico em Desenvolvimento de Sistemas da ETEC de Taboão da Serra, em 2026.

O projeto reúne conhecimentos de programação, desenvolvimento web, integração de sistemas, banco de dados, visão computacional e computação gráfica.

O FitSense integra o projeto como aplicação demonstrativa, permitindo apresentar uma possibilidade prática de utilização da tecnologia desenvolvida.

---

## Repositório

**GitHub:**  
https://github.com/giovannasilvalima/CAIMENT-ProvadorVirtual

**CAIMENT — Provador Virtual 3D**

*Explorando novas possibilidades para a experiência de experimentar roupas no comércio eletrônico.*
