/**
 * EXEMPLO DE USO - Como usar os atoms para controlar o header em suas páginas
 *
 * Este arquivo demonstra como usar os atoms do Jotai para customizar o breadcrumb,
 * pesquisa e botão "Novo" em suas páginas.
 */

import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import {
	breadcrumbAtom,
	createPermissionAtom,
	newButtonLabelAtom,
	onNewClickAtom,
	searchPlaceholderAtom,
	searchValueAtom,
	showHeaderAtom,
	showSearchAtom,
} from 'src/lib/atoms'

/**
 * Hook customizado para configurar o header
 * Use este hook no início de suas páginas para configurar o breadcrumb e ações
 *
 * @example
 * useHeaderConfig({
 *   breadcrumbs: [
 *     { label: 'Dashboard', href: '/' },
 *     { label: 'Usuários' }
 *   ],
 *   createPermission: 'usuarios:create',
 *   newButtonLabel: 'Novo Usuário',
 *   onNewClick: () => navigate('/usuarios/novo'),
 *   searchPlaceholder: 'Buscar usuários...',
 *   showHeader: false  // Para ocultar completamente o header
 * })
 */
export function useHeaderConfig({
	breadcrumbs = [],
	createPermission = null,
	newButtonLabel = 'Novo',
	onNewClick = null,
	searchPlaceholder = 'Pesquisar...',
	showSearch = true,
	showHeader = true,
}) {
	const setBreadcrumbs = useSetAtom(breadcrumbAtom)
	const setCreatePermission = useSetAtom(createPermissionAtom)
	const setNewButtonLabel = useSetAtom(newButtonLabelAtom)
	const setOnNewClick = useSetAtom(onNewClickAtom)
	const setSearchPlaceholder = useSetAtom(searchPlaceholderAtom)
	const setSearchValue = useSetAtom(searchValueAtom)
	const setShowSearch = useSetAtom(showSearchAtom)
	const setShowHeader = useSetAtom(showHeaderAtom)

	useEffect(() => {
		setBreadcrumbs(breadcrumbs)
		setCreatePermission(createPermission)
		setNewButtonLabel(newButtonLabel)
		setOnNewClick(() => onNewClick)
		setSearchPlaceholder(searchPlaceholder)
		setShowSearch(showSearch)
		setShowHeader(showHeader)

		// Limpar ao desmontar
		return () => {
			setBreadcrumbs([{ label: 'Dashboard', href: '/' }])
			setCreatePermission(null)
			setNewButtonLabel('Novo')
			setOnNewClick(null)
			setSearchPlaceholder('Pesquisar...')
			setShowSearch(true)
			setShowHeader(true)
			// Nota: Não resetar searchValue pois é controlado pela sincronização de URL
		}
	}, [
		breadcrumbs,
		createPermission,
		newButtonLabel,
		onNewClick,
		searchPlaceholder,
		showSearch,
		showHeader,
		setBreadcrumbs,
		setCreatePermission,
		setNewButtonLabel,
		setOnNewClick,
		setSearchPlaceholder,
		setShowSearch,
		setShowHeader,
	])
}

/**
 * ============================================
 * EXEMPLO DE USO EM UMA PÁGINA
 * ============================================
 *
 * import { useNavigate } from 'react-router'
 * import { useHeaderConfig } from 'src/hooks/use-header-config'
 *
 * export function UsuariosPage() {
 *   const navigate = useNavigate()
 *
 *   // Configurar o header
 *   useHeaderConfig({
 *     breadcrumbs: [
 *       { label: 'Dashboard', href: '/' },
 *       { label: 'Usuários' }
 *     ],
 *     createPermission: 'usuarios:create',  // Permissão necessária para criar
 *     newButtonLabel: 'Novo Usuário',
 *     onNewClick: () => navigate('/usuarios/novo'),
 *     searchPlaceholder: 'Buscar por email ou nome...',
 *     showSearch: true  // Mostrar ou ocultar a busca (padrão: true)
 *   })
 *
 *   return (
 *     <div>
 *       // Seu conteúdo aqui
 *     </div>
 *   )
 * }
 *
 * ============================================
 * PERMISSÕES COMUNS
 * ============================================
 * 'usuarios:create'      - Criar novo usuário
 * 'usuarios:edit'        - Editar usuário
 * 'usuarios:delete'      - Deletar usuário
 * 'usuarios:*'           - Qualquer ação em usuários
 * '*:create'             - Criar qualquer recurso
 * '*'                    - Acesso total
 *
 * Se createPermission for null, o botão "Novo" não aparece.
 * Se o usuário não tiver permissão, o botão é ocultado automaticamente.
 */
