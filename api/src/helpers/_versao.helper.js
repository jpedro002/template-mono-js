import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Commit que está rodando. Na imagem Docker não existe `.git` — o build grava
 * `versao.json` (ver `scripts/versao.js`). Em dev lê o `.git` direto, então
 * `GET /version` mostra o commit local sem passo extra.
 */
function lerGit(raiz) {
	const git = join(raiz, '.git')
	if (!existsSync(join(git, 'HEAD'))) return null

	const head = readFileSync(join(git, 'HEAD'), 'utf8').trim()
	if (!head.startsWith('ref: ')) return { commit: head, branch: null }

	const ref = head.slice(5)
	const branch = ref.replace('refs/heads/', '')
	const solto = join(git, ref)
	if (existsSync(solto)) {
		return { commit: readFileSync(solto, 'utf8').trim(), branch }
	}

	const empacotado = join(git, 'packed-refs')
	if (!existsSync(empacotado)) return null
	const linha = readFileSync(empacotado, 'utf8')
		.split('\n')
		.find(l => l.endsWith(` ${ref}`))
	return linha ? { commit: linha.split(' ')[0], branch } : null
}

function carregar(raiz = process.cwd()) {
	const arquivo = join(raiz, 'versao.json')
	if (existsSync(arquivo)) return JSON.parse(readFileSync(arquivo, 'utf8'))

	const git = lerGit(raiz)
	return {
		commit: git?.commit ?? process.env.GIT_COMMIT ?? null,
		branch: git?.branch ?? null,
		build_em: null
	}
}

const versao = carregar()

export { carregar as carregarVersao, lerGit, versao }
