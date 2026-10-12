import { CircleCheck, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useSearchParams } from 'react-router'
import { CampoSenha } from 'src/components/campo-senha'
import { MarcaAuth, MolduraAuth } from 'src/components/moldura-auth'
import { Button } from 'src/components/ui/button'
import { useResetPassword } from 'src/services/auth'

/**
 * Destino do link de recuperação de senha. Fica em `(public)`: quem esqueceu a
 * senha não tem sessão.
 */
export default function Page() {
	const [searchParams] = useSearchParams()
	const token = searchParams.get('token') || ''
	const { mutate, isPending, isSuccess, error } = useResetPassword()
	const [password, setPassword] = useState('')
	const [confirmacao, setConfirmacao] = useState('')
	const [erroLocal, setErroLocal] = useState('')

	const enviar = (e) => {
		e.preventDefault()
		if (password !== confirmacao) {
			setErroLocal('A confirmação da senha não confere.')
			return
		}
		setErroLocal('')
		mutate({ token, password, password_confirmation: confirmacao })
	}

	const erro =
		erroLocal ||
		error?.response?.data?.message ||
		(error && 'Não foi possível redefinir a senha. O link pode ter expirado.')

	return (
		<MolduraAuth>
			<Helmet>
				<title>Redefinir senha</title>
			</Helmet>

			<div className='flex flex-1 flex-col items-center justify-center gap-6'>
				<MarcaAuth />

				{!token ? (
					<p className='max-w-md text-center text-muted-foreground'>
						O endereço aberto não traz o token. Use o link do e-mail exatamente
						como ele veio.
					</p>
				) : isSuccess ? (
					<div className='flex max-w-md flex-col items-center gap-3 text-center'>
						<CircleCheck className='size-10 text-emerald-600' />
						<h1 className='font-semibold text-xl'>Senha redefinida</h1>
						<p className='text-muted-foreground'>Entre com a nova senha.</p>
					</div>
				) : (
					<form
						onSubmit={enviar}
						className='flex w-full max-w-sm flex-col gap-4'
					>
						<h1 className='text-center font-semibold text-xl'>
							Defina uma nova senha
						</h1>
						<CampoSenha
							id='password'
							label='Nova senha'
							autoComplete='new-password'
							value={password}
							onChange={setPassword}
						/>
						<CampoSenha
							id='confirmacao'
							label='Confirme a senha'
							autoComplete='new-password'
							value={confirmacao}
							onChange={setConfirmacao}
						/>
						{erro && <p className='text-destructive text-sm'>{erro}</p>}
						<Button type='submit' disabled={isPending}>
							{isPending && <Loader2 className='size-4 animate-spin' />}
							Redefinir senha
						</Button>
					</form>
				)}

				<Button asChild variant='link'>
					<Link to='/auth'>Ir para o login</Link>
				</Button>
			</div>
		</MolduraAuth>
	)
}
