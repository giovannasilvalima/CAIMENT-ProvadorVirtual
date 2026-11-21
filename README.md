 
# CAIMENT – Provador Virtual

**Sistema de Provador Virtual Integrado a Lojas de E-commerce**

Projeto acadêmico desenvolvido como Trabalho de Conclusão de Curso (TCC) no curso Técnico em Desenvolvimento de Sistemas da Etec de Taboão da Serra, instituição vinculada ao Centro Paula Souza.

---

## Sobre o projeto

O **CAIMENT – Provador Virtual** é um projeto acadêmico que propõe o desenvolvimento de um sistema de provador virtual integrado a lojas de comércio eletrônico, com o objetivo de proporcionar uma experiência de compra mais interativa e auxiliar os consumidores na escolha de roupas e tamanhos adequados.

A proposta consiste em permitir que lojas virtuais integrem o CAIMENT às suas páginas de produtos, disponibilizando aos clientes a possibilidade de visualizar as peças de vestuário em um avatar tridimensional personalizado, construído a partir de fotografias do próprio usuário.

Além da visualização tridimensional, o sistema conta com um mecanismo de recomendação de tamanho baseado nas medidas corporais do usuário e nas especificações disponibilizadas no catálogo de cada loja integrada.

O projeto busca aproximar a experiência de compra on-line daquela proporcionada pelas lojas físicas, contribuindo para uma escolha mais consciente das peças de vestuário.

## Objetivos

- Desenvolver uma solução de provador virtual que possa ser integrada a diferentes lojas de comércio eletrônico.
- Criar avatares tridimensionais personalizados a partir de fotografias dos usuários.
- Permitir o registro e armazenamento de medidas corporais para utilização durante as experiências de compra.
- Desenvolver um sistema de recomendação de tamanhos baseado na comparação entre as medidas do usuário e as especificações das roupas cadastradas pelas lojas.
- Possibilitar a visualização tridimensional de peças de vestuário no avatar personalizado.
- Explorar tecnologias de modelagem tridimensional e processamento de imagens aplicadas ao comércio eletrônico.

## Funcionalidades

### 1. Criação de avatar 3D

O CAIMENT utiliza quatro fotografias do usuário, capturadas em diferentes ângulos, para gerar um modelo tridimensional personalizado:

- **Direita:** fotografia do lado direito do corpo.
- **Esquerda:** fotografia do lado esquerdo do corpo.
- **Frontal:** fotografia da parte da frente do corpo.
- **Traseira:** fotografia das costas.

A partir dessas imagens, o sistema utiliza uma tecnologia de geração de modelos tridimensionais para construir um avatar que represente visualmente o usuário.

Uma característica importante da proposta é que a criação do avatar considera o usuário já vestido, permitindo que o processo seja compatível com fluxos de captura fotográfica utilizados em soluções de comércio eletrônico.

### 2. Cadastro e armazenamento de medidas

O sistema possui autenticação de usuários, permitindo o cadastro e o acesso a uma conta pessoal.

Por meio desse ambiente, o usuário pode registrar suas medidas corporais, que ficam disponíveis para utilização nas funcionalidades de recomendação de tamanho e personalização da experiência de compra.

### 3. Recomendação de tamanho

O CAIMENT possui uma proposta de recomendação de tamanhos baseada na comparação entre as medidas corporais registradas pelo usuário e as dimensões das peças disponibilizadas no catálogo da loja integrada.

Dessa forma, a recomendação considera as especificações de cada produto, em vez de depender exclusivamente de uma tabela genérica de tamanhos.

### 4. Integração com lojas virtuais

A arquitetura do projeto foi pensada para permitir a integração com diferentes plataformas de comércio eletrônico.

A proposta é que as lojas disponibilizem um acesso ao CAIMENT diretamente nas páginas de seus produtos, por meio de uma opção como **"Experimentar com CAIMENT"**.

Ao selecionar essa opção, o consumidor pode utilizar seu avatar e as informações corporais cadastradas para experimentar virtualmente as peças e consultar recomendações de tamanho.

### 5. Visualização de roupas em 3D

O sistema trabalha com modelos tridimensionais de peças de vestuário, permitindo sua visualização no avatar personalizado.

O objetivo é representar as características físicas das roupas e proporcionar uma experiência de experimentação virtual, considerando as dimensões e a modelagem de cada peça.

---

## Tecnologias utilizadas

O desenvolvimento do CAIMENT envolve diferentes tecnologias, distribuídas entre o frontend, backend, armazenamento de dados e renderização tridimensional.

| Tecnologia | Aplicação |
|---|---|
| React | Desenvolvimento da interface do usuário. |
| TypeScript | Tipagem e organização do código. |
| Three.js | Criação e manipulação de objetos tridimensionais. |
| React Three Fiber | Integração da renderização 3D ao React. |
| Express.js | Desenvolvimento dos serviços do backend. |
| Firebase | Autenticação e armazenamento de dados. |
| Tripo | Geração de modelos tridimensionais personalizados a partir de fotografias. |
| Vite | Ambiente de desenvolvimento e compilação. |

## Como o sistema funciona

O fluxo principal de utilização do CAIMENT é composto pelas seguintes etapas:

1. **Acesso:** o usuário acessa o sistema e realiza seu cadastro ou login.
2. **Registro de medidas:** o usuário informa suas medidas corporais para utilização nas recomendações.
3. **Captura de fotografias:** são disponibilizadas quatro imagens do corpo, correspondentes às vistas direita, esquerda, frontal e traseira.
4. **Geração do avatar:** as fotografias são utilizadas no processo de criação do modelo tridimensional personalizado.
5. **Integração com a loja:** o consumidor acessa um produto em uma loja virtual integrada e seleciona a opção de experimentação com o CAIMENT.
6. **Recomendação de tamanho:** o sistema compara as medidas do usuário com as dimensões da peça disponibilizadas no catálogo da loja.
7. **Experimentação virtual:** a roupa é apresentada tridimensionalmente no avatar do usuário.

## Estrutura da proposta

O CAIMENT foi idealizado para funcionar como uma solução complementar às plataformas de comércio eletrônico, aproveitando informações dos catálogos das próprias lojas.

Isso permite que diferentes estabelecimentos utilizem o sistema sem depender de um catálogo único de roupas, respeitando as especificações e dimensões fornecidas por cada loja.

A proposta também considera a possibilidade de integração com estabelecimentos que já utilizam tecnologias de simulação corporal baseada em fotografias, ampliando as possibilidades de utilização do provador virtual.

---

## Equipe de desenvolvimento

Projeto desenvolvido pelos seguintes integrantes:

- Ana Julia Sousa Marques
- Christian Lemes de Souza
- Emanuelly Aparecida de Lima Santos
- Flávio Gabriel Ribeiro da Silva
- Giovanna da Silva Lima

## Instituição de ensino

**Etec de Taboão da Serra – Centro Paula Souza**

**Curso:** Técnico em Desenvolvimento de Sistemas – Ensino Médio com Habilitação Profissional (MTec)

**Modalidade:** Trabalho de Conclusão de Curso (TCC).

---

## Natureza do projeto

O CAIMENT é um projeto de caráter acadêmico, desenvolvido como Trabalho de Conclusão de Curso, com a finalidade de aplicar conhecimentos de desenvolvimento de sistemas, programação, armazenamento de dados, processamento de imagens e computação gráfica tridimensional.

Sua proposta é explorar o potencial da tecnologia de provadores virtuais no comércio eletrônico, contribuindo para pesquisas e experimentações relacionadas à personalização da experiência de compra de vestuário.

**CAIMENT – Tecnologia e inovação aplicadas à experiência de experimentar roupas virtualmente.**

 
## Como executar o projeto

Para executar o CAIMENT localmente, é necessário ter o Node.js e o npm instalados no computador.

### Pré-requisitos

- [Node.js](https://nodejs.org/) (recomendado: versão 22 LTS).
- npm (instalado junto com o Node.js).
- Git.
- Conexão com a internet.

### 1. Clonar o repositório

Abra o terminal e execute:

```bash
git clone https://github.com/giovannasilvalima/CAIMENT-ProvadorVirtual.git
```

Entre na pasta do projeto:

```bash
cd CAIMENT-ProvadorVirtual
```

### 2. Configurar e executar o CAIMENT

Entre na pasta da aplicação:

```bash
cd CAIMENT-independente
```

Instale as dependências:

```bash
npm install
```

#### Configuração das variáveis de ambiente

Configure o arquivo `.env` na raiz da pasta `CAIMENT-independente`, com as credenciais necessárias para os serviços utilizados pelo sistema.

Entre elas, está a chave de acesso à API do Tripo:

```env
TRIPO_API_KEY=sua_chave_de_acesso
```

As credenciais de configuração do Firebase também devem estar disponíveis conforme a configuração utilizada pelo projeto.

**Importante:** não compartilhe o arquivo `.env` nem publique chaves privadas no GitHub.

#### Iniciar o frontend

Em um terminal, dentro da pasta `CAIMENT-independente`, execute:

```bash
npm run dev
```

O frontend estará disponível em:

http://localhost:5173

#### Iniciar o backend

Abra outro terminal, mantendo o frontend em execução, e entre novamente na pasta `CAIMENT-independente`.

Execute:

```bash
npm run server
```

O backend estará disponível em:

http://localhost:3001

### 3. Configurar e executar o FitSense

O FitSense é a loja demonstrativa desenvolvida para apresentar a integração do CAIMENT com um catálogo de produtos.

Abra outro terminal e acesse a pasta principal do repositório:

```bash
cd CAIMENT-ProvadorVirtual/FitSense
```

Instale as dependências:

```bash
npm install
```

Inicie a aplicação:

```bash
npm run dev
```

A loja demonstrativa estará disponível em:

http://localhost:5174

### 4. Acessar o sistema

Com os serviços iniciados, as aplicações estarão disponíveis nos seguintes endereços:

| Serviço | Endereço |
|---|---|
| CAIMENT – Provador Virtual | http://localhost:5173 |
| FitSense – Loja demonstrativa | http://localhost:5174 |
| Backend do CAIMENT | http://localhost:3001 |

Para utilizar a integração, acesse a loja FitSense, escolha um produto e utilize a opção de experimentação com o CAIMENT.

### 5. Observações importantes

- Os comandos `npm run dev`, `npm run server` e `npm install` devem ser executados nas respectivas pastas das aplicações.
- O frontend e o backend do CAIMENT precisam estar funcionando simultaneamente.
- A geração de avatares tridimensionais depende de uma chave válida da API do Tripo.
- O funcionamento dos recursos de autenticação e armazenamento depende da configuração do Firebase.
- O FitSense funciona como ambiente demonstrativo para apresentar a integração entre uma loja virtual, seu catálogo e o provador virtual.

---

## Repositório

O código-fonte do projeto está disponível publicamente no GitHub:

https://github.com/giovannasilvalima/CAIMENT-ProvadorVirtual
