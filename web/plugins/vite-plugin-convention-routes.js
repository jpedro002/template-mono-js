import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'glob'

const generateRoutes = async (pagesDir, routesFile, excludePatterns = []) => {
	try {
		const routesDir = path.dirname(routesFile)
		await fs.mkdir(routesDir, { recursive: true })
	} catch (error) {
		if (error.code !== 'EEXIST') {
			throw error
		}
	}

	// MODIFICADO: Adicionado '**/loading.jsx' e tsx para ignorar
	const defaultIgnore = [
		'**/_*.jsx',
		'**/_*.tsx',
		'**/layout.jsx',
		'**/error.jsx',
		'**/loading.jsx', // NOVO
		'**/loading.tsx', // NOVO
		'**/__*/**',
	]

	const ignore = [
		...defaultIgnore,
		...(Array.isArray(excludePatterns) ? excludePatterns : [excludePatterns]),
	].filter(Boolean)

	const files = (
		await glob('**/*.{jsx,tsx}', {
			cwd: pagesDir,
			ignore,
		})
	).map((file) => file.replace(/\\/g, '/'))

	const imports = new Set()
	const layoutImports = new Set() // Imports diretos para layouts
	const loadingImports = new Set() // Imports diretos para loadings
	const guardaImports = new Set() // Import direto do gate de permissão
	const routesMap = new Map()
	const preloadMap = new Map()
	const permissoesPorRota = new Map()

	// MODIFICADO: Adicionado Suspense e Outlet
	imports.add(`import { lazy, Suspense } from 'react';`)
	imports.add(
		`import { createBrowserRouter, Navigate, Outlet } from 'react-router';`,
	)

	const isInvisibleFolder = (folderName) =>
		folderName.startsWith('(') && folderName.endsWith(')')

	// Processar cada arquivo de página
	for (const file of files) {
		const routePath = fileToRoutePath(file)
		const importPath = `${path.join(pagesDir, file)}`
		const normalizedImportPath = normalizePath(importPath)
		const componentName = `P_${Math.random().toString(36).substring(2, 9)}`
		const guarda = await lerGuardaDaPagina(importPath)

		imports.add(
			`const ${componentName} = lazy(() => import('${normalizedImportPath}'));`,
		)
		preloadMap.set(routePath, `() => import('${normalizedImportPath}')`)

		if (guarda) {
			guardaImports.add(
				`import { PermissionRoute } from 'src/components/protected-route';`,
			)
			permissoesPorRota.set(urlDaRota(routePath), guarda)
		}

		const segments = file.split('/')
		const isIndex =
			segments[segments.length - 1].replace(/\.(jsx|tsx)$/, '') === 'index'

		let currentLevel = routesMap
		let physicalPath = ''

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i]
			const isFile = i === segments.length - 1
			physicalPath = path.join(physicalPath, segment)

			if (isFile) {
				currentLevel.set(segment, {
					type: 'route',
					path: isIndex
						? ''
						: segment.replace(/\.(jsx|tsx)$/, '').replace(/\[(\w+)\]/g, ':$1'),
					element: componentName,
					isIndex,
					filePath: file,
					guarda,
				})
			} else {
				const isInvisible = isInvisibleFolder(segment)
				const routeSegment = isInvisible
					? ''
					: segment.replace(/\[(\w+)\]/g, ':$1')

				if (!currentLevel.has(segment))
					currentLevel.set(segment, {
						type: 'group',
						physicalName: segment,
						routeSegment,
						children: new Map(),
						isInvisible,
					})

				const nextGroup = currentLevel.get(segment)
				if (!nextGroup.children) nextGroup.children = new Map()
				currentLevel = nextGroup.children
			}
		}
	}

	// Verificar layout, error e loading da raiz
	const rootLayoutPath = path.join(pagesDir, 'layout.jsx')
	const hasRootLayout = await fileExists(rootLayoutPath)
	const rootErrorPath = path.join(pagesDir, 'error.jsx')
	const hasRootError = await fileExists(rootErrorPath)

	// NOVO: Verificar Loading na raiz
	const rootLoadingPath = path.join(pagesDir, 'loading.jsx')
	const hasRootLoading = await fileExists(rootLoadingPath)

	// Importar loading raiz diretamente (usado como fallback)
	let rootLoadingName = null
	if (hasRootLoading) {
		rootLoadingName = 'RootLoading'
		const normalizedRootLoadingPath = normalizePath(rootLoadingPath)
		loadingImports.add(
			`import ${rootLoadingName} from '${normalizedRootLoadingPath}';`,
		)
	}

	// Função recursiva para gerar estrutura de rotas
	const generateRouteStructure = async (
		map,
		parentPhysicalPath = '',
		parentLoadingName = rootLoadingName,
	) => {
		const routes = []

		for (const [physicalName, value] of map) {
			if (value.type === 'route') {
				// Envolver páginas em Suspense com loading apropriado
				const loadingFallback = parentLoadingName
					? `<${parentLoadingName} />`
					: null
				const suspense = loadingFallback
					? `<Suspense fallback={${loadingFallback}}><${value.element} /></Suspense>`
					: `<${value.element} />`

				// O gate fica **por fora** do `Suspense`, e é isso que resolve o
				// achado 41 da auditoria: `React.lazy` só chama o `import()` quando o
				// componente é renderizado, então a página negada nem baixa o chunk —
				// sem módulo carregado não há hook para disparar consulta antes do
				// redirect. Enquanto o gate morava no JSX de retorno da página, os
				// hooks do corpo já tinham rodado quando o `<Navigate to='/404'>`
				// acontecia, e algumas rotas negadas mandavam 4
				// requisições que a API recusava com 403.
				const pageElement = value.guarda
					? `<PermissionRoute permission={${value.guarda.permissao}}${
							value.guarda.todas ? ' requireAll' : ''
						}>${suspense}</PermissionRoute>`
					: suspense

				if (value.isIndex) {
					routes.push(`{ index: true, element: ${pageElement} }`)
				} else {
					routes.push(`{
                        path: '${value.path}',
                        element: ${pageElement}
                    }`)
				}
			} else if (value.type === 'group') {
				const groupPhysicalPath = path.join(parentPhysicalPath, physicalName)
				const groupRoutePath = value.routeSegment
				const isInvisible = value.isInvisible

				// Verificar arquivos especiais (layout, error, loading)
				const layoutPath = path.join(pagesDir, groupPhysicalPath, 'layout.jsx')
				const hasLayout = await fileExists(layoutPath)

				const errorBoundaryPath = path.join(
					pagesDir,
					groupPhysicalPath,
					'error.jsx',
				)
				const hasErrorBoundary = await fileExists(errorBoundaryPath)

				// NOVO: Verificar loading
				const loadingPath = path.join(
					pagesDir,
					groupPhysicalPath,
					'loading.jsx',
				)
				const hasLoading = await fileExists(loadingPath)

				// 1. Resolver Loading Component (import direto)
				let loadingComponentName = parentLoadingName // Herda o loading do pai por padrão
				if (hasLoading) {
					loadingComponentName = `Load_${Math.random().toString(36).substring(2, 9)}`
					const normalizedLoadingPath = normalizePath(loadingPath)
					loadingImports.add(
						`import ${loadingComponentName} from '${normalizedLoadingPath}';`,
					)
				}

				// Gerar rotas filhas passando o loading apropriado
				const childRoutes = await generateRouteStructure(
					value.children,
					groupPhysicalPath,
					loadingComponentName, // Passa loading para os filhos
				)

				// 2. Resolver Layout Component (import direto, sem lazy)
				let elementCode = null
				if (hasLayout) {
					const layoutName = `L_${Math.random().toString(36).substring(2, 9)}`
					const normalizedLayoutPath = normalizePath(layoutPath)
					layoutImports.add(
						`import ${layoutName} from '${normalizedLayoutPath}';`,
					)
					// Layout não entra no mapa de preload: já é import estático, e a
					// chave dele colidia com a da página índice — `'/'` apontava para
					// `pages/layout.jsx` e o preload da home não fazia nada.

					elementCode = `<${layoutName} />`
				}

				const groupProperties = []

				// Se definimos um elemento (seja layout ou wrapper de loading)
				if (elementCode) {
					groupProperties.push(`element: ${elementCode}`)
				}

				if (hasErrorBoundary) {
					const errorBoundaryName = `E_${Math.random().toString(36).substring(2, 9)}`
					const normalizedBoundaryPath = normalizePath(errorBoundaryPath)
					// Import direto, como o layout: a tela de erro não pode depender de
					// baixar um chunk — o erro mais comum depois de um deploy é
					// justamente o chunk antigo que sumiu — nem suspender sem um
					// Suspense em volta.
					layoutImports.add(
						`import ${errorBoundaryName} from '${normalizedBoundaryPath}';`,
					)
					groupProperties.push(`errorElement: <${errorBoundaryName} />`)
				}

				if (childRoutes.trim()) {
					groupProperties.push(`children: [ ${childRoutes} ]`)
				}

				if (isInvisible) {
					if (groupProperties.length > 0) {
						routes.push(`{ ${groupProperties.join(',\n')} }`)
					} else if (childRoutes.trim()) {
						routes.push(childRoutes)
					}
				} else {
					const routeObject = [`path: '${groupRoutePath}'`, ...groupProperties]
					routes.push(`{ ${routeObject.join(',\n')} }`)
				}
			}
		}

		return routes.join(',\n')
	}

	// Gerar estrutura principal
	let routesCode = await generateRouteStructure(routesMap, '')

	// MODIFICADO: Aplicar layout e/ou error boundary raiz se existirem
	if (hasRootLayout || hasRootError) {
		const rootRouteObject = ["path: '/'"]

		let rootElementCode = null

		// Preparar Layout Raiz (import direto)
		if (hasRootLayout) {
			const rootLayoutName = 'RootLayout'
			const normalizedRootLayoutPath = normalizePath(rootLayoutPath)
			layoutImports.add(
				`import ${rootLayoutName} from '${normalizedRootLayoutPath}';`,
			)
			rootElementCode = `<${rootLayoutName} />`
		}

		if (rootElementCode) {
			rootRouteObject.push(`element: ${rootElementCode}`)
		}

		if (hasRootError) {
			const rootErrorName = `E_root_${Math.random().toString(36).substring(2, 9)}`
			const normalizedRootErrorPath = normalizePath(rootErrorPath)
			layoutImports.add(
				`import ${rootErrorName} from '${normalizedRootErrorPath}';`,
			)
			rootRouteObject.push(`errorElement: <${rootErrorName} />`)
		}

		rootRouteObject.push(`children: [ ${routesCode} ]`)
		routesCode = `{ ${rootRouteObject.join(',\n')} }`
	}

	// Gerar mapa de pré-carregamento (igual ao original)
	let preloadMapCode = 'export const routePreloadMap = {\n'
	for (const [routePath, importFn] of preloadMap) {
		// A chave é a URL de verdade — `urlDaRota` tira as pastas invisíveis; com
		// o caminho físico (`/(auth)/planejar/projetos`) nenhum
		// `preloadRoute('/planejar/projetos')` achava entrada.
		preloadMapCode += `  '${urlDaRota(normalizePath(routePath))}': ${importFn},
`
	}
	preloadMapCode += '};\n\n'

	// Função de pré-carregamento (igual ao original)
	const preloadFunctionCode = `
    export function preloadRoute(path) {
      const canPreload = !navigator.connection?.saveData &&
                        navigator.connection?.effectiveType !== 'slow-2g';
      if (!canPreload) return

      const route = normalizeRoutePath(path);
      const preloader = routePreloadMap[route];

      if (preloader) {
        preloader().catch(error => {
          console.error('Route preload failed:', error);
        });
      }
    }

function normalizeRoutePath(path) {
  let normalized = path.split('?')[0];
  normalized = normalized.split('#')[0];

  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  normalized = normalized.replace(/\\/$/, '');
  return normalized || '/';
}
`

	// Mapa rota→permissão para quem precisa da mesma resposta fora do roteador —
	// hoje o menu, que perguntava a mesma coisa por conta própria e podia
	// divergir da página (`/planejar/analise-performance` pedia 1 permissão no
	// menu e 2 na página).
	//
	// Em arquivo separado de propósito: o menu é montado pelo layout, que o
	// próprio `routes.jsx` importa. Ler o mapa de lá fecharia um ciclo de import
	// com a constante ainda em TDZ.
	let permissaoMapCode =
		'// ARQUIVO GERADO AUTOMATICAMENTE - NÃO EDITAR MANUALMENTE\n' +
		'export const rotaPermissoes = {\n'
	for (const [url, guarda] of permissoesPorRota) {
		permissaoMapCode += `  '${url}': { permissao: ${guarda.permissao}, todas: ${guarda.todas} },\n`
	}
	permissaoMapCode += '};\n'
	await escreverSeMudou(
		path.join(path.dirname(routesFile), 'rota-permissoes.js'),
		permissaoMapCode,
	)

	// Mapa e função de preload em arquivo próprio, pelo mesmo motivo de
	// `rota-permissoes.js`: quem pré-carrega é o menu (e o `ProtectedRoute`),
	// montados pelo layout que o próprio `routes.jsx` importa — ler daqui
	// fecharia um ciclo de import.
	await escreverSeMudou(
		path.join(path.dirname(routesFile), 'rota-preload.js'),
		`// ARQUIVO GERADO AUTOMATICAMENTE - NÃO EDITAR MANUALMENTE
${preloadMapCode}${preloadFunctionCode}`,
	)

	const outputContent = `// ARQUIVO GERADO AUTOMATICAMENTE - NÃO EDITAR MANUALMENTE
${Array.from(layoutImports).join('\n')}
${Array.from(loadingImports).join('\n')}
${Array.from(guardaImports).join('\n')}
${Array.from(imports).join('\n')}

export const routes = createBrowserRouter([
  ${routesCode},
  { path: '*', element: <Navigate to="/404" replace /> }
]);

export default routes;
`

	await escreverSeMudou(routesFile, outputContent)
}

/**
 * Grava em arquivo temporário e renomeia.
 *
 * `fs.writeFile` trunca antes de escrever: o watcher do Vite dispara nesse
 * intervalo e o HMR lia o módulo vazio — daí o
 * `does not provide an export named 'rotaPermissoes'`. O `rename` é atômico,
 * então o watcher só vê o conteúdo completo. Não regravar quando o conteúdo
 * é igual evita invalidar o módulo a cada salvamento de qualquer página.
 */
async function escreverSeMudou(destino, conteudo) {
	const atual = await fs.readFile(destino, 'utf-8').catch(() => null)
	if (atual === conteudo) return

	// O sufixo tem contador além do pid: duas gerações concorrentes (dois
	// saves seguidos) montavam o mesmo nome, uma renomeava e a outra morria
	// com ENOENT no tmp que já não existia.
	const temporario = `${destino}.${process.pid}.${sequenciaTmp++}.tmp`
	await fs.writeFile(temporario, conteudo)

	// No Windows o rename falha com EPERM enquanto outro processo (watcher do
	// Vite, antivírus, indexador) tem o destino aberto. É transitório: alguns
	// ms depois passa. Sem a retentativa a rejeição derrubava o `bun dev`.
	for (let tentativa = 0; ; tentativa++) {
		try {
			await fs.rename(temporario, destino)
			return
		} catch (erro) {
			if (erro.code !== 'EPERM' && erro.code !== 'EACCES') throw erro
			if (tentativa >= 9) {
				await fs.rm(temporario, { force: true })
				throw erro
			}
			await new Promise((resolver) =>
				setTimeout(resolver, 30 * (tentativa + 1)),
			)
		}
	}
}

let sequenciaTmp = 0

// ... (Resto das funções utilitárias: fileToRoutePath, fileExists, normalizePath, etc. permanecem iguais)

/**
 * A permissão que a página declara, lida do fonte **em tempo de build**.
 *
 * O contrato é uma linha só, para ser lida por regex e achada por `grep`:
 *
 *     export const permissao = 'etapas:read'
 *     export const permissao = ['cards:read', 'users:read']
 *     export const permissaoTodas = true   // exige todas, não qualquer uma
 *
 * O texto do valor é copiado **verbatim** para o arquivo de rotas — não é
 * avaliado aqui —, então qualquer literal que o JSX aceite serve.
 *
 * Por que ler do fonte em vez de um mapa rota→permissão à parte: o mapa teria
 * de repetir 62 caminhos à mão e nasceria podendo divergir. Aqui a declaração
 * mora ao lado da página, como morava o `<PermissionRoute>`, e não há segundo
 * lugar para esquecer de atualizar.
 */
const lerGuardaDaPagina = async (arquivo) => {
	let fonte
	try {
		fonte = await fs.readFile(arquivo, 'utf8')
	} catch {
		return null
	}

	// O gate saiu do corpo da página na correção do achado 41. Deixar os dois
	// conviver traz o defeito de volta em silêncio — a página negada voltaria a
	// consultar antes de redirecionar —, então isto quebra o build.
	if (fonte.includes('<PermissionRoute')) {
		throw new Error(
			`${arquivo}: o gate de permissão agora é da rota, não do JSX da página. ` +
				`Troque o <PermissionRoute> por 'export const permissao = ...' no topo do arquivo.`,
		)
	}

	const permissao = fonte.match(/^export const permissao = (.+)$/m)
	if (!permissao) return null

	// O formatador quebra um array longo em várias linhas; a regex pegaria só o
	// `[` e a rota sairia com `permission={[}`, que derruba o app inteiro.
	if (permissao[1].trim().startsWith('[') && !permissao[1].includes(']')) {
		throw new Error(
			`${arquivo}: 'export const permissao' precisa caber numa linha só. ` +
				`Junte o array e ponha '// biome-ignore format: ...' acima dele.`,
		)
	}

	const todas = /^export const permissaoTodas = true$/m.test(fonte)
	return { permissao: permissao[1].trim(), todas }
}

// Utilitários

/** Caminho de arquivo → URL: as pastas invisíveis `(grupo)` não são segmento. */
const urlDaRota = (routePath) => {
	const segmentos = routePath
		.split('/')
		.filter((s) => s && !(s.startsWith('(') && s.endsWith(')')))
	return `/${segmentos.join('/')}`
}

const fileToRoutePath = (filePath) => {
	return filePath
		.replace(/\.(jsx|tsx)$/, '')
		.replace(/[/\\]index$/, '')
		.replace(/\[(\w+)\]/g, ':$1')
}

const fileExists = async (filePath) => {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

const normalizePath = (pathStr) => {
	return pathStr.replace(/\\/g, '/')
}

const conventionRoutes = (options = {}) => {
	const {
		pagesDir = 'src/pages',
		routesFile = 'src/generated/routes.jsx',
		excludePatterns = [],
	} = options

	return {
		name: 'vite-plugin-convention-routes',
		enforce: 'pre',

		async buildStart() {
			await generateRoutes(pagesDir, routesFile, excludePatterns)
		},

		configureServer(server) {
			// Uma geração por vez: salvar vários arquivos de uma vez disparava
			// gerações paralelas competindo pelo mesmo arquivo de saída.
			let fila = Promise.resolve()

			const watcher = async (filePath) => {
				// `normalizePath`: no Windows o watcher entrega `src\pages\...`, que
				// nunca casa com `src/pages` — o arquivo de rotas ficava parado até
				// reiniciar o servidor.
				if (!normalizePath(filePath).includes(pagesDir)) return

				fila = fila.then(async () => {
					// O erro fica no log em vez de virar rejeição não tratada: um
					// arquivo de rotas desatualizado é recuperável, o servidor caído
					// não.
					try {
						await generateRoutes(pagesDir, routesFile, excludePatterns)
						server.ws.send({ type: 'full-reload' })
					} catch (erro) {
						server.config.logger.error(
							`[convention-routes] falha ao gerar rotas: ${erro.message}`,
						)
					}
				})

				await fila
			}

			server.watcher.add(path.join(process.cwd(), pagesDir))
			server.watcher.on('add', watcher)
			server.watcher.on('unlink', watcher)
			server.watcher.on('change', watcher)
		},
	}
}

export default conventionRoutes
