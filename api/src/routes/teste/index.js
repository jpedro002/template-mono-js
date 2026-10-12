// Routes do módulo teste/cards

import { Elysia } from 'elysia'
import { cardRoutes } from './cards.route'

export const testeRoutes = new Elysia({ prefix: '/api/teste' }).use(cardRoutes)
