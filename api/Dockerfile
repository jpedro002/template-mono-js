# syntax=docker/dockerfile:1.7

# ---------- deps completas (prod + dev) ----------
FROM oven/bun:1.2.23-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

# ---------- deps só de produção ----------
FROM oven/bun:1.2.23-slim AS deps-prod
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --production

# ---------- prisma client ----------
FROM deps AS build
# o `prisma generate` sonda a versão do libssl; sem openssl na imagem slim ele
# avisa e cai no palpite `openssl-1.1.x`
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN bun x prisma generate

# ---------- versão ----------
# O `.git` não chega ao runtime; daqui sai só o `versao.json` que `GET /version` lê.
# `COPY . ` traz o que o `.dockerignore` libera do `.git` (HEAD e refs) e não
# falha se o contexto vier sem ele — aí vale o build arg `GIT_COMMIT`.
FROM deps AS versao
ARG GIT_COMMIT=
WORKDIR /ctx
COPY . .
RUN GIT_COMMIT=$GIT_COMMIT bun scripts/versao.js /ctx

# ---------- runtime ----------
FROM oven/bun:1.2.23-slim AS runtime

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl tzdata \
	&& rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
	TZ=America/Fortaleza \
	PORT=3000

WORKDIR /app

COPY --from=deps-prod --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json jsconfig.json prisma.config.ts ./
COPY --chown=bun:bun prisma ./prisma
COPY --from=build --chown=bun:bun /app/prisma/generated ./prisma/generated
COPY --chown=bun:bun src ./src
COPY --from=versao --chown=bun:bun /ctx/versao.json ./versao.json

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1

# `--preload` não é opcional: a instrumentação do `pg` precisa trocar os métodos
# do módulo antes de o `@prisma/adapter-pg` carregá-lo (ver src/instrumentation.js).
CMD ["bun", "--preload", "./src/instrumentation.js", "src/index.js"]
