import { describe, expect, it } from 'bun:test'
import { get } from '../helpers/app'

const SPEC = '/docs/openapi.json'

async function spec() {
	const { body } = await get(SPEC)
	return body
}

/** `METHOD /caminho` de todas as rotas publicadas, em ordem estável. */
function inventarioDeRotas(documento) {
	return Object.entries(documento.paths)
		.flatMap(([caminho, verbos]) =>
			Object.keys(verbos).map(verbo => `${verbo.toUpperCase()} ${caminho}`)
		)
		.sort()
}

describe('documento OpenAPI', () => {
	it('é servido em /docs/openapi.json', async () => {
		const { status, headers } = await get(SPEC)

		expect(status).toBe(200)
		expect(headers.get('content-type')).toContain('json')
	})

	it('declara versão e informações da API', async () => {
		const documento = await spec()

		expect(documento.openapi).toMatch(/^3\./)
		expect(documento.info.title).toBeTruthy()
	})

	it('a página do Scalar responde em /docs', async () => {
		const { status, body } = await get('/docs')

		expect(status).toBe(200)
		expect(String(body)).toContain('script')
	})
})

describe('esquema de segurança', () => {
	it('declara autenticação por cookie', async () => {
		const documento = await spec()

		expect(documento.components.securitySchemes.CookieAuth).toMatchObject({
			type: 'apiKey',
			in: 'cookie',
			name: 'access_token'
		})
	})

	it('aplica CookieAuth como padrão do documento', async () => {
		const documento = await spec()

		expect(documento.security).toEqual([{ CookieAuth: [] }])
	})

	it('não sobrou esquema Bearer da autenticação por header', async () => {
		const documento = await spec()

		expect(documento.components.securitySchemes.BearerAuth).toBeUndefined()
		expect(JSON.stringify(documento.security)).not.toContain('Bearer')
	})
})

describe('inventário de rotas', () => {
	it('bate com o instantâneo — qualquer rota criada ou removida quebra aqui', async () => {
		const documento = await spec()

		expect(inventarioDeRotas(documento)).toMatchSnapshot()
	})

	it('publica as rotas de autenticação', async () => {
		const rotas = inventarioDeRotas(await spec())

		expect(rotas).toContain('POST /api/seguranca/auth/session')
		expect(rotas).toContain('GET /api/seguranca/auth/session')
		expect(rotas).toContain('DELETE /api/seguranca/auth/session')
	})

	it('publica o CRUD completo de cards', async () => {
		const rotas = inventarioDeRotas(await spec())

		// A raiz do baseRouter é publicada com barra final.
		expect(rotas).toEqual(
			expect.arrayContaining([
				'GET /api/teste/cards/',
				'GET /api/teste/cards/all',
				'GET /api/teste/cards/{id}',
				'POST /api/teste/cards/',
				'PUT /api/teste/cards/{id}',
				'DELETE /api/teste/cards/{id}'
			])
		)
	})

	it('usa {id} nas rotas irmãs de usuário — restrição do roteador', async () => {
		const rotas = inventarioDeRotas(await spec())

		// A Elysia não aceita dois nomes de parâmetro na mesma posição: como o
		// baseRouter registra /:id, as rotas customizadas precisam usar /:id.
		expect(rotas).toContain('POST /api/seguranca/usuarios/{id}/roles/{roleId}')
		expect(rotas.some(rota => rota.includes('/usuarios/{userId}/roles'))).toBe(
			false
		)
	})
})

describe('schemas Zod convertidos', () => {
	it('o corpo do login documenta email e password', async () => {
		const documento = await spec()
		const corpo =
			documento.paths['/api/seguranca/auth/session'].post.requestBody.content[
				'application/json'
			].schema

		expect(Object.keys(corpo.properties)).toEqual(['email', 'password'])
	})

	it('a resposta do login não expõe token', async () => {
		const documento = await spec()
		const resposta =
			documento.paths['/api/seguranca/auth/session'].post.responses['200']
				.content['application/json'].schema

		expect(JSON.stringify(resposta)).not.toContain('token')
	})

	it('campos de data não quebram a conversão para JSON Schema', async () => {
		const documento = await spec()

		expect(JSON.stringify(documento)).not.toContain(
			'cannot be represented in JSON Schema'
		)
	})
})
