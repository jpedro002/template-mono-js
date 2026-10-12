import { rotaPermissoes } from 'src/generated/rota-permissoes'
import { temPermissao, temPermissoes } from 'src/lib/permissions'

/**
 * Esta sessão consegue abrir a tela para onde o link aponta?
 *
 * A resposta sai do **mapa gerado** (`rotaPermissoes`), que o plugin de rotas
 * monta a partir do `export const permissao` de cada página. É o mesmo dado que
 * o gate da rota usa, então menu e roteador não têm como divergir.
 *
 * `permissaoDeclarada` é a saída para link sem rota com gate, ou que aponta
 * para fora das páginas geradas.
 */
export function podeAbrirRota(url, permissoes, permissaoDeclarada) {
	const rota = url ? rotaPermissoes[url] : undefined

	if (rota) {
		return temPermissoes(rota.permissao, permissoes, { todas: rota.todas })
	}

	return temPermissao(permissaoDeclarada, permissoes)
}

/**
 * Telas que este conjunto de permissões abre só pela metade: tem a primeira
 * permissão do array (a da tela) e falta o resto que a rota exige com `todas`.
 */
export function rotasIncompletas(permissoes) {
	return Object.entries(rotaPermissoes).flatMap(([url, rota]) => {
		if (!rota.todas || !Array.isArray(rota.permissao)) return []
		const [tela, ...resto] = rota.permissao
		if (!temPermissao(tela, permissoes)) return []
		const faltam = resto.filter((p) => !temPermissao(p, permissoes))
		return faltam.length ? [{ url, faltam }] : []
	})
}
