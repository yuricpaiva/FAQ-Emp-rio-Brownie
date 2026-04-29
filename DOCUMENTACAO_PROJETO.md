# Documentacao do Projeto - FAQ Emporio Brownie

## Visao geral

O projeto e uma aplicacao interna de FAQ/base de conhecimento para o Emporio Brownie. Ele permite que usuarios autenticados consultem artigos por categoria, pesquisem conteudos e acessem uma area administrativa para criar, editar, importar e gerenciar publicacoes.

A aplicacao esta organizada como um monorepo simples:

- `frontend/`: interface web em React.
- `backend/`: API, autenticacao, regras de permissao, uploads e persistencia.

## Stack tecnica

### Frontend

- React 18
- Vite 5
- React Router DOM 6
- Axios
- React Quill
- Quill Image Resize
- DOMPurify
- CSS global puro em `frontend/src/index.css`

### Backend

- Node.js
- Express
- Prisma ORM
- SQLite
- JWT
- Cookie HTTP-only
- bcryptjs
- multer
- mammoth para importar documentos Word `.docx`

### Banco de dados

O banco usa SQLite via Prisma, configurado em `backend/src/prisma/schema.prisma`.

Modelos principais:

- `User`: usuarios, credenciais, perfil, papel de acesso e status ativo.
- `Category`: categorias de conhecimento, slug, icone, ordem e status.
- `Article`: artigos com titulo, slug, resumo, categoria, conteudo HTML, status, autor e metadados.
- `ArticleRevision`: historico de revisoes dos artigos.

## Estrutura de pastas

```text
FAQ-Emp-rio-Brownie-master/
  backend/
    src/
      app.js
      server.js
      controllers/
      routes/
      middleware/
      prisma/
      data/
      utils/
      __tests__/
    uploads/
    package.json
  frontend/
    public/
    src/
      components/
      constants/
      context/
      pages/
      services/
      App.jsx
      main.jsx
      index.css
    package.json
```

## Funcionalidades principais

### Area de acesso

- Login em `/login`.
- Sessao persistida por cookie HTTP-only chamado `auth`.
- Redirecionamento automatico para login quando a sessao expira.
- Logout pelo menu lateral.
- Edicao de perfil do usuario logado: nome, email, senha e foto.

### Base de conhecimento

- Home protegida em `/`.
- Saudacao personalizada com o primeiro nome do usuario.
- Pesquisa global por titulo, resumo, autor, categoria ou conteudo.
- Listagem de categorias com contagem de artigos.
- Listagem de artigos recentes.
- Tela de categoria em `/categoria/:slug`.
- Tela de artigo em `/artigo/:slug`.
- Renderizacao segura do HTML dos artigos com DOMPurify.

### Painel administrativo

Disponivel em `/admin/dashboard` para usuarios com papel `creator` ou `admin`.

Recursos:

- Indicadores de artigos encontrados, publicados e rascunhos.
- Busca e filtro por status.
- Criacao de artigo.
- Edicao de artigo.
- Remocao de artigo.
- Controle de status do artigo: `draft` ou `published`.
- Ordenacao por `sortOrder`.
- Historico das ultimas revisoes de cada artigo.
- Upload de imagens para artigos.
- Importacao de documento Word `.docx`.

### Gestao de usuarios

Disponivel somente para usuarios `admin`.

Recursos:

- Listagem de usuarios.
- Criacao de usuario.
- Edicao de nome, email, senha, foto e permissao.
- Ativacao e inativacao de usuarios.
- Bloqueio para impedir que um admin inative o proprio usuario.

## Papeis e permissoes

O sistema trabalha com tres papeis:

- `reader`: acessa a base de conhecimento e artigos publicados.
- `creator`: acessa a base e o painel para criar, editar, importar e remover artigos.
- `admin`: possui acesso completo, incluindo gestao de usuarios.

Regras principais:

- Rotas publicas: somente login.
- Rotas de conhecimento exigem autenticacao.
- Conteudos `draft` ficam visiveis para `creator` e `admin`.
- Gestao de usuarios exige `admin`.

## Rotas do frontend

| Rota | Descricao | Permissao |
| --- | --- | --- |
| `/login` | Login | Publica |
| `/admin/login` | Redireciona para `/login` | Publica |
| `/` | Home da base | Autenticado |
| `/categoria/:slug` | Artigos de uma categoria | Autenticado |
| `/artigo/:slug` | Detalhe do artigo | Autenticado |
| `/admin/dashboard` | Painel de controle | `creator`, `admin` |
| `/admin/artigos/novo` | Novo artigo | `creator`, `admin` |
| `/admin/artigos/:id/editar` | Edicao de artigo | `creator`, `admin` |

## Rotas da API

Base URL local padrao: `http://localhost:4000/api`.

### Autenticacao

| Metodo | Rota | Descricao |
| --- | --- | --- |
| `POST` | `/auth/login` | Autentica usuario e cria cookie |
| `POST` | `/auth/logout` | Remove cookie de autenticacao |
| `GET` | `/auth/me` | Retorna usuario autenticado |

### Conhecimento

Todas exigem autenticacao.

| Metodo | Rota | Descricao |
| --- | --- | --- |
| `GET` | `/knowledge/articles` | Lista artigos, com filtros por busca, status e categoria |
| `GET` | `/knowledge/articles/id/:id` | Busca artigo por ID |
| `GET` | `/knowledge/articles/:slug` | Busca artigo por slug |
| `GET` | `/knowledge/categories` | Lista categorias ativas com contagem de artigos |

### Administracao

Todas exigem autenticacao. Algumas exigem papel especifico.

| Metodo | Rota | Descricao | Permissao |
| --- | --- | --- | --- |
| `PUT` | `/admin/users/me` | Atualiza perfil proprio | Autenticado |
| `POST` | `/admin/uploads` | Upload de imagem | Autenticado |
| `POST` | `/admin/articles/import-word` | Importa `.docx` | `creator`, `admin` |
| `POST` | `/admin/articles` | Cria artigo | `creator`, `admin` |
| `PUT` | `/admin/articles/:id` | Atualiza artigo | `creator`, `admin` |
| `DELETE` | `/admin/articles/:id` | Remove artigo | `creator`, `admin` |
| `GET` | `/admin/articles/:id/revisions` | Lista revisoes | `creator`, `admin` |
| `POST` | `/admin/users` | Cria usuario | `admin` |
| `GET` | `/admin/users` | Lista usuarios | `admin` |
| `PUT` | `/admin/users/:id` | Atualiza usuario | `admin` |

## Categorias padrao

As categorias iniciais ficam em `backend/src/data/categories.js`:

- Operacao
- Gente & Gestao
- TI
- Controladoria & Financeiro
- Comercial
- Marketing
- Producao e Expedicao

Cada categoria possui `name`, `slug`, `iconKey` e `sortOrder`.

## Design e identidade visual

O projeto usa uma interface em tons quentes, com foco em marrom, bege e superficies claras, alinhada ao tema de brownie/cafeteria.

### Cores principais

As variaveis CSS ficam em `frontend/src/index.css`:

| Token | Cor | Uso |
| --- | --- | --- |
| `--bg` | `#f4eee7` | Fundo base |
| `--bg-accent` | `#efe1d2` | Fundo de apoio |
| `--surface` | `rgba(255, 252, 248, 0.88)` | Cards transluidos |
| `--surface-strong` | `#fffaf5` | Cards e blocos destacados |
| `--border` | `rgba(107, 70, 52, 0.12)` | Bordas suaves |
| `--text` | `#42281d` | Texto principal |
| `--text-soft` | `#73574b` | Texto secundario |
| `--brand` | `#5c3928` | Cor principal da marca |
| `--brand-strong` | `#3f2418` | Marca em destaque |
| `--brand-soft` | `#f2e1d3` | Pills e realces suaves |
| `--danger` | `#b54732` | Acoes destrutivas e erros |
| `--success` | `#2f7d4c` | Sucesso e usuarios ativos |

### Componentes visuais

- Sidebar fixa no desktop.
- Sidebar recolhivel com estado salvo no `localStorage`.
- Menu responsivo para mobile.
- Cards com fundo translucido, borda suave e sombra.
- Botoes primarios com gradiente marrom.
- Botoes fantasma para acoes secundarias.
- Pills para categoria, status e permissoes.
- Modal para perfil e controle de usuarios.
- Tela de login com imagem de fundo em `frontend/public/login-store-bg.jpg`.
- Icones de categorias em `frontend/public/*.svg`.

## Uploads e arquivos

Uploads sao salvos em `backend/uploads/` e servidos pela rota publica `/uploads`.

### Imagens

- Tipos aceitos: JPG, PNG, WEBP e GIF.
- Limite: 5 MB.
- Usadas em artigos e fotos de usuarios.

### Word

- Tipo aceito: `.docx`.
- Limite: 10 MB.
- Convertido para HTML com `mammoth`.
- Imagens embutidas no Word sao extraidas e salvas em `backend/uploads/`.

## Variaveis de ambiente

### Backend

Arquivo de exemplo: `backend/.env.example`.

```env
DATABASE_URL="file:./dev.db"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
JWT_SECRET="troque-esta-chave-em-producao"
TRUST_PROXY="false"
COOKIE_SAMESITE="lax"
```

### Frontend

Arquivo de exemplo: `frontend/.env.example`.

```env
VITE_API_URL="http://localhost:4000/api"
```

## Como executar em desenvolvimento

### Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:seed
npm run dev
```

Servidor padrao: `http://localhost:4000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Servidor padrao: `http://localhost:5173`.

Em desenvolvimento, o Vite encaminha `/api` e `/uploads` para `http://localhost:4000`.

## Scripts disponiveis

### Backend

- `npm run dev`: inicia API com nodemon.
- `npm start`: inicia API com Node.
- `npm run prisma:generate`: gera Prisma Client.
- `npm run prisma:migrate`: executa migracao Prisma em desenvolvimento.
- `npm run prisma:seed`: popula usuario admin, categorias e artigos de exemplo.
- `npm test`: executa teste de autenticacao em `backend/src/__tests__/auth.test.js`.

### Frontend

- `npm run dev`: inicia Vite.
- `npm run build`: gera build de producao.
- `npm run preview`: serve build localmente para preview.

## Seed inicial

O seed cria:

- Usuario admin:
  - Email: `admin@admin.com`
  - Senha: `admin123`
  - Papel: `admin`
- Categorias padrao.
- Artigos de exemplo.
- Revisoes iniciais para artigos que ainda nao possuem historico.

Em producao, altere a senha inicial e defina um `JWT_SECRET` forte.

## Seguranca

- Senhas sao armazenadas com hash bcrypt.
- JWT expira em 7 dias.
- Token e armazenado em cookie HTTP-only.
- CORS aceita `CLIENT_ORIGIN`, `localhost:5173` e `127.0.0.1:5173`.
- Usuarios inativos nao conseguem autenticar nem manter sessao.
- Conteudo HTML de artigos e sanitizado no frontend antes da renderizacao.
- Uploads validam MIME type, extensao e tamanho maximo.

## Observacoes tecnicas

- O projeto usa SQLite; para crescimento, multiplas instancias ou maior concorrencia, considere Postgres.
- Os textos de alguns arquivos aparecem com caracteres quebrados no terminal, indicando possivel problema de encoding em parte do codigo-fonte.
- O editor Quill e carregado nas telas de criacao/edicao e pode gerar chunk maior no frontend.
- A API nao possui endpoint de CRUD para categorias; elas sao populadas pelo seed e usadas como referencia para artigos.
- A pasta `backend/uploads/` precisa ser persistida no ambiente de deploy.
