/**
 * Permissões que nenhum coringa (`*`, `recurso:*`, `*:acao`) concede: só valem
 * quando o identificador exato é atribuído a um perfil ou usuário. Útil para
 * telas em protótipo ou recursos que nem o Superadmin deve ver por padrão.
 */
export const PERMISSOES_SO_EXPLICITAS = []

export const soExplicita = identifier =>
	PERMISSOES_SO_EXPLICITAS.includes(identifier)
