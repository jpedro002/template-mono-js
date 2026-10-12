import { useRouteError } from 'react-router'
import { TelaErro } from 'src/components/tela-erro'

/**
 * `errorElement` da rota raiz (o plugin de rotas pega `src/pages/error.jsx`):
 * qualquer erro de render, de loader ou de import de página cai aqui em vez da
 * tela crua do React Router.
 */
export default function ErroDaRota() {
	return <TelaErro erro={useRouteError()} />
}
