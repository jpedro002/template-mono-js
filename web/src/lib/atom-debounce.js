import { atom } from 'jotai'

/**
 * Cria um atom com debounce para valores que mudam frequentemente
 * Útil para inputs de pesquisa, onde não queremos fazer requisições a cada keystroke
 *
 * @param {*} initialValue - Valor inicial
 * @param {number} delayMilliseconds - Tempo de debounce em ms (padrão: 500)
 * @param {boolean} shouldDebounceOnReset - Se deve fazer debounce ao resetar (padrão: false)
 * @returns {Object} { currentValueAtom, debouncedValueAtom, isDebouncingAtom, clearTimeoutAtom }
 */
export function atomWithDebounce(
	initialValue = '',
	delayMilliseconds = 500,
	shouldDebounceOnReset = false,
) {
	const prevTimeoutAtom = atom(undefined)

	// Armazena o valor atual enquanto está digitando
	const _currentValueAtom = atom(initialValue)

	// Armazena o valor final após debounce
	const _debouncedValueAtom = atom(initialValue)

	// Indica se está no período de debounce
	const isDebouncingAtom = atom(false)

	// Atom que dispara o debounce
	const debouncedValueAtom = atom(
		(get) => get(_debouncedValueAtom),
		(get, set, update) => {
			clearTimeout(get(prevTimeoutAtom))

			const prevValue = get(_currentValueAtom)
			const nextValue =
				typeof update === 'function' ? update(prevValue) : update

			const onDebounceStart = () => {
				set(_currentValueAtom, nextValue)
				set(isDebouncingAtom, true)
			}

			const onDebounceEnd = () => {
				set(_debouncedValueAtom, nextValue)
				set(isDebouncingAtom, false)
			}

			onDebounceStart()

			if (!shouldDebounceOnReset && nextValue === initialValue) {
				onDebounceEnd()
				return
			}

			const nextTimeoutId = setTimeout(() => {
				onDebounceEnd()
			}, delayMilliseconds)

			set(prevTimeoutAtom, nextTimeoutId)
		},
	)

	// Atom para limpar o timeout se necessário
	const clearTimeoutAtom = atom(null, (get, set) => {
		clearTimeout(get(prevTimeoutAtom))
		set(isDebouncingAtom, false)
	})

	return {
		currentValueAtom: _currentValueAtom,
		isDebouncingAtom,
		clearTimeoutAtom,
		debouncedValueAtom,
		_debouncedValueAtom, // Atom interno para sincronização direta
		_currentValueAtom, // Atom interno do valor atual (para sincronização direta)
	}
}
