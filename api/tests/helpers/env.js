/**
 * Ambiente determinístico dos testes.
 *
 * Precisa ser o PRIMEIRO import do preload: `settings` congela os valores no
 * momento em que o módulo é avaliado, e imports ESM são içados acima de
 * qualquer atribuição, então definir env em outro arquivo chegaria tarde demais.
 */
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test_secret_determinista_nao_use_em_producao'
process.env.JWT_ALGORITHM = 'HS256'
process.env.JWT_EXPIRES_IN = '24h'

process.env.COOKIE_NAME = 'access_token'
process.env.COOKIE_SAMESITE = 'lax'
process.env.COOKIE_SECURE = 'false'
process.env.COOKIE_DOMAIN = ''

process.env.CORS_ORIGIN = 'http://localhost:5173,http://localhost:3000'

// JSON por linha: asserção vira JSON.parse em vez de regex sobre texto colorido.
process.env.LOG_LEVEL = 'debug'
process.env.LOG_PRETTY = 'false'

// Nunca é usada de fato — o client do Prisma está mockado.
process.env.DATABASE_URL = 'postgresql://mock:mock@127.0.0.1:1/mock'

// Driver de memória: os testes exercitam o storage de verdade (write, stat,
// stream, range, presign) sem MinIO e sem rede.
process.env.STORAGE_DRIVER = 'memory'
process.env.S3_BUCKET = 'teste-private'
process.env.S3_PUBLIC_BUCKET = 'teste-public'
process.env.S3_PUBLIC_URL = 'https://cdn.teste/app-public'
process.env.STORAGE_PRESIGN_TTL = '300'

// OTel desligado: sem isso o SDK sobe por arquivo de teste, instala hooks de
// contexto no processo e o exportador tenta rede. `settings.OTEL_ENABLED` já
// cairia por NODE_ENV=test — a variável está aqui para deixar a intenção
// explícita e para valer também se alguém rodar um teste com outro NODE_ENV.
process.env.OTEL_SDK_DISABLED = 'true'

// Definido em src/index.js, que os testes não carregam.
globalThis.__basedir = new URL('../../src', import.meta.url).pathname
