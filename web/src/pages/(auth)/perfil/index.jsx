import { Navigate } from 'react-router'

/** `/perfil` não é tela: a primeira aba é dados pessoais. */
export default function Page() {
	return <Navigate to='/perfil/dados-pessoais' replace />
}
