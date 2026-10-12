import { MoreVertical } from 'lucide-react'
import { Fragment } from 'react'
import { useNavigate } from 'react-router'
import { ItemDoMenu } from 'src/components/item-do-menu'
import { Button } from 'src/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu'
import { useAuthPermissions } from 'src/contexts/auth-context'
import { temPermissoes } from 'src/lib/permissions'

/**
 * Menu "⋮" de uma linha no padrão do Executar Ação: rótulo e título no topo,
 * cada item com ícone, título e uma linha de contexto. Item `perigo` vai num
 * grupo à parte, depois de um separador. Sem item visível, o menu não aparece.
 *
 * @param {object} props
 * @param {string} props.rotulo  linha pequena em caixa alta
 * @param {string} props.titulo  o nome da linha
 * @param {{
 *   icone: import('react').ComponentType,
 *   titulo: string,
 *   descricao?: string,
 *   permissao?: string | string[],
 *   to?: string,
 *   onSelect?: () => void,
 *   perigo?: boolean,
 *   destaque?: boolean,
 *   disabled?: boolean,
 * }[]} props.itens  `false`/`null` são ignorados, para montar com `&&`
 */
export function MenuDeAcoes({ rotulo, titulo, itens }) {
	const navigate = useNavigate()
	const permissoes = useAuthPermissions()

	const visiveis = itens.filter(
		(item) =>
			item && (!item.permissao || temPermissoes(item.permissao, permissoes)),
	)
	if (visiveis.length === 0) return null

	const grupos = [
		visiveis.filter((item) => !item.perigo),
		visiveis.filter((item) => item.perigo),
	].filter((grupo) => grupo.length > 0)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant='ghost'
					size='icon'
					className='size-8 shrink-0'
					aria-label={`Ações de ${titulo}`}
				>
					<MoreVertical className='size-4' />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align='end' className='w-72 p-1.5'>
				<DropdownMenuLabel className='px-2 pt-1.5 pb-2'>
					<p className='text-overline text-muted-foreground uppercase'>
						{rotulo}
					</p>
					<p className='line-clamp-2 font-medium text-foreground text-sm leading-snug'>
						{titulo}
					</p>
				</DropdownMenuLabel>
				{grupos.map((grupo) => (
					<Fragment key={grupo[0].titulo}>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							{grupo.map(
								({
									icone,
									titulo: tituloItem,
									to,
									onSelect,
									permissao,
									...resto
								}) => (
									<ItemDoMenu
										key={tituloItem}
										icone={icone}
										titulo={tituloItem}
										onSelect={() => (to ? navigate(to) : onSelect?.())}
										{...resto}
									/>
								),
							)}
						</DropdownMenuGroup>
					</Fragment>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
