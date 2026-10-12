import { settings } from 'src/config'

/**
 * Corpo dos e-mails transacionais. Cada template devolve
 * `{ subject, html, text, template }` — o `template` é o atributo da métrica
 * `app.mail.send`, por isso é constante e não interpolado.
 *
 * HTML deliberadamente simples e com estilo inline: cliente de e-mail não tem
 * `<style>` confiável nem CSS externo, e o que este projeto precisa é que o
 * link chegue clicável, não um layout.
 */

const escapar = texto =>
	String(texto)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')

const layout = ({ titulo, paragrafos, botao, aviso }) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
	<h1 style="font-size:20px;margin:0 0 16px">${escapar(titulo)}</h1>
	${paragrafos.map(p => `<p style="line-height:1.6;margin:0 0 12px">${escapar(p)}</p>`).join('')}
	${
		botao
			? `<p style="margin:24px 0"><a href="${escapar(botao.url)}" style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapar(botao.rotulo)}</a></p>
	<p style="font-size:12px;color:#6b7280;line-height:1.6;word-break:break-all">Se o botão não funcionar, copie este endereço no navegador:<br>${escapar(botao.url)}</p>`
			: ''
	}
	${aviso ? `<p style="font-size:12px;color:#6b7280;line-height:1.6;margin-top:24px">${escapar(aviso)}</p>` : ''}
</div>`

const url = (caminho, token) =>
	`${settings.APP_URL}${caminho}?token=${encodeURIComponent(token)}`

export const templatesEmail = {
	/** Link para confirmar o novo endereço, enviado **para o novo endereço**. */
	trocaDeEmail: ({ nome, novoEmail, token }) => {
		const link = url('/auth/confirmar-email', token)

		return {
			template: 'troca-de-email',
			subject: 'Confirme seu novo e-mail',
			html: layout({
				titulo: 'Confirme seu novo e-mail',
				paragrafos: [
					`Olá, ${nome}.`,
					`Recebemos um pedido para trocar o e-mail da sua conta para ${novoEmail}. Confirme para concluir.`
				],
				botao: { rotulo: 'Confirmar e-mail', url: link },
				aviso:
					'O link vale por 24 horas. Se não foi você, ignore esta mensagem — nada muda sem a confirmação.'
			}),
			text: `Olá, ${nome}.\n\nConfirme a troca do e-mail da sua conta para ${novoEmail} abrindo o endereço abaixo:\n\n${link}\n\nO link vale por 24 horas. Se não foi você, ignore esta mensagem.`
		}
	},

	/**
	 * Link para confirmar o endereço **que já está** na conta. Mesmo token e
	 * mesma tela de confirmação da troca — o que muda é o texto: aqui nada é
	 * alterado, só se marca o e-mail como verificado.
	 */
	verificacaoDeEmail: ({ nome, email, token }) => {
		const link = url('/auth/confirmar-email', token)

		return {
			template: 'verificacao-de-email',
			subject: 'Confirme seu e-mail',
			html: layout({
				titulo: 'Confirme seu e-mail',
				paragrafos: [
					`Olá, ${nome}.`,
					`Confirme que ${email} é seu para concluir a verificação da sua conta. Nada muda no seu cadastro.`
				],
				botao: { rotulo: 'Confirmar e-mail', url: link },
				aviso:
					'O link vale por 24 horas. Se não foi você, ignore esta mensagem.'
			}),
			text: `Olá, ${nome}.\n\nConfirme que ${email} é seu abrindo o endereço abaixo:\n\n${link}\n\nO link vale por 24 horas. Se não foi você, ignore esta mensagem.`
		}
	},

	/** Link de redefinição, enviado para o endereço atual da conta. */
	recuperacaoDeSenha: ({ nome, token }) => {
		const link = url('/redefinir-senha', token)

		return {
			template: 'recuperacao-de-senha',
			subject: 'Redefinição de senha',
			html: layout({
				titulo: 'Redefinir sua senha',
				paragrafos: [
					`Olá, ${nome}.`,
					'Recebemos um pedido para redefinir a senha da sua conta.'
				],
				botao: { rotulo: 'Redefinir senha', url: link },
				aviso:
					'O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore esta mensagem — sua senha continua a mesma.'
			}),
			text: `Olá, ${nome}.\n\nRedefina a senha da sua conta abrindo o endereço abaixo:\n\n${link}\n\nO link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore esta mensagem.`
		}
	},

	/** Confirmação de cadastro concluído — sem link, é só aviso. */
	boasVindas: ({ nome }) => ({
		template: 'boas-vindas',
		subject: 'Sua conta está pronta',
		html: layout({
			titulo: 'Conta criada',
			paragrafos: [
				`Olá, ${nome}.`,
				'Seu cadastro foi concluído e você já pode entrar com o e-mail e a senha que acabou de definir.'
			],
			botao: { rotulo: 'Entrar', url: `${settings.APP_URL}/login` }
		}),
		text: `Olá, ${nome}.\n\nSeu cadastro foi concluído. Entre em ${settings.APP_URL}/login com o e-mail e a senha que você definiu.`
	})
}
