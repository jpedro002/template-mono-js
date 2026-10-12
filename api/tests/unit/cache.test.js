import { beforeEach, describe, expect, it, setSystemTime } from 'bun:test'
import { settings } from 'src/config'
import { cache } from 'src/services/_cache.service'

// Em teste o driver é sempre o de memória (fixado no settings) — nenhum teste
// abre conexão com Redis.
beforeEach(async () => {
	await cache.clear()
})

describe('cache — driver', () => {
	it('usa memória no ambiente de teste', () => {
		expect(cache.driver).toBe('memory')
		expect(settings.CACHE_DRIVER).toBe('memory')
	})
})

describe('cache — chave estável', () => {
	it('ordena as chaves do objeto', () => {
		expect(cache.chaveDe({ b: 2, a: 1 })).toBe(cache.chaveDe({ a: 1, b: 2 }))
	})

	it('descarta filtro vazio, nulo e indefinido', () => {
		expect(
			cache.chaveDe({ ano: 2023, uf: '', etapa: null, x: undefined })
		).toBe('ano=2023')
	})

	it('separa valores diferentes', () => {
		expect(cache.chaveDe({ ano: 2023 })).not.toBe(cache.chaveDe({ ano: 2024 }))
	})
})

describe('cache — get/set/del', () => {
	const ns = cache.namespace('teste:basico')

	it('devolve undefined para chave ausente', async () => {
		expect(await ns.get({ a: 1 })).toBeUndefined()
	})

	it('guarda e lê o valor', async () => {
		await ns.set({ a: 1 }, { total: 3 })
		expect(await ns.get({ a: 1 })).toEqual({ total: 3 })
	})

	it('serializa BigInt como número — ids do Prisma podem ser BigInt', async () => {
		await ns.set('bigint', { id: 10n })
		expect(await ns.get('bigint')).toEqual({ id: 10 })
	})

	it('não devolve a mesma referência guardada', async () => {
		const original = { lista: [1, 2] }
		await ns.set('ref', original)
		const lido = await ns.get('ref')

		lido.lista.push(3)
		expect((await ns.get('ref')).lista).toEqual([1, 2])
	})

	it('remove a entrada com del', async () => {
		await ns.set('x', 1)
		await ns.del('x')
		expect(await ns.get('x')).toBeUndefined()
	})

	// Relógio adiantado, não `sleep`: o helper de login usa `setSystemTime`, e um
	// teste que dependesse do relógio real passaria ou falharia conforme a ordem
	// dos arquivos da suíte.
	it('expira depois do TTL', async () => {
		const agora = Date.now()

		await ns.set('curto', 'valor', 60)
		expect(await ns.get('curto')).toBe('valor')

		setSystemTime(new Date(agora + 61_000))
		expect(await ns.get('curto')).toBeUndefined()

		setSystemTime()
	})
})

describe('cache — namespaces isolados', () => {
	it('mesma chave em namespaces diferentes não colide', async () => {
		const a = cache.namespace('teste:a')
		const b = cache.namespace('teste:b')

		await a.set('k', 'de-a')
		await b.set('k', 'de-b')

		expect(await a.get('k')).toBe('de-a')
		expect(await b.get('k')).toBe('de-b')
	})

	it('invalidate derruba os namespaces filhos pelo prefixo', async () => {
		const lista = cache.namespace('app:x:lista')
		const anos = cache.namespace('app:x:anos')
		const outro = cache.namespace('app:y:lista')

		await lista.set({ ano: 2023 }, ['a'])
		await anos.set('todos', [2023])
		await outro.set({ ano: 2023 }, ['b'])

		const removidas = await cache.namespace('app:x').invalidate()

		expect(removidas).toBe(2)
		expect(await lista.get({ ano: 2023 })).toBeUndefined()
		expect(await anos.get('todos')).toBeUndefined()
		// Namespace vizinho não pode ser levado junto.
		expect(await outro.get({ ano: 2023 })).toEqual(['b'])
	})
})

describe('cache — wrap', () => {
	it('produz uma vez e reaproveita', async () => {
		const ns = cache.namespace('teste:wrap')
		let chamadas = 0

		const produzir = async () => {
			chamadas++
			return { n: chamadas }
		}

		expect(await ns.wrap({ p: 1 }, produzir)).toEqual({ n: 1 })
		expect(await ns.wrap({ p: 1 }, produzir)).toEqual({ n: 1 })
		expect(chamadas).toBe(1)
	})

	it('chave diferente produz de novo', async () => {
		const ns = cache.namespace('teste:wrap2')
		let chamadas = 0
		const produzir = async () => ++chamadas

		await ns.wrap({ p: 1 }, produzir)
		await ns.wrap({ p: 2 }, produzir)
		expect(chamadas).toBe(2)
	})

	it('não guarda undefined — seria indistinguível de ausência', async () => {
		const ns = cache.namespace('teste:wrap3')
		let chamadas = 0

		const produzir = async () => {
			chamadas++
			return undefined
		}

		await ns.wrap('k', produzir)
		await ns.wrap('k', produzir)
		expect(chamadas).toBe(2)
	})

	it('erro de quem produz sobe — cache não engole falha da origem', async () => {
		const ns = cache.namespace('teste:wrap4')

		expect(
			ns.wrap('k', async () => {
				throw new Error('banco fora')
			})
		).rejects.toThrow('banco fora')
	})
})

describe('cache — handler de rota', () => {
	it('monta a chave a partir de query e params', async () => {
		const ns = cache.namespace('teste:handler')
		let chamadas = 0

		const handler = ns.handler(async () => ({ n: ++chamadas }))

		await handler({ query: { ano: 2023 }, params: {} })
		await handler({ query: { ano: 2023 }, params: {} })
		expect(chamadas).toBe(1)

		await handler({ query: { ano: 2024 }, params: {} })
		expect(chamadas).toBe(2)
	})

	it('aceita chave fixa para rota sem filtro', async () => {
		const ns = cache.namespace('teste:handler2')
		let chamadas = 0

		const handler = ns.handler(async () => ++chamadas, { chave: 'todos' })

		await handler({ query: { irrelevante: 1 } })
		await handler({ query: { outro: 2 } })
		expect(chamadas).toBe(1)
	})
})

describe('cache — falha do driver não derruba a rota', () => {
	it('erro na leitura vira miss e a origem responde', async () => {
		const ns = cache.namespace('teste:falha')
		const getOriginal = cache._driver.get

		cache._driver.get = async () => {
			throw new Error('conexão recusada')
		}

		try {
			expect(await ns.wrap('k', async () => 'da-origem')).toBe('da-origem')
		} finally {
			cache._driver.get = getOriginal
		}
	})

	it('erro na escrita não vaza para quem chamou', async () => {
		const ns = cache.namespace('teste:falha2')
		const setOriginal = cache._driver.set

		cache._driver.set = async () => {
			throw new Error('conexão recusada')
		}

		try {
			expect(await ns.wrap('k', async () => 'ok')).toBe('ok')
		} finally {
			cache._driver.set = setOriginal
		}
	})

	it('driver que trava é cortado pelo CACHE_TIMEOUT', async () => {
		const ns = cache.namespace('teste:travado')
		const getOriginal = cache._driver.get

		// Com o Redis fora do ar o cliente só rejeita quando estoura o timeout de
		// conexão (segundos) — o corte é o que impede o cache de encarecer a
		// requisição que ele deveria baratear.
		cache._driver.get = () => new Promise(() => {})

		try {
			const t0 = Date.now()
			expect(await ns.wrap('k', async () => 'da-origem')).toBe('da-origem')
			expect(Date.now() - t0).toBeLessThan(settings.CACHE_TIMEOUT * 5)
		} finally {
			cache._driver.get = getOriginal
		}
	})

	it('entrada corrompida é tratada como ausência', async () => {
		const ns = cache.namespace('teste:corrompida')
		await ns.set('k', { a: 1 })

		// Escreve lixo direto no driver, sob a chave real.
		const chave = [...cache._driver._entradas.keys()][0]
		cache._driver._entradas.set(chave, {
			payload: '{isso não é json',
			expiraEm: Date.now() + 60_000
		})

		expect(await ns.get('k')).toBeUndefined()
		expect(cache._driver._entradas.has(chave)).toBe(false)
	})
})

describe('cache — teto de entradas do driver de memória', () => {
	it('não cresce além de CACHE_MAX_ENTRIES', async () => {
		const ns = cache.namespace('teste:teto')
		const teto = settings.CACHE_MAX_ENTRIES

		for (let i = 0; i < teto + 50; i++) await ns.set(`k${i}`, i)

		expect(cache._driver._entradas.size).toBeLessThanOrEqual(teto)
		// A última escrita continua lá: quem sai é a mais antiga.
		expect(await ns.get(`k${teto + 49}`)).toBe(teto + 49)
	})
})
