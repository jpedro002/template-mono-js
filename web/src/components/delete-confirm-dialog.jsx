import { AlertTriangle, Loader2 } from 'lucide-react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from 'src/components/ui/alert-dialog'

/**
 * Componente de diálogo de confirmação para delete com aparência destrutiva
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Estado do dialog
 * @param {Function} props.onOpenChange - Callback para mudança de estado
 * @param {Function} props.handleConfirm - Callback ao confirmar
 * @param {Function} props.handleCancel - Callback ao cancelar
 * @param {Object} props.config - Configurações do dialog
 * @param {string} props.config.title - Título do dialog
 * @param {string} props.config.description - Descrição/mensagem
 * @param {string} props.config.confirmText - Texto do botão confirmar
 * @param {string} props.config.cancelText - Texto do botão cancelar
 * @param {import('react').ComponentType} [props.config.icone] - Ícone do selo (padrão: alerta)
 * @param {import('react').ReactNode} [props.children] - Conteúdo entre a descrição e os botões
 * @param {boolean} props.isPending - Estado de loading
 *
 * @example
 * const deleteConfirmation = useDeleteWithConfirmation(deleteMutation)
 *
 * <DeleteConfirmDialog {...deleteConfirmation} />
 */
export function DeleteConfirmDialog({
	isOpen,
	onOpenChange,
	handleConfirm,
	handleCancel,
	config,
	isPending,
	children,
}) {
	const Icone = config.icone ?? AlertTriangle

	return (
		<AlertDialog open={isOpen} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader className='flex-row items-start gap-3 text-left'>
					<span className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive'>
						<Icone className='size-5' />
					</span>
					<div className='min-w-0 space-y-1.5'>
						<AlertDialogTitle>{config.title}</AlertDialogTitle>
						<AlertDialogDescription>
							{config.description}
						</AlertDialogDescription>
					</div>
				</AlertDialogHeader>
				{children}
				<AlertDialogFooter className='border-t pt-4'>
					<AlertDialogCancel onClick={handleCancel} disabled={isPending}>
						{config.cancelText}
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleConfirm}
						disabled={isPending}
						className='bg-destructive text-white hover:bg-destructive/85 disabled:opacity-50 disabled:cursor-not-allowed'
					>
						{isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
						{config.confirmText}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
