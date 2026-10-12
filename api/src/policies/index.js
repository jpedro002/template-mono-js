import { authorizationService } from 'src/services'

/**
 * Políticas por registro (PBAC) em cima do RBAC.
 *
 * O `authorize('cards:update')` da rota responde "esta pessoa pode editar
 * cards?". A política responde "pode editar **este** card?" — dono, status,
 * recorte. As duas camadas são cumulativas: `can` exige a permissão do RBAC
 * **e** a regra da política.
 *
 *   definirPolitica('cards', {
 *     // regra por ação: (user, registro, ctx) => boolean
 *     update: (user, card) => card.createdById === user.id,
 *     // recorte das listagens: (user, acao, ctx) => where do Prisma | null
 *     escopo: user => ({ createdById: user.id })
 *   })
 *
 * Quem tem `*` ou `<recurso>:manage` passa por cima da política (mas não do
 * RBAC): é o "administrador do recurso".
 *
 * Ações são as mesmas do RBAC (`read`, `create`, `update`, `delete`, ou
 * qualquer outra), então `can(user, 'update', 'cards')` confere `cards:update`.
 */

const politicas = new Map()

/**
 * Registra a política de um recurso. Chamar de novo para o mesmo recurso
 * substitui — um recurso, uma política.
 */
export function definirPolitica(recurso, regras) {
	politicas.set(recurso, regras)
	return regras
}

export function politicaDe(recurso) {
	return politicas.get(recurso) ?? null
}

async function contexto(user, recurso) {
	const permissoes = await authorizationService.getUserPermissions(user.id)
	const ignora =
		permissoes.includes('*') ||
		authorizationService.checkPermissionMatch(`${recurso}:manage`, permissoes)
	return { permissoes, ignora }
}

/**
 * O usuário passa por cima da política de `recurso` (`*` ou `<recurso>:manage`)?
 */
export async function ignoraPolitica(user, recurso) {
	if (!user?.id) return false
	return (await contexto(user, recurso)).ignora
}

/**
 * A política de `recurso` precisa olhar o registro para decidir `acao`? Falso
 * quando não há regra para a ação nem recorte de leitura — aí carregar o
 * registro antes só custaria uma consulta.
 */
export function dependeDoRegistro(recurso, acao) {
	const politica = politicaDe(recurso)
	if (!politica) return false
	return (
		typeof politica[acao] === 'function' ||
		typeof politica.read === 'function' ||
		typeof politica.escopo === 'function'
	)
}

/**
 * O usuário pode `acao` sobre este registro de `recurso`?
 *
 * @param {{id: string}} user
 * @param {string} acao - `read`, `update`, `delete`…
 * @param {string} recurso - prefixo da permissão (`cards`)
 * @param {object} [registro] - linha do banco; regras que dependem do registro
 *   negam quando ele não vem
 * @param {object} [extra] - repassado à regra
 */
export async function can(user, acao, recurso, registro = null, extra = {}) {
	if (!user?.id) return false

	const { permissoes } = await contexto(user, recurso)
	if (
		!authorizationService.checkPermissionMatch(`${recurso}:${acao}`, permissoes)
	) {
		return false
	}

	return permitePolitica(user, acao, recurso, registro, extra)
}

/**
 * Só a regra da política, sem conferir a permissão do RBAC. Para quando o RBAC
 * já foi conferido por outra pergunta — ex.: "este registro é visível?" numa
 * rota de escrita, onde quem tem só `cards:update` não precisa de `cards:read`
 * para achar o registro que vai editar.
 */
export async function permitePolitica(
	user,
	acao,
	recurso,
	registro = null,
	extra = {}
) {
	if (!user?.id) return false

	const { permissoes, ignora } = await contexto(user, recurso)
	if (ignora) return true

	const regra = politicaDe(recurso)?.[acao]
	if (typeof regra !== 'function') return true

	return Boolean(await regra(user, registro, { permissoes, ...extra }))
}

/**
 * Recorte (`where` do Prisma) que a listagem de `recurso` deve aplicar para
 * este usuário. `null` = sem recorte. É o que impede um `GET /` de devolver
 * registros que o `can` negaria um a um.
 */
export async function escopoDe(user, acao, recurso, extra = {}) {
	const escopo = politicaDe(recurso)?.escopo
	if (typeof escopo !== 'function') return null
	if (!user?.id) return { id: { in: [] } }

	const { permissoes, ignora } = await contexto(user, recurso)
	if (ignora) return null

	return (await escopo(user, acao, { permissoes, ...extra })) ?? null
}

/** Erro com status que o `errorHandler` traduz. */
export function negado(statusCode, message) {
	const error = new Error(message)
	error.statusCode = statusCode
	return error
}
