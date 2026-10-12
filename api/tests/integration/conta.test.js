import { beforeEach, describe, expect, it } from 'bun:test'
import { mailService } from 'src/services'
import { post } from '../helpers/app'
import { IDS, loginAs, SENHA_PADRAO } from '../helpers/auth'
import { prismaMock } from '../helpers/prisma-mock'

const FORGOT = '/api/seguranca/auth/forgot-password'
const RESET = '/api/seguranca/auth/reset-password'
const TROCA_PEDIR = '/api/seguranca/auth/email/change/request'
const TROCA_CONFIRMAR = '/api/seguranca/auth/email/change/confirm'
const TROCA_CANCELAR = '/api/seguranca/auth/email/change/cancel'

const hashDe = cru => new Bun.CryptoHasher('sha256').update(cru).digest('hex')

/** Lê o token do link no corpo do último e-mail da caixa de memória. */
function tokenDoUltimoEmail() {
	const email = mailService._caixaDeSaida().at(-1)
	return /token=([a-f0-9]{64})/.exec(email.text)?.[1]
}

beforeEach(() => {
	mailService._limparCaixa()
	// Nenhum usuário existente por padrão: quem testa colisão re-mocka.
	prismaMock.User.findFirst.mockResolvedValue(null)
	prismaMock.User.create.mockResolvedValue({
		id: IDS.user,
		email: 'novo@teste.dev',
		login: 'novo@teste.dev',
		name: 'Novo Usuário'
	})
})

describe(`POST ${FORGOT}`, () => {
	it('manda o e-mail e grava só o hash do token', async () => {
		prismaMock.User.findFirst.mockResolvedValue({
			id: IDS.user,
			name: 'Usuário',
			email: 'usuario@teste.dev'
		})

		const { status } = await post(FORGOT, { email: 'Usuario@Teste.dev' })

		expect(status).toBe(200)
		expect(mailService._caixaDeSaida()).toHaveLength(1)

		const cru = tokenDoUltimoEmail()
		expect(cru).toHaveLength(64)

		const gravado = prismaMock.passwordResetToken.create.mock.calls.at(-1)[0]
		expect(gravado.data.tokenHash).toBe(hashDe(cru))
		// O valor cru nunca vai para o banco.
		expect(gravado.data.tokenHash).not.toBe(cru)
	})

	// Variar a resposta transformaria o formulário em consulta de quem tem conta.
	it('responde igual para e-mail não cadastrado e não manda e-mail', async () => {
		prismaMock.User.findFirst.mockResolvedValue(null)

		const cadastrado = await post(FORGOT, { email: 'usuario@teste.dev' })
		mailService._limparCaixa()
		const desconhecido = await post(FORGOT, { email: 'ninguem@teste.dev' })

		expect(desconhecido.status).toBe(cadastrado.status)
		expect(desconhecido.body).toEqual(cadastrado.body)
		expect(mailService._caixaDeSaida()).toHaveLength(0)
	})

	it('invalida o pedido anterior antes de criar outro', async () => {
		prismaMock.User.findFirst.mockResolvedValue({
			id: IDS.user,
			name: 'Usuário',
			email: 'usuario@teste.dev'
		})

		await post(FORGOT, { email: 'usuario@teste.dev' })

		const apagados =
			prismaMock.passwordResetToken.deleteMany.mock.calls.at(-1)[0]
		expect(apagados.where).toEqual({ userId: IDS.user, usedAt: null })
	})
})

describe(`POST ${RESET}`, () => {
	const tokenCru = 'a'.repeat(64)

	it('troca a senha e marca o token como usado', async () => {
		prismaMock.passwordResetToken.findFirst.mockResolvedValue({
			id: 'tok-1',
			userId: IDS.user
		})

		const { status } = await post(RESET, {
			token: tokenCru,
			password: 'senha-nova-12345'
		})

		expect(status).toBe(200)

		// A busca é pelo hash, nunca pelo valor do link.
		const busca = prismaMock.passwordResetToken.findFirst.mock.calls.at(-1)[0]
		expect(busca.where.tokenHash).toBe(hashDe(tokenCru))

		const marcado = prismaMock.passwordResetToken.update.mock.calls.at(-1)[0]
		expect(marcado.data.usedAt).toBeInstanceOf(Date)
	})

	// Uso e validade são conferidos no banco: o `expiresAt` lido de volta passa
	// pelo `adjustTimezone` (-3 h) e comparado em JS todo token parecia vencido.
	// O link fica numa caixa de e-mail para sempre: sem `usedAt` ele redefiniria
	// a senha quantas vezes quisessem.
	it('filtra token usado e vencido na consulta', async () => {
		prismaMock.passwordResetToken.findFirst.mockResolvedValue({
			id: 'tok-1',
			userId: IDS.user
		})

		await post(RESET, { token: tokenCru, password: 'senha-nova-12345' })

		const { where } =
			prismaMock.passwordResetToken.findFirst.mock.calls.at(-1)[0]
		expect(where.usedAt).toBeNull()
		expect(where.expiresAt.gt).toBeInstanceOf(Date)
	})

	it('recusa token inexistente, usado ou vencido', async () => {
		prismaMock.passwordResetToken.findFirst.mockResolvedValue(null)
		prismaMock.User.update.mockClear()

		const { status } = await post(RESET, {
			token: tokenCru,
			password: 'senha-nova-12345'
		})

		expect(status).toBe(422)
		expect(prismaMock.User.update).not.toHaveBeenCalled()
	})
})

describe('troca de e-mail', () => {
	it('manda a confirmação para o novo endereço, não para o atual', async () => {
		const { cookie } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue({
			name: 'Usuário',
			email: 'usuario@teste.dev',
			password_hash: (await loginAs()).usuario.password_hash
		})
		prismaMock.User.findFirst.mockResolvedValue(null)

		const { status, body } = await post(
			TROCA_PEDIR,
			{ new_email: 'Novo@Teste.dev', password: SENHA_PADRAO },
			{ cookie }
		)

		expect(status).toBe(200)
		expect(body.new_email).toBe('novo@teste.dev')
		expect(mailService._caixaDeSaida().at(-1).to).toBe('novo@teste.dev')
	})

	// Sem a senha atual: sessão sequestrada trocava o e-mail e o dono
	// perdia o caminho de recuperação.
	it('recusa o pedido com senha errada', async () => {
		const { cookie, usuario } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue({
			name: usuario.name,
			email: usuario.email,
			password_hash: usuario.password_hash
		})
		mailService._limparCaixa()

		const { status } = await post(
			TROCA_PEDIR,
			{ new_email: 'novo@teste.dev', password: 'errada' },
			{ cookie }
		)

		expect(status).toBe(401)
		expect(mailService._caixaDeSaida()).toHaveLength(0)
	})

	it('recusa e-mail já usado por outro usuário', async () => {
		const { cookie, usuario } = await loginAs()
		prismaMock.User.findUnique.mockResolvedValue({
			name: usuario.name,
			email: usuario.email,
			password_hash: usuario.password_hash
		})
		prismaMock.User.findFirst.mockResolvedValue({ id: IDS.outro })

		const { status } = await post(
			TROCA_PEDIR,
			{ new_email: 'ocupado@teste.dev', password: SENHA_PADRAO },
			{ cookie }
		)

		expect(status).toBe(422)
	})

	it('confirma pelo hash do token e marca o e-mail como verificado', async () => {
		const tokenCru = 'b'.repeat(64)
		prismaMock.email_change_tokens.findFirst.mockResolvedValue({
			id: 7n,
			user_id: IDS.user,
			new_email: 'novo@teste.dev'
		})
		prismaMock.User.findFirst.mockResolvedValue(null)
		prismaMock.User.update.mockResolvedValue({
			id: IDS.user,
			email: 'novo@teste.dev'
		})

		const { status, body } = await post(TROCA_CONFIRMAR, { token: tokenCru })

		expect(status).toBe(200)
		expect(body.email).toBe('novo@teste.dev')

		const busca = prismaMock.email_change_tokens.findFirst.mock.calls.at(-1)[0]
		expect(busca.where.token_hash).toBe(hashDe(tokenCru))

		const atualizado = prismaMock.User.update.mock.calls.at(-1)[0]
		expect(atualizado.data.emailVerifiedAt).toBeInstanceOf(Date)
	})

	// Alguém pode ter cadastrado o endereço entre o pedido e a confirmação.
	it('recusa a confirmação se o e-mail foi ocupado no meio do caminho', async () => {
		prismaMock.email_change_tokens.findFirst.mockResolvedValue({
			id: 7n,
			user_id: IDS.user,
			new_email: 'novo@teste.dev'
		})
		prismaMock.User.findFirst.mockResolvedValue({ id: IDS.outro })
		prismaMock.User.update.mockClear()

		const { status } = await post(TROCA_CONFIRMAR, { token: 'c'.repeat(64) })

		expect(status).toBe(422)
		expect(prismaMock.User.update).not.toHaveBeenCalled()
	})

	it('confirmação é pública — não exige cookie', async () => {
		prismaMock.email_change_tokens.findFirst.mockResolvedValue(null)

		const { status } = await post(TROCA_CONFIRMAR, { token: 'd'.repeat(64) })

		expect(status).toBe(422)
	})

	it('cancelar apaga o pendente e informa se havia algum', async () => {
		const { cookie } = await loginAs()
		prismaMock.email_change_tokens.deleteMany.mockResolvedValue({ count: 1 })

		const { status, body } = await post(TROCA_CANCELAR, undefined, { cookie })

		expect(status).toBe(200)
		expect(body.had_pending_request).toBe(true)
	})

	it('cancelar exige autenticação', async () => {
		expect((await post(TROCA_CANCELAR)).status).toBe(401)
	})
})
