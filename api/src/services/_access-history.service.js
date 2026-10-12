import { logger } from 'src/helpers/_logger.helper'
import { metrics } from 'src/helpers/_metrics.helper'
import { prisma } from 'src/services/_prisma.service'

/**
 * Histórico de login/logout (`seguranca.user_access_history`).
 *
 * Tudo aqui roda **depois** da resposta já ter saído, então nenhuma falha pode
 * virar exceção: o cliente já foi embora e derrubar o hook só produziria um erro
 * sem dono. Falhou, vira linha de log.
 *
 * A sessão é identificada pelo `jti` do JWT — é o que permite fechar no logout
 * exatamente a linha aberta naquele login, sem estado no servidor.
 */
async function recordLogin({ userId, jti }) {
	if (!userId) return

	const agora = new Date()

	try {
		await prisma.user_access_history.create({
			data: {
				user_id: userId,
				jti,
				login_at: agora,
				created_at: agora,
				updated_at: agora
			}
		})
	} catch (err) {
		logger.error('falha ao registrar login no histórico de acesso', {
			err,
			userId
		})
	}
}

async function recordLogout({ userId, jti }) {
	// Sem `jti` não dá para saber qual linha fechar: token de antes desta versão
	// ou logout sem sessão. Fechar "a última aberta do usuário" erraria em quem
	// tem duas sessões (browser + celular).
	if (!jti) return

	try {
		const sessao = await prisma.user_access_history.findFirst({
			where: { jti, logout_at: null },
			select: { id: true, login_at: true },
			orderBy: { login_at: 'desc' }
		})

		if (!sessao) return

		const agora = new Date()
		const duracao = Math.max(
			0,
			Math.round((agora.getTime() - sessao.login_at.getTime()) / 1000)
		)

		await prisma.user_access_history.update({
			where: { id: sessao.id },
			data: {
				logout_at: agora,
				session_duration: duracao,
				updated_at: agora
			}
		})

		// Contado aqui, e não no handler de logout, porque só aqui se sabe que uma
		// sessão foi de fato fechada: `DELETE /session` sem cookie válido também
		// responde 200 e não deve entrar na conta.
		metrics.auth.logout()
		metrics.auth.sessaoFechada(duracao)
	} catch (err) {
		logger.error('falha ao fechar sessão no histórico de acesso', {
			err,
			userId
		})
	}
}

export const accessHistoryService = { recordLogin, recordLogout }
export default accessHistoryService
