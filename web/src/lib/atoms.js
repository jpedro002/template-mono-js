import { atom } from 'jotai'
import { atomWithDebounce } from 'src/lib/atom-debounce'

/**
 * Atom para controlar o breadcrumb
 * Exemplo: [{ label: 'Dashboard', href: '/' }, { label: 'Usuários', href: '/usuarios' }, { label: 'Detalhes' }]
 */
export const breadcrumbAtom = atom([{ label: 'Dashboard', href: '/' }])

/**
 * Atom para controlar a permissão necessária para criar novo recurso
 * Exemplo: 'usuarios:create'
 * Se null, o botão "Novo" não aparece
 */
export const createPermissionAtom = atom(null)

/**
 * Atom para controlar o texto do botão "Novo"
 */
export const newButtonLabelAtom = atom('Novo')

/**
 * Atom para controlar o callback do botão "Novo"
 */
export const onNewClickAtom = atom(null)

/**
 * Atom para controlar o placeholder do input de pesquisa
 */
export const searchPlaceholderAtom = atom('Pesquisar...')

/**
 * Atom para controlar se a busca deve ser visível
 */
export const showSearchAtom = atom(false)

/**
 * Atom para controlar se o header deve ser visível
 */
export const showHeaderAtom = atom(true)

/**
 * Atoms para pesquisa com debounce (500ms)
 * - searchCurrentValueAtom: valor enquanto está digitando
 * - searchValueAtom: valor após debounce (sincronizado com URL)
 * - isSearchingAtom: indica se está no período de debounce
 * - _searchDebouncedInternalAtom: atom interno do valor debounced (para sincronização direta)
 * - _searchCurrentInternalAtom: atom interno do valor atual (para sincronização direta)
 */
const searchDebounce = atomWithDebounce('', 500)
export const searchCurrentValueAtom = searchDebounce.currentValueAtom
export const searchValueAtom = searchDebounce.debouncedValueAtom
export const isSearchingAtom = searchDebounce.isDebouncingAtom
export const clearSearchTimeoutAtom = searchDebounce.clearTimeoutAtom
export const _searchDebouncedInternalAtom = searchDebounce._debouncedValueAtom
export const _searchCurrentInternalAtom = searchDebounce._currentValueAtom
