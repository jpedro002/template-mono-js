// Empurra as linhas JSON do logger para o VictoriaLogs.
//
// Existe só por causa do dev: aqui a API roda no host, então não há container
// cujo stdout um coletor possa ler. Em produção a API roda em container e quem
// faz esse trabalho é o log driver do Docker apontando para a porta syslog do
// VictoriaLogs — este script não entra em produção.
//
//   bun run dev:logs
//
// Linha que não é JSON (banner da Elysia, aviso do Bun) passa direto para o
// terminal sem ser enviada. O coletor fora do ar não derruba o dev: a linha
// continua aparecendo no terminal e o envio é descartado com um aviso.

const BASE = process.env.LOG_COLLECTOR_URL || 'http://localhost:9428'

// `msg`/`time`/`level` são exatamente os campos que o logger emite quando
// LOG_PRETTY=false. `_stream_fields` define como o VictoriaLogs agrupa os fluxos.
const ENDPOINT =
	`${BASE}/insert/jsonline` +
	'?_msg_field=msg&_time_field=time&_stream_fields=level'

const FLUSH_MS = 1000
const FLUSH_LINES = 100

let buffer = []
let timer = null
let avisou = false

async function flush() {
	if (timer) {
		clearTimeout(timer)
		timer = null
	}
	if (!buffer.length) return

	const body = `${buffer.join('\n')}\n`
	buffer = []

	try {
		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/stream+json' },
			body
		})
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		avisou = false
	} catch (err) {
		// Um aviso por episódio de indisponibilidade, não um por lote.
		if (!avisou) {
			process.stderr.write(
				`[ship-logs] coletor indisponível em ${BASE} (${err.message}); ` +
					'linhas seguem só no terminal\n'
			)
			avisou = true
		}
	}
}

function enqueue(line) {
	buffer.push(line)
	if (buffer.length >= FLUSH_LINES) {
		flush()
		return
	}
	if (!timer) timer = setTimeout(flush, FLUSH_MS)
}

function isJsonEvent(line) {
	if (!line.startsWith('{')) return false
	try {
		return typeof JSON.parse(line).msg === 'string'
	} catch {
		return false
	}
}

let pending = ''

for await (const chunk of Bun.stdin.stream()) {
	pending += new TextDecoder().decode(chunk)
	const lines = pending.split('\n')
	pending = lines.pop() ?? ''

	for (const line of lines) {
		// O dev continua vendo tudo, JSON ou não.
		process.stdout.write(`${line}\n`)
		if (isJsonEvent(line.trim())) enqueue(line.trim())
	}
}

if (pending.trim()) {
	process.stdout.write(`${pending}\n`)
	if (isJsonEvent(pending.trim())) enqueue(pending.trim())
}

await flush()
