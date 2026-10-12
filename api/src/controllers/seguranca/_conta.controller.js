import { status } from 'elysia'
import { conferirSenha, gerarHashSenha } from 'src/helpers/_senha.helper'
import {
	mailService,
	novaVersaoDeToken,
	prisma,
	sessaoService,
	templatesEmail
} from 'src/services'

const UMA_HORA = 60 * 60 * 1000
const UM_DIA = 24 * UMA_HORA

/**
 * Token de link enviado por e-mail. O valor cru só existe na mensagem; o banco
 * guarda apenas o sha256. Quem lê o banco não consegue redefinir senha nem
 * confirmar e-mail de ninguém.
 */
function novoToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32))
	const cru = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')

	return { cru, hash: hashToken(cru) }
}

function hashToken(cru) {
	return new Bun.CryptoHasher('sha256').update(cru).digest('hex')
}

function contaController() {
	/**
	 * Pede o link de redefinição.
	 *
	 * A resposta é a **mesma** para e-mail cadastrado e não cadastrado: variar a
	 * mensagem transforma o formulário em consulta de "quem tem conta aqui".
	 */
	const forgotPassword = async ({ body }) => {
		const email = body.email.toLowerCase().trim()

		const usuario = await prisma.User.findFirst({
			where: { email, active: true, deletedAt: null },
			select: { id: true, name: true, email: true }
		})

		if (usuario) {
			const { cru, hash } = novoToken()

			// Pedido novo invalida o anterior: dois links válidos ao mesmo tempo
			// dobram a janela de quem interceptou o primeiro e-mail.
			await prisma.$transaction([
				prisma.passwordResetToken.deleteMany({
					where: { userId: usuario.id, usedAt: null }
				}),
				prisma.passwordResetToken.create({
					data: {
						userId: usuario.id,
						tokenHash: hash,
						expiresAt: new Date(Date.now() + UMA_HORA)
					}
				})
			])

			await mailService.enviar({
				to: usuario.email,
				...templatesEmail.recuperacaoDeSenha({ nome: usuario.name, token: cru })
			})
		}

		return {
			message:
				'Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.'
		}
	}

	/**
	 * Redefine a senha com o token do e-mail.
	 *
	 * O token é marcado como usado na mesma transação da troca — sem isso o mesmo
	 * link redefiniria a senha quantas vezes quisessem, e ele vive numa caixa de
	 * e-mail por tempo indeterminado.
	 */
	const resetPassword = async ({ body }) => {
		// Validade conferida no banco: o `expiresAt` lido de volta sai recuado 3 h
		// pelo `adjustTimezone` e todo token pareceria vencido.
		const registro = await prisma.passwordResetToken.findFirst({
			where: {
				tokenHash: hashToken(body.token.trim()),
				usedAt: null,
				expiresAt: { gt: new Date() }
			},
			select: { id: true, userId: true }
		})

		if (!registro) {
			return status(422, {
				error: 'Unprocessable Entity',
				message:
					'Link inválido ou expirado. Solicite uma nova redefinição de senha.'
			})
		}

		const hash = await gerarHashSenha(body.password)

		await prisma.$transaction([
			// Recuperar a senha encerra toda sessão aberta: quem pede o link
			// muitas vezes é quem desconfia que outra pessoa entrou na conta.
			prisma.User.update({
				where: { id: registro.userId },
				data: { password_hash: hash, ...novaVersaoDeToken() }
			}),
			prisma.passwordResetToken.update({
				where: { id: registro.id },
				data: { usedAt: new Date() }
			})
		])
		await sessaoService.invalidar(registro.userId)

		return {
			message: 'Senha redefinida com sucesso. Você já pode fazer login.'
		}
	}

	/**
	 * Pede a troca do e-mail da conta. O link vai para o **novo** endereço — é a
	 * prova de que quem pediu tem acesso a ele.
	 *
	 * Exige a senha atual: sem isso, uma sessão sequestrada troca o e-mail da
	 * conta e o dono perde o caminho de recuperação.
	 */
	const requestEmailChange = async ({ user, body }) => {
		const novoEmail = body.new_email.toLowerCase().trim()

		const atual = await prisma.User.findUnique({
			where: { id: user.id, deletedAt: null },
			select: { name: true, email: true, password_hash: true }
		})

		if (!atual) {
			return status(404, { error: 'Usuário não encontrado' })
		}

		if (!(await conferirSenha(body.password, atual.password_hash))) {
			return status(401, {
				error: 'Unauthorized',
				message: 'Senha incorreta.'
			})
		}

		if (novoEmail === atual.email) {
			return status(422, {
				error: 'Unprocessable Entity',
				message: 'Este já é o e-mail da sua conta.'
			})
		}

		const emUso = await prisma.User.findFirst({
			where: { OR: [{ email: novoEmail }, { login: novoEmail }] },
			select: { id: true }
		})

		if (emUso) {
			return status(422, {
				error: 'Unprocessable Entity',
				message: 'Este e-mail já está em uso.'
			})
		}

		const { cru, hash } = novoToken()
		const expiraEm = new Date(Date.now() + UM_DIA)
		const agora = new Date()

		await prisma.$transaction([
			prisma.email_change_tokens.deleteMany({ where: { user_id: user.id } }),
			prisma.email_change_tokens.create({
				data: {
					user_id: user.id,
					new_email: novoEmail,
					token_hash: hash,
					expires_at: expiraEm,
					created_at: agora,
					updated_at: agora
				}
			})
		])

		await mailService.enviar({
			to: novoEmail,
			...templatesEmail.trocaDeEmail({
				nome: atual.name,
				novoEmail,
				token: cru
			})
		})

		return {
			message: 'Enviamos um e-mail de confirmação para o novo endereço.',
			new_email: novoEmail,
			expires_at: expiraEm
		}
	}

	/**
	 * Reenvia a confirmação do e-mail **atual**, para quem tem
	 * `emailVerifiedAt` nulo — a conta migrada do sistema anterior nasceu assim,
	 * e é `emailVerifiedAt` que a tela de segurança exige antes de deixar trocar
	 * a senha.
	 *
	 * Reaproveita `email_change_tokens` com `new_email` igual ao atual: a
	 * confirmação é a mesma rota e o mesmo efeito colateral que interessa aqui
	 * (`emailVerifiedAt = agora`). Uma tabela só para isto guardaria a mesma
	 * linha com outro nome.
	 *
	 * Não pede senha, ao contrário da troca: não muda nada e o link vai para o
	 * endereço que já está na conta, então não existe o sequestro de e-mail que
	 * lá a senha impede. Apaga o pedido de troca pendente, se houver — dois
	 * destinos vivos para o mesmo token deixariam o desfecho na ordem de clique.
	 */
	const requestEmailVerification = async ({ user }) => {
		const atual = await prisma.User.findUnique({
			where: { id: user.id, deletedAt: null },
			select: { name: true, email: true, emailVerifiedAt: true }
		})

		if (!atual) {
			return status(404, { error: 'Usuário não encontrado' })
		}

		if (atual.emailVerifiedAt) {
			return status(422, {
				error: 'Unprocessable Entity',
				message: 'Este e-mail já está verificado.'
			})
		}

		const { cru, hash } = novoToken()
		const expiraEm = new Date(Date.now() + UM_DIA)
		const agora = new Date()

		await prisma.$transaction([
			prisma.email_change_tokens.deleteMany({ where: { user_id: user.id } }),
			prisma.email_change_tokens.create({
				data: {
					user_id: user.id,
					new_email: atual.email,
					token_hash: hash,
					expires_at: expiraEm,
					created_at: agora,
					updated_at: agora
				}
			})
		])

		await mailService.enviar({
			to: atual.email,
			...templatesEmail.verificacaoDeEmail({
				nome: atual.name,
				email: atual.email,
				token: cru
			})
		})

		return {
			message: 'Enviamos um link de confirmação para o seu e-mail.',
			email: atual.email,
			expires_at: expiraEm
		}
	}

	/**
	 * Confirma a troca com o token do e-mail. Rota pública: o link costuma ser
	 * aberto no cliente de e-mail, que pode nem ser o browser da sessão.
	 *
	 * Limite conhecido: o JWT já emitido continua valendo com o e-mail antigo no
	 * payload até expirar — token stateless não se revoga. O `id` não muda, então
	 * a autorização segue correta; o que fica velho é o `email` do token, que
	 * nenhuma decisão usa.
	 */
	const confirmEmailChange = async ({ body }) => {
		const registro = await prisma.email_change_tokens.findFirst({
			where: {
				token_hash: hashToken(body.token.trim()),
				expires_at: { gt: new Date() }
			},
			select: { id: true, user_id: true, new_email: true }
		})

		if (!registro) {
			return status(422, {
				error: 'Unprocessable Entity',
				message: 'Token inválido ou expirado.'
			})
		}

		// Alguém pode ter cadastrado o endereço entre o pedido e a confirmação.
		const emUso = await prisma.User.findFirst({
			where: {
				OR: [{ email: registro.new_email }, { login: registro.new_email }],
				NOT: { id: registro.user_id }
			},
			select: { id: true }
		})

		if (emUso) {
			return status(422, {
				error: 'Unprocessable Entity',
				message: 'Este e-mail já está em uso.'
			})
		}

		// Token emitido por `/email/verify/request` carrega o endereço que já está
		// na conta: ali nada muda, só se marca como verificado. É o mesmo token e
		// o mesmo update — o que muda é o que se diz a quem clicou.
		const dono = await prisma.User.findUnique({
			where: { id: registro.user_id },
			select: { email: true }
		})
		const apenasVerificacao = dono?.email === registro.new_email

		const [usuario] = await prisma.$transaction([
			prisma.User.update({
				where: { id: registro.user_id },
				data: { email: registro.new_email, emailVerifiedAt: new Date() },
				select: { id: true, email: true }
			}),
			prisma.email_change_tokens.delete({ where: { id: registro.id } })
		])

		return {
			message: apenasVerificacao
				? 'E-mail verificado com sucesso.'
				: 'E-mail atualizado com sucesso. Faça login novamente com o novo endereço.',
			id: usuario.id,
			email: usuario.email
		}
	}

	/** Cancela o pedido pendente — o link enviado deixa de valer. */
	const cancelEmailChange = async ({ user }) => {
		const { count } = await prisma.email_change_tokens.deleteMany({
			where: { user_id: user.id }
		})

		return {
			message:
				count > 0
					? 'O pedido de alteração de e-mail foi cancelado. O link enviado deixou de ser válido.'
					: 'Não havia nenhum pedido de alteração de e-mail pendente.',
			had_pending_request: count > 0
		}
	}

	return {
		forgotPassword,
		resetPassword,
		requestEmailChange,
		requestEmailVerification,
		confirmEmailChange,
		cancelEmailChange
	}
}

export { contaController }
