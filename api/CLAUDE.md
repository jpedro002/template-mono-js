# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # dev server with hot reload (com o preload do OTel)
bun run dev:logs     # idem, mas empurra o stdout para o VictoriaLogs (JSON, sem pretty)
bun run build        # bundle to dist/
bun run start        # run from dist/

bun test             # suíte completa (não precisa de banco)
bun run test:unit         # tests/unit
bun run test:integration  # tests/integration
bun run test:watch
bun run test:coverage     # limiar de 75% por arquivo (bunfig.toml)

bun run lint         # biome check
bun run format       # biome format

# Observabilidade local (Postgres + MinIO + VictoriaLogs + VictoriaMetrics + Tempo + Grafana)
docker compose -f docker-compose.dev.yml up -d

bun run prisma:generate   # regenerate Prisma client after schema changes
bun run prisma:studio     # open Prisma Studio GUI

bun run seed         # permissões (auto: prisma/permissions_*.js), roles SUPER_ADMIN/ADMIN/USUARIO, admin (SEED_ADMIN_*)
bun run seed:demo    # idem + cards de exemplo (SEED_DEMO=true)
bun run permissoes:diff   # permissões usadas em authorize() que faltam no banco
bun run permissoes:sync   # insere as que faltam

# Code generators (interactive CLI)
bun run generate:crud         # controller + route + permissions for a new Prisma model
bun run generate:permissions  # permissions seed only
bun run generate:controller   # controller only
```

### Testes

Runner nativo do Bun. `tests/setup.js` (preload via `bunfig.toml`) fixa o ambiente e troca `src/services/_prisma.service` por um client falso — o barrel `src/services` e o `authorizationService` importam desse módulo, então uma substituição só alcança tudo. **Nenhum teste toca o banco.**

O SDK do OTel fica desligado (`OTEL_SDK_DISABLED=true` em `tests/helpers/env.js`): sem ele o medidor é no-op e cada ponto de instrumentação vira função vazia, então nenhum teste precisa de coletor. O que **é** testado é a parte com decisão: a redação de atributo de span (`tests/unit/otel-redaction.test.js`) e a coleta das métricas observáveis (`tests/unit/metrics.test.js`, que chama `iniciarMetricas()` de propósito — sem isso a fachada sairia pelo `I?.` e o teste passaria sem exercitar uma linha).

- **Unitários** (`tests/unit/`) — chamam a função direto: logger, settings, cookie, rate limit, `_util.helper`, `authorizationService`, middleware de RBAC, `errorHandler`, `baseController`.
- **Integração** (`tests/integration/`) — `app.handle(new Request(...))`, sem abrir porta; ciclo completo (derive → validação → beforeHandle → onError → onAfterResponse).

Como o Prisma é falso, a asserção de integração é sobre **os argumentos enviados ao Prisma** (`prismaMock.Card.findMany.mock.calls.at(-1)[0]`), não sobre linhas do banco. `getDatabase()` devolve os metadados reais do schema gerado, então `mappingFields`/`parseValues` rodam de verdade.

Helpers: `loginAs({ permissions, roles })` devolve o header `Cookie`; `prismaError('P2002')` produz a classe real do Prisma; `logEvents()` lê o que o logger escreveu; `runWithEnv()` roda código em outro processo quando o comportamento depende de env lida no import (`LOG_LEVEL`, `NODE_ENV=production`).

Estado global que precisa de reset entre testes — já feito no `beforeEach`: cache de permissões (TTL 5 min), buckets do rate limit (`loginAs` avança o relógio 61 s, pois sob `app.handle()` todo mundo cai na chave `login:unknown`) e as linhas de log capturadas.

`tests/integration/openapi.test.js` tem um snapshot do inventário de rotas: mexer em rota quebra o teste de propósito. Aceite com `bun test -u`.

## Architecture

**Runtime**: Bun. **Framework**: Elysia v1.4. **ORM**: Prisma 7 (PostgreSQL). **Validation**: Zod v4 (via Standard Schema, nativo na Elysia). **Linter**: Biome. **Telemetria**: OpenTelemetry (traces + métricas), log próprio.

### Request lifecycle

```
src/instrumentation.js (preload: SDK do OTel + patch do pg)
src/index.js → createApp() → .use(otel) → .use(logger) → .use(metrics)
                            → .use(cors) → .use(openapi) → .use(jwt)
                            → .onError(errorHandler)
                            → .use(segurancaRoutes) / .use(testeRoutes)
```

Cada domínio é uma instância Elysia que carrega seu próprio `prefix` (`/api/{domain}`), montada na raiz com `.use()`.

All Zod/Prisma/Elysia errors are normalized in `src/helpers/_handleerror.helper.js` (registrado via `.onError()`). Throw an `Error` with `error.statusCode = 404` from a controller to get a 404 response, ou retorne `status(404, {...})` diretamente.

### Path aliases

`src/*` resolves to `./src/*` (configured in `jsconfig.json`, resolved natively by Bun).

### Handlers

Handlers recebem o contexto da Elysia, não `(request, reply)`:

```js
const handler = async ({ body, query, params, headers, set, user, jwt }) => {
	return { ok: true }              // 200 + JSON
	// return status(201, data)      // status explícito
	// set.status = 204; return null // sem corpo
}
```

`user` é resolvido pelo `jwtPlugin` a partir do **cookie httpOnly** de sessão (`COOKIE_NAME`, default `access_token`) — é `null` quando ausente/inválido. Não há autenticação por header `Authorization`.

### Base abstractions

**`baseController(model, params)`** (`src/controllers/base.controller.js`)
Factory that returns `{ all, fetch, one, post, put, del }` handlers for a Prisma model. Supports:
- `select`, `include`, `omit` — static Prisma query options
- `allowedFields` — whitelist for dynamic `?select=field1,field2` query params
- `sensitiveFields` — always excluded from dynamic select

**`baseRouter(controller, options)`** (`src/routes/base.route.js`)
Retorna uma instância Elysia com as 6 rotas REST do controller — monte com `.use()`:
| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/` | `post` |
| `PUT` | `/:id` | `put` |
| `GET` | `/all` | `all` (no pagination) |
| `GET` | `/` | `fetch` (paginated) |
| `GET` | `/:id` | `one` |
| `DELETE` | `/:id` | `del` |

Options: `tag`, `schemas` (`createSchema`, `updateSchema`, `entitySchema` — all Zod), per-verb `middleware` arrays (aplicados como `beforeHandle`).

**Atenção ao roteador**: a Elysia (memoirist) não aceita dois nomes de parâmetro diferentes na mesma posição. Como o `baseRouter` registra `/:id`, rotas customizadas irmãs devem usar `/:id` também (ex: `/:id/roles/:roleId`, não `/:userId/roles/:roleId`).

### Autenticação (cookie httpOnly)

O JWT vive **só** em cookie `httpOnly` — nunca é devolvido no corpo da resposta nem lido por JavaScript.

| Rota | Efeito |
|------|--------|
| `POST /api/seguranca/auth/session` | login; grava o cookie, devolve só `{ user }` |
| `GET /api/seguranca/auth/session` | dados da sessão atual |
| `DELETE /api/seguranca/auth/session` | logout; expira o cookie |

Front-end precisa mandar `credentials: 'include'` no fetch. `CORS_ORIGIN` deve listar a origem exata (allowlist já é exata, `credentials: true` no CORS).

Atributos vêm de `COOKIE_NAME`, `COOKIE_SAMESITE`, `COOKIE_SECURE`, `COOKIE_DOMAIN`; `Max-Age` deriva de `JWT_EXPIRES_IN`.

#### Rate limit do login: só a falha gasta cota

`POST /auth/session` usa `rateLimitCheck` no `beforeHandle` (só lê o balde) e
`rateLimitHit` no `afterHandle`, e **apenas quando `accessEvent.userId` está
vazio** — ou seja, quando a senha não bateu. Contando toda requisição, quatro
ciclos de login/logout esgotavam o limite de 5/min e o quinto login **com a
senha certa** levava 429 por até um minuto. O que o limite protege é a
adivinhação de senha; acertar a senha não pode consumir tentativa.

São dois baldes, com a divisão importando:

| Balde | Teto | Por quê |
|---|---|---|
| `login:<email>` | 5/min | adivinhação é por conta, e o balde não é dividido com quem entra pelo mesmo proxy |
| `login-ip:<ip>` | 20/min | varredura de muitas contas da mesma origem |

O teto por IP é folgado de propósito: atrás de proxy reverso o `server.requestIP`
é o do proxy e **toda a rede cai na mesma chave** — como limite estreito, ele
trancaria o login de todos depois de cinco erros de qualquer um.

#### Histórico de acesso

Login e logout gravam em `seguranca.user_access_history` via
`accessHistoryService` (`src/services/_access-history.service.js`), chamado no
**`afterResponse`** das rotas de sessão — o INSERT roda com a resposta já
entregue e não entra no tempo do login. Consequência: nada ali pode lançar,
falha vira linha de log.

O login assina um `jti` no JWT; é ele que o logout usa para fechar exatamente a
linha daquela sessão (`logout_at` + `session_duration` em segundos), sem
confundir duas sessões do mesmo usuário. Quem nunca chama o logout (cookie
expirado, browser fechado) fica com `logout_at` nulo — o JWT não avisa ninguém
quando expira.

O handler não chama o serviço: ele preenche `accessEvent` (derive da rota) e o
`afterResponse` consome. Login recusado nunca preenche, então não grava.

**CSRF**: a proteção atual é `SameSite=lax`. Se o front-end estiver em outro site (registrable domain diferente) e for preciso `COOKIE_SAMESITE=none`, essa proteção deixa de existir e passa a ser necessário um token anti-CSRF — o boot emite aviso nesse caso.

### RBAC / Authorization

Permission identifiers follow `resource:action` format (e.g. `users:read`, `cards:*`, `*`). `*:acao` **não** alcança `SEGURANCA_RECURSOS` (`users`, `roles`, `permissions`, `auditoria`) — só `*` ou o recurso nomeado. Espelho no web: `web/src/lib/permissions.js`.

Middleware in `src/middleware/_authorization.middleware.js` — funções `beforeHandle` que recebem o contexto:
- `authenticate` — exige `user` resolvido (401 se ausente ou sessão revogada)
- `authorize(['users:read', 'users:update'])` — checks user has ≥1 permission (pass `{ requireAll: true }` to require all). O 403 não devolve `required`; vai para `log.warn`.

Não existe `requireAdmin`/`requireSuperAdmin`: acesso é permissão, nunca nome de role (`GET /version` usa `sistema:read`).

Uso: `{ beforeHandle: [authenticate, authorize('users:read')] }`.

`authorizationService` (`src/services/_authorization.service.js`) guarda as permissões no `cacheService` (namespace `authz:perms`, 5 min) — com `CACHE_DRIVER=redis`, consistente entre instâncias. As mutações do serviço já invalidam; código próprio chama `await authorizationService.clearCache(userId)` (sem `userId`, invalida todos).

#### Sessão revogável

JWT carrega `tv`; `jwtPlugin` confere com `users.token_version` via `sessaoService.valida` (cache `sessao:user`, `SESSAO_CACHE_TTL` 30 s) e também rejeita inativo, excluído e `requiresRelogin`. Para derrubar sessões: `data: { ...novaVersaoDeToken() }` no update **e** `await sessaoService.invalidar(userId)` depois do commit. Já feito em desativar/excluir, reset de senha (admin e e-mail), troca da própria senha (reemite o cookie via `emitirSessao({ ..., jti: user.jti })`), `POST /usuarios/:id/revogar-sessoes` e login com `requiresRelogin`.

Nos testes, `loginAs` aquece o cache de sessão logo após o login (o mock de `User.findFirst` ainda devolve o usuário); para simular revogação, troque o mock e chame `sessaoService.invalidar(id)`.

#### Trava do acesso total e auto-ação

`acessoTotalService` (`semRoleDoUsuario`, `semPermissaoDoUsuario`, `semUsuario`, `semRole`) lança 409 quando a operação deixaria zero usuários ativos com `*` (só se antes havia algum). Desativar/excluir a si mesmo: 409.

#### Auditoria

`auditoriaService.registrar(tx, { actorId, action, targetUserId?, roleId?, permissionId?, before?, after? })` — sempre com o `tx` da mudança. Ações válidas em `ACOES_AUDITORIA`. Tabela `seguranca.authz_audit`, sem FK (sobrevive à exclusão do que cita). Leitura: `GET /api/seguranca/auditoria` (`auditoria:read`).

#### Políticas (PBAC)

`src/policies/index.js`: `definirPolitica(recurso, { [acao]: (user, registro, ctx) => boolean, escopo: (user, acao, ctx) => where | null })`, `can(user, acao, recurso, registro)` (RBAC `recurso:acao` **e** regra), `permitePolitica` (só a regra), `escopoDe(user, acao, recurso)`. `*` ou `recurso:manage` ignoram a política.

Para proteger um recurso:
1. Crie `src/policies/<recurso>.policy.js` com `definirPolitica('<recurso>', {...})` e importe-o no controller (o import registra).
2. `baseController('Model', { policy: '<recurso>', campoDono: 'createdById' })` — listagens recebem o `escopo`; `one`/`put`/`del` carregam o registro (`findFirst`) e conferem: fora do escopo/regra de leitura → 404, sem a regra da ação → 403. Sem regra para a ação nem `escopo`/`read`, não há consulta extra.
3. Adicione `<recurso>:manage` ao `prisma/permissions_<recurso>.js` — o teste de catálogo exige.

Exemplo: `src/policies/cards.policy.js` (editar/excluir só o dono).

#### Catálogo

`tests/unit/catalogo-permissoes.test.js` compara `authorize(...)` em `src/routes`/`src/app.js` e `definirPolitica` em `src/policies` com `prisma/permissions_*.js` — nos dois sentidos.

### Plugins

`src/plugins/` — todos são instâncias Elysia nomeadas (dedupe automático), exceto `rateLimit`:
- `corsPlugin` — allowlist exata via `CORS_ORIGIN`
- `openapiPlugin` — `@elysiajs/openapi` + Scalar em `/docs`, spec JSON em `/docs/openapi.json`. Zod → JSON Schema via `mapJsonSchema`
- `jwtPlugin` — `@elysiajs/jwt` (assinatura via `jwt.sign` no contexto) + resolve de `user` a partir do cookie. Exporta `setAuthCookie(cookie, token)` / `clearAuthCookie(cookie)`
- `rateLimit(opts)` — factory que retorna um `beforeHandle`; janela fixa por IP, em memória. `rateLimitCheck(opts)` só **lê** o balde e `rateLimitHit(opts)` **conta** — o par existe para o login, onde quem gasta cota é a tentativa falha (ver [Autenticação](#autenticação-cookie-httponly))
- `loggerPlugin` — log de acesso estruturado; injeta `reqId`, `startedAt` e `log` (logger com `reqId` fixo) no contexto
- `metricsPlugin` — métricas de HTTP (duração, em voo, corpo, erros) e atributos de correlação no span
- `otelPlugin` — vem do `src/instrumentation.js`, não de `src/plugins/`: quem cria o SDK precisa ser carregado por preload (ver [Telemetria](#telemetria-opentelemetry))

### Logs

`logger` (`src/helpers/_logger.helper.js`) — sem dependência externa. `logger.info(msg, fields)`, `.warn`, `.error`, `.debug`, `.child(fields)`.

- `LOG_PRETTY=true` (default fora de produção): linha legível e colorida. `false`: um JSON por linha.
- `LOG_LEVEL`: `debug` | `info` | `warn` | `error`.
- Todo evento cabe em **uma linha**: strings têm quebras achatadas e são cortadas em 300 caracteres (mensagens de erro da Elysia/Prisma são enormes). Stack fica no campo `err.stack`.
- Chaves sensíveis saem como `[REDACTED]`. O casamento é por **radical, em substring sobre a chave normalizada** (minúscula, sem `_` e `-`), então um radical cobre todos os compostos: `password` pega `password_confirmation` e `currentPassword`; `senha` pega `senha_atual` e `nova_senha`; `cookie` pega `set-cookie`. Enumerar chave por chave era o furo — com o corpo do cliente no log, qualquer nome composto imprevisto vazava.
- Abaixo de 3 níveis de profundidade o valor vira `[TRUNCATED]`. O corte existe para não percorrer objetos gigantes (um Prisma client inteiro), mas **devolver o valor cru ali vazava tudo que estivesse abaixo do limite sem passar pela redação**.
- `cpf` **não** é redigido de propósito: é PII, não credencial, e apagá-lo destruiria a informação que a auditoria existe para guardar. Trocar é uma linha em `SENSITIVE_PARTS`.
- Cada requisição ganha um `reqId` (aceita `x-request-id` de entrada) devolvido no header `x-request-id` — correlaciona a linha do erro com a linha do acesso.
- Rotas sob `/docs` não entram no log de acesso.

Dentro de um handler use o logger já correlacionado: `({ log }) => log.info('algo', { cardId })`.

#### Auditoria de escrita

O log de acesso inclui o campo `body` quando o método é `POST/PUT/PATCH/DELETE`
— é o "quem alterou o quê". É linha de log, **não** tabela: log nunca ocupa espaço no
banco da aplicação.

- Arquivo enviado vira `[FILE]` antes de qualquer coisa, senão o binário entra na linha.
- Corpo acima de **4 KB** não entra: sai `[BODY omitido: N bytes]`. Corpo maior inviabiliza um evento por linha.
- A redação não acontece no plugin — quem faz é o `normalize` do logger, que já percorre o objeto todo.

#### Coleta

O logger escreve no stdout; quem guarda é o **VictoriaLogs** (retenção de 90
dias) e quem mostra é o **Grafana** — em dev <http://localhost:3003>, sem login.
A vmui (<http://localhost:9428/select/vmui>) continua existindo para diagnosticar
o próprio coletor, mas a leitura do dia a dia é o Grafana.

O VictoriaLogs não tem healthcheck no compose de propósito: a imagem é
construída sobre `scratch` — sem shell, sem wget, sem curl —, então qualquer
`test:` falha com "executable file not found" e deixa o container eternamente
unhealthy, travando o `depends_on` de quem espera por ele.

Em dev a API roda no host, não em container — então o stdout é empurrado por
`bun run dev:logs`, que canaliza o servidor por `scripts/ship-logs.js`
(`LOG_PRETTY=false`, envia para `/insert/jsonline` em lotes, e a linha continua
aparecendo no terminal). Coletor fora do ar não derruba o dev.

Em produção (`docker-compose.yml`) a API roda em container e quem entrega é o log
driver `syslog` do Docker — sem agente. Três detalhes que não são cosméticos:

- O endereço é `tcp://127.0.0.1:8094`, **não** o nome do serviço: quem abre a
  conexão é o daemon do Docker, que não está na rede do compose.
- `mode: non-blocking` — coletor lento não pode segurar a escrita do processo.
- O syslog **não** desempacota JSON: a linha inteira chega em `_msg`. Para
  filtrar por campo, desempacote na consulta: `| unpack_json | filter ...`.

**O VictoriaLogs OSS não tem controle de acesso por padrão** — e o que ele
guarda é a trilha de auditoria (o `body` das mutações, com login e CPF). Em
produção são três camadas, nenhuma opcional:

| Camada | O quê | Cobre |
|---|---|---|
| bind `127.0.0.1` | publicação Docker cria DNAT que passa por cima do ufw — trocar por `9428:9428` expõe na internet | :8094 e :9428 |
| fora da `dokploy-network` | rede compartilhada por todo app do host; nela, qualquer container alcança `victorialogs:9428` direto. O serviço não precisa dela: quem entrega é o daemon, pelo host. Na rede default deste compose só entra o Grafana, que é quem consulta | :9428 |
| `-httpAuth.username/password` (`VL_AUTH_*`) | Basic auth | só HTTP |

A ingestão syslog **não tem autenticação nenhuma** (`-syslog.tls*` só
criptografa): quem alcança a :8094 injeta linha forjada. Só o bind protege.
Multi-tenancy (`AccountID`/`ProjectID`) é header confiado, não autenticação.

Acesso em produção (Grafana e vmui): túnel SSH
(`ssh -L 3003:127.0.0.1:3003 -L 9428:127.0.0.1:9428 host`), **nunca** Traefik —
publicar a tela é publicar a trilha de auditoria. Por isso o serviço do Grafana
não tem label de roteamento e também fica fora da `dokploy-network`.

Em dev não há nada disso: sem basic auth (quebraria o `ship-logs.js`) e sem
listener syslog. Aceitável porque tudo está preso em `127.0.0.1`.

#### Grafana

Interface de leitura dos três sinais. Não guarda nada: log vai para o
VictoriaLogs pelo plugin **`victoriametrics-logs-datasource`** (LogsQL nativo —
não é o datasource do Loki e não traduz LogQL, instalado por
`GF_INSTALL_PLUGINS`), métrica para o VictoriaMetrics pelo datasource
`prometheus` nativo e trace para o Tempo.

Tudo é provisionado de `grafana/`, então descartar o volume não perde
configuração:

| Arquivo | O quê |
|---|---|
| `provisioning/datasources/victorialogs.yml` | logs (`uid: victorialogs`) |
| `provisioning/datasources/victoriametrics.yml` | métricas (`uid: victoriametrics`), tipo `prometheus` |
| `provisioning/datasources/tempo.yml` | traces (`uid: tempo`), com grafo de serviço |
| `provisioning/dashboards/default.yml` | provider que lê a pasta de dashboards |
| `dashboards/api.json` | "API — logs" (`uid: api-logs`) |
| `dashboards/api-metrics.json` | "API — métricas" (`uid: api-metrics`) |

Todas as datasources são `editable: false`: mexer pela UI e perder no próximo
boot é pior que não poder mexer.

O dashboard de métricas tem 24 painéis em cinco seções — HTTP, banco (pool,
Prisma vs SQL), autenticação/RBAC, storage e processo. Leia as descrições dos
painéis antes de tirar conclusão: várias existem para avisar o que a série **não**
mede (404 fora da latência, sessão sem logout fora da duração, download contado
na banda comprometida e não na entregue).

A datasource de log manda basic auth por causa da produção (`VL_AUTH_*`). Em dev o
coletor sobe sem `-httpAuth` e ignora o header — o compose de dev passa
`VL_AUTH_USER=dev`/`VL_AUTH_PASSWORD=dev` só para a interpolação não ficar vazia.

Porta 3003 no host porque a API de dev ocupa a 3000 e o front a 3001; dentro do
container o Grafana segue na 3000. Em produção `GRAFANA_ADMIN_PASSWORD` é
obrigatória (`:?` no compose) — nada de `admin/admin` numa tela de auditoria.

Painéis: requisições por status, latência (p50/p95/p99), contadores 4xx/5xx,
rotas mais lentas, erros e avisos, e auditoria de escrita (o `body` das
mutações). Tipo de query do plugin: `instant` para painel de logs, `stats` para
stat/table, `statsRange` para série temporal.

Consulta (LogsQL): com `_msg_field=msg`, o `msg` do logger vira `_msg` — filtre
por `_msg:request`, não `msg:request`. O `body` chega achatado (`body.login`,
`body.password`). Toda query precisa de janela de tempo:

```bash
curl -s http://localhost:9428/select/logsql/query \
  --data-urlencode 'query=_msg:request AND method:POST' \
  --data-urlencode 'start=2026-08-18T00:00:00Z' \
  --data-urlencode 'end=2026-08-19T00:00:00Z'
```

**Toda query do dashboard começa com `_msg:request | unpack_json`** — é o que faz
o mesmo painel servir aos dois ambientes. Em dev o `ship-logs.js` entrega campos
já estruturados; via syslog a linha JSON inteira chega em `_msg`. `_msg:request`
casa nos dois (filtro por palavra pega o `request` dentro do JSON cru) e
`unpack_json` não faz nada quando `_msg` não é JSON. Efeito colateral em
produção: o painel de logs mostra a linha JSON crua como mensagem.

### Telemetria (OpenTelemetry)

Três sinais, três backends. O **log não tem agente no meio** (stdout → daemon do
Docker → VictoriaLogs); métrica e trace passam por um **OpenTelemetry Collector**
em produção, que existe por um motivo só — amostragem por cauda (ver abaixo):

| Sinal | Origem | Caminho | Backend | Retenção |
|---|---|---|---|---|
| Log | `logger` → stdout | syslog do daemon | VictoriaLogs | 90 dias |
| Métrica | SDK do OTel, push OTLP | collector (prod) / direto (dev) | VictoriaMetrics | 90 dias |
| Trace | SDK do OTel, push OTLP | collector (prod) / direto (dev) | Tempo | 7 dias |

**Em dev não há collector**: a API empurra direto para `127.0.0.1`, porque o que
o collector resolve (não perder o 5xx raro) só existe sob amostragem, e em dev a
amostragem é 100%. Os defaults do `settings` apontam para os backends.

Tudo é lido no mesmo Grafana (<http://localhost:3003> em dev).

Trace tem retenção curta de propósito: é dado de diagnóstico do que acabou de
acontecer e custa ordens de grandeza mais por evento. Quem precisa de janela
longa usa log ou métrica.

#### A ordem de carregamento é contrato, não estilo

```bash
bun --preload ./src/instrumentation.js src/index.js
```

`src/instrumentation.js` é o **único** lugar que cria o SDK. Ele precisa ser
avaliado antes do resto por um motivo mecânico: a instrumentação do `pg`
funciona trocando os métodos do módulo no momento em que ele carrega, e o
`@prisma/adapter-pg` importa `pg` no topo do `_prisma.service`. Chegando tarde,
não há mais o que trocar — e as consultas somem do trace **sem erro nenhum**.

O `createApp()` importa o `otelPlugin` desse mesmo arquivo. Preload e import
resolvem para o mesmo caminho, logo para o mesmo módulo: um SDK por processo.
Criar o SDK em outro arquivo daria dois pipelines e atributos duplicados.

Dentro do arquivo há uma segunda ordem que também é contrato:
`iniciarMetricas()` roda **depois** do `sdk.start()`. Diferente do tracer, o
medidor do OTel não é um proxy — `metrics.getMeter()` chamado antes de existir um
`MeterProvider` global devolve um medidor no-op, e o instrumento criado a partir
dele fica no-op para sempre. Foi exatamente o bug em que a exportação funcionava
mas só as métricas do próprio SDK chegavam ao VictoriaMetrics.

Consequências práticas:

- `bun run build` usa `--external pg`: bundle que embute o `pg` não pode ser
  instrumentado, porque o patch atua no módulo resolvido em tempo de execução.
- O `Dockerfile` roda `bun --preload ./src/instrumentation.js src/index.js`, não
  `bun run src/index.js`.
- Nos testes o SDK está desligado (`OTEL_SDK_DISABLED=true` em
  `tests/helpers/env.js`) e `src/instrumentation.js` sai fora da cobertura: é
  fiação, e a parte com decisão de verdade (redação de span, coleta das
  observáveis) mora em helpers testados.

#### Redação de atributo de span — não é opcional

O `@elysiajs/opentelemetry` anexa ao span raiz, sem pedir, **um atributo por
header** (`http.request.header.*`), os cookies (`http.request.cookie`) e o
**corpo** da requisição e da resposta. Sem tratamento, o trace de um
`POST /auth/session` sai com a senha em texto puro e o de qualquer requisição
autenticada sai com o JWT de sessão — para um armazenamento com outra retenção e
outro controle de acesso.

`src/helpers/_otel-redaction.helper.js` é um `SpanProcessor` registrado **antes**
do que exporta (o `onEnd` roda na ordem de registro; invertido, não protege
nada). Duas políticas, e a diferença importa:

- Atributo cujo **nome** denuncia segredo vira `[REDACTED]`. O casamento é o
  mesmo `isSensitiveKey` do logger — de propósito: duas listas de radicais
  divergem, e a que ficar para trás vaza.
- Atributo que é **corpo serializado** é **removido**. Ali o segredo está dentro
  de uma string JSON, onde casamento por nome de chave não alcança. Não há perda:
  o corpo das mutações já é auditado no log, com redação recursiva e corte de
  4 KB.

Efeito colateral aceito: `access-control-allow-credentials` sai `[REDACTED]`
porque o radical `credential` casa. Sobra-redigir um header público é melhor que
manter lista de exceção, que é onde o próximo vazamento se esconde.

#### Métricas

`src/helpers/_metrics.helper.js` é o registro central — o código de domínio nunca
toca em instrumento nem em nome de métrica, só chama a fachada
(`metrics.auth.login('success')`).

Duas regras que não se negociam:

1. **Atributo é sempre de cardinalidade fechada.** Cada combinação de atributos é
   uma série no backend. `http.route` usa o padrão registrado no roteador
   (`/api/seguranca/users/:id`), nunca a URL concreta. Não existe atributo de
   `userId`, `cpf` ou nome de arquivo em lugar nenhum — id em métrica é uma série
   por registro, e é assim que se derruba um banco de séries.
2. **Métrica não é log.** Nada aqui identifica *quem* fez; para isso existe a
   trilha de auditoria no log.

Unidade de tempo é **segundo**, como manda a convenção do OTel (o log usa ms; os
dois convivem, não se misturam). Os buckets dos histogramas são explícitos: o
default do SDK é pensado para milissegundos e jogaria quase toda requisição no
primeiro bucket.

O que é medido, e onde a instrumentação mora:

| Métrica (nome no OTel) | De onde vem |
|---|---|
| `http.server.request.duration` · `.active_requests` · `.request.body.size` | `plugins/_metrics.js` |
| `app.http.errors` | idem — inclui o que **não casou rota** |
| `app.db.operation.duration` | extensão `$allOperations` do `_prisma.service` |
| `app.db.pool.connections` · `.pending` · `.max` | `pg.Pool` do `_prisma.service` |
| `app.auth.login` · `.logout` · `.session.duration` | `_session.controller`, `_access-history.service` |
| `app.authz.decision` · `.cache` | `_authorization.middleware`, `_authorization.service` |
| `app.ratelimit.blocked` | `plugins/_rate-limit.js` |
| `app.storage.operation` · `.bytes` | `_file.service` |
| `app.cache.operation` | `_cache.service` (atributos `operation`, `namespace`, `result`) |
| `app.log.events` | `emit()` do logger, depois do corte por nível |
| `process.uptime` · `.memory.usage` · `.cpu.time` · `app.runtime.eventloop.lag` | observáveis, coletadas no intervalo de export |
| `db.client.*` | instrumentação do `pg` (não é nossa) |
| `traces_spanmetrics_*` · `traces_service_graph_*` | geradas pelo **Tempo** a partir dos spans |

Dois detalhes que evitam interpretação errada dos painéis:

- **`app.db.operation.duration` e `db.client.operation.duration` medem coisas
  diferentes** e por isso têm nomes diferentes. A primeira é a operação do Prisma
  ponta a ponta (espera por conexão, `parseValues`, `adjustTimezone`) — o número
  que o usuário sente. A segunda é o SQL dentro do driver. A diferença entre as
  duas é o custo da camada da aplicação. Mesmo raciocínio para `app.db.pool.*`
  vs `db.client.connection.*`: o pool do adapter não é o que a instrumentação do
  `pg` enxerga.
- **Requisição que não casou rota não entra na latência.** Ela morre antes do
  `derive`, então não tem início cronometrado; aparece em `app.http.errors` com
  `http.route="unrouted"`. Do mesmo modo, o `onError` roda **antes** do
  `errorHandler` (que é quem define `set.status`), então quem conta o erro é o
  `onAfterResponse` — no `onError` o status de um 404 ainda é 200.

**Detecção automática de recurso fica desligada.** Ligada, ela anexa
`process.pid`, `process.command_args` e afins, e todo atributo de recurso vira
rótulo em *toda* métrica: cada reinício criaria um conjunto novo de séries para
as mesmas métricas. O recurso é escrito à mão com `service.name`,
`service.version`, `deployment.environment.name` e `host.name` (estável entre
reinícios, ao contrário do pid).

#### Traces

O plugin da Elysia nomeia o span pela função — **use função nomeada** nos hooks,
não arrow anônima, senão o waterfall vem cheio de span sem nome. Para marcar um
trecho: `record('nome', () => ...)` de `@elysiajs/opentelemetry`.

Cada span raiz carrega `app.request.id`, que é o mesmo `reqId` do log de acesso
e do header `x-request-id` — é o caminho de ida e volta entre uma linha de log e
o waterfall correspondente.

#### Amostragem: a decisão é por cauda, não por cabeça

O sampler do SDK é `ParentBased` (respeita a decisão de quem chamou, para não
cortar um trace no meio) com razão **1 nos dois ambientes** — a API manda 100%
dos traces. Isso **não** é o que vai para o disco do Tempo.

Quem descarta é o processor `tail_sampling` do collector
(`otel/collector.yml`), que decide **quando o trace termina**, já sabendo o
resultado. Quatro políticas em OR:

| Política | Guarda |
|---|---|
| `status_code: ERROR` | todo trace com span em erro |
| `http.response.status_code` 500–599 | todo 5xx, inclusive o que respondeu sem levantar exceção no span raiz |
| latência > 2 s | toda requisição lenta |
| probabilística 5% | linha de base do tráfego saudável |

A razão de cabeça (`OTEL_TRACES_SAMPLER_ARG=0.1`) que existia antes era o
defeito: sorteava no **primeiro span**, antes de existir resultado, então 90% dos
erros e das requisições lentas — exatamente o que se quer olhar — iam para o
lixo. Baixar esse número de novo em produção reintroduz isso; o teto do disco do
Tempo é responsabilidade da política de cauda, não do SDK.

Duas consequências que não são cosméticas:

- **O `metrics_generator` do Tempo passa a ver o conjunto amostrado**, que é
  enviesado para erro e lentidão. As arestas do grafo de serviço continuam
  corretas, as taxas absolutas não. Taxa, erro e latência confiáveis vêm de
  `http_server_request_duration_seconds`, medida pela API em 100% das
  requisições, sem amostragem nenhuma.
- **O tail sampling segura trace inteiro em memória** até decidir
  (`decision_wait: 10s`, `num_traces: 50000`). Por isso o `memory_limiter` é o
  primeiro processor do pipeline: estourou, o lote é recusado e o SDK descarta —
  telemetria perdida, requisição intacta.

Rotas sob `/docs` não entram em trace nem em métrica, como já não entravam no log.

#### Envs

Os nomes são os **padrão da especificação** do OTel, não invenção deste projeto —
qualquer ferramenta OTel entende os mesmos.

| Env | Default | Para quê |
|---|---|---|
| `OTEL_SDK_DISABLED` | `false` (e `true` em teste) | desliga tudo |
| `OTEL_SERVICE_NAME` | `api` | nome no Tempo e rótulo `service_name` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `http://localhost:4318/v1/traces` | Tempo em dev; o collector em produção |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | `http://localhost:8428/opentelemetry/v1/metrics` | VictoriaMetrics em dev (caminho **não** é o OTLP padrão); o collector em produção, que é quem conhece esse caminho |
| `OTEL_METRIC_EXPORT_INTERVAL` | `15000` | intervalo de push (ms) |
| `OTEL_TRACES_SAMPLER_ARG` | `1` | razão de amostragem **de cabeça**; quem corta em produção é o `tail_sampling` do collector |
| `OTEL_DIAG` | `false` | log do próprio OTel |
| `METRICS_QUERY_URL` | origem do endpoint de métricas | leitura de volta, para `GET /api/seguranca/telemetria/uso` |
| `METRICS_QUERY_TIMEOUT` | `5000` | teto de tempo da consulta (ms) |

#### Métrica de volta: a tela de uso do sistema

`GET /api/seguranca/telemetria/uso` consulta o **mesmo** VictoriaMetrics pela API
do Prometheus (`/api/v1/query` e `/api/v1/query_range`) e devolve requisições,
erros, latência p95, logins, rotas mais usadas e mais lentas. É o que substituiu
`/admin/analytics`, que somava eventos num array do `localStorage`.

A consulta é **fixa, escrita no controller**: o cliente escolhe a janela
(`1h|24h|7d|30d`) e nada mais. Aceitar PromQL do browser seria leitura arbitrária
do banco de séries.

Métrica pode ser publicada numa tela e log não — é a regra 2 acima (*métrica não
é log*): nada aqui identifica quem fez. É por isso que o Grafana, que lê a
trilha de auditoria, continua só por túnel SSH.

Sem `METRICS_QUERY_URL`, com o SDK desligado ou com o backend fora do ar a rota
responde **503 dizendo o que falta** — nunca número inventado, que era
exatamente o defeito da tela anterior.

Falha de exportação é **silenciosa** por padrão e nunca chega ao cliente: o lote
é descartado e a requisição segue — mesma escolha do `ship-logs.js`. Coletor fora
do ar não derruba nem polui o dev. `OTEL_DIAG=true` quando o suspeito é o
pipeline.

#### Infra

Em dev (`docker-compose.dev.yml`) a API roda no host e os backends escutam em
`127.0.0.1`: VictoriaMetrics em `:8428`, Tempo em `:4318` (OTLP) e `:3200`
(consulta) — os defaults acima já apontam para lá.

Em produção (`docker-compose.yml`) a API roda em container e empurra por nome de
serviço numa rede `observability` criada por este compose. Ela existe porque os
backends **não** entram na `dokploy-network`, que é compartilhada por todo app do
host: no modelo pull o backend precisaria alcançar a API; no push quem abre a
conexão é a API, por uma rede que só tem quem precisa.

O Tempo está **pinado em 2.x**: o `latest` já é o Tempo 3, que reescreveu o
caminho de escrita em cima de uma fila Kafka e removeu os componentes
monolíticos (`ingester`, `compactor`) — sobe com "field ingester not found".

`tempo/tempo.yml` liga o `metrics_generator`, que deriva métricas dos próprios
spans (RED por operação e grafo de serviço) e as escreve no VictoriaMetrics por
remote write. É o que dá latência por consulta do `pg` sem escrever um contador
para cada uma. Pesou? Remova os `processors` em `overrides` — nada na aplicação
depende disso.

`-opentelemetry.usePrometheusNaming` no VictoriaMetrics converte nome e rótulo
para a convenção do Prometheus (`http.server.request.duration` em segundos vira
`http_server_request_duration_seconds`, `http.route` vira `http_route`). **O
dashboard versionado depende dessa flag**: sem ela os nomes chegam com ponto e
nenhuma query casa.

Nenhum dos dois serviços tem healthcheck no compose — a imagem do
VictoriaMetrics é `scratch` (sem shell) e o Tempo depende de ordem de subida que
o `depends_on` simples já resolve.

### E-mail transacional (driver trocável)

`mailService` (`src/services/_mail.service.js`) — mesma forma do cache e do kit
de storage: uma interface, quatro drivers, quem escolhe é o env.

| `MAIL_DRIVER` | Para onde vai | Quando |
|---|---|---|
| `ses` (default) | API HTTP do SESv2 | produção |
| `resend` | API HTTP do Resend (`RESEND_API_KEY`) | produção, alternativa ao SES |
| `log` | stdout | dev — não exige credencial da AWS |
| `memory` | array no processo | teste (fixado no `settings`) |

**Sem SDK.** O SESv2 é um POST JSON e a assinatura SigV4 sai do Web Crypto que o
Bun já tem — `@aws-sdk/client-sesv2` traria dezenas de pacotes para assinar uma
requisição. A cadeia de HMAC é conferida em `tests/unit/mail.test.js` contra o
vetor publicado pela AWS: errar ali não dá erro visível, o SES recusa 100% das
chamadas e o sintoma no produto é "não recebi o e-mail".

Regras que não se negociam:

- **`enviar` nunca lança.** O envio é efeito colateral do cadastro ou da
  recuperação de senha, não a operação em si: SES fora do ar não pode
  transformar um registro bem-sucedido em 500. Falha vira linha de log e
  `app.mail.send{result="error"}`.
- **Todo envio tem teto de tempo** (`MAIL_TIMEOUT`, 8 s), pelo mesmo motivo do
  cache: provedor lento não pode pendurar a requisição.
- **O destinatário não entra na métrica nem na linha de erro** — endereço é PII
  e, em métrica, uma série por usuário.

Os corpos ficam em `_mail-templates.js`, um por assunto, devolvendo
`{ subject, html, text, template }`. O `template` é o atributo da métrica, por
isso é constante. Tudo que vem do usuário é escapado — o HTML vai para um cliente
de e-mail, não para o DOM, mas o custo de escapar é zero.

**O link aponta para o front-end (`APP_URL`), não para a API.** Quem recebe o
e-mail é uma pessoa com um browser, não um cliente HTTP.

Tokens de link (recuperação de senha, troca de e-mail): o banco guarda **só o
sha256**. Quem lê o banco não redefine a senha de ninguém — precisaria do valor
original, que só existiu na mensagem. `password_reset_tokens` marca `usedAt` em
vez de apagar: o link fica numa caixa de e-mail para sempre, e sem essa marca
redefiniria a senha quantas vezes quisessem.

Envs: `MAIL_DRIVER`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_TIMEOUT`, `APP_URL`,
`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`,
`RESEND_API_KEY`.
As credenciais são separadas das de S3 de propósito: o bucket pode estar no
MinIO/R2 e o e-mail na AWS, e a chave do SES só precisa de `ses:SendEmail`.
Conta nova do SES começa em **sandbox** — só envia para endereço verificado.

### Colunas de data pura

`adjustTimezone` (`_util.helper.js`) recua 3 h de toda data que sai do banco — a conversão para Brasília que a API sempre fez. Coluna `date` **não** entra nisso: não há hora para converter, e mover muda o dia.

O runtime do Prisma 7 não diz qual coluna é `date` (`_runtimeDataModel` traz só `{name, kind, type}`), então `src/helpers/_colunas-data.js` guarda um mapa **por model** (`COLUNAS_DATA`, mais `COLUNAS_DATA_EM_TIMESTAMP` para `timestamp` que guarda data pura). O schema do template não tem nenhuma coluna `@db.Date`; ao criar a primeira, registre-a ali — senão a API devolve o dia anterior.

### Cache (driver trocável)

`cacheService` (`src/services/_cache.service.js`) — mesma forma do kit de
storage: uma interface, três drivers, quem escolhe é o env.

| `CACHE_DRIVER` | Onde guarda | Quando |
|---|---|---|
| `memory` (default) | Map do processo | dev, teste, instância única |
| `redis` | Redis/Valkey via `RedisClient` do Bun (sem SDK) | mais de uma instância servindo |
| `none` | lugar nenhum | desligar sem mexer em código |

Em teste o driver é **sempre** `memory` (fixado no `settings`): driver com rede
em teste unitário é dependência escondida.

Uso — nunca chame o driver direto, peça um namespace:

```js
const cacheLista = cache.namespace('cards:lista')          // TTL padrão
const cacheAnos  = cache.namespace('cards:anos', { ttl: 3600 })

// no controller
return {
  fetch: cacheLista.handler(fetch),                    // chave = params + query
  anos:  cacheAnos.handler(anos, { chave: 'todos' }),  // rota sem filtro
  invalidateCache: () => cache.namespace('cards').invalidate()
}
```

`namespace(ns)` devolve `{ get, set, del, wrap, invalidate, handler }`.
`wrap(chave, produzir, ttl)` é o ponto de uso geral; `handler(fn, opts)` é o
mesmo para um handler da Elysia.

**A chave é derivada, não escrita à mão.** `cache.chaveDe(obj)` ordena as
chaves e descarta `''`/`null`/`undefined` — sem isso `{ano,uf}` e `{uf,ano}`, ou
"sem filtro" e "filtro vazio", viram entradas diferentes do mesmo resultado.

**Invalidação é por assunto, não por chave.** Quem importa dado novo não conhece
as combinações de filtro guardadas. A limpeza é por prefixo, então invalidar o
namespace pai (`cards`) derruba os filhos (`:lista`, `:anos`) e não
toca no vizinho. No Redis é `SCAN` + `UNLINK` — nunca `KEYS` (percorre o
keyspace inteiro travando o servidor) nem `FLUSHDB` (o banco pode não ser só
nosso; o recorte é o `CACHE_PREFIX`).

Regras que não se negociam:

- **Falha de cache nunca vira falha de requisição.** Toda operação é try/catch
  com valor neutro: Redis fora do ar, chave corrompida ou timeout viram `miss` e
  a origem responde.
- **Toda operação tem teto de tempo** (`CACHE_TIMEOUT`, 200 ms). Não é
  paranoia: medido, o cliente com o Redis fora do ar só rejeita o comando depois
  de ~2,6 s — sem o corte, uma queda do cache somaria segundos a *toda*
  requisição. `invalidate`/`clear` têm orçamento próprio (30 s) porque varrem o
  keyspace e não rodam no caminho da requisição.
- **O valor trafega serializado nos dois drivers.** O de memória poderia guardar
  a referência e ser mais rápido, mas aí quem alterasse o objeto devolvido
  corromperia a entrada — e o bug não apareceria em produção, onde o driver é
  outro. O `stringify` converte BigInt para número (ids BigInt do Prisma não
  serializam), senão toda escrita lançaria.
- **`undefined` não é guardado**: seria indistinguível de ausência na leitura
  seguinte.
- **Nada de identidade na chave** nas rotas de dado público: a resposta é igual
  para todo mundo e misturar usuário só multiplicaria entradas idênticas. Rota
  cujo resultado dependa de quem pediu passa um `chave` próprio que inclua o
  recorte — caso contrário o cache vaza dado de um usuário para outro.

O driver de memória tem teto (`CACHE_MAX_ENTRIES`): descarta o que venceu e,
se ainda estourar, a entrada mais antiga. Cache em memória sem limite é
vazamento com outro nome.

Envs: `CACHE_DRIVER`, `CACHE_TTL` (300 s), `CACHE_PREFIX` (`app:cache:`),
`CACHE_MAX_ENTRIES` (5000), `CACHE_TIMEOUT` (200 ms), `REDIS_URL`,
`REDIS_CONNECT_TIMEOUT`. Infra: serviço `valkey` nos dois composes — em dev
preso em `127.0.0.1:6379`, em produção sem porta publicada e **fora da
`dokploy-network`** (Valkey sem senha nessa rede seria leitura e escrita livre
para qualquer container do host); quem usa é só a API, pela rede `cache`.

O template não consome o cache em nenhuma rota; use `cache.namespace(...)` nos módulos que precisarem. Depois de escrever dado novo, chame `invalidate()` do namespace.

### Arquivos (kit de storage)

**Sem tabela e sem rota genérica.** O serviço devolve um **descritor** (JSON
puro) e quem persiste é o módulo dono do registro — coluna `Json`, campo de
texto com a `key`, o que servir ao domínio. Sem ledger central, nada no sistema
sabe o que existe no bucket.

O que isso custa, e foi aceito: nada de dedupe por checksum, cota por usuário,
idempotência, soft delete ou GC. `remove` apaga o objeto na hora, e descritor
perdido pelo módulo vira lixo invisível no bucket.

**`fileService`** (`src/services/_file.service.js`) — o ponto de uso. Nunca
chame o `storage` direto.

| Função | Para quê |
|---|---|
| `upload({ file, profile, originalName })` | upload pela API (bytes atravessam o processo) → descritor |
| `presignUpload({ filename, mimeType, size, profile })` | `{ descriptor, url, method, expiresIn, headers }` para o browser subir direto ao bucket |
| `confirmUpload(descritor)` | confere no bucket o que chegou; divergiu → apaga o objeto e lança 400 |
| `deliver(descritor, { mode, range })` | decide redirect vs stream |
| `url(descritor)` / `download(descritor, { range })` | URL assinada / stream com Range (206) |
| `replace(descritor, { file })` / `remove` / `removeMany` / `exists` | versão, exclusão, checagem |

`fileDescriptorSchema` (Zod) valida o descritor na entrada e na saída da coluna.

Uso num módulo:

```js
const descritor = await fileService.upload({ file: body.file, profile: 'document' })
await prisma.Card.update({ where: { id }, data: { anexo: descritor } })
// depois
return fileService.deliver(card.anexo, { mode: query.mode, range })
```

Autorização é a do módulo: quem passou pelo RBAC do registro pode ler o
descritor guardado nele. Nunca aceite `key` vinda do cliente — leia o descritor
do banco a partir do id do registro, senão a rota vira leitura arbitrária do
bucket.

**Perfil manda, chamador não escolhe.** `avatar` (imagem, 2 MB, PUBLIC,
inline), `document` (pdf/csv/xlsx/docx, 25 MB, PRIVATE, attachment),
`attachment` (qualquer tipo, 25 MB, PRIVATE, attachment). O tipo é confirmado
por **magic bytes**, não pelo `content-type` declarado.

Ciclo do upload assinado: `presignUpload` → browser faz o `PUT` →
`confirmUpload` → só então persista o descritor.

**Limite conhecido**: `PUT` assinado não impõe tamanho (exigiria POST-policy,
que o cliente S3 do Bun não expõe). Contenção: TTL de 300 s e o `confirmUpload`
conferindo o tamanho real. Sem GC, upload assinado que ninguém confirma fica no
bucket — se isso incomodar, use lifecycle rule no próprio bucket.

Envs: `STORAGE_DRIVER` (`s3` default, `memory` para teste/dev offline),
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_PUBLIC_URL`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_VIRTUAL_HOSTED` (MinIO usa
path-style: `false`), `STORAGE_MAX_SIZE`, `STORAGE_PRESIGN_TTL`,
`STORAGE_CHECKSUM_LIMIT`. Infra de dev: `docker-compose.dev.yml` (Postgres +
MinIO). Nos testes o driver é `memory` — write/stat/stream/range/presign rodam
de verdade, sem MinIO e sem rede.

Regras que não se negociam: privado por default; `PUBLIC` = chave não
adivinhável, **não é autorização**; URL assinada é credencial (nunca em log nem
em mensagem de erro); a chave do objeto não deriva de input do usuário.

#### ⚠️ Ponto de atenção: exclusão silenciosa que não apaga nada

**`storage.delete` de chave inexistente é sucesso.** O S3 (e o MinIO) responde
`204` para `DELETE` de um objeto que não existe — não é erro, é a semântica do
protocolo. Consequência: chave errada em `fileService.remove` **não levanta
nada**. A linha some do banco, o log diz "arquivo removido", a métrica conta
`remove{result="ok"}` e o arquivo continua no bucket. Foi exatamente assim que
arquivos ficaram órfãos no bucket.

Duas causas, as duas ainda possíveis em qualquer módulo novo:

1. **O pathname da URL não é a chave.** Quem guarda URL em vez de descritor precisa derivar a chave de volta, e aí o primeiro segmento do caminho pode ser o **bucket** (MinIO é path-style: `http://host:9000/app-private/k`). Passar `app-private/k` como chave apaga um objeto que não existe.
2. **`visibility` do descritor tem de ser a do perfil que subiu o arquivo.** `bucketRefFor` escolhe o bucket por ela; `PRIVATE` num objeto que foi para o bucket público apaga no bucket errado — de novo, sem erro.

Por isso: **`remove` nunca é `.catch(() => {})`**. Falha ali não pode derrubar a
requisição (a linha já mudou), mas tem de virar linha de log com a `key` —
sem isso não existe nenhum sinal de que o bucket está acumulando lixo. Não há
ledger nem GC para conferir depois.

Quando desconfiar, `fileService.exists(descritor)` **antes** do `remove` é a
única checagem real; e no dev dá para conferir direto:
`docker compose -f docker-compose.dev.yml exec minio mc ls -r local/app-private`.

### Adding a new domain

1. Run `bun run generate:crud` and answer the prompts (Prisma model name, module folder, resource name).
2. Register the generated routes in `src/app.js`:
   ```js
   import { myDomainRoutes } from './routes/mydomain'
   // a instância já carrega seu próprio prefix
   .use(myDomainRoutes)
   ```
3. Run `bun run seed` (ou `bun run permissoes:sync`) to push the generated permissions to the database. O seed descobre `prisma/permissions_*.js` sozinho — cada um só exporta `PERMISSIONS`, sem client nem efeito colateral no import.

### Prisma

- Schema: pasta `prisma/schema/` (multi-arquivo, apontada por `prisma.config.ts`). `schema.prisma` só tem `generator` + `datasource`; os models ficam em arquivos por domínio.

  | Arquivo | Schema do banco |
  |---|---|
  | `seguranca.prisma` (`User`, `Role`, `Permission`, pivôs, `PasswordResetToken`) · `acesso.prisma` (`email_change_tokens`, `user_access_history`) | `seguranca` |
  | `teste.prisma` (`Card`) | `public` |

  Todo model e todo enum declara seu `@@schema(...)`, e o schema novo entra em `datasource.schemas` (`schema.prisma`).

  Com o schema em pasta, o Migrate procuraria as migrations dentro dela — daí o `migrations.path` explícito em `prisma.config.ts`. Sem ele, `migrate deploy` responde "No migration found" e não aplica nada. As migrations começam em uma única `init`.
- Generated client: `prisma/generated/prisma/` — import from there, not from `@prisma/client` directly.
- All IDs use UUID v7 (`@default(uuid(7))`).
- After editing the schema run `bun run prisma:generate`.
- Seed: `prisma/seed.js` (idempotente; também é o `migrations.seed` do `prisma.config.ts`). Roles base são realinhadas a cada execução; senha de admin existente nunca é trocada; em produção exige `SEED_ADMIN_PASSWORD` ≥12 antes de gravar.

### Code style (Biome)

Tabs, width 2. Single quotes. No semicolons (only where required). No trailing commas. Line width 80.
