import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installMockApi } from './lib/mock'
import './styles.css'
import './styles/editor.css'

if (!window.forge) {
  // Running in a plain browser (design preview) — use the in-memory vault
  installMockApi()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
