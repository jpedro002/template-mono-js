import bcrypt from 'bcrypt'

const SALT_ROUNDS = 10

/**
 * Hash "descartável" para igualar o tempo de resposta quando não existe usuário
 * — sem ele, "e-mail não cadastrado" responde na hora e "senha errada" demora o
 * bcrypt, o que enumera usuários por cronômetro.
 */
export const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation-dummy', 12)

/**
 * Compara senha com hash, aceitando os hashes migrados do Laravel.
 *
 * O PHP grava com a marca de versão `$2y$`; o bcrypt do Node só reconhece
 * `$2a$`/`$2b$` e, com `$2y$`, devolve `false` sempre — sem erro nenhum. O
 * algoritmo é o mesmo, só a marca difere, então a troca de prefixo é segura.
 * Comparar direto com `bcrypt.compare` reprova **todo** usuário vindo do sistema
 * anterior.
 *
 * @param {string} senha
 * @param {string|null|undefined} hash
 * @returns {Promise<boolean>}
 */
export async function conferirSenha(senha, hash) {
	const bruto = hash || DUMMY_HASH
	const normalizado = bruto.startsWith('$2y$') ? `$2b$${bruto.slice(4)}` : bruto

	return bcrypt.compare(senha, normalizado)
}

/** @param {string} senha */
export const gerarHashSenha = senha => bcrypt.hash(senha, SALT_ROUNDS)
