import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O catálogo (`prisma/permissions_*.js`, que o seed grava no banco) e o código
 * (`authorize(...)` nas rotas, `definirPolitica(...)` nas políticas) não podem
 * divergir:
 *
 * - permissão exigida pelo código e ausente do catálogo nunca é criada pelo
 *   seed — a rota fica inalcançável para todo mundo, menos `*`;
 * - permissão no catálogo que nenhum código exige é tela de role mostrando um
 *   checkbox que não faz nada.
 *
 * O `permissoes:diff` compara código × banco; este teste compara código ×
 * catálogo, sem banco, e roda em todo `bun test`.
 */

const RAIZ = new URL('../..', import.meta.url).pathname

// Usadas fora de `authorize`: `*` é o coringa de acesso total.
const SEM_USO_DIRETO = new Set(['*'])

function arquivos(dir) {
	return readdirSync(dir).flatMap(nome => {
		const caminho = join(dir, nome)
		if (statSync(caminho).isDirectory()) return arquivos(caminho)
		return caminho.endsWith('.js') ? [caminho] : []
	})
}

async function catalogo() {
	const pasta = join(RAIZ, 'prisma')
	const ids = new Set()
	for (const nome of readdirSync(pasta)) {
		if (!/^permissions_.+\.js$/.test(nome)) continue
		const { PERMISSIONS } = await import(join(pasta, nome))
		for (const p of PERMISSIONS) ids.add(p.identifier)
	}
	return ids
}

function usadasNoCodigo() {
	const fontes = [
		...arquivos(join(RAIZ, 'src/routes')),
		...arquivos(join(RAIZ, 'src/policies')),
		join(RAIZ, 'src/app.js')
	]
	const usadas = new Map()

	for (const arquivo of fontes) {
		const fonte = readFileSync(arquivo, 'utf8')
		const relativo = arquivo.replace(RAIZ, '')

		// authorize('x:y') e authorize(['x:y', 'z:w'], …)
		for (const [, args] of fonte.matchAll(
			/authorize\(\s*(\[[^\]]*\]|'[^']+')/g
		)) {
			for (const [, id] of args.matchAll(/'([^']+)'/g)) {
				usadas.set(id, relativo)
			}
		}

		// definirPolitica('cards', …) — o bypass da política é `cards:manage`.
		for (const [, recurso] of fonte.matchAll(
			/definirPolitica\(\s*'([^']+)'/g
		)) {
			usadas.set(`${recurso}:manage`, relativo)
		}
	}

	return usadas
}

describe('catálogo de permissões × código', () => {
	it('toda permissão exigida pelo código está no catálogo', async () => {
		const ids = await catalogo()
		const faltando = [...usadasNoCodigo()]
			.filter(([id]) => !ids.has(id))
			.map(([id, arquivo]) => `${id} (${arquivo})`)

		expect(faltando).toEqual([])
	})

	it('toda permissão do catálogo é exigida por algum código', async () => {
		const usadas = usadasNoCodigo()
		const sobrando = [...(await catalogo())].filter(
			id => !usadas.has(id) && !SEM_USO_DIRETO.has(id)
		)

		expect(sobrando).toEqual([])
	})

	it('a varredura acha alguma coisa (o regex não quebrou em silêncio)', () => {
		expect(usadasNoCodigo().size).toBeGreaterThan(10)
	})
})
