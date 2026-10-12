/**
 * Espelho do `checkPermissionMatch` da API
 * (`src/services/_authorization.service.js`).
 *
 * Divergir daqui é pior do que não ter gate nenhum: o menu passa a mostrar
 * link que a API responde 403, ou a esconder tela que o usuário poderia abrir.
 * Qualquer mudança na regra do back tem que descer para cá junto.
 */
/**
 * Telas em protótipo: nenhum coringa concede, nem `*`. Espelho de
 * `PERMISSOES_SO_EXPLICITAS` da API (`src/helpers/_permissoes-explicitas.js`).
 */
export const PERMISSOES_SO_EXPLICITAS = []

/**
 * Recursos de segurança: `*:acao` não os alcança, só `*` ou o recurso nomeado.
 * Espelho de `SEGURANCA_RECURSOS` da API (`src/services/_authorization.service.js`).
 */
export const SEGURANCA_RECURSOS = ['users', 'roles', 'permissions', 'auditoria']

export function temPermissao(requerida, permissoes = []) {
	// Item de menu sem permissão declarada é público dentro da área logada.
	if (!requerida) return true

	if (permissoes.includes(requerida)) return true
	if (PERMISSOES_SO_EXPLICITAS.includes(requerida)) return false
	if (permissoes.includes('*')) return true

	const [recurso, acao] = requerida.split(':')
	if (!recurso || !acao) return false

	if (permissoes.includes(`${recurso}:*`)) return true
	if (SEGURANCA_RECURSOS.includes(recurso)) return false
	return permissoes.includes(`*:${acao}`)
}

/**
 * @param {string|string[]} requeridas
 * @param {string[]} permissoes
 * @param {{ todas?: boolean }} [opcoes] - `todas` exige o conjunto inteiro
 */
export function temPermissoes(requeridas, permissoes = [], opcoes = {}) {
	const lista = Array.isArray(requeridas) ? requeridas : [requeridas]
	if (lista.length === 0) return true

	return opcoes.todas
		? lista.every((p) => temPermissao(p, permissoes))
		: lista.some((p) => temPermissao(p, permissoes))
}

/**
 * Acesso total é a permissão `*`, não o nome de um perfil: renomear a role não
 * pode mudar quem enxerga o quê. `roles` fica na assinatura só por
 * compatibilidade com quem já chama assim.
 */
export function temAcessoTotal(permissoes = [], _roles = []) {
	return permissoes.includes('*')
}

/**
 * Espelho da contenção de escalada da API (`controllers/seguranca/_contencao.js`):
 * só atribui ou retira um perfil quem cobre **cada** permissão dele. Identificador
 * que começa com `*` (`*`, `*:read`) só `*` cobre.
 */
export function podeConcederPerfil(role, permissoes = [], _roles = []) {
	if (permissoes.includes('*')) return true
	return (role?.rolePermissions ?? []).every(({ permission }) => {
		const identifier = permission?.identifier ?? ''
		return !identifier.startsWith('*') && temPermissao(identifier, permissoes)
	})
}
