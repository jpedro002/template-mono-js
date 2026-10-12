// Varre as rotas atrás de `authorize(...)`, compara com a tabela
// `seguranca.permissions` e insere o que falta.
//
//   bun scripts/sync-permissoes.js            # só o diff (não escreve nada)
//   bun scripts/sync-permissoes.js --apply    # insere as que faltam
//   bun scripts/sync-permissoes.js --apply --ativar-orfas
//
// A fonte da verdade é o **código**: uma permissão citada num `authorize()` que
// não existe no banco nunca é concedida a ninguém, e a rota responde 403 para
// todo mundo que não tem `*` — falha silenciosa que só aparece em produção.
//
// O catálogo (`prisma/permissions_*.js`) entra só para
// herdar `name`/`category` já escritos à mão; quando o identificador não está em
// lugar nenhum, os dois são inferidos do próprio `resource:action`.
//
// O que este script **não** faz: vincular permissão a perfil. Quem decide quem
// recebe é o seed ou a API de roles — dar acesso
// automático a perfil seria escalada de privilégio por efeito colateral.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../prisma/generated/prisma/client'

const RAIZ_CODIGO = ['src']
const RAIZ_CATALOGO = 'prisma'

const APLICAR = process.argv.includes('--apply')
const ATIVAR_ORFAS = process.argv.includes('--ativar-orfas')

const ACOES = {
	read: 'Visualizar',
	create: 'Criar',
	update: 'Atualizar',
	delete: 'Excluir',
	manage: 'Gerenciar',
	assign: 'Atribuir',
	revoke: 'Revogar',
	import: 'Importar',
	export: 'Exportar',
	executar: 'Executar',
	'*': 'Todas as ações de'
}

function arquivosJs(dir, saida = []) {
	for (const entrada of readdirSync(dir)) {
		const caminho = join(dir, entrada)
		if (statSync(caminho).isDirectory()) {
			if (entrada === 'node_modules' || entrada === 'generated') continue
			arquivosJs(caminho, saida)
		} else if (extname(entrada) === '.js') {
			saida.push(caminho)
		}
	}
	return saida
}

// `authorize('a:b')`, `authorize(['a:b', 'c:d'])`, `authorize('a:b', { ... })`.
// Pega o argumento até o parêntese que fecha e colhe toda string ali dentro que
// tenha a forma `recurso:acao` — o `{ requireAll: true }` não casa e some.
function permissoesDoCodigo() {
	const usos = new Map()

	for (const raiz of RAIZ_CODIGO) {
		for (const arquivo of arquivosJs(raiz)) {
			const fonte = readFileSync(arquivo, 'utf8')
			const re = /\bauthorize\(/g
			let m = re.exec(fonte)

			while (m) {
				let i = m.index + m[0].length
				let profundidade = 1
				while (i < fonte.length && profundidade > 0) {
					if (fonte[i] === '(') profundidade++
					else if (fonte[i] === ')') profundidade--
					i++
				}
				const argumento = fonte.slice(m.index + m[0].length, i - 1)

				for (const [, id] of argumento.matchAll(
					/['"`]([a-z0-9_-]+:[a-z0-9_*-]+)['"`]/gi
				)) {
					if (!usos.has(id)) usos.set(id, new Set())
					usos.get(id).add(arquivo.replaceAll('\\', '/'))
				}

				m = re.exec(fonte)
			}
		}
	}

	return usos
}

// Lê `identifier`/`name`/`category` dos arquivos de seed sem importá-los: cada
// um instancia um PrismaClient no topo, e importar 20 deles abriria 20 clientes
// para ler três strings.
function catalogoDeclarado() {
	const catalogo = new Map()
	const arquivos = readdirSync(RAIZ_CATALOGO)
		.filter(f => f.startsWith('permissions_'))
		.map(f => join(RAIZ_CATALOGO, f))

	for (const arquivo of arquivos) {
		const fonte = readFileSync(arquivo, 'utf8')
		for (const [, corpo] of fonte.matchAll(/\{([^{}]*identifier:[^{}]*)\}/g)) {
			const id = corpo.match(/identifier:\s*['"]([^'"]+)['"]/)?.[1]
			if (!id) continue
			catalogo.set(id, {
				identifier: id,
				name: corpo.match(/name:\s*['"]([^'"]+)['"]/)?.[1],
				category: corpo.match(/category:\s*['"]([^'"]+)['"]/)?.[1],
				arquivo: arquivo.replaceAll('\\', '/')
			})
		}
	}

	return catalogo
}

function inferir(identifier) {
	const [recurso, acao] = identifier.split(':')
	const legivel = recurso.replaceAll('_', ' ')
	return {
		name: `${ACOES[acao] ?? acao} ${legivel}`,
		category: recurso
	}
}

async function main() {
	const usos = permissoesDoCodigo()
	const catalogo = catalogoDeclarado()

	const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
	const db = new PrismaClient({ adapter })

	const noBanco = new Map(
		(await db.permission.findMany()).map(p => [p.identifier, p])
	)

	const faltando = []
	const inativas = []
	for (const [id, arquivos] of usos) {
		const existente = noBanco.get(id)
		if (!existente) {
			const declarada = catalogo.get(id)
			const inferida = inferir(id)
			faltando.push({
				identifier: id,
				name: declarada?.name ?? inferida.name,
				category: declarada?.category ?? inferida.category,
				origem: declarada ? declarada.arquivo : 'inferido',
				usadaEm: [...arquivos]
			})
		} else if (!existente.active) {
			inativas.push(id)
		}
	}

	const orfas = [...noBanco.keys()].filter(
		id => id !== '*' && !usos.has(id) && !catalogo.has(id)
	)
	const semRota = [...catalogo.keys()].filter(
		id => !usos.has(id) && noBanco.has(id)
	)

	console.log(`\n📋 ${usos.size} permissões citadas em authorize()`)
	console.log(`🗄️  ${noBanco.size} permissões no banco`)
	console.log(`📚 ${catalogo.size} permissões declaradas no catálogo\n`)

	if (faltando.length === 0) {
		console.log('✅ Nada faltando: todo authorize() tem permissão no banco.')
	} else {
		console.log(`❌ ${faltando.length} faltando no banco:`)
		for (const p of faltando) {
			console.log(`   + ${p.identifier}  [${p.category}] "${p.name}"`)
			console.log(`     origem: ${p.origem}`)
			console.log(`     usada em: ${p.usadaEm.join(', ')}`)
		}
	}

	if (inativas.length) {
		console.log(
			`\n⚠️  ${inativas.length} usadas em rota mas com active=false (a rota nega): ${inativas.join(', ')}`
		)
	}

	if (semRota.length) {
		console.log(
			`\nℹ️  ${semRota.length} no catálogo sem authorize() no código (tela ou rota esquecida):`
		)
		console.log(`   ${semRota.join(', ')}`)
	}

	if (orfas.length) {
		console.log(
			`\n🧹 ${orfas.length} no banco sem catálogo e sem authorize() — inclui permissões de **tela**, que decidem menu e não endpoint. Não remova sem conferir:`
		)
		console.log(`   ${orfas.join(', ')}`)
	}

	if (!APLICAR) {
		console.log('\n(dry-run — rode com --apply para inserir)')
		await db.$disconnect()
		return
	}

	for (const p of faltando) {
		await db.permission.upsert({
			where: { identifier: p.identifier },
			update: {},
			create: {
				identifier: p.identifier,
				name: p.name,
				category: p.category,
				active: true
			}
		})
		console.log(`   ✔ inserida ${p.identifier}`)
	}

	if (ATIVAR_ORFAS && inativas.length) {
		await db.permission.updateMany({
			where: { identifier: { in: inativas } },
			data: { active: true }
		})
		console.log(`   ✔ ${inativas.length} reativadas`)
	}

	console.log(
		`\n✨ ${faltando.length} inseridas. Vincule a um perfil pelo seed ou pela API de roles — este script não concede acesso a ninguém.`
	)

	await db.$disconnect()
}

main().catch(async e => {
	console.error('❌', e)
	process.exit(1)
})
