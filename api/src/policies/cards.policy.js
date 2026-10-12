import { definirPolitica } from 'src/policies'

/**
 * Política de exemplo: qualquer um com `cards:read` lê todos os cards; editar e
 * excluir só o dono. `cards:manage` (ou `*`) ignora a regra de dono.
 *
 * Card antigo sem dono (`createdById` nulo) só é editável por quem tem
 * `cards:manage` — "sem dono" não pode virar "de todo mundo".
 */
const doDono = (user, card) =>
	Boolean(card?.createdById) && card.createdById === user.id

export const cardsPolicy = definirPolitica('cards', {
	update: doDono,
	delete: doDono
	// Para recortar também a leitura (cada um vê só os seus):
	// read: doDono,
	// escopo: user => ({ createdById: user.id })
})
