import { settings } from 'src/config'
import { logger } from 'src/helpers/_logger.helper'
import { metrics } from 'src/helpers/_metrics.helper'

/**
 * E-mail transacional. Mesma forma do kit de storage e do cache: uma interface,
 * quatro drivers, quem escolhe é o env (`MAIL_DRIVER`).
 *
 * | driver   | para onde vai        | quando                        |
 * |----------|----------------------|-------------------------------|
 * | `ses`    | API HTTP do SESv2    | produção                      |
 * | `resend` | API HTTP do Resend   | produção (alternativa ao SES) |
 * | `log`    | stdout               | dev sem credencial da AWS     |
 * | `memory` | array no processo    | teste (fixado no `settings`)  |
 *
 * Não há SDK: o SESv2 é um POST JSON e a assinatura SigV4 sai do Web Crypto,
 * que o Bun já tem. O `@aws-sdk/client-sesv2` traria dezenas de pacotes para
 * assinar uma requisição.
 */

const encoder = new TextEncoder()

const hex = bytes =>
	[...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')

const sha256 = async texto =>
	hex(await crypto.subtle.digest('SHA-256', encoder.encode(texto)))

async function hmac(chave, dado) {
	const key = await crypto.subtle.importKey(
		'raw',
		chave,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	)

	return new Uint8Array(
		await crypto.subtle.sign('HMAC', key, encoder.encode(dado))
	)
}

/** Chave de assinatura do SigV4: HMAC encadeado data → região → serviço. */
async function chaveDeAssinatura(secret, data, regiao, servico) {
	let chave = encoder.encode(`AWS4${secret}`)
	for (const parte of [data, regiao, servico, 'aws4_request']) {
		chave = await hmac(chave, parte)
	}
	return chave
}

/**
 * Assina e envia um POST para a API do SESv2.
 *
 * Os cabeçalhos assinados são os três mínimos (`content-type`, `host`,
 * `x-amz-date`) mais o token de sessão quando a credencial é temporária —
 * incluir mais só aumenta a chance de divergir entre o que foi assinado e o que
 * o runtime realmente manda.
 */
async function enviarPeloSes({ from, to, subject, html, text }) {
	const {
		AWS_REGION,
		AWS_ACCESS_KEY_ID,
		AWS_SECRET_ACCESS_KEY,
		AWS_SESSION_TOKEN
	} = settings

	const host = `email.${AWS_REGION}.amazonaws.com`
	const path = '/v2/email/outbound-emails'
	const corpo = JSON.stringify({
		FromEmailAddress: from,
		Destination: { ToAddresses: [to] },
		Content: {
			Simple: {
				Subject: { Data: subject, Charset: 'UTF-8' },
				Body: {
					Html: { Data: html, Charset: 'UTF-8' },
					Text: { Data: text, Charset: 'UTF-8' }
				}
			}
		}
	})

	const agora = new Date()
	const amzDate = `${agora.toISOString().replace(/[:-]|\.\d{3}/g, '')}`
	const data = amzDate.slice(0, 8)
	const escopo = `${data}/${AWS_REGION}/ses/aws4_request`
	const hashCorpo = await sha256(corpo)

	const cabecalhos = {
		'content-type': 'application/json',
		host,
		'x-amz-date': amzDate,
		...(AWS_SESSION_TOKEN && { 'x-amz-security-token': AWS_SESSION_TOKEN })
	}
	const assinados = Object.keys(cabecalhos).sort()
	const canonicalHeaders = assinados
		.map(h => `${h}:${cabecalhos[h]}\n`)
		.join('')
	const signedHeaders = assinados.join(';')

	const canonical = [
		'POST',
		path,
		'',
		canonicalHeaders,
		signedHeaders,
		hashCorpo
	].join('\n')

	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amzDate,
		escopo,
		await sha256(canonical)
	].join('\n')

	const chave = await chaveDeAssinatura(
		AWS_SECRET_ACCESS_KEY,
		data,
		AWS_REGION,
		'ses'
	)
	const assinatura = hex(await hmac(chave, stringToSign))

	const resposta = await fetch(`https://${host}${path}`, {
		method: 'POST',
		headers: {
			...cabecalhos,
			authorization: `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${escopo}, SignedHeaders=${signedHeaders}, Signature=${assinatura}`
		},
		body: corpo,
		signal: AbortSignal.timeout(settings.MAIL_TIMEOUT)
	})

	if (!resposta.ok) {
		// O corpo do erro do SES não tem segredo (é código + mensagem), mas o
		// header de autorização tem — por isso só o corpo entra na mensagem.
		const detalhe = await resposta.text().catch(() => '')
		throw new Error(
			`SES respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`
		)
	}

	return resposta.json()
}

async function enviarPeloResend({ from, to, subject, html, text }) {
	const resposta = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${settings.RESEND_API_KEY}`
		},
		body: JSON.stringify({ from, to: [to], subject, html, text }),
		signal: AbortSignal.timeout(settings.MAIL_TIMEOUT)
	})

	if (!resposta.ok) {
		const detalhe = await resposta.text().catch(() => '')
		throw new Error(
			`Resend respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`
		)
	}

	return resposta.json()
}

/** Caixa de saída do driver `memory` — só o teste lê. */
const caixa = []

const drivers = {
	ses: enviarPeloSes,
	resend: enviarPeloResend,
	log: async mensagem => {
		logger.info('mail', {
			to: mensagem.to,
			subject: mensagem.subject,
			text: mensagem.text
		})
	},
	memory: async mensagem => {
		caixa.push(mensagem)
	}
}

/**
 * Envia um e-mail. **Nunca lança**: o envio é efeito colateral do cadastro ou da
 * recuperação de senha, não a operação em si. SES fora do ar não pode transformar
 * um registro bem-sucedido em erro 500 — o que acontece é uma linha de log e um
 * ponto na métrica `app.mail.send{result="error"}`.
 *
 * Quem chama decide o que dizer ao usuário; a resposta dessas rotas é sempre
 * genérica, então não há o que vazar por aqui.
 *
 * @param {object} mensagem
 * @param {string} mensagem.to
 * @param {string} mensagem.subject
 * @param {string} mensagem.html
 * @param {string} mensagem.text
 * @param {string} mensagem.template - nome do template, vira atributo da métrica
 * @returns {Promise<boolean>} se saiu
 */
async function enviar({ to, subject, html, text, template }) {
	const driver = settings.MAIL_DRIVER
	const enviarCom = drivers[driver]

	if (!enviarCom) {
		logger.error('mail: driver desconhecido', { driver })
		metrics.mail.envio({ template, driver, result: 'error' })
		return false
	}

	const from = `${settings.MAIL_FROM_NAME} <${settings.MAIL_FROM}>`

	try {
		await enviarCom({ from, to, subject, html, text })
		metrics.mail.envio({ template, driver, result: 'ok' })
		return true
	} catch (erro) {
		// `to` fica de fora: é PII e a linha de erro não precisa dele para ser
		// diagnosticada — o template e a mensagem do SES bastam.
		logger.error('mail: falha no envio', { template, driver, err: erro })
		metrics.mail.envio({ template, driver, result: 'error' })
		return false
	}
}

/** Só o teste usa: lê e limpa a caixa do driver `memory`. */
const _caixaDeSaida = () => caixa
const _limparCaixa = () => {
	caixa.length = 0
}

export const mailService = {
	enviar,
	_caixaDeSaida,
	_limparCaixa,
	// Exposto para o teste conferir a cadeia de HMAC contra o vetor publicado
	// pela AWS. Errar aqui não dá erro visível: o SES recusa toda chamada e
	// ninguém recebe link de recuperação de senha.
	_chaveDeAssinatura: chaveDeAssinatura,
	_hex: hex
}
