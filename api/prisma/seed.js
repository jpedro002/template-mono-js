// Seed base: permissões, roles e o primeiro usuário SUPER_ADMIN.
//
// Idempotente — rodar de novo só atualiza nome/categoria das permissões e
// realinha as permissões das roles base. Nunca troca a senha de um usuário que
// já existe.
//
//   bun run seed                       # ou: bunx prisma db seed
//   SEED_DEMO=true bun run seed        # + cards de exemplo
//
// Permissões: todo `prisma/permissions_*.js` que exporte `PERMISSIONS` entra
// automaticamente (o gerador `plop` cria um por model). Não há lista para manter.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'
import { PrismaClient } from './generated/prisma/client'

const PRODUCAO = process.env.NODE_ENV === 'production'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

// Roles base. `permissoes`:
//   '*'       → só a permissão coringa (acesso total)
//   'todas'   → todas as permissões do catálogo, exceto o coringa
//   string[]  → lista explícita
// `requireAdmin` do middleware aceita ADMIN e SUPER_ADMIN pelo nome — não
// renomeie sem ajustar `src/middleware/_authorization.middleware.js` e
// `NOMES_ACESSO_TOTAL` no web.
const ROLES = [
	{
		name: 'SUPER_ADMIN',
		description: 'Acesso total, inclusive a permissões criadas depois',
		order: 1,
		permissoes: '*'
	},
	{
		name: 'ADMIN',
		description: 'Administra usuários, roles e todos os módulos',
		order: 2,
		permissoes: 'todas'
	},
	{
		name: 'USUARIO',
		description: 'Usuário comum, somente leitura',
		order: 3,
		permissoes: ['cards:read']
	}
]

async function carregarCatalogo() {
	const pasta = import.meta.dir
	const arquivos = readdirSync(pasta)
		.filter(f => /^permissions_.+\.js$/.test(f))
		.sort()

	const catalogo = new Map()
	for (const arquivo of arquivos) {
		const { PERMISSIONS } = await import(join(pasta, arquivo))
		if (!Array.isArray(PERMISSIONS)) {
			throw new Error(`${arquivo} não exporta PERMISSIONS (array)`)
		}
		for (const p of PERMISSIONS) catalogo.set(p.identifier, p)
	}
	return [...catalogo.values()]
}

async function seedPermissoes(catalogo) {
	for (const p of catalogo) {
		await db.permission.upsert({
			where: { identifier: p.identifier },
			update: { name: p.name, category: p.category },
			create: {
				identifier: p.identifier,
				name: p.name,
				category: p.category,
				description: p.description
			}
		})
	}
	console.log(`🔐 ${catalogo.length} permissões`)
}

function identificadoresDa(role, catalogo) {
	if (role.permissoes === '*') return ['*']
	if (role.permissoes === 'todas') {
		return catalogo.map(p => p.identifier).filter(id => id !== '*')
	}
	return role.permissoes
}

async function seedRoles(catalogo) {
	for (const config of ROLES) {
		const role = await db.role.upsert({
			where: { name: config.name },
			update: { description: config.description, order: config.order },
			create: {
				name: config.name,
				description: config.description,
				order: config.order
			}
		})

		const identificadores = identificadoresDa(config, catalogo)
		const permissoes = await db.permission.findMany({
			where: { identifier: { in: identificadores } },
			select: { id: true, identifier: true }
		})
		const faltando = identificadores.filter(
			id => !permissoes.some(p => p.identifier === id)
		)
		if (faltando.length) {
			throw new Error(
				`Role ${config.name} referencia permissões fora do catálogo: ${faltando.join(', ')}`
			)
		}

		// Realinha a role base ao que está declarado aqui. Concessões manuais
		// em roles base se perdem — crie roles próprias para isso.
		await db.$transaction([
			db.rolePermission.deleteMany({ where: { roleId: role.id } }),
			db.rolePermission.createMany({
				data: permissoes.map(p => ({ roleId: role.id, permissionId: p.id }))
			})
		])
	}
	console.log(`👥 ${ROLES.length} roles (${ROLES.map(r => r.name).join(', ')})`)
}

async function seedAdmin() {
	const email = process.env.SEED_ADMIN_EMAIL || 'admin@admin.com'
	const login = process.env.SEED_ADMIN_LOGIN || 'admin'
	const name = process.env.SEED_ADMIN_NAME || 'Administrador'
	const senha = process.env.SEED_ADMIN_PASSWORD

	const existente = await db.user.findFirst({
		where: { OR: [{ email }, { login }] },
		select: { id: true, email: true }
	})

	const user =
		existente ??
		(await db.user.create({
			data: {
				email,
				login,
				name,
				password_hash: await bcrypt.hash(senha || '123456', 10),
				emailVerifiedAt: new Date()
			},
			select: { id: true, email: true }
		}))

	const superAdmin = await db.role.findUniqueOrThrow({
		where: { name: 'SUPER_ADMIN' }
	})
	await db.userRole.upsert({
		where: { userId_roleId: { userId: user.id, roleId: superAdmin.id } },
		update: {},
		create: { userId: user.id, roleId: superAdmin.id }
	})

	if (existente) {
		console.log(`👤 admin já existia: ${user.email} (senha mantida)`)
	} else {
		console.log(`👤 admin criado: ${user.email}`)
		if (!senha) {
			console.warn('⚠️  senha padrão "123456" — defina SEED_ADMIN_PASSWORD')
		}
	}
}

async function seedDemo() {
	if (process.env.SEED_DEMO !== 'true') return
	if (PRODUCAO) {
		console.warn('⚠️  SEED_DEMO ignorado em produção')
		return
	}
	if ((await db.card.count()) > 0) {
		console.log('🃏 cards de exemplo já existem')
		return
	}
	await db.card.createMany({
		data: [
			{ title: 'Bem-vindo', description: 'Card de exemplo do template.' },
			{ title: 'CRUD', description: 'Edite ou exclua para testar a tela.' },
			{ title: 'Permissões', description: 'cards:create/read/update/delete' }
		]
	})
	console.log('🃏 3 cards de exemplo')
}

// Falha antes de gravar qualquer coisa: seed pela metade em produção é pior
// que seed nenhum.
function validarAmbiente() {
	const senha = process.env.SEED_ADMIN_PASSWORD
	if (PRODUCAO && (!senha || senha.length < 12)) {
		throw new Error(
			'Em produção SEED_ADMIN_PASSWORD é obrigatória (mínimo 12 caracteres).'
		)
	}
}

async function main() {
	validarAmbiente()
	console.log('🌱 seed\n')
	const catalogo = await carregarCatalogo()
	await seedPermissoes(catalogo)
	await seedRoles(catalogo)
	await seedAdmin()
	await seedDemo()
	console.log('\n✨ pronto')
}

main()
	.catch(e => {
		console.error('❌', e.message)
		process.exitCode = 1
	})
	.finally(() => db.$disconnect())
