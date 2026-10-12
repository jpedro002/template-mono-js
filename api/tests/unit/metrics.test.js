import { beforeAll, describe, expect, it } from 'bun:test'
import { iniciarMetricas, metrics } from 'src/helpers/_metrics.helper'

/**
 * Sem SDK ligado (`OTEL_SDK_DISABLED=true` no ambiente de teste) o medidor do
 * OTel é no-op: `add`/`record` não guardam nada e não há de onde ler um valor.
 * Por isso o que se testa aqui é o que tem decisão de verdade — o callback das
 * métricas observáveis — e o contrato da fachada: nenhum ponto de instrumentação
 * pode lançar, porque todos ficam no caminho de requisições reais.
 *
 * `iniciarMetricas()` é chamada de propósito: sem ela a fachada inteira sai pelo
 * `I?.`, e o teste passaria sem exercitar uma linha do corpo — que é justamente
 * onde vive o risco (atributo montado errado, unidade trocada).
 */
beforeAll(() => {
	iniciarMetricas()
})

function coletor() {
	const observado = []
	return {
		observado,
		result: {
			observe: (instrumento, value, attributes) =>
				observado.push({ instrumento, value, attributes })
		}
	}
}

/**
 * Instrumentos falsos, e não os reais: com o SDK desligado o medidor no-op
 * devolve **o mesmo objeto** para todo `createObservableGauge`, então filtrar por
 * identidade do instrumento real juntaria todas as séries numa só. `coletarRuntime`
 * recebe os instrumentos por parâmetro justamente para permitir isso.
 */
const INSTRUMENTOS = {
	uptime: 'uptime',
	memoria: 'memoria',
	cpu: 'cpu',
	eventLoopLag: 'lag',
	dbConexoes: 'conexoes',
	dbFila: 'fila',
	dbConexoesMax: 'conexoes_max'
}

function valoresDe(observado, instrumento) {
	return observado
		.filter(o => o.instrumento === instrumento)
		.map(o => ({ value: o.value, attributes: o.attributes }))
}

describe('métricas observáveis — runtime', () => {
	it('publica uptime, memória por tipo, CPU por modo e lag do event loop', () => {
		const { result, observado } = coletor()
		const inst = INSTRUMENTOS

		metrics._coletarRuntime(result, inst)

		expect(valoresDe(observado, inst.uptime)).toHaveLength(1)
		expect(valoresDe(observado, inst.uptime)[0].value).toBeGreaterThan(0)

		expect(
			valoresDe(observado, inst.memoria).map(o => o.attributes.type)
		).toEqual(['rss', 'heap_used', 'heap_total', 'external'])

		expect(valoresDe(observado, inst.cpu).map(o => o.attributes.mode)).toEqual([
			'user',
			'system'
		])

		const lag = valoresDe(observado, inst.eventLoopLag)
		expect(lag).toHaveLength(1)
		expect(lag[0].value).toBeGreaterThanOrEqual(0)
	})

	it('converte o tempo de CPU de microssegundos para segundos', () => {
		const { result, observado } = coletor()

		metrics._coletarRuntime(result, INSTRUMENTOS)

		// O processo de teste não gastou horas de CPU: se a conversão faltasse, o
		// valor bruto em microssegundos passaria de milhões.
		for (const { value } of valoresDe(observado, INSTRUMENTOS.cpu)) {
			expect(value).toBeLessThan(3600)
		}
	})
})

describe('métricas observáveis — pool do Postgres', () => {
	it('não emite série de conexão quando ninguém registrou o pool', () => {
		metrics.db.registrarPool(null)
		const { result, observado } = coletor()

		metrics._coletarRuntime(result, INSTRUMENTOS)

		// Ausente é diferente de zerado: zero se confunde com "pool vazio".
		expect(valoresDe(observado, INSTRUMENTOS.dbConexoes)).toHaveLength(0)
		expect(valoresDe(observado, INSTRUMENTOS.dbFila)).toHaveLength(0)
	})

	it('derive conexões em uso de total menos ociosas', () => {
		metrics.db.registrarPool(() => ({
			total: 7,
			idle: 2,
			waiting: 3,
			max: 10
		}))
		const { result, observado } = coletor()

		metrics._coletarRuntime(result, INSTRUMENTOS)

		expect(valoresDe(observado, INSTRUMENTOS.dbConexoes)).toEqual([
			{ value: 5, attributes: { state: 'used' } },
			{ value: 2, attributes: { state: 'idle' } }
		])
		expect(valoresDe(observado, INSTRUMENTOS.dbFila)[0].value).toBe(3)
		expect(valoresDe(observado, INSTRUMENTOS.dbConexoesMax)[0].value).toBe(10)

		metrics.db.registrarPool(null)
	})
})

describe('amostragem do lag', () => {
	it('devolve um timer que não segura o processo', () => {
		const timer = metrics._iniciarAmostragemDeLag()

		// Sem unref, um teste que criasse o timer deixaria o processo do `bun test`
		// pendurado.
		expect(typeof timer.unref).toBe('function')

		clearInterval(timer)
	})
})

describe('fachada — nenhum ponto de instrumentação pode lançar', () => {
	it('HTTP: início, fim e erro', () => {
		expect(() => {
			metrics.http.iniciou()
			metrics.http.terminou({
				method: 'GET',
				route: '/api/teste/cards/:id',
				status: 200,
				durationSeconds: 0.012,
				bodySize: 0
			})
			metrics.http.terminou({
				method: 'POST',
				route: '',
				status: 201,
				durationSeconds: 0.5,
				bodySize: 128
			})
			metrics.http.erro({
				method: 'GET',
				route: undefined,
				status: 404,
				errorType: 'NOT_FOUND'
			})
			metrics.http.erro({ method: 'GET', status: 500 })
		}).not.toThrow()
	})

	it('banco, autenticação e autorização', () => {
		expect(() => {
			metrics.db.operacao({
				model: 'User',
				operation: 'findFirst',
				durationSeconds: 0.03
			})
			metrics.db.operacao({
				model: null,
				operation: null,
				durationSeconds: 0.01,
				errorType: 'P2002'
			})
			metrics.auth.login('success')
			metrics.auth.login('invalid_credentials')
			metrics.auth.logout()
			metrics.auth.sessaoFechada(3600)
			metrics.authz.decisao('authorize', 'deny')
			metrics.authz.cache('hit')
		}).not.toThrow()
	})

	it('rate limit, storage e log', () => {
		expect(() => {
			metrics.rateLimit.bloqueado('login')
			metrics.storage.operacao({
				operation: 'upload',
				profile: 'document',
				result: 'ok'
			})
			metrics.storage.bytes({
				operation: 'upload',
				profile: 'document',
				bytes: 2048
			})
			// Tamanho zero ou negativo não entra: contador só cresce.
			metrics.storage.bytes({
				operation: 'upload',
				profile: 'document',
				bytes: 0
			})
			metrics.log.evento('error')
		}).not.toThrow()
	})
})
