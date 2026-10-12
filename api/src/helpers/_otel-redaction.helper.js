import { isSensitiveKey } from 'src/helpers/_logger.helper'

/**
 * Redação de atributos de span.
 *
 * **Por que isso existe.** O `@elysiajs/opentelemetry` anexa ao span raiz, sem
 * pedir, um atributo por header da requisição (`http.request.header.*`), os
 * cookies (`http.request.cookie`) e o **corpo** da requisição e da resposta
 * (`http.request.body` / `http.response.body`). Ou seja: por padrão, o trace de
 * um `POST /auth/session` sai daqui com a senha em texto puro e o trace de
 * qualquer requisição autenticada sai com o JWT de sessão.
 *
 * O log tem redação por radical desde sempre; o trace não tinha nada, e o Tempo
 * guarda o que recebe. Sem este passo, ligar trace significaria copiar
 * credenciais para um segundo armazenamento — com outra retenção e outro
 * controle de acesso.
 *
 * **Duas políticas, e a diferença importa.**
 *
 * - Atributo cujo *nome* denuncia segredo vira `[REDACTED]`. O casamento é o
 *   mesmo `isSensitiveKey` do logger — de propósito: duas listas de radicais em
 *   dois arquivos divergem, e a que ficar para trás vaza.
 * - Atributo que é um **corpo serializado** é **removido**, não redigido. Ali o
 *   segredo está *dentro* de uma string JSON, onde casamento por nome de chave
 *   não alcança. E não há perda: o corpo das mutações já é auditado no log de
 *   acesso, com redação recursiva e corte de 4 KB. Duplicá-lo no trace só
 *   aumentaria o span e a superfície.
 */
const ATRIBUTOS_REMOVIDOS = new Set([
	'http.request.body',
	'http.response.body',
	// Redundantes com o log de acesso e sem valor de diagnóstico no waterfall.
	'http.request.cookie'
])

/**
 * O nome do atributo carrega o do header (`http.request.header.cookie`), então
 * `isSensitiveKey` já pega cookie e authorization pelo radical. Só o último
 * segmento é comparado para não deixar o prefixo `http.` diluir o casamento.
 * @param {string} chave
 */
function chaveSensivel(chave) {
	const ultimo = chave.split('.').pop() || chave
	return isSensitiveKey(ultimo) || isSensitiveKey(chave)
}

/**
 * Aplica a redação no objeto de atributos, no lugar.
 *
 * Muta em vez de copiar porque roda no `onEnd` do span, quando o objeto de
 * atributos já é o que o exportador vai serializar — devolver uma cópia não
 * mudaria nada do que sai na rede.
 *
 * @param {Record<string, unknown>} attributes
 * @returns {number} quantos atributos foram alterados ou removidos
 */
export function redigirAtributos(attributes) {
	if (!attributes || typeof attributes !== 'object') return 0

	let alterados = 0

	for (const chave of Object.keys(attributes)) {
		if (ATRIBUTOS_REMOVIDOS.has(chave)) {
			delete attributes[chave]
			alterados++
			continue
		}
		if (chaveSensivel(chave)) {
			attributes[chave] = '[REDACTED]'
			alterados++
		}
	}

	return alterados
}

/**
 * `SpanProcessor` que redige antes de qualquer exportação.
 *
 * Precisa vir **antes** do processador que exporta na lista de `spanProcessors`:
 * o SDK chama `onEnd` na ordem em que foram registrados, e é nesse ponto que o
 * atributo ainda pode ser alterado.
 */
export function createRedactingSpanProcessor() {
	return {
		onStart: () => {},
		onEnd: span => redigirAtributos(span.attributes),
		forceFlush: () => Promise.resolve(),
		shutdown: () => Promise.resolve()
	}
}

export default { redigirAtributos, createRedactingSpanProcessor }
