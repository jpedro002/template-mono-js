import { Navigate, useParams } from 'react-router'
import { useAuthPermissions } from 'src/contexts/auth-context'
import { temPermissoes } from 'src/lib/permissions'

/**
 * Segundo degrau do gate das páginas `[id].jsx` que servem `/novo` e `/:id`.
 *
 * O `export const permissao` é lido em build e vale para a rota `/:id` inteira
 * — não sabe se o `:id` é `novo`. Por isso essas páginas declaram a união
 * (`x:create` **ou** `x:update`), e sozinha ela deixava quem só tem update
 * abrir o formulário de criação (o `POST` cobra create) e vice-versa. Este
 * wrapper decide pelo `:id`: `novo` exige `criar`, o resto exige `editar`
 * (todas as da lista — a edição carrega por `GET /:id`, que cobra `x:read`).
 *
 * Fica **por fora** da página pelo mesmo motivo do `PermissionRoute`: negado,
 * o componente da página nem monta, e nenhum hook dela dispara consulta que a
 * API recusaria.
 */
export function comGateNovoOuEdicao(Pagina, { criar, editar }) {
	function GateNovoOuEdicao() {
		const { id } = useParams()
		const permissoes = useAuthPermissions()
		const exigidas = id === 'novo' ? criar : editar

		if (!temPermissoes(exigidas, permissoes, { todas: true })) {
			return <Navigate to='/404' replace />
		}

		return <Pagina />
	}

	return GateNovoOuEdicao
}
