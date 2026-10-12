import { settings } from 'src/config'
import { logger } from 'src/helpers/_logger.helper'
import { metrics } from 'src/helpers/_metrics.helper'
import { storage } from 'src/services/_storage.service'
import { z } from 'zod'

/**
 * Kit de arquivos — política de upload e entrega, sem banco.
 *
 * Não existe tabela de arquivos: o serviço devolve um **descritor** (JSON puro)
 * e quem persiste é o módulo dono do registro — numa coluna `Json`, num campo
 * de texto com a `key`, ou numa tabela do próprio domínio. Sem ledger central,
 * nada aqui sabe o que existe no bucket.
 *
 * Consequências, todas assumidas ao tirar a tabela:
 * - sem dedupe por checksum, sem cota por usuário, sem idempotência
 * - sem soft delete e sem GC: `remove` apaga o objeto na hora
 * - objeto cujo descritor o módulo perder vira lixo invisível no bucket
 */

//#region política

/**
 * Quem decide mime, tamanho e visibilidade é o perfil — nunca o chamador.
 * Chamador que escolhe o mime é chamador que aceita `.exe` renomeado.
 */
const FILE_PROFILES = {
	avatar: {
		mimes: ['image/jpeg', 'image/png', 'image/webp'],
		maxSize: 2_000_000,
		visibility: 'PUBLIC',
		disposition: 'inline'
	},
	document: {
		mimes: [
			'application/pdf',
			'text/csv',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		],
		maxSize: 25_000_000,
		visibility: 'PRIVATE',
		disposition: 'attachment'
	},
	attachment: {
		mimes: null,
		maxSize: 25_000_000,
		visibility: 'PRIVATE',
		disposition: 'attachment'
	}
}

const EXTENSOES = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'application/pdf': 'pdf',
	'text/csv': 'csv',
	'text/plain': 'txt',
	'application/zip': 'zip',
	'application/msword': 'doc',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
		'docx'
}

/**
 * Assinaturas suficientes para a allowlist. Uma dependência como `file-type`
 * traria centenas de formatos que nenhum perfil aceita.
 */
const ASSINATURAS = [
	{ mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
	{ mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
	{ mime: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
	{ mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
	{ mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
	{ mime: 'application/zip', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }
]

/** OOXML (xlsx, docx, pptx) é zip: o sniff não distingue um do outro. */
const BASEADOS_EM_ZIP = new Set([
	'application/zip',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])

/** Formatos de texto não têm magic bytes — validados por heurística. */
const SEM_ASSINATURA = new Set(['text/csv', 'text/plain'])

/**
 * O que o módulo persiste. Guarde inteiro (coluna `Json`) — as funções de
 * entrega recebem este objeto de volta.
 */
const fileDescriptorSchema = z.object({
	key: z.string().max(512).describe('Chave do objeto no bucket'),
	bucket: z.string().max(100).describe('Nome do bucket'),
	visibility: z.enum(['PRIVATE', 'PUBLIC']).describe('Visibilidade'),
	profile: z.string().max(50).describe('Perfil aplicado no upload'),
	originalName: z.string().max(255).describe('Nome original enviado'),
	mimeType: z.string().max(150).describe('Tipo confirmado pelo conteúdo'),
	extension: z.string().max(20).nullable().describe('Extensão derivada'),
	size: z.number().int().describe('Tamanho em bytes'),
	checksum: z.string().max(64).nullable().optional().describe('sha256')
})

//#endregion

//#region helpers

function falhar(statusCode, message) {
	const erro = new Error(message)
	erro.statusCode = statusCode
	throw erro
}

function perfilDe(nome) {
	const perfil = FILE_PROFILES[nome]
	if (!perfil) falhar(400, `Perfil de arquivo desconhecido: ${nome}`)
	return perfil
}

/** Nome original só existe para exibir e baixar — nunca entra na chave. */
function sanitizarNome(nome) {
	const limpo = String(nome || '')
		// biome-ignore lint/suspicious/noControlCharactersInRegex: tirar caractere de controle é justamente o objetivo
		.replace(/[\u0000-\u001f]/g, '')
		.replace(/[\\/]/g, '_')
		.trim()
		.slice(0, 255)
	return limpo || 'arquivo'
}

function extensaoDe(mime, nome) {
	if (EXTENSOES[mime]) return EXTENSOES[mime]
	const doNome = /\.([a-z0-9]{1,10})$/i.exec(nome || '')?.[1]
	return doNome ? doNome.toLowerCase() : null
}

/** `{perfil}/{ano}/{mês}/{id}.{ext}` — sem nada derivado do input do usuário. */
function montarChave({ profile, id, extensao }) {
	const agora = new Date()
	const ano = agora.getUTCFullYear()
	const mes = String(agora.getUTCMonth() + 1).padStart(2, '0')
	return `${profile}/${ano}/${mes}/${id}${extensao ? `.${extensao}` : ''}`
}

function detectarTipo(head) {
	return (
		ASSINATURAS.find(assinatura =>
			assinatura.bytes.every(
				(byte, indice) => head[assinatura.offset + indice] === byte
			)
		)?.mime ?? null
	)
}

function pareceTexto(head) {
	// NUL no começo é o sinal mais barato de binário disfarçado de texto.
	return !head.subarray(0, 512).includes(0x00)
}

function tiposCompativeis(a, b) {
	if (a === b) return true
	return BASEADOS_EM_ZIP.has(a) && BASEADOS_EM_ZIP.has(b)
}

/**
 * Content-type declarado pelo cliente é palpite. O que vale são os bytes.
 * @returns {string} mime a persistir
 */
function validarTipo(perfil, declarado, head) {
	const detectado = detectarTipo(head)

	if (!perfil.mimes) {
		// Perfil aberto: sem allowlist, mas o arquivo nunca é servido inline nem
		// vai para o bucket público — o risco de tipo errado fica contido.
		return detectado || declarado || 'application/octet-stream'
	}

	if (detectado) {
		const compativel = perfil.mimes.find(mime =>
			tiposCompativeis(mime, detectado)
		)
		if (!compativel) {
			falhar(
				415,
				`Tipo de arquivo não permitido para este perfil: ${detectado}`
			)
		}
		// Declarado compatível com os bytes tem prioridade: distingue xlsx de docx,
		// que sniffam igual (zip).
		return declarado && tiposCompativeis(declarado, detectado)
			? declarado
			: compativel
	}

	if (
		declarado &&
		perfil.mimes.includes(declarado) &&
		SEM_ASSINATURA.has(declarado) &&
		pareceTexto(head)
	) {
		return declarado
	}

	falhar(415, 'Não foi possível confirmar o tipo do arquivo pelo conteúdo.')
}

function sha256(bytes) {
	return new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
}

/** RFC 5987: nome com acento/espaço sobrevive ao header. */
function contentDisposition(disposition, nome) {
	const ascii = nome.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
	return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

function garantirTamanho(perfil, size) {
	if (!size || size <= 0) falhar(400, 'Arquivo vazio.')
	if (size > perfil.maxSize) {
		falhar(413, `Arquivo excede o limite do perfil (${perfil.maxSize} bytes).`)
	}
	if (size > settings.STORAGE_MAX_SIZE) {
		falhar(
			413,
			`Arquivo excede o limite global (${settings.STORAGE_MAX_SIZE} bytes).`
		)
	}
}

/** O descritor é a única coisa que o módulo precisa guardar. */
function montarDescritor({
	key,
	visibility,
	profile,
	originalName,
	mimeType,
	extensao,
	size,
	checksum = null
}) {
	return {
		key,
		bucket: storage.bucketName(storage.bucketRefFor(visibility)),
		visibility,
		profile,
		originalName,
		mimeType,
		extension: extensao,
		size,
		checksum
	}
}

function exigirDescritor(descritor) {
	if (!descritor?.key) falhar(400, 'Descritor de arquivo inválido.')
	return descritor
}

function perfilDoDescritor(descritor) {
	return FILE_PROFILES[descritor.profile] ?? FILE_PROFILES.attachment
}

//#endregion

//#region escrita

/**
 * Upload passando pela API. Para arquivo grande vindo do browser prefira
 * `presignUpload` — aqui os bytes atravessam o processo.
 *
 * @param {object} params
 * @param {File|Blob} params.file
 * @param {string} [params.profile]
 * @param {string} [params.originalName]
 * @returns {Promise<object>} descritor a persistir no seu módulo
 */
async function upload({ file, profile = 'attachment', originalName = null }) {
	const perfil = perfilDe(profile)
	const size = file?.size ?? 0

	garantirTamanho(perfil, size)

	// Abaixo do limite o buffer serve para o sniff, o hash e a escrita — uma
	// leitura só. Acima, lê apenas o cabeçalho e transmite o resto em fluxo.
	const cabe = size <= settings.STORAGE_CHECKSUM_LIMIT
	const buffer = cabe ? new Uint8Array(await file.arrayBuffer()) : null
	const head = buffer
		? buffer.subarray(0, 4100)
		: new Uint8Array(await file.slice(0, 4100).arrayBuffer())

	const nome = sanitizarNome(originalName || file.name)
	const mimeType = validarTipo(perfil, file.type || null, head)
	const extensao = extensaoDe(mimeType, nome)
	const visibility = perfil.visibility
	const bucketRef = storage.bucketRefFor(visibility)
	const key = montarChave({ profile, id: Bun.randomUUIDv7(), extensao })

	await storage.write(bucketRef, key, buffer ?? file, { type: mimeType })

	// `profile` é fechado (avatar | document | attachment) — a chave e o nome do
	// arquivo, que não são, ficam fora do atributo de propósito.
	metrics.storage.operacao({ operation: 'upload', profile, result: 'ok' })
	metrics.storage.bytes({ operation: 'upload', profile, bytes: size })

	logger.info('arquivo enviado', { key, size, profile })

	return montarDescritor({
		key,
		visibility,
		profile,
		originalName: nome,
		mimeType,
		extensao,
		size,
		checksum: buffer ? sha256(buffer) : null
	})
}

/**
 * Prepara upload direto do browser para o bucket.
 *
 * Devolve o descritor **junto** com a URL: guarde-o só depois do `confirmUpload`
 * — antes disso o objeto pode nem existir.
 *
 * LIMITE: `PUT` assinado não impõe tamanho (isso exigiria POST-policy, que o
 * cliente S3 do Bun não expõe). Quem tiver a URL pode subir mais que o
 * declarado. Contenção: TTL curto e o `confirmUpload` conferindo o tamanho real.
 */
function presignUpload({ filename, mimeType, size, profile = 'attachment' }) {
	const perfil = perfilDe(profile)

	garantirTamanho(perfil, size)
	if (perfil.mimes && !perfil.mimes.includes(mimeType)) {
		falhar(415, `Tipo de arquivo não permitido para este perfil: ${mimeType}`)
	}

	const nome = sanitizarNome(filename)
	const extensao = extensaoDe(mimeType, nome)
	const visibility = perfil.visibility
	const bucketRef = storage.bucketRefFor(visibility)
	const key = montarChave({ profile, id: Bun.randomUUIDv7(), extensao })

	const url = storage.presignPut(bucketRef, key, { type: mimeType })

	// Contado na emissão, não na conclusão: sem GC, presign que ninguém confirma
	// deixa objeto órfão no bucket, e a diferença entre este contador e o de
	// `confirm` é a única medida desse vazamento.
	metrics.storage.operacao({ operation: 'presign', profile, result: 'ok' })

	logger.info('upload assinado emitido', { key, size, profile })

	return {
		descriptor: montarDescritor({
			key,
			visibility,
			profile,
			originalName: nome,
			mimeType,
			extensao,
			size
		}),
		url,
		method: 'PUT',
		expiresIn: settings.STORAGE_PRESIGN_TTL,
		headers: { 'content-type': mimeType }
	}
}

/**
 * Fecha o ciclo do upload assinado: confere no bucket o que realmente chegou.
 * Divergiu do declarado, o objeto é apagado e a chamada falha — só persista o
 * descritor que sai daqui.
 */
async function confirmUpload(descritor) {
	exigirDescritor(descritor)

	const perfil = perfilDe(descritor.profile)
	const bucketRef = storage.bucketRefFor(descritor.visibility)

	let real = null
	try {
		real = await storage.stat(bucketRef, descritor.key)
	} catch {
		falhar(409, 'O arquivo ainda não foi enviado para o storage.')
	}

	const divergente =
		real.size !== descritor.size ||
		real.size > perfil.maxSize ||
		real.size > settings.STORAGE_MAX_SIZE

	if (divergente) {
		await storage.delete(bucketRef, descritor.key)
		metrics.storage.operacao({
			operation: 'confirm',
			profile: descritor.profile,
			result: 'divergente'
		})
		logger.warn('upload assinado rejeitado na confirmação', {
			key: descritor.key,
			declarado: descritor.size,
			real: real.size
		})
		falhar(400, 'O arquivo enviado não confere com o que foi declarado.')
	}

	metrics.storage.operacao({
		operation: 'confirm',
		profile: descritor.profile,
		result: 'ok'
	})
	metrics.storage.bytes({
		operation: 'confirm',
		profile: descritor.profile,
		bytes: real.size
	})

	logger.info('upload assinado confirmado', {
		key: descritor.key,
		size: real.size
	})
	return { ...descritor, size: real.size }
}

/**
 * Sobe a versão nova e apaga a antiga. Troque o descritor guardado pelo que sai
 * daqui **antes** de considerar a operação concluída.
 */
async function replace(descritor, { file, originalName = null }) {
	exigirDescritor(descritor)

	const novo = await upload({
		file,
		profile: descritor.profile,
		originalName: originalName || descritor.originalName
	})

	await remove(descritor)

	logger.info('arquivo substituído', {
		anterior: descritor.key,
		novo: novo.key
	})
	return novo
}

/** Apaga o objeto. Não há soft delete: sem tabela, não há de onde desfazer. */
async function remove(descritor) {
	exigirDescritor(descritor)
	await storage.delete(
		storage.bucketRefFor(descritor.visibility),
		descritor.key
	)
	metrics.storage.operacao({
		operation: 'remove',
		profile: descritor.profile,
		result: 'ok'
	})
	logger.info('arquivo removido', { key: descritor.key })
}

/** Apaga vários — útil quando o registro dono é excluído. */
async function removeMany(descritores = []) {
	for (const descritor of descritores) {
		if (descritor?.key) await remove(descritor)
	}
}

//#endregion

//#region entrega

/** Público sai pelo CDN; privado sai assinado e de vida curta. */
function url(descritor, { expiresIn } = {}) {
	exigirDescritor(descritor)

	// URL assinada é credencial: conta-se que uma foi emitida, e nada além disso
	// — nem a chave, nem a URL, em métrica, log ou mensagem de erro.
	metrics.storage.operacao({
		operation: 'url',
		profile: descritor.profile,
		result: 'ok'
	})

	if (descritor.visibility === 'PUBLIC' && storage.hasPublicBucket()) {
		return {
			url: storage.publicUrl(descritor.key),
			expiresIn: null,
			visibility: descritor.visibility
		}
	}

	return {
		url: storage.presignGet(
			storage.bucketRefFor(descritor.visibility),
			descritor.key,
			{ expiresIn }
		),
		expiresIn: expiresIn ?? settings.STORAGE_PRESIGN_TTL,
		visibility: descritor.visibility
	}
}

/** `bytes=0-1023` → `{ start, end }`; qualquer coisa fora disso vira null. */
function parseRange(range, size) {
	const encontrado = /^bytes=(\d*)-(\d*)$/.exec(String(range || '').trim())
	if (!encontrado) return null

	const [, inicioBruto, fimBruto] = encontrado
	if (!inicioBruto && !fimBruto) return null

	// `bytes=-500` = últimos 500 bytes.
	const start = inicioBruto
		? Number(inicioBruto)
		: Math.max(0, size - Number(fimBruto))
	const end = inicioBruto ? (fimBruto ? Number(fimBruto) : size - 1) : size - 1

	if (start > end || start >= size) return null
	return { start, end: Math.min(end, size - 1) }
}

/**
 * Stream pelo processo, com o nome e o disposition corretos. Custa banda —
 * use `url()` quando o cliente puder falar direto com o bucket.
 */
async function download(descritor, { range = null } = {}) {
	exigirDescritor(descritor)

	const perfil = perfilDoDescritor(descritor)
	const bucketRef = storage.bucketRefFor(descritor.visibility)

	const headers = {
		'content-type': descritor.mimeType,
		'content-disposition': contentDisposition(
			perfil.disposition,
			descritor.originalName
		),
		// Sem isto o browser pode ignorar o content-type e executar o conteúdo.
		'x-content-type-options': 'nosniff',
		'accept-ranges': 'bytes',
		'cache-control':
			descritor.visibility === 'PUBLIC'
				? 'public, max-age=3600'
				: 'private, max-age=60'
	}

	// Descritor sintético (registros importados) chega sem tamanho; sem ele não há
	// content-length nem Range.
	if (!descritor.size) {
		const info = await storage.stat(bucketRef, descritor.key).catch(() => null)
		if (!info) {
			const e = new Error('Arquivo não encontrado')
			e.statusCode = 404
			throw e
		}
		descritor = { ...descritor, size: info.size }
	}

	const pedaco = parseRange(range, descritor.size)
	if (pedaco) {
		const { start, end } = pedaco
		metrics.storage.operacao({
			operation: 'download',
			profile: descritor.profile,
			result: 'partial'
		})
		metrics.storage.bytes({
			operation: 'download',
			profile: descritor.profile,
			bytes: end - start + 1
		})
		return {
			status: 206,
			headers: {
				...headers,
				'content-range': `bytes ${start}-${end}/${descritor.size}`,
				'content-length': String(end - start + 1)
			},
			body: await storage.slice(bucketRef, descritor.key, start, end + 1)
		}
	}

	// Contabilizado no início do stream, não no fim: o corpo é lazy e ninguém
	// aqui sabe se o cliente vai ler até o final. Mede banda comprometida, não
	// banda entregue — e é o número que interessa para custo de saída.
	metrics.storage.operacao({
		operation: 'download',
		profile: descritor.profile,
		result: 'ok'
	})
	metrics.storage.bytes({
		operation: 'download',
		profile: descritor.profile,
		bytes: descritor.size
	})

	return {
		status: 200,
		headers: { ...headers, 'content-length': String(descritor.size) },
		body: await storage.stream(bucketRef, descritor.key)
	}
}

/**
 * Decide como entregar o arquivo.
 *
 * `auto` redireciona o que é para ver no browser (perfil `inline`) e transmite
 * pelo processo o que é anexo — o `presign` do Bun não assina
 * `response-content-disposition`, então só o proxy garante o nome do arquivo.
 *
 * @param {object} descritor
 * @param {object} [opts]
 * @param {'auto'|'redirect'|'proxy'} [opts.mode]
 * @param {string|null} [opts.range]
 * @param {number} [opts.expiresIn]
 */
async function deliver(
	descritor,
	{ mode = 'auto', range = null, expiresIn } = {}
) {
	exigirDescritor(descritor)

	const perfil = perfilDoDescritor(descritor)
	const redirecionar =
		mode === 'redirect' || (mode === 'auto' && perfil.disposition === 'inline')

	if (mode !== 'proxy' && redirecionar) {
		return { kind: 'redirect', ...url(descritor, { expiresIn }) }
	}

	return { kind: 'stream', ...(await download(descritor, { range })) }
}

/** O objeto ainda está lá? Sem ledger, é a única forma de saber. */
async function exists(descritor) {
	exigirDescritor(descritor)
	try {
		await storage.stat(
			storage.bucketRefFor(descritor.visibility),
			descritor.key
		)
		return true
	} catch {
		return false
	}
}

//#endregion

const fileService = {
	upload,
	presignUpload,
	confirmUpload,
	replace,
	remove,
	removeMany,
	url,
	download,
	deliver,
	exists,
	// exportados para teste e reuso
	_internos: {
		montarChave,
		validarTipo,
		detectarTipo,
		sanitizarNome,
		parseRange,
		contentDisposition
	}
}

export { fileService, FILE_PROFILES, fileDescriptorSchema }
export default fileService
