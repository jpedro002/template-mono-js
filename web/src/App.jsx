import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { lazy, Suspense } from 'react'
import { Helmet, HelmetProvider } from 'react-helmet-async'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
// @ts-expect-error
import { routes } from 'src/generated/routes'
import { persistOptions, queryClient } from './lib/react-query'

// Lazy load devtools apenas em desenvolvimento
const ReactQueryDevtools = import.meta.env.DEV
	? lazy(() =>
			import('@tanstack/react-query-devtools').then((res) => ({
				default: res.ReactQueryDevtools,
			})),
		)
	: () => null

const App = () => {
	return (
		<HelmetProvider>
			{/* Título de base. Sem um `<title>` na raiz, o da última página que
			    declarou um sobra na aba quando a próxima não declara — depois do
			    login a aba continuava escrita "Entrar". */}
			<Helmet>
				<title>Template</title>
			</Helmet>
			<PersistQueryClientProvider
				client={queryClient}
				persistOptions={persistOptions}
			>
				<RouterProvider router={routes} />
				{import.meta.env.DEV && (
					<Suspense fallback={null}>
						<ReactQueryDevtools initialIsOpen={false} />
					</Suspense>
				)}
				{/* Toaster global para toasts personalizados (sonner) */}
				<Toaster position='top-right' />
			</PersistQueryClientProvider>
		</HelmetProvider>
	)
}

export default App
