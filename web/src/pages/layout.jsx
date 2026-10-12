import { Outlet } from 'react-router'
import { AuthProvider } from 'src/contexts/auth-context'

const Layout = () => {
	return (
		<AuthProvider>
			<Outlet />
		</AuthProvider>
	)
}
export default Layout
