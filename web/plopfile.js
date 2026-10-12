import { execSync } from 'node:child_process'

export default function (plop) {
	// Roda o Biome nos arquivos gerados para já sair formatado e sem lint errors.
	// Retorna uma action (função) compatível com o plop.
	const formatGenerated = (files) => () => {
		const args = files.map((f) => `'${f}'`).join(' ')
		try {
			execSync(`bunx biome check --write ${args}`, { stdio: 'ignore' })
			return `✨ Biome aplicado em ${files.length} arquivo(s)`
		} catch {
			return '⚠️  Não foi possível rodar o Biome. Rode manualmente: bun lint:fix'
		}
	}

	// ==========================================
	// HELPERS
	// ==========================================
	plop.setHelper('lowercase', (text) => text.toLowerCase())
	plop.setHelper('uppercase', (text) => text.toUpperCase())

	plop.setHelper('camelCase', (text) => {
		return text
			.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
				index === 0 ? word.toLowerCase() : word.toUpperCase(),
			)
			.replace(/\s+/g, '')
	})

	plop.setHelper('pascalCase', (text) => {
		return text
			.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => word.toUpperCase())
			.replace(/\s+/g, '')
	})

	plop.setHelper('kebabCase', (text) => {
		return text
			.replace(/([a-z])([A-Z])/g, '$1-$2')
			.replace(/\s+/g, '-')
			.toLowerCase()
	})

	plop.setHelper('pluralize', (word) => {
		const irregulars = {
			user: 'users',
			usuario: 'usuarios',
			role: 'roles',
			permission: 'permissions',
			permissao: 'permissoes',
			category: 'categories',
			categoria: 'categorias',
			person: 'people',
			pessoa: 'pessoas',
			produto: 'produtos',
			venda: 'vendas',
		}

		const lower = word.toLowerCase()
		if (irregulars[lower]) return irregulars[lower]

		// Regras para português
		if (lower.endsWith('ão')) return lower.slice(0, -2) + 'ões'
		if (lower.endsWith('al')) return lower.slice(0, -2) + 'ais'
		if (lower.endsWith('el')) return lower.slice(0, -2) + 'éis'
		if (lower.endsWith('ol')) return lower.slice(0, -2) + 'óis'
		if (lower.endsWith('ul')) return lower.slice(0, -2) + 'uis'
		if (lower.endsWith('r') || lower.endsWith('z')) return lower + 'es'
		if (lower.endsWith('s')) return lower // já está no plural

		// Regra padrão
		return lower + 's'
	})

	// ==========================================
	// GENERATOR: SERVICE BASE
	// ==========================================
	plop.setGenerator('service', {
		description: 'Criar um service com base no createBaseService factory',
		prompts: [
			{
				type: 'input',
				name: 'entityName',
				message: 'Nome da entidade (singular, ex: Usuario, Produto, Venda):',
				validate: (value) => {
					if (!value) return 'Nome da entidade é obrigatório'
					return true
				},
			},
			{
				type: 'input',
				name: 'endpoint',
				message: 'Endpoint da API (ex: /seguranca/usuarios, /vendas/produtos):',
				validate: (value) => {
					if (!value) return 'Endpoint é obrigatório'
					if (!value.startsWith('/')) return 'Endpoint deve começar com /'
					return true
				},
			},
			{
				type: 'confirm',
				name: 'addCustomMethods',
				message: 'Adicionar exemplos de métodos customizados?',
				default: false,
			},
		],
		actions: (data) => {
			const actions = []

			// Preparar dados derivados
			const entityCamel = plop.getHelper('camelCase')(data.entityName)
			const entityPascal = plop.getHelper('pascalCase')(data.entityName)
			const entityLower = data.entityName.toLowerCase()
			const entityPlural = plop.getHelper('pluralize')(entityLower)
			const entityPluralCamel = plop.getHelper('camelCase')(entityPlural)

			const templateData = {
				...data,
				entityCamel,
				entityPascal,
				entityLower,
				entityPlural,
				entityPluralCamel,
			}

			// Criar o arquivo de service
			actions.push({
				type: 'add',
				path: 'src/services/{{entityPlural}}.js',
				templateFile: 'plop-templates/service.hbs',
				data: templateData,
			})

			// Formatar o arquivo gerado
			actions.push(formatGenerated([`src/services/${entityPlural}.js`]))

			// Mensagem de sucesso
			actions.push(() => {
				return `
✅ Service criado com sucesso!

📁 Arquivo: src/services/${entityPlural}.js

📖 Como usar no componente:

import { 
  use${entityPascal}List,
  use${entityPascal},
  use${entityPascal}Create,
  use${entityPascal}Update,
  use${entityPascal}Delete
} from 'src/services/${entityPlural}'

// Exemplo de uso:
const { data, isLoading } = use${entityPascal}List({ page: 1, pageSize: 10 })
				`
			})

			return actions
		},
	})

	// ==========================================
	// GENERATOR: PÁGINA CRUD COMPLETA
	// ==========================================
	plop.setGenerator('crud-page', {
		description: 'Criar página CRUD completa com tabela + formulário + service',
		prompts: [
			{
				type: 'input',
				name: 'entityName',
				message: 'Nome da entidade (singular, ex: Usuario, Produto):',
				validate: (value) => {
					if (!value) return 'Nome da entidade é obrigatório'
					return true
				},
			},
			{
				type: 'input',
				name: 'endpoint',
				message: 'Endpoint da API (ex: /seguranca/usuarios):',
				validate: (value) => {
					if (!value) return 'Endpoint é obrigatório'
					if (!value.startsWith('/')) return 'Endpoint deve começar com /'
					return true
				},
			},
			{
				type: 'input',
				name: 'routePath',
				message: 'Caminho da rota (ex: admin/usuarios, vendas/produtos):',
				validate: (value) => {
					if (!value) return 'Caminho da rota é obrigatório'
					return true
				},
			},
			{
				type: 'input',
				name: 'permissionResource',
				message:
					'Recurso de permissão no backend (enter para usar o plural da entidade):',
			},
		],
		actions: (data) => {
			const actions = []

			const entityCamel = plop.getHelper('camelCase')(data.entityName)
			const entityPascal = plop.getHelper('pascalCase')(data.entityName)
			const entityLower = data.entityName.toLowerCase()
			const entityPlural = plop.getHelper('pluralize')(entityLower)
			const entityPluralCamel = plop.getHelper('camelCase')(entityPlural)
			const entityKebab = plop.getHelper('kebabCase')(data.entityName)
			// Recurso usado nas strings de permissão (ex: "usuarios:read").
			// Cai para o plural da entidade quando não informado.
			const permissionResource = data.permissionResource?.trim() || entityPlural

			const templateData = {
				...data,
				entityCamel,
				entityPascal,
				entityLower,
				entityPlural,
				entityPluralCamel,
				entityKebab,
				permissionResource,
			}

			// 1. Criar service
			actions.push({
				type: 'add',
				path: 'src/services/{{entityPlural}}.js',
				templateFile: 'plop-templates/service.hbs',
				skipIfExists: true,
				data: templateData,
			})

			// 2. Criar página index (lista)
			actions.push({
				type: 'add',
				path: 'src/pages/(auth)/{{routePath}}/index.jsx',
				templateFile: 'plop-templates/page-index.hbs',
				data: templateData,
			})

			// 3. Criar página de detalhe/edição
			actions.push({
				type: 'add',
				path: 'src/pages/(auth)/{{routePath}}/[id].jsx',
				templateFile: 'plop-templates/page-detail.hbs',
				data: templateData,
			})

			// 4. Formatar os arquivos gerados
			actions.push(
				formatGenerated([
					`src/services/${entityPlural}.js`,
					`src/pages/(auth)/${data.routePath}/index.jsx`,
					`src/pages/(auth)/${data.routePath}/[id].jsx`,
				]),
			)

			// Mensagem final
			actions.push(() => {
				return `
✅ CRUD completo criado!

📁 Arquivos criados:
  - src/services/${entityPlural}.js
  - src/pages/(auth)/${data.routePath}/index.jsx
  - src/pages/(auth)/${data.routePath}/[id].jsx

🔗 Rota gerada: /${data.routePath}
🔐 Permissões usadas: ${permissionResource}:read | :create | :update | :delete

⚠️  Não esqueça de:
  1. Adicionar a rota no menu (src/layout/components/app-sidebar.jsx)
  2. Ajustar os campos da tabela (headers) no index.jsx
  3. Ajustar os campos do formulário no [id].jsx
  4. Conferir se o recurso de permissão "${permissionResource}" bate com o backend
				`
			})

			return actions
		},
	})
}
