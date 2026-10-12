/**
 * Trilha de auditoria das mudanças de acesso (`seguranca.authz_audit`).
 *
 * Sempre gravada **na mesma transação** da mudança: auditoria escrita depois
 * pode faltar justamente quando a mudança deu certo e o processo caiu em
 * seguida. Por isso `registrar` recebe o `tx` e devolve a promessa da escrita —
 * nunca abre transação própria.
 *
 * Diferente do log de acesso (que tem o `body` de toda mutação), aqui a linha é
 * estruturada e consultável por alvo, autor e ação: "quem deu `*` para fulano?"
 * é uma consulta, não um grep em 90 dias de log.
 */

export const ACOES_AUDITORIA = [
	'role.assign',
	'role.revoke',
	'permission.grant',
	'permission.revoke',
	'role.create',
	'role.update',
	'role.delete',
	'role.permissions.set',
	'user.sessions.revoke',
	'user.deactivate',
	'user.delete'
]

/**
 * @param {object} tx - client do Prisma dentro da transação
 * @param {object} dados
 * @param {string|null} dados.actorId
 * @param {string} dados.action - um de `ACOES_AUDITORIA`
 * @param {string} [dados.targetUserId]
 * @param {string} [dados.roleId]
 * @param {string} [dados.permissionId]
 * @param {object} [dados.before]
 * @param {object} [dados.after]
 */
function registrar(tx, dados) {
	if (!ACOES_AUDITORIA.includes(dados.action)) {
		throw new Error(`Ação de auditoria desconhecida: ${dados.action}`)
	}

	return tx.authzAudit.create({
		data: {
			actorId: dados.actorId ?? null,
			action: dados.action,
			targetUserId: dados.targetUserId ?? null,
			roleId: dados.roleId ?? null,
			permissionId: dados.permissionId ?? null,
			before: dados.before ?? undefined,
			after: dados.after ?? undefined
		}
	})
}

export const auditoriaService = { registrar }
