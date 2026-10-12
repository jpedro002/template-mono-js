import { Loader2, MailCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from 'src/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'src/components/ui/dialog'
import { Input } from 'src/components/ui/input'
import { Label } from 'src/components/ui/label'
import { useForgotPassword } from 'src/services/auth'

/**
 * Recuperação de senha, como no Next: mesmo diálogo em dois estados —
 * formulário e confirmação.
 *
 * A confirmação não diz se o e-mail existe, porque a API também não: a resposta
 * de `POST /seguranca/auth/forgot-password` é idêntica para cadastrado e não
 * cadastrado, senão o formulário viraria consulta de quem tem conta. Por isso o
 * texto fala do que foi feito ("se existir conta, o link foi enviado"), não do
 * que foi encontrado.
 */
export function DialogoEsqueciSenha({ open, onOpenChange, emailInicial = '' }) {
	const [email, setEmail] = useState(emailInicial)
	const [enviado, setEnviado] = useState(false)
	const [erro, setErro] = useState(null)
	const forgotMutation = useForgotPassword()

	// Reabrir o diálogo recomeça do zero, já com o que a pessoa digitou no login
	// — que é o caso comum: errou a senha, o e-mail está certo ali em cima.
	useEffect(() => {
		if (open) {
			setEmail(emailInicial?.trim() || '')
			setEnviado(false)
			setErro(null)
		}
	}, [open, emailInicial])

	const enviar = async () => {
		const alvo = email.trim()

		if (!alvo) {
			setErro('Informe um e-mail para recuperar a senha.')
			return
		}

		try {
			setErro(null)
			await forgotMutation.mutateAsync(alvo)
			setEnviado(true)
		} catch (erroApi) {
			setErro(
				erroApi?.response?.data?.message ||
					'Não foi possível enviar agora. Tente de novo em instantes.',
			)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Recuperar senha</DialogTitle>
					<DialogDescription>
						{enviado
							? 'Confira sua caixa de entrada.'
							: 'Informe seu e-mail para receber as instruções de redefinição.'}
					</DialogDescription>
				</DialogHeader>

				{enviado ? (
					<div className='flex items-start gap-3 rounded-md border border-border bg-background p-3'>
						<MailCheck
							aria-hidden='true'
							className='mt-0.5 size-4 shrink-0 text-success'
						/>
						<p className='text-body text-muted-foreground'>
							Se existir uma conta com <strong>{email.trim()}</strong>, o link
							de redefinição já está a caminho. Ele vale por 1 hora e serve uma
							vez só.
						</p>
					</div>
				) : (
					<div className='space-y-2'>
						<Label htmlFor='esqueci-email'>E-mail</Label>
						<Input
							id='esqueci-email'
							type='email'
							autoComplete='email'
							placeholder='seu@exemplo.com'
							value={email}
							onChange={(evento) => setEmail(evento.target.value)}
							onKeyDown={(evento) => {
								// O diálogo não é um `<form>`; sem isto, Enter fecha em vez de
								// enviar.
								if (evento.key === 'Enter') {
									evento.preventDefault()
									enviar()
								}
							}}
							aria-invalid={Boolean(erro) || undefined}
							aria-describedby={erro ? 'esqueci-erro' : undefined}
							disabled={forgotMutation.isPending}
						/>
						{erro && (
							<p id='esqueci-erro' className='text-caption text-destructive'>
								{erro}
							</p>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						type='button'
						variant='outline'
						onClick={() => onOpenChange(false)}
					>
						{enviado ? 'Entendi' : 'Fechar'}
					</Button>
					{!enviado && (
						<Button
							type='button'
							onClick={enviar}
							disabled={forgotMutation.isPending}
						>
							{forgotMutation.isPending && (
								<Loader2 className='size-4 animate-spin' />
							)}
							{forgotMutation.isPending ? 'Enviando…' : 'Enviar link'}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
