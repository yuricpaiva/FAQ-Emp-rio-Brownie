# FAQ Empório Brownie

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
- Healthcheck disponível em `GET /api/health`

## Observações

- O projeto ainda usa SQLite; para ambientes maiores ou múltiplas instâncias, considere migrar para Postgres
- O editor de artigos usa carregamento sob demanda, mas o chunk do Quill continua relativamente grande
