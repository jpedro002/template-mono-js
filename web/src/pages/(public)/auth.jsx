import { Helmet } from 'react-helmet-async'
import { Navigate, useLocation } from 'react-router'
import { LoginForm } from 'src/components/login-form'
import { MolduraAuth } from 'src/components/moldura-auth'
import { useAuth } from 'src/contexts/auth-context'
import { rotaDeRetorno } from 'src/lib/return-to'
import RootLoading from 'src/pages/loading.jsx'

const Login = () => {
	const { isAuthenticated, isReady } = useAuth()
	const { search } = useLocation()

	if (!isReady) {
		return <RootLoading />
	}

	// Quem já tem sessão não vê o login: volta para a rota que pediu (`returnTo`,
	// posto pelo `ProtectedRoute`) ou para a home.
	if (isAuthenticated) {
		return <Navigate to={rotaDeRetorno(search)} replace />
	}

	return (
		<>
			<Helmet>
				<title>Entrar</title>
			</Helmet>

			<MolduraAuth>
				<LoginForm />
			</MolduraAuth>
		</>
	)
}
export default Login
