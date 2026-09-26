import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AuthSessionError, finalizeAuthCode, getAuthSession } from '../services/authApi'
import { consumeAuthCodeFromHash, hasAuthCodeFragment } from '../services/authFlow'
import { beginManualLogin, clearAuthAttempt, markAuthFailed, markAuthSucceeded, tryBeginAutomaticLogin } from '../services/authAttemptStore'
import { isEmbeddedContext, registerDanaParentDiagnostics } from '../services/embeddedAuth'
import { consumeLogoutPending } from '../services/logoutState'
import { getApiBaseUrl } from '../services/apiConfig'
import { SESSION_EXPIRED_EVENT } from '../services/sessionEvents'
import { clearSessionId } from '../services/sessionStore'
import { useSessionWebSocket } from '../hooks/useSessionWebSocket'
import App from '../App'
import '../auth.css'

type LoginHandler = () => void

function AuthError({ message, onRetry }: { message: string; onRetry: LoginHandler }) {
  return <main className="auth-state"><section><h1>No fue posible validar la sesión</h1><p>{message}</p><button onClick={onRetry}>Reintentar</button></section></main>
}

function LoginRequired({ onLogin }: { onLogin: LoginHandler }) {
  return <main className="auth-state"><section><h1>Acceso requerido</h1><p>Debes iniciar sesión para acceder al dashboard.</p><button onClick={onLogin}>Iniciar sesión</button></section></main>
}

function AuthenticationFailed({ onLogin }: { onLogin?: LoginHandler }) {
  return <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>Puedes intentar iniciar sesión nuevamente.</p>{onLogin && <button onClick={onLogin}>Reintentar inicio de sesión</button>}</section></main>
}

function Forbidden() { return <main className="auth-state"><section><h1>Acceso no autorizado</h1><p>Tu usuario está autenticado, pero no tiene autorización para acceder a este dashboard.</p></section></main> }
function FinalizingAuthentication() { return <main className="auth-state"><section><h1>Completando autenticación…</h1><p>Validando tu sesión con Paramita.</p></section></main> }
function SilentAuthenticationFailed() { return <main className="auth-state"><section><h1>No fue posible reutilizar la sesión de DANA.</h1><p>La sesión existente no pudo validarse silenciosamente.</p></section></main> }
function EmbeddedSessionValidation() { return <main className="auth-state"><section><h1>Validando sesión con DANA…</h1><p>Esperando la respuesta del portal DANA.</p></section></main> }

function startDirectLogin() {
  beginManualLogin()
  const baseUrl = getApiBaseUrl()
  if (baseUrl) window.location.href = `${baseUrl}/auth/login`
}

function AutomaticLoginRedirect({ afterLogout = false, embedded = false, onLogin }: { afterLogout?: boolean; embedded?: boolean; onLogin: LoginHandler }) {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const initialized = useRef(false)
  const redirected = useRef(false)
  const baseUrl = getApiBaseUrl()

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (afterLogout) clearAuthAttempt()
    setAllowed(tryBeginAutomaticLogin())
  }, [afterLogout])

  useEffect(() => {
    if (allowed !== true || !baseUrl || redirected.current) return
    if (embedded) return
    redirected.current = true
    window.location.replace(`${baseUrl}/auth/login`)
  }, [allowed, baseUrl, embedded])

  if (allowed === null) return <FinalizingAuthentication />
  if (embedded) return <EmbeddedSessionValidation />
  if (!allowed) {
    markAuthFailed()
    return embedded ? <SilentAuthenticationFailed /> : <AuthenticationFailed onLogin={onLogin} />
  }
  if (!baseUrl) return embedded ? <SilentAuthenticationFailed /> : <AuthError message="Falta configurar VITE_API_URL en el frontend." onRetry={onLogin} />
  return <FinalizingAuthentication />
}

function AuthCallback({ embedded, onLogin }: { embedded: boolean; onLogin: LoginHandler }) {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')
  const description = params.get('error_description')
  const code = params.get('code')
  const state = params.get('state')
  const redirected = useRef(false)
  const baseUrl = getApiBaseUrl()

  useEffect(() => {
    if (error || !code || !state) {
      markAuthFailed()
      return
    }
    if (!baseUrl || redirected.current) return
    redirected.current = true
    window.location.replace(`${baseUrl}/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`)
  }, [baseUrl, code, error, state])

  if (error) return embedded ? <SilentAuthenticationFailed /> : <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>{description || 'El inicio de sesión fue cancelado o rechazado.'}</p><button onClick={onLogin}>Intentar nuevamente</button></section></main>
  if (!code || !state) return <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>La respuesta de DANA no contiene los parámetros esperados.</p><button onClick={onLogin}>Intentar nuevamente</button></section></main>
  if (!baseUrl) return <AuthError message="Falta configurar VITE_API_URL en el frontend." onRetry={() => window.location.reload()} />
  return <FinalizingAuthentication />
}

export function AuthGate() {
  const queryClient = useQueryClient()
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const [embedded] = useState(isEmbeddedContext)
  const [authFragment] = useState(() => ({ present: hasAuthCodeFragment(), code: consumeAuthCodeFromHash() }))
  const [logoutReturn] = useState(() => {
    const pending = consumeLogoutPending()
    if (pending) clearAuthAttempt()
    return pending
  })
  const authCode = authFragment.code
  const [finalizeState, setFinalizeState] = useState<'idle' | 'pending' | 'success' | 'error'>(() => authFragment.present ? authCode ? 'pending' : 'error' : 'idle')

  useEffect(() => {
    if (!embedded) return
    return registerDanaParentDiagnostics()
  }, [embedded])

  useEffect(() => {
    if (!authCode) return
    let active = true
    void finalizeAuthCode(authCode).then(() => {
      if (!active) return
      markAuthSucceeded()
      setFinalizeState('success')
      void queryClient.invalidateQueries({ queryKey: ['paramita-session'] })
    }).catch(() => {
      clearSessionId()
      markAuthFailed()
      if (active) setFinalizeState('error')
    })
    return () => { active = false }
  }, [authCode, queryClient])

  useEffect(() => {
    if (authFragment.present && !authCode) markAuthFailed()
  }, [authCode, authFragment.present])

  const session = useQuery({
    queryKey: ['paramita-session'],
    queryFn: getAuthSession,
    enabled: path === '/' && (!authFragment.present || finalizeState === 'success') && finalizeState !== 'pending',
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
      markAuthFailed()
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
    return embedded ? <FinalizingAuthentication /> : <AutomaticLoginRedirect onLogin={startDirectLogin} />
  }
  if (path === '/auth/callback') return <AuthCallback embedded={embedded} onLogin={startDirectLogin} />
  if (authFragment.present && finalizeState === 'pending') return <FinalizingAuthentication />
  if (authFragment.present && finalizeState === 'error') return <AuthenticationFailed />
  if (session.isPending) return <main className="auth-state"><section><h1>Validando sesión…</h1><p>Conectando con DANA.</p></section></main>
  if (session.isError) {
    const error = session.error as AuthSessionError
    if (error.status === 403) return <Forbidden />
    return <AuthError message="No fue posible validar la sesión." onRetry={() => void session.refetch()} />
  }
  if (!session.data?.authenticated) {
    if (embedded) return <AutomaticLoginRedirect afterLogout={logoutReturn} embedded onLogin={startDirectLogin} />
    if (logoutReturn) return <AutomaticLoginRedirect afterLogout onLogin={startDirectLogin} />
    return <AutomaticLoginRedirect onLogin={startDirectLogin} />
  }

  markAuthSucceeded()
  return <App />
}
