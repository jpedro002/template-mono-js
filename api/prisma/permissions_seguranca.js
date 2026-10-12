// Permissões do núcleo de segurança (usuários, roles, permissões, telemetria).
// Padrão: recurso:ação. Lido por `prisma/seed.js` e por `scripts/sync-permissoes.js`.

export const PERMISSIONS = [
	{ identifier: '*', name: 'Todas as Permissões', category: 'root' },

	// Usuários
	{ identifier: 'users:create', name: 'Criar Usuários', category: 'users' },
	{ identifier: 'users:read', name: 'Visualizar Usuários', category: 'users' },
	{ identifier: 'users:update', name: 'Atualizar Usuários', category: 'users' },
	{ identifier: 'users:delete', name: 'Deletar Usuários', category: 'users' },
	{
		identifier: 'users:manage',
		name: 'Gerenciar Autorização de Usuários',
		category: 'users'
	},

	// Roles
	{ identifier: 'roles:create', name: 'Criar Roles', category: 'roles' },
	{ identifier: 'roles:read', name: 'Visualizar Roles', category: 'roles' },
	{ identifier: 'roles:update', name: 'Atualizar Roles', category: 'roles' },
	{ identifier: 'roles:delete', name: 'Deletar Roles', category: 'roles' },
	{ identifier: 'roles:assign', name: 'Atribuir Roles', category: 'roles' },
	{ identifier: 'roles:revoke', name: 'Remover Roles', category: 'roles' },

	// Permissões
	{
		identifier: 'permissions:create',
		name: 'Criar Permissões',
		category: 'permissions'
	},
	{
		identifier: 'permissions:read',
		name: 'Visualizar Permissões',
		category: 'permissions'
	},
	{
		identifier: 'permissions:update',
		name: 'Atualizar Permissões',
		category: 'permissions'
	},
	{
		identifier: 'permissions:delete',
		name: 'Deletar Permissões',
		category: 'permissions'
	},
	{
		identifier: 'permissions:assign',
		name: 'Conceder Permissões',
		category: 'permissions'
	},
	{
		identifier: 'permissions:revoke',
		name: 'Revogar Permissões',
		category: 'permissions'
	},

	// Telemetria (uso do sistema, lido do VictoriaMetrics)
	{
		identifier: 'telemetria:read',
		name: 'Visualizar uso do sistema',
		category: 'telemetria'
	},

	// Auditoria das mudanças de acesso (seguranca.authz_audit)
	{
		identifier: 'auditoria:read',
		name: 'Visualizar trilha de auditoria de acesso',
		category: 'auditoria'
	},

	// Diagnóstico da API (GET /version)
	{
		identifier: 'sistema:read',
		name: 'Visualizar diagnóstico do sistema',
		category: 'sistema'
	}
]
