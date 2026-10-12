import {
	ArrowLeft,
	ChevronDown,
	Copy,
	Home,
	RotateCw,
	ServerCrash,
	ShieldX,
	WifiOff,
} from 'lucide-react'
import { Component, useEffect, useState } from 'react'
import { MarcaAuth } from 'src/components/moldura-auth'
import { Button } from 'src/components/ui/button'

/**
 * Tela de erro do app inteiro — o `errorElement` da rota raiz e o boundary de
 * classe em volta do `<App />`. Sem ela o React Router mostra a página crua
 * "Unexpected Application Error!" com o stack em vermelho.
 *
 * Não usa hook do router (`useNavigate`, `Link`) de propósito: o boundary de
 * classe fica **fora** do `RouterProvider`, então a navegação é por
 * `window.location`, que funciona nos dois lugares e ainda descarta o estado
 * que quebrou.
 */

// Depois de um deploy, a aba aberta pede um chunk com hash antigo que não existe
// mais. Não é bug da tela: recarregar resolve.
const CHUNK_VELHO =
	/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i

const CHAVE_RECARGA = 'app:recarga-chunk'

/**
 * Chamado no boot: se o app ficou de pé por alguns segundos depois de uma
 * recarga automática, ela funcionou — tira a marca para que o próximo deploy
 * também recarregue sozinho.
 */
export function liberarRecargaAutomatica() {
	setTimeout(() => {
		try {
			sessionStorage.removeItem(CHAVE_RECARGA)
		} catch {
			// Sem sessionStorage (aba privada restrita): nada a limpar.
		}
	}, 10_000)
}

export const ehChunkVelho = (erro) =>
	CHUNK_VELHO.test(String(erro?.message ?? erro))

function classificar(erro) {
	const status = erro?.status

	if (status === 404)
		return {
			icone: ServerCrash,
			titulo: 'Página não encontrada',
			texto: 'O endereço não existe ou foi movido.',
		}
	if (status === 401 || status === 403)
		return {
			icone: ShieldX,
			titulo: 'Acesso negado',
			texto: 'Seu perfil não tem permissão para abrir esta página.',
		}
	if (ehChunkVelho(erro))
		return {
			icone: WifiOff,
			titulo: 'O sistema foi atualizado',
			texto:
				'Esta aba ficou com uma versão antiga. Recarregue para continuar de onde parou.',
		}
	return {
		icone: ServerCrash,
		titulo: 'Algo deu errado nesta tela',
		texto:
			'Um erro inesperado interrompeu a página. Tente recarregar; se continuar, avise o suporte com os detalhes abaixo.',
	}
}

function detalheTecnico(erro) {
	if (!erro) return ''
	if (erro.status)
		return `${erro.status} ${erro.statusText ?? ''}\n${erro.data ?? ''}`.trim()
	const cabecalho =
		erro.name && erro.message ? `${erro.name}: ${erro.message}` : String(erro)
	// No V8 o stack já começa pela própria mensagem; repetir só polui.
	if (erro.stack?.startsWith(cabecalho)) return erro.stack
	return [cabecalho, erro.stack].filter(Boolean).join('\n\n')
}

export function TelaErro({ erro }) {
	const [abertos, setAbertos] = useState(import.meta.env.DEV)
	const [copiado, setCopiado] = useState(false)
	const { icone: Icone, titulo, texto } = classificar(erro)
	const detalhe = detalheTecnico(erro)
	const chunkVelho = ehChunkVelho(erro)

	// Chunk velho: recarrega sozinho uma vez. A marca no sessionStorage impede
	// laço se o servidor estiver de fato fora — aí a tela fica parada aqui.
	useEffect(() => {
		if (!chunkVelho) return
		try {
			if (sessionStorage.getItem(CHAVE_RECARGA)) return
			sessionStorage.setItem(CHAVE_RECARGA, '1')
		} catch {
			return
		}
		window.location.reload()
	}, [chunkVelho])

	useEffect(() => {
		if (erro && !erro.status) console.error(erro)
	}, [erro])

	const copiar = async () => {
		try {
			await navigator.clipboard.writeText(
				`${window.location.href}\n${new Date().toISOString()}\n\n${detalhe}`,
			)
			setCopiado(true)
			setTimeout(() => setCopiado(false), 2000)
		} catch {
			// Sem permissão de área de transferência: o texto segue visível.
		}
	}

	return (
		<main className='flex min-h-svh items-center justify-center bg-background p-4'>
			<title>Erro</title>
			<div className='w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm sm:p-8'>
				<MarcaAuth className='h-9' />

				<div className='mt-8 flex items-start gap-4'>
					<span className='grid size-12 shrink-0 place-items-center rounded-xl bg-act text-act-fg'>
						<Icone className='size-6' aria-hidden />
					</span>
					<div className='min-w-0'>
						<h1 className='text-h1'>{titulo}</h1>
						<p className='mt-1 text-body text-muted-foreground'>{texto}</p>
					</div>
				</div>

				<div className='mt-8 flex flex-col-reverse gap-2 sm:flex-row'>
					<Button
						variant='ghost'
						onClick={() => {
							if (window.history.length > 1) window.history.back()
							else window.location.assign('/')
						}}
					>
						<ArrowLeft />
						Voltar
					</Button>
					<Button
						variant='outline'
						className='sm:ml-auto'
						onClick={() => window.location.assign('/')}
					>
						<Home />
						Início
					</Button>
					<Button onClick={() => window.location.reload()}>
						<RotateCw />
						Recarregar
					</Button>
				</div>

				{detalhe && !erro?.status && (
					<div className='mt-6 border-t pt-4'>
						<div className='flex items-center justify-between gap-2'>
							<button
								type='button'
								aria-expanded={abertos}
								onClick={() => setAbertos((v) => !v)}
								className='inline-flex items-center gap-1 rounded-sm font-medium text-caption text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
							>
								Detalhes técnicos
								<ChevronDown
									className={`size-3.5 transition-transform ${abertos ? 'rotate-180' : ''}`}
									aria-hidden
								/>
							</button>
							<Button variant='ghost' size='sm' onClick={copiar}>
								<Copy />
								{copiado ? 'Copiado' : 'Copiar'}
							</Button>
						</div>
						{abertos && (
							<pre className='mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-[11px] text-muted-foreground leading-relaxed'>
								{detalhe}
							</pre>
						)}
					</div>
				)}
			</div>
		</main>
	)
}

/**
 * Rede de segurança para o que estoura fora do `RouterProvider` (providers do
 * `App`). Erro dentro de rota cai no `errorElement`, que usa a mesma tela.
 */
export class LimiteDeErro extends Component {
	state = { erro: null }

	static getDerivedStateFromError(erro) {
		return { erro }
	}

	render() {
		if (this.state.erro) return <TelaErro erro={this.state.erro} />
		return this.props.children
	}
}
