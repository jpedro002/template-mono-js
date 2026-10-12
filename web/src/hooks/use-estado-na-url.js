import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Estado de uma listagem guardado na query string — o `$queryString` dos
 * componentes Livewire do painel Blade: o link com filtro, aba, ordem e página
 * é compartilhável e sobrevive ao recarregamento.
 *
 * `definir({ busca: 'x' })` mexe só nas chaves passadas. Valor vazio (`''`,
 * `null`, `undefined`) ou igual ao padrão **sai da URL**, como o `except` do
 * Livewire, para o link limpo continuar limpo. Mudar qualquer coisa que não
 * seja a própria página volta para a página 1 (`resetPage()` do Livewire):
 * senão a tela abre na página 5 de um recorte que tem uma só.
 *
 * @param {Record<string, string>} padroes - chave → valor padrão (como string)
 */
export function useEstadoNaUrl(padroes) {
	const [searchParams, setSearchParams] = useSearchParams()

	const chave = JSON.stringify(padroes)
	const valores = useMemo(() => {
		const base = JSON.parse(chave)
		return Object.fromEntries(
			Object.entries(base).map(([nome, padrao]) => [
				nome,
				searchParams.get(nome) ?? padrao,
			]),
		)
	}, [chave, searchParams])

	const definir = useCallback(
		(mudancas) => {
			const base = JSON.parse(chave)
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev)

					for (const [nome, valor] of Object.entries(mudancas)) {
						const texto =
							valor === null || valor === undefined ? '' : String(valor)
						if (texto === '' || texto === (base[nome] ?? '')) next.delete(nome)
						else next.set(nome, texto)
					}

					if (!('page' in mudancas)) next.delete('page')
					return next
				},
				{ replace: true },
			)
		},
		[chave, setSearchParams],
	)

	const limpar = useCallback(
		() => setSearchParams(new URLSearchParams(), { replace: true }),
		[setSearchParams],
	)

	return { valores, definir, limpar }
}
