/**
 * Captura o que o logger escreve. Sem isso cada teste de erro despeja linhas de
 * log no relatório do runner e esconde a falha de verdade.
 *
 * `PRINT_LOGS=1 bun test` volta a imprimir.
 */
const PRINT = process.env.PRINT_LOGS === '1'

const original = {
	log: console.log.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console)
}

const captured = { log: [], warn: [], error: [] }

for (const channel of ['log', 'warn', 'error']) {
	console[channel] = (...args) => {
		captured[channel].push(args.map(String).join(' '))
		if (PRINT) original[channel](...args)
	}
}

/**
 * `onAfterResponse` roda depois que `handle()` já resolveu — sem ceder o event
 * loop a linha de acesso ainda não foi escrita quando o teste faz a asserção.
 */
export const flushLogs = () => new Promise(resolve => setTimeout(resolve, 0))

export function resetConsole() {
	captured.log.length = 0
	captured.warn.length = 0
	captured.error.length = 0
}

/** Todas as linhas escritas, na ordem, independente do canal. */
export function consoleLines(channel = null) {
	if (channel) return [...captured[channel]]
	return [...captured.log, ...captured.warn, ...captured.error]
}

/** Linhas do logger já parseadas (LOG_PRETTY=false ⇒ um JSON por linha). */
export function logEvents(channel = null) {
	return consoleLines(channel)
		.map(line => {
			try {
				return JSON.parse(line)
			} catch {
				return null
			}
		})
		.filter(Boolean)
}

export { original as realConsole }
