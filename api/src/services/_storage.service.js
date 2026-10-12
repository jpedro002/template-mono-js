import { settings } from 'src/config'

/**
 * Driver de storage compatível com S3 (AWS S3, Cloudflare R2, MinIO, Spaces,
 * Backblaze B2) sobre o cliente nativo do Bun — sem SDK externo.
 *
 * Só bytes: não conhece Prisma, RBAC nem política de upload. Isso fica no
 * `fileService`, que é quem os controllers usam. Este módulo é também o ponto
 * único de substituição nos testes (`mock.module('src/services/_storage.service')`),
 * do mesmo jeito que o `_prisma.service`.
 *
 * Dois buckets: privado (default) e público opcional. Bucket público é bucket
 * separado, não prefixo — no R2 é assim que funciona, e um erro de policy num
 * bucket único exporia o acervo inteiro.
 *
 * LIMITE CONHECIDO: `presign` do Bun não assina `response-content-disposition`.
 * URL assinada serve para exibição inline; download com nome de arquivo passa
 * pelo proxy da API (`fileService.download`).
 */

const PRIVATE = 'private'
const PUBLIC = 'public'

/** Aceita 'private'/'public' e os valores do enum ('PRIVATE'/'PUBLIC'). */
function normalize(ref) {
	const alvo = String(ref || PRIVATE).toLowerCase()
	if (alvo === PUBLIC && settings.S3_PUBLIC_BUCKET) return PUBLIC
	return PRIVATE
}

function bucketName(ref) {
	return normalize(ref) === PUBLIC
		? settings.S3_PUBLIC_BUCKET
		: settings.S3_BUCKET
}

/** URL pública (CDN) de um objeto do bucket público. */
function publicUrl(key) {
	const base =
		settings.S3_PUBLIC_URL ||
		`${settings.S3_ENDPOINT || ''}/${settings.S3_PUBLIC_BUCKET || ''}`
	return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
}

function hasPublicBucket() {
	return Boolean(settings.S3_PUBLIC_BUCKET)
}

//#region driver S3

function makeS3Driver() {
	// Storage sem credencial só falharia no primeiro upload — em produção isso
	// significa descobrir o erro de configuração com o usuário na frente.
	const ausentes = [
		'S3_ACCESS_KEY_ID',
		'S3_SECRET_ACCESS_KEY',
		'S3_BUCKET'
	].filter(chave => !settings[chave])

	if (ausentes.length > 0) {
		const aviso = `Storage: variáveis obrigatórias ausentes: ${ausentes.join(', ')}.`
		if (settings.NODE_ENV === 'production') throw new Error(aviso)
		console.warn(
			`[AVISO] ${aviso} Use STORAGE_DRIVER=memory para rodar sem MinIO.`
		)
	}

	const clients = {
		[PRIVATE]: new Bun.S3Client({
			accessKeyId: settings.S3_ACCESS_KEY_ID,
			secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
			region: settings.S3_REGION,
			bucket: settings.S3_BUCKET,
			endpoint: settings.S3_ENDPOINT,
			virtualHostedStyle: settings.S3_VIRTUAL_HOSTED
		}),
		[PUBLIC]: settings.S3_PUBLIC_BUCKET
			? new Bun.S3Client({
					accessKeyId: settings.S3_ACCESS_KEY_ID,
					secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
					region: settings.S3_REGION,
					bucket: settings.S3_PUBLIC_BUCKET,
					endpoint: settings.S3_ENDPOINT,
					virtualHostedStyle: settings.S3_VIRTUAL_HOSTED
				})
			: null
	}

	const at = ref => clients[normalize(ref)]

	/**
	 * Assinar é barato (só HMAC), mas gerar uma URL diferente a cada request
	 * zera o cache do browser e do CDN. Reaproveita a assinatura durante metade
	 * da validade — nunca devolve uma URL prestes a expirar.
	 */
	const assinadas = new Map()

	function cachedPresign(cacheKey, expiresIn, gerar) {
		const agora = Date.now()
		const cache = assinadas.get(cacheKey)
		if (cache && cache.validaAte > agora) return cache.url

		if (assinadas.size > 500) {
			for (const [chave, valor] of assinadas) {
				if (valor.validaAte <= agora) assinadas.delete(chave)
			}
		}

		const url = gerar()
		assinadas.set(cacheKey, {
			url,
			validaAte: agora + (expiresIn * 1000) / 2
		})
		return url
	}

	return {
		driver: 's3',

		write: (ref, key, data, opts) => at(ref).write(key, data, opts),
		stream: (ref, key) => at(ref).file(key).stream(),
		slice: (ref, key, start, end) =>
			at(ref).file(key).slice(start, end).stream(),
		stat: (ref, key) => at(ref).file(key).stat(),
		exists: (ref, key) => at(ref).file(key).exists(),
		delete: (ref, key) => at(ref).file(key).delete(),
		list: (ref, opts) => at(ref).list(opts),
		writer: (ref, key, opts) =>
			at(ref)
				.file(key)
				.writer({ queueSize: 4, ...opts }),

		async copy(ref, from, to) {
			await at(ref).write(to, at(ref).file(from))
		},

		presignGet(ref, key, opts = {}) {
			const expiresIn = opts.expiresIn ?? settings.STORAGE_PRESIGN_TTL
			return cachedPresign(
				`GET:${normalize(ref)}:${key}:${expiresIn}`,
				expiresIn,
				() => at(ref).presign(key, { method: 'GET', expiresIn })
			)
		},

		// PUT nunca entra no cache: uma URL de escrita reaproveitada permitiria
		// sobrescrever o objeto de outro upload.
		presignPut(ref, key, opts = {}) {
			return at(ref).presign(key, {
				method: 'PUT',
				expiresIn: opts.expiresIn ?? settings.STORAGE_PRESIGN_TTL,
				...(opts.type && { type: opts.type })
			})
		},

		async ping() {
			await at(PRIVATE).list({ maxKeys: 1 })
			return true
		}
	}
}

//#endregion

//#region driver memory

/**
 * Guarda os bytes num Map do processo. Serve para dev sem MinIO e para os
 * testes. Não persiste, não escala — e é exatamente isso que se espera dele.
 */
function makeMemoryDriver() {
	const objetos = new Map()

	const id = (ref, key) => `${normalize(ref)}:${key}`

	function get(ref, key) {
		const objeto = objetos.get(id(ref, key))
		if (!objeto) {
			const erro = new Error(`NoSuchKey: ${key}`)
			erro.name = 'S3Error'
			erro.code = 'NoSuchKey'
			throw erro
		}
		return objeto
	}

	return {
		driver: 'memory',
		_objetos: objetos,

		async write(ref, key, data, opts = {}) {
			const bytes =
				data instanceof ArrayBuffer
					? new Uint8Array(data)
					: new Uint8Array(await new Response(data).arrayBuffer())

			objetos.set(id(ref, key), {
				bytes,
				type: opts.type || data?.type || 'application/octet-stream',
				lastModified: new Date()
			})
			return bytes.byteLength
		},

		stream: async (ref, key) => new Response(get(ref, key).bytes).body,

		slice: async (ref, key, start, end) =>
			new Response(get(ref, key).bytes.slice(start, end)).body,

		stat: async (ref, key) => {
			const objeto = get(ref, key)
			return {
				size: objeto.bytes.byteLength,
				type: objeto.type,
				lastModified: objeto.lastModified,
				etag: Bun.hash(objeto.bytes).toString(16)
			}
		},

		exists: async (ref, key) => objetos.has(id(ref, key)),

		delete: async (ref, key) => {
			objetos.delete(id(ref, key))
		},

		list: async (ref, opts = {}) => {
			const prefixo = `${normalize(ref)}:${opts.prefix || ''}`
			const contents = [...objetos.entries()]
				.filter(([chave]) => chave.startsWith(prefixo))
				.slice(0, opts.maxKeys ?? 1000)
				.map(([chave, objeto]) => ({
					key: chave.slice(chave.indexOf(':') + 1),
					size: objeto.bytes.byteLength,
					lastModified: objeto.lastModified
				}))
			return { contents, isTruncated: false, keyCount: contents.length }
		},

		writer() {
			throw new Error('writer() não é suportado pelo driver de memória.')
		},

		async copy(ref, from, to) {
			objetos.set(id(ref, to), { ...get(ref, from) })
		},

		presignGet: (ref, key, opts = {}) =>
			`memory://${bucketName(ref)}/${key}?exp=${opts.expiresIn ?? settings.STORAGE_PRESIGN_TTL}`,

		presignPut: (ref, key, opts = {}) =>
			`memory://${bucketName(ref)}/${key}?method=PUT&exp=${opts.expiresIn ?? settings.STORAGE_PRESIGN_TTL}`,

		async ping() {
			return true
		}
	}
}

//#endregion

const driver =
	settings.STORAGE_DRIVER === 'memory' ? makeMemoryDriver() : makeS3Driver()

const storage = {
	...driver,
	bucketName,
	publicUrl,
	hasPublicBucket,
	/** 'public' só quando há bucket público configurado; senão cai no privado. */
	bucketRefFor: normalize
}

export { storage }
export default storage
