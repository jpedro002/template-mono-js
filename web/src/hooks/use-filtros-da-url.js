import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Filtros de combo guardados na URL, ao lado de `page`/`pageSize`.
 *
 * Na URL, e não em `useState`, pelo mesmo motivo das outras telas de recorte:
 * o link com o filtro aplicado é compartilhável e sobrevive ao recarregamento.
 *
 * Trocar um filtro apaga `page`: senão a tela abre na página 5 de um recorte
 * que tem uma só, e a listagem parece vazia.
 *
 * @param {string[]} nomes - chaves de filtro que esta tela usa
 * @returns {{valores: Record<string,string>, definir: (nome: string, valor: string, limpar?: string[]) => void}}
 */
export function useFiltrosDaUrl(nomes) {
	const [searchParams, setSearchParams] = useSearchParams()

	const chaves = nomes.join(',')
	const valores = useMemo(
		() =>
			Object.fromEntries(
				chaves.split(',').map((nome) => [nome, searchParams.get(nome) ?? '']),
			),
		[chaves, searchParams],
	)

	const definir = useCallback(
		(nome, valor, limpar = []) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev)

					if (valor) next.set(nome, valor)
					else next.delete(nome)

					// Filtro em cascata: trocar o pai invalida a escolha do filho.
					for (const dependente of limpar) next.delete(dependente)

					next.delete('page')
					return next
				},
				{ replace: true },
			)
		},
		[setSearchParams],
	)

	return { valores, definir }
}
