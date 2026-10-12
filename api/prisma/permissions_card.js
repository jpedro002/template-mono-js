// Permissões para Card - cards
// Padrão: recurso:ação. Lido por `prisma/seed.js` e por `scripts/sync-permissoes.js`.

export const PERMISSIONS = [
	{ identifier: 'cards:create', name: 'Criar cards', category: 'cards' },
	{ identifier: 'cards:read', name: 'Visualizar cards', category: 'cards' },
	{ identifier: 'cards:update', name: 'Atualizar cards', category: 'cards' },
	{ identifier: 'cards:delete', name: 'Deletar cards', category: 'cards' },
	// Ignora a política de dono (`src/policies/cards.policy.js`): edita e exclui
	// card de qualquer um.
	{
		identifier: 'cards:manage',
		name: 'Gerenciar cards de qualquer usuário',
		category: 'cards'
	}
]
