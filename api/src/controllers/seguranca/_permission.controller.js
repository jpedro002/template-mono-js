import { status } from 'elysia'
import { baseController } from 'src/controllers'
import {
	ativacaoDe,
	leituraComInativos,
	porActive
} from 'src/controllers/_ativacao.js'
import { authorizationService, prisma } from 'src/services'

const select = {
	id: true,
	identifier: true,
	name: true,
	description: true,
	category: true,
	active: true
}

// `listByCategory` já escondia a permissão inativa; a listagem principal não —
// a mesma permissão aparecia numa tela e sumia na outra. Agora as duas partem
// de `active: true`, e a flag de query é o que traz as inativas de volta.
const base = baseController('Permission', {
	select,
	where: leituraComInativos('incluir_inativas', porActive)
})

/**
 * `DELETE` inativa, `PATCH /:id/ativar` religa — não apaga. Mesmo motivo da
 * role: `role_permissions` e `user_permissions` cascateiam, então apagar uma
 * permissão a retiraria de toda role e de todo usuário sem aviso. `active` é o
 * que o `authorizationService` já lê ao montar a sessão.
 */
const { del, ativar } = ativacaoDe('Permission', {
	select,
	estado: porActive,
	idDe: id => id,
	mensagens: {
		naoEncontrado: 'Permissão não localizada.',
		jaAtivo: 'A permissão já está ativa.'
	}
})

// `recurso:ação`, sem coringa. `*`, `recurso:*` e `*:ação` são concedidos, não
// criados: uma permissão chamada `*` é acesso total para toda role que a tiver.
const IDENTIFICADOR = /^[a-z0-9_-]+:[a-z0-9_-]+$/

const identificadorInvalido = () =>
	status(400, {
		error: 'Identificador inválido',
		message: 'Identificador deve seguir padrão: "recurso:ação", sem coringa'
	})

/**
 * PUT - Atualizar permissão. O identificador não muda: é por ele que as rotas
 * cobram (`authorize('users:read')`), então renomear uma permissão que um
 * perfil já tem para outra — ou para `*` — dava a esse perfil o acesso da nova.
 */
const put = async ctx => {
	const { params, body } = ctx
	const atual = await prisma.permission.findUnique({
		where: { id: params.id },
		select: { identifier: true }
	})
	if (!atual) {
		return status(404, { error: 'Permissão não encontrada' })
	}
	if (body.identifier !== undefined && body.identifier !== atual.identifier) {
		return status(422, {
			error: 'Identificador imutável',
			message:
				'O identificador de uma permissão não pode ser alterado; crie outra'
		})
	}

	// Desligar/religar por aqui (`active`) muda a sessão de quem a tem.
	const data = await base.put(ctx)
	authorizationService.clearCache()
	return data
}

/**
 * POST - Criar nova permissão
 */
const post = async ({ body }) => {
	const { identifier, name, description, category } = body

	if (!identifier || !IDENTIFICADOR.test(identifier)) {
		return identificadorInvalido()
	}

	const permission = await authorizationService.createPermission({
		identifier,
		name,
		description,
		category
	})

	return status(201, permission)
}

/**
 * GET - Listar permissões por categoria
 */
const listByCategory = async ({ params }) => {
	const { category } = params

	return prisma.permission.findMany({
		where: { category, active: true },
		select
	})
}

export const permissionController = () => ({
	...base,
	post,
	put,
	del,
	ativar,
	listByCategory
})
