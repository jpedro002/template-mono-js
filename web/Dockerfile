# Dockerfile para Deploy do Frontend com Coolify

# ---- deps stage: cache de dependências isolado do código fonte ----
FROM oven/bun:1.3-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ---- build stage ----
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Variáveis obrigatórias em build-time (Vite baseia o bundle nelas, validadas por Zod no startup)
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

# ---- production stage ----
FROM nginx:1.29-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
