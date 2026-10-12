import { createApp } from 'src/app'

let app = null

/** A app é construída uma vez: `createApp()` é caro e não guarda estado. */
export function getApp() {
	if (!app) app = createApp()
	return app
}

/**
 * Executa uma requisição pelo `handle` da Elysia — ciclo de vida completo
 * (derive, validação, beforeHandle, onError, onAfterResponse) sem abrir porta.
 *
 * @param {string} path caminho com querystring, ex: '/api/teste/cards?page=2'
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {any} [options.body] serializado como JSON, exceto `FormData`, que vai
 *   cru para o runtime montar o `multipart/form-data` com o boundary correto
 * @param {string} [options.cookie] header `Cookie` completo
 * @param {object} [options.headers]
 */
export async function request(path, options = {}) {
	const { method = 'GET', body, cookie, headers = {} } = options

	const init = { method, headers: new Headers(headers) }

	if (body instanceof FormData) {
		// Definir content-type na mão quebraria o boundary gerado pelo Request.
		init.body = body
	} else if (body !== undefined) {
		init.headers.set('content-type', 'application/json')
		init.body = typeof body === 'string' ? body : JSON.stringify(body)
	}
	if (cookie) init.headers.set('cookie', cookie)

	const response = await getApp().handle(
		new Request(new URL(path, 'http://localhost'), init)
	)

	const contentType = response.headers.get('content-type') || ''
	let parsed = null
	if (response.status !== 204) {
		const text = await response.text()
		if (text) parsed = contentType.includes('json') ? JSON.parse(text) : text
	}

	return {
		status: response.status,
		body: parsed,
		headers: response.headers,
		cookies: response.headers.getSetCookie?.() || [],
		raw: response
	}
}

export const get = (path, options) =>
	request(path, { ...options, method: 'GET' })
export const post = (path, body, options) =>
	request(path, { ...options, method: 'POST', body })
export const put = (path, body, options) =>
	request(path, { ...options, method: 'PUT', body })
export const del = (path, options) =>
	request(path, { ...options, method: 'DELETE' })

/** Quebra um `Set-Cookie` em `{ name, value, httponly, samesite, ... }`. */
export function parseSetCookie(header) {
	const [pair, ...attributes] = header.split(';').map(part => part.trim())
	const separator = pair.indexOf('=')

	const result = {
		name: pair.slice(0, separator),
		value: pair.slice(separator + 1)
	}

	for (const attribute of attributes) {
		const index = attribute.indexOf('=')
		if (index === -1) result[attribute.toLowerCase()] = true
		else
			result[attribute.slice(0, index).toLowerCase()] = attribute.slice(
				index + 1
			)
	}

	return result
}
