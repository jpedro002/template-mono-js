/**
 * O par `Ativo (N)` / `Inativo (N)` das listagens de cadastro.
 *
 * São duas consultas, não uma: a API conta os ativos **ou** o total, conforme
 * a flag de inativos, e nunca os dois lados de uma vez. Inativos é a
 * diferença. `pageSize: 1` e `select: 'id'` porque o que interessa é o
 * `rowCount` da paginação — a página em si é descartada.
 *
 * As duas contagens recebem o mesmo recorte da listagem (busca e filtros),
 * mas **não** a página nem a ordenação: o par responde "quantos existem neste
 * recorte", não "quantos estão nesta página".
 *
 * Recebe o hook de listagem em vez de o endpoint porque é ele que já carrega a
 * chave de cache e o `select` do recurso — passar a URL faria uma segunda
 * fonte de verdade para a mesma listagem.
 *
 * @param {(filtros: object) => {data?: {pagination?: {rowCount: number}}}} useList
 *   - o `useXList` do recurso
 * @param {object} params
 * @param {string} params.chaveInativos - `incluir_inativas` ou
 *   `incluir_inativos`, conforme o gênero do recurso
 * @param {string} [params.term] - o mesmo termo de busca da listagem
 * @param {string[]} [params.fields] - os mesmos campos de busca da listagem
 * @param {string[]} [params.fspecifics] - os mesmos filtros da listagem
 * @param {object} [params.recorteExtra] - o que o `useList` do recurso pede
 *   além de busca e `fspecifics` (é o caso de ciclo, cuja listagem é filtrada
 *   por cliente); sem isto o par contaria fora do recorte da tabela
 * @returns {{ativos: number|undefined, inativos: number|undefined}}
 */
export function useContagemAtivoInativo(
	useList,
	{ chaveInativos, term, fields, fspecifics, recorteExtra },
) {
	const recorte = {
		pageSize: 1,
		select: 'id',
		term,
		fields,
		fspecifics,
		...recorteExtra,
	}

	const { data: ativosData } = useList(recorte)
	const { data: todosData } = useList({ ...recorte, [chaveInativos]: true })

	const ativos = ativosData?.pagination?.rowCount
	const todos = todosData?.pagination?.rowCount

	return {
		ativos,
		inativos:
			ativos === undefined || todos === undefined ? undefined : todos - ativos,
	}
}
