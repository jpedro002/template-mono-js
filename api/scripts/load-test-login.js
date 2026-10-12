#!/usr/bin/env bun
// Load test do POST /api/seguranca/auth/session.
//
// A rota tem rate limit de 5 req/min por IP (src/routes/seguranca/_session.route.js).
// Rodando de uma máquina só, todo mundo cai no mesmo IP: depois das 5 primeiras
// requisições da janela, o resto vira 429 — isso é esperado, não bug do script.
// Para medir throughput real do handler sem o limiter atrapalhar, suba a API
// com LOGIN_RATE_LIMIT_MAX alto (ver nota no fim) só localmente, nunca em prod.
//
// Uso:
//   bun run scripts/load-test-login.js
//   bun run scripts/load-test-login.js --email a@b.com --password 123456 --connections 20 --duration 15
//   bun run scripts/load-test-login.js --url http://localhost:3000

import autocannon from 'autocannon'

function parseArgs(argv) {
	const out = {}
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			out[argv[i].slice(2)] = argv[i + 1]
			i++
		}
	}
	return out
}

const args = parseArgs(process.argv.slice(2))

const url = args.url || 'http://localhost:3000'
const email = args.email || process.env.LOAD_TEST_EMAIL || 'admin@admin.com'
const password =
	args.password || process.env.LOAD_TEST_PASSWORD || 'senha-de-teste'
const connections = Number(args.connections || 10)
const duration = Number(args.duration || 10)

console.log(`POST ${url}/api/seguranca/auth/session`)
console.log(`email=${email} connections=${connections} duration=${duration}s`)
console.log(
	'Lembrete: rate limit é 5/min por IP. Espere muito 429 acima disso.\n'
)

const instance = autocannon({
	url: `${url}/api/seguranca/auth/session`,
	method: 'POST',
	connections,
	duration,
	headers: {
		'content-type': 'application/json'
	},
	body: JSON.stringify({ email, password })
})

autocannon.track(instance, { renderProgressBar: true })

instance.on('done', result => {
	const byStatus = result.statusCodeStats || {}
	console.log('\n--- status codes ---')
	for (const [code, stats] of Object.entries(byStatus)) {
		console.log(`  ${code}: ${stats.count}`)
	}
	console.log('\n--- latência (ms) ---')
	console.log(
		`  p50=${result.latency.p50} p95=${result.latency.p97_5} p99=${result.latency.p99} max=${result.latency.max}`
	)
	console.log(`  req/s média: ${result.requests.average}`)
	console.log(
		`  erros de conexão: ${result.errors}, timeouts: ${result.timeouts}`
	)
})

process.once('SIGINT', () => instance.stop())
