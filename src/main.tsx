import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './brand.css'
import './sidebar-toggle.css'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
