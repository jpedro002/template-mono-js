import { baseController } from 'src/controllers'
import 'src/policies/cards.policy'

function cardController() {
	// `policy: 'cards'` liga a política por registro (`src/policies/cards.policy.js`):
	// editar e excluir só o dono, salvo `cards:manage`. `campoDono` grava quem
	// criou a partir da sessão.
	const base = baseController('Card', {
		policy: 'cards',
		campoDono: 'createdById'
	})

	return {
		...base // Herda: all, fetch, one, post, put, del
	}
}

export { cardController }
