import { ProtectedRoute } from 'src/components/protected-route'
import { AppLayout } from 'src/layout/app-layout'

export default function Page() {
	return (
		<ProtectedRoute>
			<AppLayout />
		</ProtectedRoute>
	)
}
