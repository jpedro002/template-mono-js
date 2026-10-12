import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import conventionRoutes from './plugins/vite-plugin-convention-routes'

// https://vite.dev/config/
export default defineConfig(() => ({
	plugins: [
		react({
			babel: {
				plugins: [['babel-plugin-react-compiler']],
			},
		}),
		tailwindcss(),
		conventionRoutes({
			excludePatterns: ['**/components/*.jsx'],
			pagesDir: 'src/pages',
		}),
	],
	resolve: {
		alias: {
			src: '/src',
		},
	},
	build: {
		// Otimizações de build
		target: 'esnext',
		minify: 'oxc',
		cssMinify: true,
		rollupOptions: {
			output: {
				// Chunking nativo do Rolldown - mais rápido que manualChunks (deprecated)
				advancedChunks: {
					minSize: 20000,
					groups: [
						{
							name: 'react-vendor',
							test: /node_modules\/(react|react-dom|react-router)\//,
						},
						{ name: 'query-vendor', test: /node_modules\/@tanstack\// },
						{ name: 'ui-vendor', test: /node_modules\/@radix-ui\// },
						{
							name: 'form-vendor',
							test: /node_modules\/(react-hook-form|@hookform|zod)\//,
						},
						{ name: 'vendor', test: /node_modules/ },
					],
				},
			},
		},
		// Aumentar limite de warning de chunk
		chunkSizeWarningLimit: 1000,
	},
	// Otimizações de servidor dev
	server: {
		hmr: {
			overlay: true,
		},
	},
	// Pre-bundling de dependências
	optimizeDeps: {
		include: ['react', 'react-dom', 'react-router', '@tanstack/react-query'],
		exclude: [],
	},
}))
