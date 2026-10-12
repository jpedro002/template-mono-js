import { Prisma } from '../../prisma/generated/prisma/client'
import { logger } from './_logger.helper'

/**
 * Normaliza erros de validação da Elysia (Standard Schema / Zod)
 */
function getValidationErrors(error) {
	// ValidationError da Elysia: `all` traz um item por issue do schema
	if (Array.isArray(error.all)) {
		return error.all.map(issue => ({
			field: issue.path?.replace(/^\//, '').replace(/\//g, '.') || error.type,
			message: issue.message || issue.summary,
			keyword: error.type,
			received: issue.value !== undefined ? typeof issue.value : 'desconhecido',
			expected: error.expected ? typeof error.expected : 'informação ausente'
		}))
	}
	// Fallback se vier um ZodError direto (fora do ciclo de vida da Elysia)
	if (error.issues) {
		return error.issues.map(issue => ({
			field: issue.path?.join('.') || 'campo',
			message: issue.message,
			keyword: issue.code,
			received: issue.type || 'desconhecido',
			expected: issue.message
		}))
	}
	return []
}

/**
 * Rótulo do erro a partir do status. Só é usado quando nenhum ramo específico
 * definiu um: erro de regra de negócio nasce como `Error` com `statusCode`, e
 * sem isto todos eles saíam rotulados "Erro Interno".
 */
function rotuloDoStatus(statusCode) {
	const rotulos = {
		400: 'Requisição Inválida',
		401: 'Não Autorizado',
		403: 'Acesso Negado',
		404: 'Não Encontrado',
		409: 'Conflito de Dados',
		413: 'Arquivo Muito Grande',
		422: 'Regra de Negócio',
		429: 'Limite Excedido'
	}
	return rotulos[statusCode] || (statusCode >= 500 ? 'Erro Interno' : 'Erro')
}

/**
 * Handler global de erros — registrado via `.onError()` na instância raiz.
 *
 * **403 é falta de papel; 404 é registro fora do alcance.** Quem decide é o
 * `authorize` do middleware — "você não tem `users:update`" —, e nenhum
 * controller precisa emitir 403 para dizer que um id não é do usuário: dizer
 * "existe, mas não é seu" é contar que existe, e a resposta tem de ser a mesma
 * do id que não existe (mesmo status **e** mesma mensagem).
 *
 * Fora da regra, e de propósito: estado de negócio sobre um recurso que **é**
 * do usuário — prazo de edição vencido, registro já publicado — continua 403.
 *
 * @param {import('elysia').ErrorContext} ctx
 */
export function errorHandler({ code, error, set, path, request, reqId }) {
	// 1. Definição inicial de Status e Mensagem
	let statusCode = error?.statusCode || 500
	let message = error?.message || 'Erro interno do servidor.'
	// O rótulo sai do status, não de um default fixo: erro de regra de negócio é
	// lançado como `Error` com `statusCode` (`erro('...', 422)` dos controllers) e caía aqui como "Erro Interno" — a resposta dizia 422 no corpo e
	// "Erro Interno" no rótulo, e é o rótulo que a tela mostra ao usuário.
	let errorType = rotuloDoStatus(statusCode)
	let details = null

	// 2. Tratamento de Validação (Zod / Elysia)
	if (code === 'VALIDATION') {
		// Validação de resposta = contrato do servidor quebrado, não do cliente.
		if (error.type === 'response') {
			statusCode = 500
			errorType = 'Erro de Serialização'
			message = 'A resposta do servidor não corresponde ao schema definido.'
			if (process.env.NODE_ENV === 'development') {
				details = { errors: getValidationErrors(error) }
			}
		} else {
			statusCode = 400
			errorType = 'Erro de Validação'
			message = 'Os dados enviados contêm erros de validação.'
			const validationErrors = getValidationErrors(error)

			details = {
				totalErrors: validationErrors.length,
				errors: validationErrors,
				hint: 'Verifique os campos listados acima. Certifique-se de enviar um objeto JSON válido no corpo da requisição.'
			}
		}
	}

	// 3. Tratamento de Erros do Prisma
	else if (error instanceof Prisma.PrismaClientKnownRequestError) {
		// Mapeamento de erros comuns do Prisma para Status HTTP corretos
		switch (error.code) {
			case 'P2025': // Registro não encontrado
				statusCode = 404
				errorType = 'Não Encontrado'
				message = 'O registro solicitado não foi encontrado.'
				break
			case 'P2002': // Violação de Unique (ex: email duplicado)
				statusCode = 409
				errorType = 'Conflito de Dados'
				message = `Violação de restrição única no campo: ${error.meta?.target || 'desconhecido'}`
				break
			case 'P2003': // Violação de Foreign Key
				statusCode = 400
				errorType = 'Erro de Integridade'
				message = 'A operação viola um relacionamento de dados existente.'
				break
			default:
				// Mantém 500 para erros desconhecidos de banco, mas formata a mensagem
				message = `Erro no banco de dados: ${error.message.split('\n').pop()}`
		}
	}

	// 4. Erros do storage S3-like
	// 502 e não 500: credencial ou bucket quebrado é dependência nossa fora do
	// ar, não pedido inválido do cliente — e é isso que o alerta precisa ver.
	// A mensagem para o cliente é genérica; o detalhe fica no log.
	else if (error?.name === 'S3Error') {
		const mapa = {
			NoSuchKey: [404, 'Não Encontrado', 'Arquivo não encontrado no storage.'],
			NoSuchBucket: [502, 'Storage Indisponível', 'Bucket inexistente.'],
			AccessDenied: [
				502,
				'Storage Indisponível',
				'Credencial de storage recusada.'
			],
			EntityTooLarge: [
				413,
				'Arquivo Muito Grande',
				'O arquivo excede o limite aceito pelo storage.'
			]
		}
		const [mapeado, tipo, texto] = mapa[error.code] || [
			502,
			'Storage Indisponível',
			'Falha ao acessar o storage de arquivos.'
		]
		statusCode = mapeado
		errorType = tipo
		message = texto
	}

	// 5. Rota inexistente / corpo malformado
	else if (code === 'NOT_FOUND') {
		statusCode = 404
		errorType = 'Não Encontrado'
		message = 'Rota não encontrada.'
	} else if (code === 'PARSE') {
		statusCode = 400
		errorType = 'Erro de Parsing'
		message = 'Não foi possível interpretar o corpo da requisição.'
	}

	// 5. Logging (Essencial para debug)
	// 5xx é falha nossa e sai com stack; 4xx é erro do cliente e vira warn enxuto.
	const logFields = {
		reqId,
		code,
		statusCode,
		method: request?.method,
		path
	}

	if (statusCode >= 500) {
		logger.error('erro não tratado', { ...logFields, err: error })
	} else if (code === 'VALIDATION') {
		// A mensagem crua do erro é um JSON inteiro — só os campos interessam.
		logger.warn('erro de validação', {
			...logFields,
			on: error.type,
			fields: (details?.errors || []).map(issue => issue.field).join(',')
		})
	} else {
		logger.warn('erro operacional', {
			...logFields,
			message: error?.message
		})
	}

	// 6. Resposta Final
	set.status = statusCode

	return {
		error: errorType,
		message,
		statusCode,
		details: details || undefined, // Só envia se houver detalhes
		timestamp: new Date().toISOString(),
		path
	}
}
