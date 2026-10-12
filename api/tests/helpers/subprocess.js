const ROOT = new URL('../..', import.meta.url).pathname.replace(
	/^\/([A-Za-z]:)/,
	'$1'
)

/**
 * Roda um trecho em um processo Bun novo.
 *
 * `settings` e o `logger` congelam `LOG_LEVEL`, `LOG_PRETTY` e `NODE_ENV` no
 * momento em que o módulo é avaliado. Como o registro de módulos é cacheado por
 * processo, comportamento que depende dessas variáveis só dá para observar em
 * um processo com outro ambiente.
 *
 * @param {string} code fonte ESM
 * @param {Record<string,string>} env variáveis adicionais
 */
export async function runWithEnv(code, env = {}) {
	const merged = { ...process.env, ...env }
	// Valor nulo remove a variável — permite testar o caminho "não definida".
	for (const [key, value] of Object.entries(env)) {
		if (value === null || value === undefined) delete merged[key]
	}

	// `--env-file=/dev/null`: sem isso o Bun carrega o `.env` local da raiz e ele
	// repõe a variável que o teste removeu (`--no-env-file` não vale para `-e`).
	const proc = Bun.spawn(['bun', '--env-file=/dev/null', '-e', code], {
		cwd: ROOT,
		env: merged,
		stdout: 'pipe',
		stderr: 'pipe'
	})

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited
	])

	return { stdout, stderr, exitCode }
}

/** Linhas JSON emitidas pelo logger em um subprocesso. */
export function jsonLines(stdout) {
	return stdout
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => {
			try {
				return JSON.parse(line)
			} catch {
				return null
			}
		})
		.filter(Boolean)
}
