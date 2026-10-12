import axios from 'axios'
import { settings } from 'src/config'

/**
 * `withCredentials` é o que faz o browser mandar o cookie de sessão do
 * a API em requisição cross-origin — sem ele toda chamada autenticada
 * volta 401. Do outro lado, a origem do web precisa estar em `CORS_ORIGIN`:
 * com `credentials`, o allowlist tem que ser exato, `*` não vale.
 *
 * Não há interceptor de `Authorization`: o JWT vive em cookie httpOnly e o JS
 * não tem acesso a ele.
 *
 * `indexes: null` serializa array como chave repetida (`fields=nome&fields=uf`)
 * em vez do default do axios, `fields[]=nome&fields[]=uf`. Não é preferência de
 * estilo: a API lê a query com `URLSearchParams`, então com colchete a chave que
 * chega é literalmente `fields[]` e o parâmetro `fields` fica vazio. O efeito
 * era silencioso e visível — `term` só entra no `where` quando há `fields`, e
 * sem eles a busca das telas de listagem devolvia a tabela inteira em vez de
 * filtrar. Mesma coisa para `fspecifics` e `cliente_ids`.
 */
const api = axios.create({
	baseURL: settings.API_URL,
	withCredentials: true,
	paramsSerializer: { indexes: null },
})

/**
 * Filtro que vem de `useSearchParams` é string vazia quando não está preenchido,
 * e o axios só descarta `undefined`/`null` — `parent_id=` chegava na API, onde o
 * id coage para 0 e o schema responde 400 "erros de validação". Vazio é
 * ausência de filtro, então some antes de virar query.
 */
api.interceptors.request.use((config) => {
	if (config.params && !(config.params instanceof URLSearchParams)) {
		config.params = Object.fromEntries(
			Object.entries(config.params).filter(([, valor]) => valor !== ''),
		)
	}
	return config
})

export { api }
