import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LimiteDeErro, liberarRecargaAutomatica } from './components/tela-erro'

liberarRecargaAutomatica()

// @ts-expect-error
createRoot(document.getElementById('root')).render(
	<StrictMode>
		<LimiteDeErro>
			<App />
		</LimiteDeErro>
	</StrictMode>,
)
