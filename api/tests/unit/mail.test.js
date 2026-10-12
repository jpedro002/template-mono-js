import { beforeEach, describe, expect, it } from 'bun:test'
import { settings } from 'src/config'
import { mailService } from 'src/services/_mail.service'
import { templatesEmail } from 'src/services/_mail-templates'

describe('assinatura SigV4', () => {
	// Vetor publicado pela AWS na documentação do Signature Version 4
	// ("Examples of how to derive a signing key"). Se a cadeia de HMAC divergir,
	// o SES recusa 100% das chamadas — e o sintoma no produto é "não recebi o
	// e-mail", que ninguém liga a uma assinatura errada.
	it('deriva a chave igual ao exemplo da AWS', async () => {
		const chave = await mailService._chaveDeAssinatura(
			'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
			'20150830',
			'us-east-1',
			'iam'
		)

		expect(mailService._hex(chave)).toBe(
			'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9'
		)
	})
})

describe('mailService.enviar', () => {
	beforeEach(() => mailService._limparCaixa())

	it('entrega no driver de memória com o remetente montado', async () => {
		const enviado = await mailService.enviar({
			to: 'alguem@teste.dev',
			...templatesEmail.boasVindas({ nome: 'Alguém' })
		})

		expect(enviado).toBe(true)

		const mensagem = mailService._caixaDeSaida().at(-1)
		expect(mensagem.to).toBe('alguem@teste.dev')
		expect(mensagem.from).toMatch(/^.+ <.+@.+>$/)
		expect(mensagem.subject).toBe('Sua conta está pronta')
	})

	// Envio é efeito colateral do cadastro, não o cadastro: um SES fora do ar não
	// pode transformar um registro bem-sucedido em 500.
	it('devolve false em vez de lançar quando o driver não existe', async () => {
		const anterior = settings.MAIL_DRIVER
		settings.MAIL_DRIVER = 'inexistente'

		try {
			const resultado = await mailService.enviar({
				to: 'alguem@teste.dev',
				...templatesEmail.boasVindas({ nome: 'Alguém' })
			})

			expect(resultado).toBe(false)
		} finally {
			settings.MAIL_DRIVER = anterior
		}
	})

	it('devolve false em vez de lançar quando o SES está fora do ar', async () => {
		const anterior = { driver: settings.MAIL_DRIVER, fetch: globalThis.fetch }
		settings.MAIL_DRIVER = 'ses'
		globalThis.fetch = async () => {
			throw new Error('conexão recusada')
		}

		try {
			const resultado = await mailService.enviar({
				to: 'alguem@teste.dev',
				...templatesEmail.recuperacaoDeSenha({
					nome: 'Alguém',
					token: 'a'.repeat(64)
				})
			})

			expect(resultado).toBe(false)
		} finally {
			settings.MAIL_DRIVER = anterior.driver
			globalThis.fetch = anterior.fetch
		}
	})

	it('envia pelo Resend com Bearer e o corpo esperado', async () => {
		const anterior = {
			driver: settings.MAIL_DRIVER,
			chave: settings.RESEND_API_KEY,
			fetch: globalThis.fetch
		}
		settings.MAIL_DRIVER = 'resend'
		settings.RESEND_API_KEY = 're_teste'
		let chamada
		globalThis.fetch = async (url, init) => {
			chamada = { url, init }
			return new Response('{"id":"1"}', { status: 200 })
		}

		try {
			const resultado = await mailService.enviar({
				to: 'alguem@teste.dev',
				subject: 'Assunto',
				html: '<p>oi</p>',
				text: 'oi',
				template: 'teste'
			})

			expect(resultado).toBe(true)
			expect(chamada.url).toBe('https://api.resend.com/emails')
			expect(chamada.init.headers.authorization).toBe('Bearer re_teste')
			const corpo = JSON.parse(chamada.init.body)
			expect(corpo.to).toEqual(['alguem@teste.dev'])
			expect(corpo.subject).toBe('Assunto')
		} finally {
			settings.MAIL_DRIVER = anterior.driver
			settings.RESEND_API_KEY = anterior.chave
			globalThis.fetch = anterior.fetch
		}
	})
})

describe('templates', () => {
	it('escapa o que vem do usuário no HTML', () => {
		const { html } = templatesEmail.boasVindas({
			nome: '<script>alert(1)</script>'
		})

		expect(html).not.toContain('<script>')
		expect(html).toContain('&lt;script&gt;')
	})

	it('o link de recuperação carrega o token e aponta para o web', () => {
		const { html, text, template } = templatesEmail.recuperacaoDeSenha({
			nome: 'Alguém',
			token: 'a'.repeat(64)
		})

		expect(template).toBe('recuperacao-de-senha')
		expect(html).toContain(`/redefinir-senha?token=${'a'.repeat(64)}`)
		expect(text).toContain(`/redefinir-senha?token=${'a'.repeat(64)}`)
	})

	it('o link de troca de e-mail aponta para a tela de confirmação', () => {
		const { html } = templatesEmail.trocaDeEmail({
			nome: 'Alguém',
			novoEmail: 'novo@teste.dev',
			token: 'b'.repeat(64)
		})

		expect(html).toContain(`/auth/confirmar-email?token=${'b'.repeat(64)}`)
	})
})
