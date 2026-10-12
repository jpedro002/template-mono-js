# template-api-js

API REST em **Bun + Elysia** com Prisma, autenticação JWT em cookie `httpOnly`, RBAC por permissões e documentação OpenAPI gerada automaticamente a partir dos schemas Zod.

---

## Sumário

- [Stack](#stack)
- [Requisitos](#requisitos)
- [Começando](#começando)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Ciclo de uma requisição](#ciclo-de-uma-requisição)
- [Autenticação](#autenticação)
- [Autorização (RBAC)](#autorização-rbac)
- [CRUD base](#crud-base)
- [Endpoints](#endpoints)
- [Arquivos (kit de storage)](#arquivos-kit-de-storage)
- [Formato de erros](#formato-de-erros)
- [Logs](#logs)
- [Testes](#testes)
- [Gerador de CRUD](#gerador-de-crud)
- [Banco de dados](#banco-de-dados)
- [Docker](#docker)
- [Convenções de código](#convenções-de-código)

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Bun |
| Framework HTTP | Elysia 1.4 |
| ORM | Prisma 7 (PostgreSQL) |
| Validação | Zod 4 (Standard Schema, nativo na Elysia) |
| Documentação | `@elysiajs/openapi` + Scalar |
| Autenticação | `@elysiajs/jwt` + cookie `httpOnly` |
| Hash de senha | bcrypt |
| Linter/Formatter | Biome |
| Gerador de código | Plop |

---

## Requisitos

- [Bun](https://bun.sh) 1.2+
- PostgreSQL 14+

---

## Começando

```bash
# 1. dependências
bun install

# 2. configuração
cp .env.example .env   # edite DATABASE_URL e JWT_SECRET

# 3. cliente Prisma
bun run prisma:generate

# 4. criar as tabelas
bun x prisma migrate deploy   # ou, em dev: bun x prisma migrate dev

# 5. popular permissões, roles e usuário SUPER_ADMIN
bun run seed          # SEED_DEMO=true / bun run seed:demo inclui cards de exemplo

# 6. subir em modo dev (hot reload)
bun run dev
```

| Endereço | O que é |
|----------|---------|
| `http://localhost:3000` | API |
| `http://localhost:3000/docs` | documentação interativa (Scalar) |
| `http://localhost:3000/docs/openapi.json` | especificação OpenAPI em JSON |

### Seed (`prisma/seed.js`)

Idempotente — pode rodar quantas vezes quiser. Também roda em `bunx prisma migrate reset` e `bunx prisma db seed` (configurado em `prisma.config.ts`).

| Etapa | O quê |
|---|---|
| Permissões | todo `prisma/permissions_*.js` que exporta `PERMISSIONS` (auto-descoberta; o `plop` gera um por model). Upsert atualiza nome/categoria |
| Roles | `SUPER_ADMIN` (coringa `*`), `ADMIN` (todas as permissões do catálogo, menos `*`), `USUARIO` (`cards:read`). As permissões das roles base são **realinhadas** a cada execução — para concessões manuais crie roles próprias |
| Admin | usuário com role `SUPER_ADMIN`. Já existindo (mesmo e-mail ou login), a senha **não** é alterada |
| Demo | `SEED_DEMO=true`: 3 cards de exemplo se a tabela estiver vazia. Ignorado em produção |

| Env | Default | |
|---|---|---|
| `SEED_ADMIN_EMAIL` | `admin@admin.com` | |
| `SEED_ADMIN_LOGIN` | `admin` | |
| `SEED_ADMIN_NAME` | `Administrador` | |
| `SEED_ADMIN_PASSWORD` | `123456` fora de produção | **obrigatória em produção** (mín. 12 caracteres) — sem ela o seed aborta antes de gravar |
| `SEED_DEMO` | `false` | |

---

## Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `PORT` | `3000` | Porta HTTP |
| `NODE_ENV` | `development` | Ambiente de execução |
| `DATABASE_URL` | — | String de conexão PostgreSQL (obrigatória) |
| `JWT_SECRET` | dev inseguro | Segredo de assinatura. **Obrigatório em produção** — a aplicação não sobe sem ele |
| `JWT_ALGORITHM` | `HS256` | Algoritmo de assinatura |
| `JWT_EXPIRES_IN` | `24h` | Expiração do token (também vira o `Max-Age` do cookie) |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Expiração do refresh (reservado) |
| `CORS_ORIGIN` | `http://localhost:3000,http://localhost:3001` | Allowlist de origens, separadas por vírgula (correspondência exata) |
| `COOKIE_NAME` | `access_token` | Nome do cookie de sessão |
| `COOKIE_SAMESITE` | `lax` | `lax`, `strict` ou `none` |
| `COOKIE_SECURE` | `true` em produção | Exige HTTPS para o cookie trafegar |
| `COOKIE_DOMAIN` | — | Domínio do cookie (ex: `.seudominio.com`) |
| `SESSAO_CACHE_TTL` | `30` | Segundos de cache do estado da sessão (versão do token, ativo). Atraso máximo de uma revogação nas outras instâncias com `CACHE_DRIVER=memory` |
| `LOG_LEVEL` | `debug` (prod: `info`) | `debug`, `info`, `warn` ou `error` |
| `LOG_PRETTY` | `true` (prod: `false`) | `true` = legível e colorido; `false` = JSON por linha |
| `STORAGE_DRIVER` | `s3` | `s3` ou `memory` (Map em processo — só teste e dev offline) |
| `S3_ENDPOINT` | — | Endpoint do provedor (vazio = AWS) |
| `S3_REGION` | `us-east-1` | Região |
| `S3_BUCKET` | `app-private` | Bucket privado (default de tudo) |
| `S3_PUBLIC_BUCKET` | — | Bucket público opcional (só avatar) |
| `S3_PUBLIC_URL` | — | URL/CDN do bucket público |
| `S3_ACCESS_KEY_ID` | — | Credencial. **Obrigatória em produção** |
| `S3_SECRET_ACCESS_KEY` | — | Credencial. **Obrigatória em produção** |
| `S3_VIRTUAL_HOSTED` | `false` | `true` para AWS/R2; MinIO usa path-style |
| `STORAGE_MAX_SIZE` | `25000000` | Teto global de upload em bytes |
| `STORAGE_PRESIGN_TTL` | `300` | Validade da URL assinada em segundos |
| `STORAGE_CHECKSUM_LIMIT` | `8000000` | Acima disso o upload vira stream e sai sem checksum |

---

## Scripts

```bash
bun run dev          # servidor com hot reload
bun run build        # bundle para dist/
bun run start        # executa a partir de dist/

bun test             # suíte completa
bun run test:unit         # só a camada unitária
bun run test:integration  # só as rotas HTTP
bun run test:watch        # modo watch
bun run test:coverage     # com relatório de cobertura

bun run lint         # biome check
bun run format       # biome format

bun run prisma:generate   # regerar o client após mudar o schema
bun run prisma:studio     # GUI do banco

bun run seed         # permissões, roles e usuário SUPER_ADMIN
bun run seed:demo    # idem + cards de exemplo

bun run permissoes:diff   # permissões citadas em authorize() que faltam no banco
bun run permissoes:sync   # insere as que faltam

bun run generate:crud         # controller + rota + permissões de um model
bun run generate:permissions  # apenas o seed de permissões
bun run generate:controller   # apenas o controller
```

> Veja [Testes](#testes) para o que a suíte cobre e como ela roda sem banco.

---

## Estrutura do projeto

```
src/
├── index.js            # bootstrap: listen
├── app.js              # composição: plugins → onError → rotas
├── config/             # settings a partir das variáveis de ambiente
├── plugins/            # cors, openapi, jwt (cookie), rate limit
├── middleware/         # authenticate, authorize
├── policies/           # políticas por registro (PBAC)
├── routes/
│   ├── base.route.js   # fábrica das 6 rotas REST padrão
│   ├── seguranca/      # usuários, sessão, roles, permissões
│   └── teste/          # domínio de exemplo (cards)
├── controllers/
│   ├── base.controller.js  # handlers CRUD genéricos sobre o Prisma
│   ├── seguranca/
│   └── teste/
├── helpers/            # utilitários + handler global de erros
└── services/           # prisma, autorização (cache), cache, storage, e-mail
```

O alias `src/*` aponta para `./src/*` (configurado no `jsconfig.json`, resolvido nativamente pelo Bun).

---

## Ciclo de uma requisição

```
index.js → createApp()
         → .use(cors) → .use(openapi) → .use(jwt)
         → .onError(errorHandler)
         → .use(segurancaRoutes)   # prefixo /api/seguranca
         → .use(testeRoutes)       # prefixo /api/teste
```

Cada domínio é uma instância Elysia que carrega o próprio `prefix` e é montada na raiz com `.use()`. Os handlers recebem o contexto da Elysia:

```js
const handler = async ({ body, query, params, user, set, cookie }) => {
	return { ok: true }              // 200 + JSON
	// return status(201, data)      // status explícito
	// set.status = 204; return null // resposta sem corpo
}
```

---

## Autenticação

O JWT trafega **exclusivamente** em cookie `httpOnly` — nunca aparece no corpo da resposta e não pode ser lido por JavaScript no browser.

| Método | Rota | Efeito |
|--------|------|--------|
| `POST` | `/api/seguranca/auth/session` | Login: valida credenciais, grava o cookie e retorna `{ user }` |
| `GET` | `/api/seguranca/auth/session` | Dados da sessão atual (roles e permissões incluídas) |
| `DELETE` | `/api/seguranca/auth/session` | Logout: expira o cookie |

```js
// login
await fetch('http://localhost:3000/api/seguranca/auth/session', {
	method: 'POST',
	credentials: 'include',          // obrigatório para o cookie ser gravado
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ email: 'admin@admin.com', password: '123456' })
})

// chamadas seguintes: o browser envia o cookie sozinho
await fetch('http://localhost:3000/api/teste/cards', { credentials: 'include' })
```

Pontos de atenção:

- **`credentials: 'include'` em todas as chamadas.** Sem isso o cookie não é enviado e a resposta é `401`.
- **`CORS_ORIGIN` precisa listar a origem exata** do front-end. Curinga (`*`) não funciona junto com credenciais.
- O login tem **rate limit** de 5 tentativas por minuto por IP (`429` ao estourar).
- **CSRF**: a proteção é o `SameSite=lax`, suficiente quando front-end e API estão no mesmo site registrável (`app.dominio.com` ↔ `api.dominio.com`). Se o front estiver em outro domínio e for necessário `COOKIE_SAMESITE=none`, essa proteção deixa de existir e um token anti-CSRF passa a ser obrigatório — a aplicação emite um aviso no boot nesse caso.

---

## Autorização (RBAC + políticas)

Permissões seguem o formato `recurso:ação` — por exemplo `users:read`, `cards:create`. Curingas:

| Curinga | Concede |
|---|---|
| `*` | tudo (role `SUPER_ADMIN`), menos as permissões só explícitas |
| `cards:*` | todas as ações do recurso nomeado |
| `*:read` | a ação em qualquer recurso **de domínio** — não alcança `users`, `roles`, `permissions` nem `auditoria` (`SEGURANCA_RECURSOS`) |

Um usuário acumula permissões vindas das **roles** atribuídas e de **permissões diretas**, ambas com data de expiração opcional. Usuário inativo ou excluído não tem role nem permissão nenhuma.

Middlewares (`src/middleware/`), aplicados via `beforeHandle`:

| Middleware | Verifica |
|------------|----------|
| `authenticate` | Sessão válida (cookie **e** sessão não revogada) |
| `authorize('users:read')` | Possui ao menos uma das permissões |
| `authorize([...], { requireAll: true })` | Possui todas as permissões |

Não há atalho por nome de role (`requireAdmin` saiu): acesso é sempre permissão — renomear uma role não muda quem acessa o quê. O 403 não lista as permissões exigidas (vão para o log, com o `userId`).

```js
.get('/relatorio', controller.relatorio, {
	beforeHandle: [authenticate, authorize('cards:read')]
})
```

**Cache.** As permissões ficam no `cacheService` (namespace `authz:perms`, 5 min). Com `CACHE_DRIVER=redis` a revogação vale na hora em todas as instâncias; com `memory`, na instância que fez a mudança. Toda mutação do `authorizationService` já invalida; código próprio chama `await authorizationService.clearCache(userId)`.

**Contenção de escalada** (`_contencao.js`): ninguém concede permissão ou role que não tem, nem mexe em usuário com mais acesso que ele. Conceder `*:acao` exige `*`.

**Trava do acesso total** (`_acesso-total.service.js`): remover role, revogar permissão, desligar role ou desativar/excluir usuário responde **409** quando deixaria o sistema sem nenhum usuário ativo com `*`. Desativar ou excluir a si mesmo também é 409.

### Sessões revogáveis

O JWT carrega `tv` (versão das sessões do usuário). A cada requisição o `jwtPlugin` compara com `users.token_version` (cache `sessao:user`, `SESSAO_CACHE_TTL` = 30 s) e rejeita usuário inativo, excluído ou com `requires_relogin`. A versão sobe — derrubando **todas** as sessões abertas — ao:

- desativar ou excluir o usuário;
- redefinir a senha (pelo admin ou pelo link do e-mail);
- trocar a própria senha (esta sessão recebe cookie novo e continua);
- `POST /usuarios/:id/revogar-sessoes` (`users:manage`);
- logar com `requires_relogin = true` (a flag cai).

### Políticas por registro (PBAC)

`authorize` responde "pode editar cards?"; a política responde "pode editar **este** card?". Ficam em `src/policies/`:

```js
// src/policies/cards.policy.js
definirPolitica('cards', {
	update: (user, card) => card.createdById === user.id,
	delete: (user, card) => card.createdById === user.id,
	// escopo: user => ({ createdById: user.id })  // recorte das listagens
})
```

No `baseController`, `policy: 'cards'` aplica o `escopo` em `all`/`fetch` e confere a regra em `one`/`put`/`del` (fora do escopo = 404, sem a regra = 403); `campoDono: 'createdById'` grava o dono a partir da sessão e impede trocá-lo pelo body. `*` ou `cards:manage` passam por cima da política. Fora do `baseController`: `can(user, 'update', 'cards', registro)` e `escopoDe(user, 'read', 'cards')`.

### Auditoria

Toda mudança de acesso grava em `seguranca.authz_audit` **na mesma transação**: `role.assign`, `role.revoke`, `permission.grant`, `permission.revoke`, `role.create`, `role.update`, `role.delete`, `role.permissions.set`, `user.sessions.revoke`, `user.deactivate`, `user.delete` — com autor, alvo, role/permissão e antes/depois. Leitura em `GET /api/seguranca/auditoria` (`auditoria:read`).

### Catálogo

`tests/unit/catalogo-permissoes.test.js` falha quando um `authorize('x:y')` (ou o `x:manage` de uma política) não está em `prisma/permissions_*.js`, ou quando o catálogo tem permissão que nenhum código exige.

Permissões criadas pelo `seed`: `*`, `users:{create,read,update,delete,manage}`, `roles:{create,read,update,delete,assign,revoke}`, `permissions:{create,read,update,delete,assign,revoke}`, `telemetria:read`, `auditoria:read`, `sistema:read` (`GET /version`), `cards:{create,read,update,delete,manage}`.

---

## CRUD base

`baseRouter(controller, options)` devolve uma instância Elysia já com as 6 rotas REST do recurso:

| Método | Rota | Handler | Descrição |
|--------|------|---------|-----------|
| `POST` | `/` | `post` | Cria um registro |
| `PUT` | `/:id` | `put` | Atualiza um registro |
| `GET` | `/all` | `all` | Lista tudo (sem paginação) |
| `GET` | `/` | `fetch` | Lista paginada |
| `GET` | `/:id` | `one` | Busca por ID |
| `DELETE` | `/:id` | `del` | Remove por ID |

### Query params das listagens

| Param | Exemplo | Descrição |
|-------|---------|-----------|
| `term` | `?term=joão` | Termo de busca |
| `fields` | `?fields=nome&fields=email` | Campos onde o `term` é procurado |
| `fspecifics` | `?fspecifics=status$ativo` | Filtro exato no formato `campo$valor` (repetível) |
| `order` | `?order=createdAt` | Campo de ordenação |
| `orderDirection` | `?orderDirection=desc` | `asc` (default) ou `desc` |
| `select` | `?select=id,nome,email` | Retorna apenas os campos indicados |
| `page` | `?page=2` | Página (default `1`) |
| `pageSize` | `?pageSize=50` | Itens por página (default `20`) |

`select` só funciona nos campos declarados em `allowedFields` no controller; campos sensíveis (`password_hash`, `token`…) são sempre descartados.

Resposta paginada:

```json
{
	"data": [],
	"pagination": { "page": 1, "rowCount": 42, "pageCount": 3, "pageSize": 20 }
}
```

> **Atenção ao roteador**: a Elysia não aceita dois nomes de parâmetro diferentes na mesma posição da URL. Como o `baseRouter` registra `/:id`, rotas customizadas irmãs devem usar `/:id` também (ex: `/:id/roles/:roleId`).

---

## Endpoints

Todos exigem sessão autenticada, exceto `GET /`, `/healthz`, `/ready` e o login (`/version` exige admin).

### Autenticação — `/api/seguranca/auth`

| Método | Rota | Permissão |
|--------|------|-----------|
| `POST` | `/session` | pública (rate limit 5/min) |
| `GET` | `/session` | autenticado |
| `DELETE` | `/session` | autenticado |
| `POST` | `/forgot-password`, `/reset-password` | pública (rate limit) |
| `POST` | `/email/change/request`, `/email/verify/request`, `/email/change/cancel` | autenticado |
| `POST` | `/email/change/confirm` | pública (token do e-mail) |

### Usuários — `/api/seguranca/usuarios`

| Método | Rota | Permissão |
|--------|------|-----------|
| `GET` | `/`, `/all`, `/:id` | `users:read` |
| `POST` | `/` | `users:create` |
| `PUT` | `/:id` | `users:update` |
| `DELETE` | `/:id` | `users:delete` |
| `POST` | `/update-password` | autenticado (troca a própria senha; derruba as outras sessões) |
| `POST` | `/:id/revogar-sessoes` | `users:manage` (encerra todas as sessões do usuário) |
| `POST`/`DELETE` | `/:id/roles/:roleId` | `users:update` |
| `POST`/`DELETE` | `/:id/permissions/:permissionId` | `users:update` |
| `GET` | `/users/:userId/roles` | autenticado (próprio) ou `users:manage` |
| `GET` | `/users/:userId/permissions` | autenticado (próprio) ou `users:manage` |
| `GET` | `/users/:userId/permissions/detail` | autenticado (próprio) ou `users:manage` |
| `POST` | `/users/roles/assign` | `users:manage` + `roles:assign` |
| `POST` | `/users/permissions/grant` | `users:manage` + `permissions:assign` |

### Roles — `/api/seguranca/roles`

CRUD padrão sob `roles:*`, mais `GET /:id/users` (usuários que possuem a role).

### Permissões — `/api/seguranca/permissoes`

CRUD padrão sob `permissions:*`, mais `GET /category/:category`.

### Telemetria — `/api/seguranca/telemetria`

`GET /uso` (uso do sistema lido do VictoriaMetrics; exige `telemetria:read`).

### Auditoria — `/api/seguranca/auditoria`

`GET /` (`auditoria:read`): filtros `targetUserId`, `actorId`, `action`, `roleId`, `permissionId`, `de`, `ate`, paginação `page`/`pageSize` (máx. 200). Mais recente primeiro.

### Cards (exemplo) — `/api/teste/cards`

CRUD padrão sob `cards:*`, com a política de dono (`src/policies/cards.policy.js`): editar e excluir só quem criou, salvo `cards:manage`.

---

## Arquivos (kit de storage)

Não há tabela de arquivos nem rota genérica: o serviço devolve um **descritor**
(JSON puro) e **quem persiste é o módulo dono do registro**. Guarde o descritor
inteiro numa coluna `Json` do seu domínio (ou só a `key`, se preferir montar o
resto) e devolva-o ao serviço na hora de entregar o arquivo.

Toda a mecânica está em `fileService` (`src/services/_file.service.js`), que
fala com o `storage` (`src/services/_storage.service.js`, `Bun.S3Client` — sem
SDK externo, compatível com AWS S3, Cloudflare R2, MinIO, Spaces e B2).

### O que o kit faz e o que não faz

| Faz | Não faz |
|---|---|
| perfis (mime, tamanho, visibilidade, disposition) | dedupe por checksum |
| sniff por magic bytes | cota por usuário |
| chave sem input do usuário | idempotência de upload |
| presign `PUT` + confirmação do tamanho real | soft delete e coleta de lixo |
| entrega com Range (206), redirect ou proxy | saber o que existe no bucket |

Sem ledger, descritor que o módulo perder vira objeto órfão invisível. Se isso
importar no seu caso, coloque lifecycle rule no bucket.

### Anexar num módulo

```js
// 1. schema da rota
const AnexoUploadSchema = z.object({
	file: z.file().max(settings.STORAGE_MAX_SIZE).meta({ type: 'string', format: 'binary' })
})

// 2. controller — o perfil manda no mime, no tamanho e na visibilidade
const descritor = await fileService.upload({ file: body.file, profile: 'document' })
await prisma.Card.update({ where: { id: params.id }, data: { anexo: descritor } })

// 3. entrega — o descritor volta do banco, nunca do cliente
const card = await prisma.Card.findUniqueOrThrow({ where: { id: params.id } })
const entrega = await fileService.deliver(card.anexo, { mode: query.mode, range })
```

A autorização é a do próprio módulo: quem passou pelo RBAC do card pode ler o
descritor guardado nele. **Nunca aceite `key` vinda do cliente** — isso
transformaria a rota em leitura arbitrária do bucket.

`fileDescriptorSchema` (Zod) está exportado para validar a coluna e a resposta.

### Perfis

| Perfil | Tipos | Máx. | Visibilidade | Entrega |
|---|---|---|---|---|
| `avatar` | jpeg, png, webp | 2 MB | `PUBLIC` | inline (CDN) |
| `document` | pdf, csv, xlsx, docx | 25 MB | `PRIVATE` | attachment |
| `attachment` | qualquer | 25 MB | `PRIVATE` | attachment |

O chamador **não escolhe** mime nem visibilidade. O tipo é confirmado por magic
bytes: PNG renomeado para `.pdf` toma 415.

### Upload direto ao bucket (arquivo grande)

```
presignUpload  ->  { descriptor, url, method, expiresIn, headers }  (TTL 300 s)
   |  browser faz o PUT direto no bucket
confirmUpload(descriptor)  ->  confere o tamanho real; divergiu, apaga o
                               objeto e lança 400. Só persista o que sai daqui.
```

Limite conhecido: `PUT` assinado não impõe tamanho (exigiria POST-policy, que o
cliente S3 do Bun não expõe) — daí o TTL curto e a conferência no
`confirmUpload`.

### Infra de dev

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres + MinIO + buckets
```

Nos testes `STORAGE_DRIVER=memory` troca o driver por um Map em processo: write,
stat, stream, range e presign rodam de verdade, sem MinIO e sem rede.

### Regras que não se negociam

- Privado por default; `PUBLIC` significa chave não adivinhável, **não é autorização**.
- URL assinada é credencial: nunca em log nem em mensagem de erro.
- A chave do objeto (`{perfil}/{ano}/{mês}/{uuid}.{ext}`) não deriva de input do usuário.
- `Content-Disposition: attachment` + `nosniff` em tudo que não seja imagem de perfil.

---

## Formato de erros

Todos os erros passam pelo handler global (`src/helpers/_handleerror.helper.js`) e saem no mesmo formato:

```json
{
	"error": "Erro de Validação",
	"message": "Os dados enviados contêm erros de validação.",
	"statusCode": 400,
	"details": {
		"totalErrors": 1,
		"errors": [{ "field": "email", "message": "Email inválido" }]
	},
	"timestamp": "2026-08-17T13:02:45.100Z",
	"path": "/api/seguranca/usuarios/"
}
```

| Status | Quando ocorre |
|--------|---------------|
| `400` | Falha de validação (body, params ou query) |
| `401` | Sessão ausente, inválida ou expirada |
| `403` | Autenticado, mas sem a permissão exigida |
| `404` | Registro ou rota inexistente |
| `409` | Violação de restrição única (Prisma `P2002`) |
| `429` | Rate limit excedido |
| `500` | Erro interno ou resposta fora do schema declarado |

Para devolver um erro de dentro de um controller:

```js
import { status } from 'elysia'

return status(404, { error: 'Registro não encontrado' })
```

---

## Logs

Log estruturado, sem dependência externa. Em desenvolvimento sai legível e colorido; em produção, um JSON por linha — formato que Loki, Datadog e CloudWatch consomem direto.

```
16:36:48.229 INFO  request reqId=7c57e3c4 method=GET path=/api/seguranca/auth/session status=200 durationMs=23.2 userId=01a0…
16:36:48.301 WARN  erro de validação reqId=de341357 code=VALIDATION statusCode=400 method=GET path=/api/teste/cards/nao-uuid on=params fields=id
```

```json
{"level":"error","time":"2026-08-17T16:38:27.739Z","msg":"erro não tratado","reqId":"bda37652","code":"ECONNREFUSED","statusCode":500,"method":"POST","path":"/api/seguranca/auth/session","err":{"type":"PrismaClientKnownRequestError","message":"Invalid `prisma.user.findFirst()` invocation:","stack":"…"}}
```

### O que é registrado

| Evento | Nível | Campos |
|--------|-------|--------|
| Toda requisição concluída | `info` (2xx/3xx), `warn` (4xx), `error` (5xx) | `reqId`, `method`, `path`, `status`, `durationMs`, `userId` |
| Erro de validação | `warn` | `on` (body/params/query), `fields` |
| Erro operacional (4xx) | `warn` | `code`, `statusCode`, `message` |
| Erro não tratado (5xx) | `error` | `err` com `type`, `message`, `code` e `stack` |

### Garantias

- **Uma linha por evento**: quebras são achatadas e strings cortadas em 300 caracteres — mensagens de erro da Elysia e do Prisma vêm com JSON e stack embutidos.
- **`reqId` em tudo**: gerado por requisição (ou herdado do header `x-request-id`) e devolvido no header `x-request-id` da resposta. É o que liga a linha do erro à linha do acesso.
- **Redação automática**: `password`, `token`, `authorization`, `cookie`, `secret` e afins saem como `[REDACTED]` em qualquer nível do objeto.
- **Sem ruído**: rotas sob `/docs` não geram log de acesso.
- Corpo de requisição e resposta **não** são logados.

### Usando dentro de um handler

O contexto já traz um logger com o `reqId` embutido:

```js
const handler = async ({ log, params }) => {
	log.info('card removido', { cardId: params.id })
}
```

Fora do ciclo de requisição (serviços, seeds, scripts):

```js
import { logger } from 'src/helpers'

logger.warn('cache invalidado', { userId })
```

---

## Testes

Runner nativo do Bun (`bun test`) — sem dependência adicional. A suíte **não precisa de banco**: o client do Prisma é substituído no preload, então `bun test` roda em qualquer máquina e no CI sem container.

```bash
bun test                  # ~580 testes, ~8s
bun run test:unit         # funções puras, sem HTTP
bun run test:integration  # rotas via app.handle()
bun run test:coverage     # cobertura (limiar de 75% por arquivo)

PRINT_LOGS=1 bun test     # mostra o que o logger escreveu
```

### Organização

```
tests/
├── setup.js                # preload: env, mock do Prisma, reset entre testes
├── helpers/
│   ├── env.js              # variáveis de ambiente determinísticas
│   ├── prisma-mock.js      # client falso + metadados reais do schema
│   ├── app.js              # request() por app.handle(), sem abrir porta
│   ├── auth.js             # loginAs() devolve o cookie de sessão
│   ├── console.js          # captura o que o logger escreveu
│   ├── subprocess.js       # roda código com outro ambiente
│   └── factories.js        # dados de exemplo (faker + UUID v7)
├── unit/                   # logger, settings, cookie, rate limit, utils,
│                           # RBAC, handler de erros, baseController
└── integration/            # auth, RBAC, CRUD, usuários, autorização,
                            # roles/permissões, erros, contrato OpenAPI
```

### Como o Prisma é substituído

`tests/setup.js` troca `src/services/_prisma.service` por um client falso. Como o barrel `src/services` e o `authorizationService` importam desse mesmo módulo, um único ponto de substituição alcança controllers, services e middleware.

O falso mantém `getDatabase()` ligado aos **metadados reais** do schema gerado, então `mappingFields` e `parseValues` rodam de verdade. A consequência prática: os testes de integração verificam **os argumentos enviados ao Prisma** — o `where`, o `select`, o `take/skip` — e não linhas retornadas pelo banco.

```js
await get('/api/teste/cards?term=relatorio&fields=title', { cookie })

expect(prismaMock.Card.findMany.mock.calls.at(-1)[0].where).toEqual({
	OR: [{ title: { contains: 'relatorio', mode: 'insensitive' } }]
})
```

O que **não** fica coberto por essa escolha: SQL de verdade, constraints (unique, chave estrangeira), transações e a extension global do Prisma (`adjustTimezone`, coerção de tipos no `$allOperations`). Os erros `P2002`/`P2025` são simulados com `prismaError('P2002')`, que devolve a classe real do Prisma para o handler global reconhecer via `instanceof`.

### Estado compartilhado

`bun test` roda todos os arquivos no mesmo processo, então três estados globais precisam de cuidado — todos já tratados nos helpers:

| Estado | Tratamento |
|---|---|
| Cache de permissões (TTL 5 min) | `authorizationService.clearCache()` no `beforeEach` |
| Buckets do rate limit | `loginAs()` avança o relógio 61 s; testes unitários usam `keyPrefix` próprio |
| Linhas de log | `resetConsole()` no `beforeEach` |

### Contrato da API

`tests/integration/openapi.test.js` guarda um instantâneo do inventário de rotas. Criar, remover ou renomear qualquer rota quebra esse teste — é a rede de proteção contra mudança acidental de contrato. Para aceitar a mudança:

```bash
bun test --update-snapshots
```

---

## Gerador de CRUD

```bash
bun run generate:crud
```

O CLI pergunta o model do Prisma, a pasta do módulo e o nome do recurso, e gera controller, rota (com os middlewares de permissão) e o seed de permissões. Depois:

1. Registre as rotas em `src/app.js`:

	```js
	import { meuDominioRoutes } from './routes/meudominio'
	// a instância já carrega o próprio prefixo
	.use(meuDominioRoutes)
	```

2. Aplique as permissões novas: `bun run seed` (o `prisma/permissions_<model>.js` gerado é descoberto sozinho; vincule-as a roles próprias pela API ou em `ROLES` no seed — `ADMIN` já recebe todas)

---

## Banco de dados

O schema é multi-arquivo: a pasta `prisma/schema/` (apontada por `prisma.config.ts`), com `schema.prisma` guardando só `generator` + `datasource` e um arquivo por domínio funcional. Cada domínio tem seu próprio schema do PostgreSQL — **`public` não guarda nada do sistema**, só o `Card` de exemplo.

| Arquivo | Schema | Conteúdo |
|---|---|---|
| `seguranca.prisma` | `seguranca` | `User`, `Role`, `Permission`, pivôs do RBAC e `PasswordResetToken` |
| `acesso.prisma` | `seguranca` | `email_change_tokens` e `user_access_history` (login/logout) |
| `teste.prisma` | `public` | `Card` (domínio de exemplo) |

Todo model e todo enum declara seu `@@schema(...)`. Novo domínio = novo arquivo `.prisma` com schema próprio (adicione-o em `datasource.schemas`, em `schema.prisma`).

As migrations ficam em `prisma/migrations/` (caminho explícito em `prisma.config.ts`, porque o schema mora em pasta). O repositório começa com uma única migration `init`.

Todos os IDs são UUID v7 (`@default(uuid(7))`), ordenáveis por tempo de criação.

O client gerado fica em `prisma/generated/prisma/` — importe de lá, não de `@prisma/client`. Após qualquer alteração no schema, rode `bun run prisma:generate`.

---

## Docker

```bash
docker compose up -d --build
```

O `docker-compose.yml` sobe apenas a API (imagem `oven/bun`, `network_mode: host`, capabilities reduzidas). O PostgreSQL é externo — aponte o `DATABASE_URL` do `.env` para ele.

---

## Convenções de código

Biome com tabs (largura 2), aspas simples, sem ponto e vírgula, sem vírgula final, linha de 80 colunas.

```bash
bun run lint     # verifica
bun run format   # formata
```

Comentários só quando o **porquê** não for óbvio pelo código.
