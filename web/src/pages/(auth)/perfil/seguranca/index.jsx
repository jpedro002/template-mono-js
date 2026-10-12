import { CircleCheck, CircleX, Loader2, Lock } from 'lucide-react'
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { CampoSenha } from 'src/components/campo-senha'
import { Button } from 'src/components/ui/button'
import { Skeleton } from 'src/components/ui/skeleton'
import { toast } from 'src/lib/toast'
import { cn } from 'src/lib/utils'
import {
	useConferirSenha,
	usePerfil,
	useTrocarSenha,
} from 'src/services/perfil'

const REGRAS = [
	{
		chave: 'tamanho',
		rotulo: 'Mínimo de 8 caracteres',
		testa: (s) => s.length >= 8,
	},
	{
		chave: 'maiuscula',
		rotulo: 'Uma letra maiúscula',
		testa: (s) => /[A-Z]/.test(s),
	},
	{
		chave: 'minuscula',
		rotulo: 'Uma letra minúscula',
		testa: (s) => /[a-z]/.test(s),
	},
	{
		chave: 'especial',
		rotulo: 'Um caractere especial (-!@#$%^&*())',
		testa: (s) => /[-!@#$%^&*()]/.test(s),
	},
]

const mensagemDeErro = (erro, padrao) =>
	erro?.response?.data?.message || erro?.message || padrao

/**
 * Troca da própria senha, em dois passos: conferir a atual, depois definir a
 * nova.
 *
 * O passo 1 existe porque a API confere a senha antiga de novo no
 * `update-password` — o `check-password` só libera o formulário, sem trocar
 * nada. Ele tem limite de tentativas do lado da API: é um oráculo de senha
 * para quem roubou um cookie.
 *
 * E-mail não verificado bloqueia a tela: sem endereço confirmado não há para
 * onde mandar a recuperação se a nova senha se perder.
 */
export default function Page() {
	const { data: perfil, isPending } = usePerfil()
	const conferir = useConferirSenha()
	const trocar = useTrocarSenha()

	const [senhaAtual, setSenhaAtual] = useState('')
	const [conferida, setConferida] = useState(false)
	const [nova, setNova] = useState('')
	const [confirmacao, setConfirmacao] = useState('')

	if (isPending) {
		return (
			<div className='space-y-6'>
				<Skeleton className='h-8 w-40' />
				<Skeleton className='h-10 w-full' />
				<Skeleton className='h-10 w-full' />
			</div>
		)
	}

	const verificado = Boolean(perfil?.emailVerifiedAt)
	const aprovadas = REGRAS.filter((r) => r.testa(nova))
	const novaValida = nova.length > 0 && aprovadas.length === REGRAS.length
	const podeSalvar = novaValida && nova === confirmacao

	const conferirSenhaAtual = async () => {
		if (!senhaAtual.trim()) {
			toast.error('A senha atual é obrigatória.')
			return
		}

		try {
			const { valida } = await conferir.mutateAsync(senhaAtual)
			if (!valida) {
				toast.error('A senha atual está incorreta.')
				return
			}
			setConferida(true)
			toast.success('Senha atual confirmada.')
		} catch (erro) {
			toast.error(mensagemDeErro(erro, 'Não foi possível verificar a senha.'))
		}
	}

	const salvar = async () => {
		try {
			await trocar.mutateAsync({ oldPassword: senhaAtual, newPassword: nova })
			setSenhaAtual('')
			setConferida(false)
			setNova('')
			setConfirmacao('')
			toast.success('Senha alterada com sucesso.')
		} catch (erro) {
			toast.error(mensagemDeErro(erro, 'Não foi possível alterar a senha.'))
		}
	}

	return (
		<div>
			<Helmet>
				<title>Segurança</title>
			</Helmet>

			<div className='mb-6'>
				<div className='mb-2 flex items-center gap-2'>
					<Lock className='size-6 text-primary' />
					<h1 className='font-semibold text-lg'>Segurança</h1>
				</div>
				<p className='text-muted-foreground'>
					Confirme a senha atual para definir uma nova.
				</p>
			</div>

			{!verificado && (
				<div className='mb-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-amber-900 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'>
					Seu e-mail ainda não foi verificado. Confirme-o em{' '}
					<span className='font-semibold'>Dados pessoais</span> antes de trocar
					a senha.
				</div>
			)}

			<fieldset
				disabled={!verificado}
				className='space-y-6 disabled:opacity-60'
			>
				<div className='flex items-end gap-2'>
					<div className='flex-1'>
						<CampoSenha
							id='senha-atual'
							label='Senha atual'
							value={senhaAtual}
							onChange={setSenhaAtual}
							disabled={conferida}
							autoComplete='current-password'
						/>
					</div>
					{!conferida && (
						<Button
							type='button'
							variant='outline'
							onClick={conferirSenhaAtual}
							disabled={conferir.isPending}
						>
							{conferir.isPending ? (
								<>
									<Loader2 className='mr-2 size-4 animate-spin' />
									Conferindo...
								</>
							) : (
								'Confirmar'
							)}
						</Button>
					)}
				</div>

				<CampoSenha
					id='senha-nova'
					label='Nova senha'
					value={nova}
					onChange={setNova}
					disabled={!conferida}
					autoComplete='new-password'
				/>

				<ul className='space-y-1 text-sm'>
					{REGRAS.map((regra) => {
						const ok = regra.testa(nova)
						const Icone = ok ? CircleCheck : CircleX
						return (
							<li
								key={regra.chave}
								className={cn(
									'flex items-center gap-2',
									ok ? 'text-emerald-600' : 'text-muted-foreground',
								)}
							>
								<Icone className='size-4' />
								{regra.rotulo}
							</li>
						)
					})}
				</ul>

				<CampoSenha
					id='senha-confirmacao'
					label='Confirmar nova senha'
					value={confirmacao}
					onChange={setConfirmacao}
					disabled={!conferida || !novaValida}
					autoComplete='new-password'
				/>

				{confirmacao.length > 0 && nova !== confirmacao && (
					<p className='text-destructive text-sm'>As senhas não conferem.</p>
				)}

				<div className='flex justify-end pt-4'>
					<Button
						onClick={salvar}
						disabled={!conferida || !podeSalvar || trocar.isPending}
						className='px-8'
					>
						{trocar.isPending ? (
							<>
								<Loader2 className='mr-2 size-4 animate-spin' />
								Salvando...
							</>
						) : (
							'Salvar nova senha'
						)}
					</Button>
				</div>
			</fieldset>
		</div>
	)
}
