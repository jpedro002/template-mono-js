// Roda no build da imagem: grava o commit em `versao.json`, porque o `.git` não
// vai para o runtime. `GIT_COMMIT` (build arg) vence quando o `.git` não veio
// no contexto.
import { writeFileSync } from 'node:fs'
import { lerGit } from '../src/helpers/_versao.helper.js'

const git = lerGit(process.argv[2] ?? process.cwd())

writeFileSync(
	'versao.json',
	JSON.stringify({
		commit: process.env.GIT_COMMIT || git?.commit || null,
		branch: git?.branch ?? null,
		build_em: new Date().toISOString()
	})
)
console.log(
	'versao.json',
	git?.commit ?? process.env.GIT_COMMIT ?? 'sem commit'
)
