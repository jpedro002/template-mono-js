import { prisma } from 'src/services'

/**
 * Inativar e reativar como dois verbos.
 *
 * Um único endpoint que alterna o estado ("interruptor") deixa quem clica sem
 * saber se vai apagar ou restaurar. Aqui são dois verbos: `DELETE` inativa e
 * `PATCH /:id/ativar` reativa.
 *
 * Mora num arquivo só porque todo recurso com soft delete usa o mesmo par —
 * copiado, o conserto do próximo detalhe teria de acontecer em cada um.
 */

/**
 * Como o recurso guarda "inativo". São três formas no banco, não uma, e a
 * diferença não é cosmética: reativar pelo campo errado devolve o registro
 * invisível por outro motivo.
 */

/** Soft delete em snake_case (`deleted_at`). */
const porDeletedAt = {
	filtroAtivo: { deleted_at: null },
	selecao: { deleted_at: true },
	inativo: linha => linha.deleted_at !== null,
	dadosInativar: () => ({ deleted_at: new Date() }),
	dadosReativar: () => ({ deleted_at: null, updated_at: new Date() })
}

/**
 * `User`: soft delete em camelCase **e** `active: false` na mesma tacada.
 * Reativar só o `deletedAt` traria o usuário de volta às listagens já sem poder
 * entrar, e sem nada na tela explicando por quê.
 */
const porDeletedAtEActive = {
	filtroAtivo: { deletedAt: null },
	selecao: { deletedAt: true },
	inativo: linha => linha.deletedAt !== null,
	dadosInativar: () => ({ deletedAt: new Date(), active: false }),
	dadosReativar: () => ({ deletedAt: null, active: true })
}

/**
 * `Role` e `Permission` não têm coluna de soft delete — desligam pelo `active`
 * que o `authorizationService` já lê ao montar as permissões da sessão. É por
 * isso que aqui `DELETE` não apaga: `user_roles` e `role_permissions` têm
 * `ON DELETE CASCADE`, então apagar uma role a removeria de todos os usuários
 * que a tinham, em silêncio e sem desfazer.
 */
const porActive = {
	filtroAtivo: { active: true },
	selecao: { active: true },
	inativo: linha => linha.active === false,
	dadosInativar: () => ({ active: false }),
	dadosReativar: () => ({ active: true })
}

/**
 * Predicado de leitura do `baseController`, para usar **no lugar** de
 * `softDelete: true`.
 *
 * A troca não é estilo: o filtro de soft delete do `baseController` é
 * incondicional, então a flag de query nunca seria lida e o registro inativado
 * não teria caminho nenhum na tela — ninguém enxerga o que precisa reativar.
 * Quem apaga continua fazendo soft delete, no `del` daqui.
 *
 * A flag é `incluir_inativas`/`incluir_inativos` conforme o gênero do recurso.
 * @param {string} chaveDaQuery
 * @param {object} [estado] - uma das formas acima; `deleted_at` por padrão
 * @returns {(ctx: object|null) => object}
 */
function leituraComInativos(chaveDaQuery, estado = porDeletedAt) {
	return ctx => (ctx?.query?.[chaveDaQuery] === true ? {} : estado.filtroAtivo)
}

/**
 * As duas metades do interruptor.
 *
 * @param {string} model - nome do model no Prisma
 * @param {object} params
 * @param {object} [params.select] - o mesmo `select` do controller, para o
 *   `ativar` devolver a linha na forma que a listagem já conhece
 * @param {object} [params.omit] - alternativa ao `select` para o controller que
 *   lê a tabela inteira menos alguns campos (é o caso de `User`, que esconde o
 *   hash da senha); o Prisma recusa os dois juntos
 * @param {{naoEncontrado: string, jaAtivo: string}} params.mensagens - frases
 *   prontas, e não um rótulo: "localizado" e "ativo" concordam com o gênero do
 *   recurso e não há como montá-las a partir do nome
 * @param {(ctx: {tx: object, id: bigint|string, ctx: object}) => Promise<void>} [params.aoReativar]
 *   - guarda extra, dentro da mesma transação da reativação (por exemplo,
 *   recusar a reativação de um registro cuja dependência foi removida)
 * @param {object} [params.estado] - uma das formas acima; `deleted_at` por padrão
 * @param {(id: string) => bigint|string} [params.idDe] - models com id BigInt
 *   precisam de conversão; os de uuid vão crus
 * @returns {{del: Function, ativar: Function}}
 */
function ativacaoDe(
	model,
	{
		select = null,
		omit = null,
		mensagens,
		aoReativar = null,
		estado = porDeletedAt,
		idDe = BigInt
	}
) {
	const projecao = select ? { select } : omit ? { omit } : {}

	// Registro já inativo cai em P2025, que o errorHandler traduz em 404 — não
	// em "apagado de novo".
	const del = async ({ params, set }) => {
		await prisma[model].update({
			where: { id: idDe(params.id), ...estado.filtroAtivo },
			data: estado.dadosInativar()
		})

		set.status = 204
		return null
	}

	const ativar = async ctx => {
		const id = idDe(ctx.params.id)

		const linha = await prisma[model].findUnique({
			where: { id },
			select: { id: true, ...estado.selecao }
		})

		if (!linha) throw erroDeAtivacao(mensagens.naoEncontrado, 404)
		if (!estado.inativo(linha)) throw erroDeAtivacao(mensagens.jaAtivo, 422)

		const data = await prisma.$transaction(async tx => {
			if (aoReativar) await aoReativar({ tx, id, ctx })

			return tx[model].update({
				where: { id },
				data: estado.dadosReativar(),
				...projecao
			})
		})

		return { data }
	}

	return { del, ativar }
}

/**
 * @param {string} mensagem
 * @param {number} statusCode
 * @returns {Error}
 */
function erroDeAtivacao(mensagem, statusCode) {
	const error = new Error(mensagem)
	error.statusCode = statusCode
	return error
}

export {
	ativacaoDe,
	erroDeAtivacao,
	leituraComInativos,
	porActive,
	porDeletedAt,
	porDeletedAtEActive
}
