---
name: deploy-faq-production
description: Fazer deploy manual do FAQ EB na produção via SSH, incluindo preflight, backup do SQLite, atualização da main, Prisma, build, PM2 e validação. Use quando o usuário pedir para publicar ou implantar alterações do FAQ EB no servidor de produção; não use para execução ou testes locais comuns.
---

# Deploy do FAQ EB em produção

Implante somente quando o usuário pedir explicitamente um deploy. Um pedido de revisão, commit ou push não autoriza modificar produção.

## Ambiente fixo

- Repositório oficial local: `C:\Users\yuric\Documents\FAQ-Emp-rio-Brownie`
- Branch de produção: `main`
- SSH configurado: `ssh faq-production`
- Diretório no servidor: `/var/www/FAQ-Emp-rio-Brownie-master`
- Processo PM2: `faq-backend`
- Backend local no servidor: `http://127.0.0.1:4000`
- URL pública: `https://faq.emporiobrownie.com.br`
- Banco atual: `backend/src/prisma/dev.db`

Nunca revele senhas, chaves, `.env` ou credenciais. Não use o repositório antigo do Google Drive.

## Regras de segurança

- Preserve todas as alterações locais, tanto no computador quanto no servidor.
- Nunca execute `git reset`, `git checkout`, `git clean`, exclusão recursiva ou sobrescrita de banco/uploads.
- No servidor, preserve especialmente `.env`, `backend/uploads/`, bancos SQLite, backups, infraestrutura local e a alteração rastreada já existente em `.gitignore`.
- Não rode a suíte de testes no servidor: testes podem modificar dados. Faça os testes no ambiente local antes do deploy.
- Atualize produção somente com `git pull --ff-only origin main`.
- Não aplique rollback de banco ou migration automaticamente. Isso exige autorização explícita e análise da migration.
- Se qualquer etapa falhar, pare antes da próxima mutação, preserve o estado e informe o comando, a etapa e um resumo seguro do erro.

## 1. Preflight local

Antes de conectar ao servidor, confirme o repositório e o commit que será publicado:

```powershell
Set-Location -LiteralPath 'C:\Users\yuric\Documents\FAQ-Emp-rio-Brownie'
git status --short
git branch --show-current
git rev-parse --short HEAD
git rev-parse --short origin/main
git rev-parse --show-toplevel
```

Requisitos:

- o caminho deve ser o repositório de `Documents`;
- a branch deve ser `main`;
- `HEAD` e `origin/main` devem apontar para o commit autorizado para deploy;
- alterações pendentes não relacionadas devem permanecer intocadas.

Se as alterações solicitadas não estiverem commitadas e publicadas na `main`, não presuma autorização para publicar: informe o bloqueio ou siga a autorização explícita já fornecida pelo usuário.

Confira o que mudou desde o commit atualmente implantado. Primeiro leia o HEAD remoto:

```powershell
ssh faq-production "cd /var/www/FAQ-Emp-rio-Brownie-master && git rev-parse --short HEAD && git status --short"
```

Depois inspecione localmente o intervalo correspondente:

```powershell
git diff --name-only <HEAD_REMOTO>..origin/main
git log --oneline <HEAD_REMOTO>..origin/main
```

Classifique o deploy:

- `frontend/**`: exige build do frontend;
- `backend/**`: exige dependências/Prisma quando aplicável e reinício do PM2;
- `backend/src/prisma/schema.prisma` ou `backend/src/prisma/migrations/**`: exige backup e `prisma migrate deploy` antes do reinício;
- alterações em Nginx ou infraestrutura: não improvise; inspecione a configuração específica, faça backup e valide com `nginx -t` antes de recarregar.

Faça validações locais proporcionais ao escopo. Para uma entrega completa:

```powershell
Set-Location -LiteralPath 'C:\Users\yuric\Documents\FAQ-Emp-rio-Brownie\backend'
npm test
npx prisma validate --schema src/prisma/schema.prisma

Set-Location -LiteralPath 'C:\Users\yuric\Documents\FAQ-Emp-rio-Brownie\frontend'
npm run build

Set-Location -LiteralPath 'C:\Users\yuric\Documents\FAQ-Emp-rio-Brownie'
git diff --check
```

Se uma alteração local preexistente impedir a validação, não a descarte nem a inclua silenciosamente. Isole-a apenas de forma reversível quando seguro e restaure exatamente o estado original depois; caso contrário, reporte o bloqueio.

## 2. Verificação inicial do servidor

Conecte usando chave SSH, sem colocar senha na linha de comando:

```powershell
ssh faq-production
```

No servidor:

```bash
cd /var/www/FAQ-Emp-rio-Brownie-master
git rev-parse --short HEAD
git status --short
pm2 status faq-backend
systemctl is-active nginx
```

Leia o status antes de qualquer atualização. Arquivos modificados ou não rastreados já existentes pertencem ao ambiente e devem ser preservados. Se uma alteração rastreada conflitar com o pull, pare; não force a atualização.

## 3. Backup antes de mudanças no backend ou banco

Antes de migrations ou de uma atualização que possa afetar persistência, crie um backup com timestamp:

```bash
cd /var/www/FAQ-Emp-rio-Brownie-master
mkdir -p backups
deploy_timestamp=$(date +%Y%m%d-%H%M%S)
cp -p backend/src/prisma/dev.db "backups/dev.db.pre-deploy-${deploy_timestamp}"
ls -lh "backups/dev.db.pre-deploy-${deploy_timestamp}"
```

Se o banco não estiver nesse caminho, pare e confirme `DATABASE_URL` sem imprimir seu valor completo. Não crie um banco vazio no lugar do banco real.

## 4. Atualizar a `main`

```bash
cd /var/www/FAQ-Emp-rio-Brownie-master
git pull --ff-only origin main
git rev-parse --short HEAD
```

O HEAD resultante deve ser o mesmo `origin/main` confirmado no preflight. Se o pull não puder ser fast-forward, pare e investigue sem resetar o servidor.

## 5. Backend e Prisma

Execute esta seção quando houver mudança em `backend/**`. Para mudanças apenas de frontend, pule para a seção seguinte.

```bash
cd /var/www/FAQ-Emp-rio-Brownie-master/backend
npm install
npx prisma generate --schema src/prisma/schema.prisma
```

Quando houver schema ou migration nova, depois do backup execute:

```bash
npx prisma migrate deploy --schema src/prisma/schema.prisma
npx prisma migrate status --schema src/prisma/schema.prisma
```

Use `migrate deploy`, nunca `migrate dev`, em produção. Não use `db push` como substituto para migrations versionadas.

## 6. Frontend

Execute quando houver mudança em `frontend/**` ou quando o build precisar ser regenerado:

```bash
cd /var/www/FAQ-Emp-rio-Brownie-master/frontend
npm install
npm run build
test -f dist/index.html
```

O Nginx serve `frontend/dist`; não copie o build para outro diretório sem confirmar uma mudança de infraestrutura.

## 7. Reiniciar o backend

Quando houve mudança no backend, Prisma ou dependências do backend:

```bash
cd /var/www/FAQ-Emp-rio-Brownie-master
pm2 restart faq-backend
pm2 save
pm2 status faq-backend
```

Não reinicie o backend em um deploy exclusivamente de frontend, salvo se houver motivo operacional confirmado.

## 8. Validação pós-deploy

No servidor:

```bash
cd /var/www/FAQ-Emp-rio-Brownie-master
git rev-parse --short HEAD
git status --short
curl --fail --silent --show-error http://127.0.0.1:4000/api/health
pm2 status faq-backend
systemctl is-active nginx
```

Fora do servidor, valide a rota pública:

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://faq.emporiobrownie.com.br/api/health
curl.exe -sS https://faq.emporiobrownie.com.br/
```

Para frontend, confirme que o HTML público referencia os bundles recém-gerados e que esses assets retornam HTTP 200. Para PWA, considere que um Service Worker antigo pode manter a interface anterior até o usuário aceitar “Atualizar agora” ou recarregar.

Se a API não retornar HTTP 200 ou o PM2 não ficar `online`, consulte apenas o necessário:

```bash
pm2 logs faq-backend --lines 100 --nostream
```

Não reproduza logs completos na resposta. Resuma o erro e oculte qualquer credencial ou dado sensível.

## 9. Encerramento

Informe ao usuário:

- commit implantado;
- escopo atualizado (frontend, backend e/ou migration);
- resultado do build e das migrations;
- estado do PM2/Nginx quando aplicável;
- HTTP do health check público;
- qualquer aviso relevante de cache/PWA;
- confirmação de que alterações locais e arquivos persistentes foram preservados.

Não declare sucesso se o commit, o build, as migrations, o processo ou o health check exigido não tiverem sido confirmados.
