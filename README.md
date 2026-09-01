# FAQ EB

Aplicação interna de base de conhecimento com:

- frontend em React + Vite
- backend em Node.js + Express
- banco com Prisma + SQLite
- autenticação por cookie HTTP-only

## Estrutura

- `frontend/`: aplicação web
- `backend/`: API, autenticação, uploads e banco

## Configuração

### Backend

1. Copie `backend/.env.example` para `backend/.env`
2. Ajuste as variáveis:
   - `DATABASE_URL`
   - `PORT`
   - `CLIENT_ORIGIN`
   - `JWT_SECRET`
   - `TRUST_PROXY`
   - `COOKIE_SAMESITE`

### Frontend

1. Copie `frontend/.env.example` para `frontend/.env`
2. Ajuste `VITE_API_URL` se frontend e backend ficarem em domínios diferentes

## Desenvolvimento

### Backend

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Build

### Backend

```bash
cd backend
npm install
npm run prisma:generate
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

## Deploy

- Em produção, defina um `JWT_SECRET` forte
- Se o backend ficar atrás de proxy reverso, use `TRUST_PROXY=true`
- Se frontend e backend estiverem em domínios diferentes, ajuste `CLIENT_ORIGIN`, `VITE_API_URL` e `COOKIE_SAMESITE`
- Uploads são salvos em `backend/uploads/`; garanta persistência dessa pasta no ambiente de deploy
- Evidências do módulo Forms usam exclusivamente o diretório externo definido em `FORMS_UPLOAD_DIR`; ele também deve ser persistido e incluído nos backups
- Healthcheck disponível em `GET /api/health`

## Reservas de recursos compartilhados

Usuários autenticados acessam `/reservas` para consultar a agenda semanal, verificar disponibilidade, criar reservas e acompanhar o histórico. Administradores também cadastram tipos e recursos, criam bloqueios e gerenciam todas as reservas.

- API autenticada: `/api/reservations`
- Administração: `/api/admin/reservations` (`admin`)
- Timezone de negócio: `America/Fortaleza`; instantes persistidos em UTC
- `TIME_SLOT`: RFC 3339 com offset `-03:00`
- `PERIOD`: `startDate` e `endDate` inclusivas
- Cada tipo define parâmetros fixos (`sim/não`, número ou texto) e um ícone; o cadastro de recursos é gerado a partir dessa definição
- Definições e valores específicos são armazenados como JSON serializado, por compatibilidade com Prisma 5 + SQLite
- Reservas e bloqueios são cancelados logicamente e permanecem no histórico

A sobreposição usa intervalos semiabertos (`startAt < existing.endAt` e `endAt > existing.startAt`). O service fornece mensagens amigáveis e triggers SQLite reforçam a regra entre processos. Para alta concorrência ou várias réplicas, planeje uma migração futura para PostgreSQL.

## Observações

- O projeto ainda usa SQLite; para ambientes maiores ou múltiplas instâncias, considere migrar para Postgres
- O editor de artigos usa carregamento sob demanda, mas o chunk do Quill continua relativamente grande

## Forms

O agrupador `Forms` oferece modelos configuráveis e preenchimentos com rascunho, pontuação, evidências e aprovação. `Modelos` é administrativo; `Preenchimentos` respeita permissões por papel ou usuário, sempre validadas pela API.

- API autenticada: `/api/forms`
- O acesso geral ao módulo é configurado por usuário em `Painel > Configurações > Formulários`; administradores possuem acesso implícito
- Resultados: `SIMPLE` ou `SCORE`, com média simples ou ponderada calculada no backend
- Perguntas: `TEXT`, `NUMBER`, `BOOLEAN`, `SCORE` e `PHOTO`
- Estados: `DRAFT`, `PENDING_APPROVAL`, `COMPLETED`, `APPROVED` e `REJECTED`
- A estrutura, os aprovadores e o observador padrão são capturados quando o preenchimento começa; alterações futuras no modelo não modificam rascunhos nem histórico
- O modelo pode definir um observador padrão bloqueado. Sem padrão, o autor pode escolher, trocar ou remover um usuário ativo antes ou depois da finalização
- A aba `Observando` exibe ao observador apenas preenchimentos já finalizados; esse vínculo concede leitura do detalhe e das fotos, sem edição ou aprovação
- Uma pergunta pode possuir uma evidência. O SQLite guarda somente `storageKey` relativo, MIME, tamanho e timestamps
- As fotos são autenticadas em `GET /api/forms/photos/:photoId`, nunca expostas como diretório público
- Observadores ativos podem ser consultados em `GET /api/forms/observer-candidates`; a atribuição do rascunho usa `PATCH /api/forms/submissions/:id/observer`

`FORMS_UPLOAD_DIR` deve ser um caminho absoluto, gravável e externo ao repositório, por exemplo `/var/lib/faq/forms`. A ausência ou invalidade dessa variável bloqueia somente operações de foto do Forms. Não existe fallback para `backend/uploads`.

Para restaurar ou migrar o Forms é necessário preservar em conjunto o SQLite e o conteúdo de `FORMS_UPLOAD_DIR`. Alterar apenas a raiz configurada não exige migration, desde que os mesmos caminhos relativos sejam mantidos.
