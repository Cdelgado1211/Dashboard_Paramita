import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AuthSessionError, finalizeAuthCode, getAuthSession } from '../services/authApi'
import { consumeAuthCodeFromHash } from '../services/authFlow'
import { clearAuthAttempt, hasAuthAttempted, markAuthAttempt } from '../services/authAttemptStore'
import { getApiBaseUrl } from '../services/apiConfig'
import { SESSION_EXPIRED_EVENT } from '../services/sessionEvents'
import { clearSessionId } from '../services/sessionStore'
import { useSessionWebSocket } from '../hooks/useSessionWebSocket'
import App from '../App'
import '../auth.css'

function AuthError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="auth-state"><section><h1>No fue posible validar la sesión</h1><p>{message}</p><button onClick={onRetry}>Reintentar</button></section></main>
}

function startLogin() { const baseUrl = getApiBaseUrl(); if (baseUrl) window.location.href = `${baseUrl}/auth/login` }
function LoginRequired() { return <main className="auth-state"><section><h1>Acceso requerido</h1><p>Debes iniciar sesión para acceder al dashboard.</p><button onClick={startLogin}>Iniciar sesión</button></section></main> }
function AuthenticationFailed() { const retryLogin = () => { clearAuthAttempt(); startLogin() }; return <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>Puedes intentar iniciar sesión nuevamente.</p><button onClick={retryLogin}>Reintentar inicio de sesión</button></section></main> }
function Forbidden() { return <main className="auth-state"><section><h1>Acceso no autorizado</h1><p>Tu usuario está autenticado, pero no tiene autorización para acceder a este dashboard.</p></section></main> }
function FinalizingAuthentication() { return <main className="auth-state"><section><h1>Completando autenticación…</h1><p>Validando tu sesión con Paramita.</p></section></main> }

function AuthCallback() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')
  const description = params.get('error_description')
  const code = params.get('code')
  const state = params.get('state')
  if (error) return <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>{description || 'El inicio de sesión fue cancelado o rechazado.'}</p><a href="/auth/login">Intentar nuevamente</a></section></main>
  if (!code || !state) return <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>La respuesta de DANA no contiene los parámetros esperados.</p><a href="/auth/login">Intentar nuevamente</a></section></main>
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) return <AuthError message="Falta configurar VITE_API_URL en el frontend." onRetry={() => window.location.reload()} />
  window.location.replace(`${baseUrl}/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)
  return <FinalizingAuthentication />
}

export function AuthGate() {
  const queryClient = useQueryClient()
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const [authCode] = useState(() => consumeAuthCodeFromHash())
  const [finalizeState, setFinalizeState] = useState<'idle' | 'pending' | 'success' | 'error'>(() => authCode ? 'pending' : 'idle')

  useEffect(() => {
    if (!authCode) return
    let active = true
    void finalizeAuthCode(authCode).then(() => {
      if (!active) return
      setFinalizeState('success')
      void queryClient.invalidateQueries({ queryKey: ['paramita-session'] })
    }).catch(() => {
      clearSessionId()
      if (active) setFinalizeState('error')
    })
    return () => { active = false }
  }, [authCode, queryClient])

  const session = useQuery({
    queryKey: ['paramita-session'],
    queryFn: getAuthSession,
    enabled: path === '/' && finalizeState !== 'pending',
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
  })

  useSessionWebSocket(session.data)

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSessionId()
      void queryClient.cancelQueries({ queryKey: ['paramita-dashboard'] })
      void queryClient.cancelQueries({ queryKey: ['paramita-order'] })
      queryClient.setQueryData(['paramita-session'], { authenticated: false })
      void queryClient.invalidateQueries({ queryKey: ['paramita-session'], refetchType: 'none' })
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
  }, [queryClient])

  useEffect(() => {
    if (path !== '/') return
    const validate = () => void queryClient.invalidateQueries({ queryKey: ['paramita-session'] })
    window.addEventListener('focus', validate)
    document.addEventListener('visibilitychange', validate)
    return () => {
      window.removeEventListener('focus', validate)
      document.removeEventListener('visibilitychange', validate)
    }
  }, [path, queryClient])

  if (path === '/auth/login') {
    const baseUrl = getApiBaseUrl()
    if (!baseUrl) return <AuthError message="Falta configurar VITE_API_URL en el frontend." onRetry={() => window.location.reload()} />
    window.location.replace(`${baseUrl}/auth/login`)
    return <FinalizingAuthentication />
  }
  if (path === '/auth/callback') return <AuthCallback />
  if (authCode && finalizeState === 'pending') return <FinalizingAuthentication />
  if (authCode && finalizeState === 'error') return <AuthenticationFailed />
  if (session.isPending) return <main className="auth-state"><section><h1>Validando sesión…</h1><p>Conectando con DANA.</p></section></main>
  if (session.isError) {
    const error = session.error as AuthSessionError
    if (error.status === 403) return <Forbidden />
    return <AuthError message="No fue posible validar la sesión." onRetry={() => void session.refetch()} />
  }
  if (!session.data?.authenticated) {
    if (!hasAuthAttempted()) {
      markAuthAttempt()
      const baseUrl = getApiBaseUrl()
      if (baseUrl) {
        window.location.href = `${baseUrl}/auth/login`
        return <FinalizingAuthentication />
      }
      return <AuthError message="Falta configurar VITE_API_URL en el frontend." onRetry={() => void session.refetch()} />
    }
    return <AuthenticationFailed />
  }

  clearAuthAttempt()
  return <App />
}
