import { CircleCheck, CircleX, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useSearchParams } from 'react-router'
import { MarcaAuth, MolduraAuth } from 'src/components/moldura-auth'
import { Button } from 'src/components/ui/button'
import { useConfirmarEmail } from 'src/services/perfil'

/**
 * Destino do link enviado por e-mail — tanto o da troca de endereço quanto o da
 * verificação do endereço atual. É a mesma rota da API nos dois casos; o que
 * muda é a mensagem que ela devolve.
 *
 * Fica em `(public)` porque o link é aberto no cliente de e-mail, que pode nem
 * ser o browser onde a sessão está. Exigir login aqui deixaria o usuário sem
 * caminho justamente quando o e-mail é o que está em jogo.
 */
export default function Page() {
	const [searchParams] = useSearchParams()
	const token = searchParams.get('token') || ''
	const { mutateAsync: confirmarEmail } = useConfirmarEmail()
	const [resultado, setResultado] = useState(null)

	// StrictMode monta duas vezes em dev, e o token só vale uma: sem a trava a
	// segunda chamada sempre acharia o token já consumido e pintaria erro numa
	// confirmação que deu certo.
	const jaEnviou = useRef(false)

	useEffect(() => {
		if (!token || jaEnviou.current) return
		jaEnviou.current = true

		confirmarEmail(token)
			.then((resposta) =>
				setResultado({
					ok: true,
					mensagem: resposta?.message || 'E-mail confirmado com sucesso.',
				}),
			)
			.catch((erro) =>
				setResultado({
					ok: false,
					mensagem:
						erro?.response?.data?.message ||
						'Não foi possível confirmar o e-mail. O link pode ter expirado.',
				}),
			)
	}, [token, confirmarEmail])

	const semToken = !token

	return (
		<MolduraAuth>
			<Helmet>
				<title>Confirmação de e-mail</title>
			</Helmet>

			<div className='flex flex-1 flex-col items-center justify-center gap-6 text-center'>
				<MarcaAuth />

				{semToken ? (
					<Estado
						ok={false}
						titulo='Link inválido'
						mensagem='O endereço aberto não traz o token de confirmação. Use o link do e-mail exatamente como ele veio.'
					/>
				) : !resultado ? (
					<div className='flex flex-col items-center gap-3 text-muted-foreground'>
						<Loader2 className='size-8 animate-spin' />
						<p>Confirmando seu e-mail...</p>
					</div>
				) : (
					<Estado
						ok={resultado.ok}
						titulo={resultado.ok ? 'Tudo certo' : 'Não deu certo'}
						mensagem={resultado.mensagem}
					/>
				)}

				<Button asChild>
					<Link to='/auth'>Ir para o login</Link>
				</Button>
			</div>
		</MolduraAuth>
	)
}

function Estado({ ok, titulo, mensagem }) {
	const Icone = ok ? CircleCheck : CircleX

	return (
		<div className='flex max-w-md flex-col items-center gap-3'>
			<Icone
				className={ok ? 'size-10 text-emerald-600' : 'size-10 text-destructive'}
			/>
			<h1 className='font-semibold text-xl'>{titulo}</h1>
			<p className='text-muted-foreground'>{mensagem}</p>
		</div>
	)
}
