import { settings } from 'src/config'
import { cache } from 'src/services/_cache.service'
import { prisma } from 'src/services/_prisma.service'

/**
 * Estado de sessão do usuário: o que torna o JWT revogável.
 *
 * O token é stateless — sozinho, ele vale até expirar, mesmo para usuário
 * desativado ou que trocou a senha. O `jwtPlugin` confere a cada requisição o
 * `tv` assinado no token contra `users.token_version`; incrementar a versão
 * derruba **todas** as sessões abertas do usuário de uma vez.
 *
 * A leitura passa por um cache curto (`SESSAO_CACHE_TTL`, 30 s) para não somar
 * uma consulta a toda requisição. Toda mudança chama `invalidar`, então na
 * instância que fez a mudança a revogação vale na hora; nas outras, com o
 * driver `memory`, em até 30 s — com `CACHE_DRIVER=redis` o cache é um só e vale
 * na hora em todas.
 */

const cacheSessao = cache.namespace('sessao:user', {
	ttl: settings.SESSAO_CACHE_TTL
})

/** Fragmento de `data` que derruba as sessões abertas. */
export const novaVersaoDeToken = () => ({ tokenVersion: { increment: 1 } })

async function estado(userId) {
	return cacheSessao.wrap(userId, async () => {
		const linha = await prisma.user.findFirst({
			where: { id: userId },
			select: {
				active: true,
				deletedAt: true,
				tokenVersion: true,
				requiresRelogin: true
			}
		})
		// `null` não é guardado pelo `wrap` (só `undefined` não é), então usuário
		// inexistente também fica no cache — e é negado do mesmo jeito.
		return linha
			? {
					active: linha.active !== false,
					deletedAt: linha.deletedAt ?? null,
					tokenVersion: linha.tokenVersion ?? 0,
					requiresRelogin: linha.requiresRelogin === true
				}
			: null
	})
}

/**
 * A sessão deste payload ainda vale? Falso para usuário inexistente, inativo,
 * excluído, marcado para novo login ou com versão de token defasada.
 */
async function valida(payload) {
	if (!payload?.id) return false

	const atual = await estado(payload.id)
	if (!atual) return false
	if (!atual.active || atual.deletedAt) return false
	if (atual.requiresRelogin) return false

	return (payload.tv ?? 0) === atual.tokenVersion
}

function invalidar(userId) {
	return cacheSessao.del(userId)
}

/**
 * Derruba todas as sessões do usuário. Recebe `tx` para entrar na transação de
 * quem chama (auditoria junto); quem chama invalida o cache depois do commit.
 */
function revogar(tx, userId) {
	return tx.user.update({
		where: { id: userId },
		data: novaVersaoDeToken(),
		select: { id: true, tokenVersion: true }
	})
}

export const sessaoService = { estado, valida, invalidar, revogar }
