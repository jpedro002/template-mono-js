/**
 * Rota pretendida antes do login, carregada em `?returnTo=`.
 *
 * Query e não `state` do react-router: o 401 global (`src/lib/react-query.js`)
 * chega em `/auth` por `window.location.href`, uma navegação de browser que não
 * leva state nenhum. Com o destino na URL, os dois caminhos — o `<Navigate>` do
 * `ProtectedRoute` e o reload do interceptor — voltam para o mesmo lugar.
 */
import { resolveRotaInicio } from './rota-inicio'

/** Rota que `rotaDeLoginCom` considera "sem destino a preservar". */
const PADRAO = '/'

/**
 * Monta o destino do login preservando de onde a pessoa foi tirada.
 *
 * @param {{pathname: string, search?: string}} localizacao
 */
export function rotaDeLoginCom(localizacao) {
	const destino = `${localizacao.pathname}${localizacao.search || ''}`

	if (!ehInterno(destino) || destino === PADRAO) return '/auth'

	return `/auth?returnTo=${encodeURIComponent(destino)}`
}

/**
 * Lê o destino pós-login. Sem `returnTo` — ou com um que não serve — cai na
 * home do ciclo, e não em `/`: `/` é só um `<Navigate>` para lá, e passar por
 * ela cobra o chunk daquela rota mais um salto de rota, o que aparecia como
 * uma tela em branco de ~400 ms entre o login e a tela inicial.
 *
 * @param {string} search - `location.search`
 */
export function rotaDeRetorno(search) {
	const bruto = new URLSearchParams(search).get('returnTo')

	if (!bruto || !ehInterno(bruto)) return resolveRotaInicio()

	return bruto
}

/**
 * `//host` e `https://host` são absolutos e virariam redirect aberto — o login
 * mandaria a pessoa (já autenticada) para fora do domínio a partir de um link
 * montado por outra pessoa. Só caminho relativo passa, e `/auth` fica fora para
 * o login não voltar para ele mesmo.
 */
function ehInterno(destino) {
	if (!destino.startsWith('/') || destino.startsWith('//')) return false
	return !destino.startsWith('/auth')
}
