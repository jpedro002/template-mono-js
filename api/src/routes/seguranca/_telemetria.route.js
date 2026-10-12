import { Elysia } from 'elysia'
import { JANELAS, telemetriaController } from 'src/controllers/seguranca'
import { authenticate, authorize } from 'src/middleware'
import { rateLimit } from 'src/plugins'
import { z } from 'zod'

const controller = telemetriaController()

const TAG = 'Segurança - Telemetria'

// Só quem tem `telemetria:read` (ou `*`) lê o uso do sistema.
//
// O rate limit não é cerimônia: cada chamada dispara 8 consultas ao
// VictoriaMetrics, algumas sobre 30 dias de série.
const leitura = [
	authenticate,
	authorize('telemetria:read'),
	rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'telemetria' })
]

export const telemetriaRoutes = new Elysia({ prefix: '/telemetria' }).get(
	'/uso',
	controller.uso,
	{
		beforeHandle: leitura,
		query: z.object({
			janela: z.enum(Object.keys(JANELAS)).optional().default('24h')
		}),
		response: { 200: z.any(), 503: z.any() },
		detail: {
			tags: [TAG],
			summary: 'Uso do sistema, lido da telemetria',
			description:
				'A fonte é o VictoriaMetrics para onde a API já empurra OTel. **Consulta fixa**: o cliente escolhe a janela e nada mais, porque aceitar PromQL do browser seria leitura arbitrária do banco de séries. Métrica pode ser publicada e log não: nenhum atributo aqui identifica quem fez — é regra do `_metrics.helper`, e é por isso que o Grafana continua só por túnel SSH. Sem `METRICS_QUERY_URL` ou com o backend fora do ar responde **503 explicando**, nunca número inventado.'
		}
	}
)
