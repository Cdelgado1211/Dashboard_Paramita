import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthGate } from './components/AuthGate'
import './brand.css'
import './sidebar-toggle.css'
import './operational.css'
import './reference-layout.css'
import './logo.css'
import './logo-toggle.css'
import './filter-help.css'
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false } } })
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><AuthGate /></QueryClientProvider></StrictMode>)
