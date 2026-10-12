# Plano — API como monólito modular

**Status:** proposto · **Data:** 2026-10-12

## Objetivo

Trocar a organização por camada técnica (`controllers/`, `routes/`, `services/`, `policies/` misturando segurança, cards e infraestrutura) por **módulos de negócio** em `src/modules/<nome>`, cada um com uma única porta de entrada e fronteiras verificadas por teste.

Critério de aceite em toda fase: `bun test` verde, `bun run build` ok, snapshot do OpenAPI **inalterado** (o web não pode perceber a mudança).

---

## 1. Estrutura alvo

```
src/
  app.js                 # só compõe: plugins globais + .use() de cada módulo
  index.js
  instrumentation.js
  modules.js             # lista MODULOS — fonte única para app, seed e testes
  kernel/                # núcleo compartilhado, sem regra de negócio
    config/
    logger/  metrics/  otel/
    errors/              # errorHandler
    util/                # _util.helper, datas, senha
    http/                # baseController, baseRouter, plugins (cors, openapi, rate-limit, logger, metrics)
    db/                  # cliente prisma, pool, adjustTimezone, colunas de data
    cache/  storage/  file/  mail/
    events/              # barramento em processo (fase 4)
    policies/            # motor PBAC (definirPolitica, can, escopoDe) — sem políticas de domínio
  modules/
    identidade/          # hoje "seguranca"
      index.js           # API PÚBLICA — única coisa importável de fora
      module.js          # contrato do módulo (ver §2)
      http/              # rotas + schemas Zod
      application/       # casos de uso: login, revogar sessões, conceder role…
      domain/            # contenção, acesso total, regras puras
      infra/             # acesso ao prisma, sessão, cache de permissões
      permissions.js     # catálogo de permissões do módulo
      tests/
    cards/               # módulo de exemplo (simples: sem camadas)
      index.js
      module.js
      http/
      cards.service.js
      policies.js
      permissions.js
      tests/
```

Camadas (`domain/`, `application/`, `infra/`) só onde há regra que justifique — hoje apenas `identidade`. Módulo CRUD fica plano.

---

## 2. Contrato de um módulo

```js
// src/modules/cards/module.js
export const cardsModule = {
	nome: 'cards',
	rotas,                 // instância Elysia já com o prefix (/api/teste hoje)
	permissoes,            // catálogo — lido pelo seed e pelo teste de catálogo
	politicas,             // registradas no motor do kernel
	eventos: {
		publica: ['cards.card.criado'],
		escuta: ['identidade.usuario.excluido']
	},
	iniciar                // opcional: assinantes, jobs
}
```

```js
// src/modules.js
export const MODULOS = [identidadeModule, cardsModule]
```

`app.js`, `prisma/seed.js`, `scripts/sync-permissoes.js` e `tests/unit/catalogo-permissoes.test.js` passam a ler `MODULOS` — acaba a descoberta por nome de arquivo (`prisma/permissions_*.js`).

---

## 3. Regras de fronteira

1. Módulo importa só de `src/kernel/*` ou do **`index.js`** de outro módulo. Nunca `modules/x/infra/...`.
2. `kernel` não importa nada de `modules`.
3. **Tabela tem um dono.** Outro módulo não lê nem escreve nela via prisma: chama a API pública do dono.
4. **Sem FK entre módulos** (ver decisão D2).
5. Cada módulo no seu schema Postgres (`seguranca`, `cards`, …).
6. Comunicação:
   - síncrona → função da API pública (`identidade.temPermissao(userId, perm)`);
   - assíncrona → `kernel/events` (em processo). Garantia de entrega, quando precisar: outbox na mesma transação.
7. Autorização na borda: `authenticate`/`authorize` exportados por `identidade`; motor de políticas no kernel, políticas no módulo dono.
8. O kernel define a **interface** "resolver usuário da requisição"; `identidade` fornece a implementação (JWT + `tokenVersion`). Evita kernel → identidade.

**Enforcement:** `dependency-cruiser` (ou teste próprio que varre imports) no `bun test`. Sem isso a fronteira apodrece.

---

## 4. Mapa de migração (de → para)

| Hoje | Destino |
|---|---|
| `src/config/*` | `kernel/config/` |
| `helpers/_logger`, `_metrics`, `_otel-redaction`, `_handleerror`, `_util`, `_senha`, `_versao`, `_colunas-data`, `_permissoes-explicitas` | `kernel/{logger,metrics,otel,errors,util,db}` (`_permissoes-explicitas` → `identidade/domain`) |
| `plugins/_cors`, `_openapi`, `_rate-limit`, `_logger`, `_metrics` | `kernel/http/plugins/` |
| `plugins/_jwt` | `identidade/infra/` (implementa a interface do kernel) |
| `controllers/base.controller`, `routes/base.route`, `controllers/_ativacao` | `kernel/http/` |
| `services/_prisma`, `_cache`, `_storage`, `_file`, `_mail`, `_mail-templates` | `kernel/{db,cache,storage,file,mail}` (templates de e-mail de conta → `identidade`) |
| `policies/index.js` | `kernel/policies/` |
| `policies/cards.policy.js` | `modules/cards/policies.js` |
| `middleware/_authorization.middleware` | `identidade/http/` (exportado no `index.js`) |
| `controllers/seguranca/*`, `routes/seguranca/*` | `identidade/http` + `application` |
| `services/_authorization`, `_sessao`, `_acesso-total`, `_auditoria`, `_access-history` | `identidade/{application,infra}` |
| `controllers/seguranca/_contencao` | `identidade/domain/` |
| `_telemetria.controller/route` | `identidade` agora; candidato a módulo `observabilidade` (D4) |
| `controllers/teste/*`, `routes/teste/*` | `modules/cards/` |
| `prisma/permissions_seguranca.js`, `permissions_card.js` | `modules/*/permissions.js` |
| `tests/unit`, `tests/integration` | ficam `tests/` para kernel; testes de módulo em `modules/*/tests` |

---

## 5. Fases

Cada fase é um PR independente, mergeável sozinho.

### Fase 0 — Rede de segurança (0,5 dia)
- [ ] Registrar baseline: nº de testes, snapshot OpenAPI, `bun run build`.
- [ ] Teste de fronteira em modo **relatório** (lista violações, não falha).
- [ ] Aliases `src/kernel/*` e `src/modules/*` no `jsconfig.json`.
- [ ] `bunfig.toml`: incluir `src/modules/**/tests` na suíte.

### Fase 1 — Extrair o kernel (1 dia)
- [ ] Mover arquivos conforme §4 (só os de kernel).
- [ ] Re-exports temporários nos caminhos antigos (`src/services/index.js` etc.) — marcados `// TODO remover na fase 5`.
- [ ] `tests/setup.js`: mock do prisma passa a substituir `kernel/db`. **Rodar a suíte antes de qualquer outra mudança** — é o ponto mais frágil.
- [ ] Interface `resolverUsuario` no kernel; `jwtPlugin` ainda no lugar antigo, só adaptado.

### Fase 2 — Piloto: módulo `cards` (0,5 dia)
- [ ] `modules/cards/` com `module.js`, `index.js`, `http/`, `cards.service.js`, `policies.js`, `permissions.js`.
- [ ] `src/modules.js` com `MODULOS`; `app.js` monta a partir dela (prefixo `/api/teste` mantido).
- [ ] Seed e teste de catálogo lendo `MODULOS`.
- [ ] Migration: `public.cards` → schema `cards` (D3) e decisão da FK (D2).

### Fase 3 — Módulo `identidade` (2–3 dias)
- [ ] Sub-áreas: sessão/auth, conta, usuários, RBAC (roles, permissões, contenção, acesso total), auditoria, telemetria.
- [ ] API pública mínima no `index.js`: `authenticate`, `authorize`, `temPermissao`, `obterUsuario(id)`, `usuariosAtivos(ids)`, eventos.
- [ ] `jwtPlugin` + `sessaoService` movidos para `identidade/infra`, registrados como implementação de `resolverUsuario`.
- [ ] Prefixo `/api/seguranca` mantido.

### Fase 4 — Eventos (1 dia)
- [ ] `kernel/events`: `publicar(nome, payload)`, `assinar(nome, fn)`, em processo, JSDoc tipado; falha de assinante vira log, nunca derruba quem publicou.
- [ ] `identidade.usuario.excluido` → `cards` anula/transfere `createdById`.
- [ ] (Opcional) tabela `outbox` + publicação pós-commit.

### Fase 5 — Ferramentas e trava (1 dia)
- [ ] Plop: gerador `module` (cria estrutura e registra em `MODULOS`); `crud` gera **dentro** de um módulo.
- [ ] `scripts/sync-permissoes.js` lendo `MODULOS`; apagar `prisma/permissions_*.js`.
- [ ] Remover re-exports temporários.
- [ ] Teste de fronteira vira **bloqueante**.
- [ ] `bun test src/modules/cards` funcionando isolado.

### Fase 6 — Documentação (0,5 dia)
- [ ] CLAUDE.md e README: mapa de módulos, regras de fronteira, "como criar um módulo".
- [ ] ADR curto com D1–D4.

**Total estimado:** 6–8 dias.

---

## 6. Decisões a tomar antes de começar

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Onde ficam os `.prisma` | (a) por módulo + script que concatena em `prisma/schema/` (Prisma 7 lê uma pasta só); (b) central em `prisma/schema/<modulo>.prisma` com dono documentado | **(b)** — mais simples; posse garantida pelo teste de fronteira |
| D2 | FK `Card.createdById → User` | manter como exceção documentada / remover e sincronizar por evento | Template: **remover** (mostra o padrão); app real: avaliar caso a caso |
| D3 | Schema Postgres de cards | manter `public` / mover para `cards` | **Mover** — um schema por módulo |
| D4 | Telemetria | dentro de `identidade` / módulo `observabilidade` | **`observabilidade`** — não é identidade |

---

## 7. Riscos

- **Mocks de teste acoplados ao caminho do prisma** — mover na fase 1 isoladamente e validar a suíte.
- **Ordem de carregamento do OTel** — `instrumentation.js` precisa continuar carregando antes de `kernel/db` (patch do `pg`). Não mover o import do adapter para outro ponto.
- **Contrato HTTP** — prefixos e formatos de resposta não mudam; renomear rotas é outro projeto, junto com o web.
- **Abstração prematura** — não criar camadas em módulo CRUD; não criar outbox sem necessidade real de entrega garantida.
