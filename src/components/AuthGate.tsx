import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AuthSessionError, finalizeAuthCode, getAuthSession } from '../services/authApi'
import { consumeAuthCodeFromHash, hasAuthCodeFragment } from '../services/authFlow'
import { beginManualLogin, clearAuthAttempt, markAuthFailed, markAuthSucceeded, tryBeginAutomaticLogin } from '../services/authAttemptStore'
import { getAuthCodeFromMessage, handoffAuthCodeToOpener, isEmbeddedContext, openDanaAuthPopup } from '../services/embeddedAuth'
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

function AuthenticationFailed({ onLogin }: { onLogin: LoginHandler }) {
  return <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>Puedes intentar iniciar sesión nuevamente.</p><button onClick={onLogin}>Reintentar inicio de sesión</button></section></main>
}

function EmbeddedLoginPrompt({ onLogin, error }: { onLogin: LoginHandler; error: string | null }) {
  return <main className="auth-state"><section><h1>Acceso requerido</h1><p>Continúa en una ventana segura de DANA para abrir el dashboard.</p>{error && <p role="alert">{error}</p>}<button onClick={onLogin}>Continuar con DANA</button></section></main>
}

function Forbidden() { return <main className="auth-state"><section><h1>Acceso no autorizado</h1><p>Tu usuario está autenticado, pero no tiene autorización para acceder a este dashboard.</p></section></main> }
function FinalizingAuthentication() { return <main className="auth-state"><section><h1>Completando autenticación…</h1><p>Validando tu sesión con Paramita.</p></section></main> }

function AutomaticLoginRedirect({ afterLogout = false, onLogin }: { afterLogout?: boolean; onLogin: LoginHandler }) {
  const [allowed] = useState(() => {
    if (afterLogout) clearAuthAttempt()
    return tryBeginAutomaticLogin()
  })
  const redirected = useRef(false)
  const baseUrl = getApiBaseUrl()

  useEffect(() => {
    if (!allowed || !baseUrl || redirected.current) return
    redirected.current = true
    window.location.href = `${baseUrl}/auth/login`
  }, [allowed, baseUrl])

  if (!allowed) {
    markAuthFailed()
    return <AuthenticationFailed onLogin={onLogin} />
  }
  if (!baseUrl) return <AuthError message="Falta configurar VITE_API_URL en el frontend." onRetry={onLogin} />
  return <FinalizingAuthentication />
}

function AuthCallback({ onLogin }: { onLogin: LoginHandler }) {
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

  if (error) return <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>{description || 'El inicio de sesión fue cancelado o rechazado.'}</p><button onClick={onLogin}>Intentar nuevamente</button></section></main>
  if (!code || !state) return <main className="auth-state"><section><h1>No fue posible completar la autenticación.</h1><p>La respuesta de DANA no contiene los parámetros esperados.</p><button onClick={onLogin}>Intentar nuevamente</button></section></main>
  if (!baseUrl) return <AuthError message="Falta configurar VITE_API_URL en el frontend." onRetry={() => window.location.reload()} />
  return <FinalizingAuthentication />
}

export function AuthGate() {
  const queryClient = useQueryClient()
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const [embedded] = useState(isEmbeddedContext)
  const [popupError, setPopupError] = useState<string | null>(null)
  const popupRef = useRef<Window | null>(null)
  const processedCodeRef = useRef<string | null>(null)
  const [authFragment] = useState(() => ({ present: hasAuthCodeFragment(), code: consumeAuthCodeFromHash() }))
  const [logoutReturn] = useState(() => {
    const pending = consumeLogoutPending()
    if (pending) clearAuthAttempt()
    return pending
  })
  const authCode = authFragment.code
  const [finalizeState, setFinalizeState] = useState<'idle' | 'pending' | 'success' | 'error'>(() => authFragment.present ? authCode ? 'pending' : 'error' : 'idle')

  const startLogin = useCallback(() => {
    const baseUrl = getApiBaseUrl()
    if (!baseUrl) {
      setPopupError('Falta configurar VITE_API_URL en el frontend.')
      return
    }

    beginManualLogin()
    if (!embedded) {
      window.location.href = `${baseUrl}/auth/login`
      return
    }

    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus()
      return
    }
    const popup = openDanaAuthPopup(`${baseUrl}/auth/login`)
    if (!popup) {
      markAuthFailed()
      setPopupError('El navegador bloqueó la ventana de inicio de sesión. Permite las ventanas emergentes e inténtalo nuevamente.')
      return
    }
    popupRef.current = popup
    setPopupError(null)
  }, [embedded])

  const completeAuthentication = useCallback((code: string) => {
    if (processedCodeRef.current) return
    processedCodeRef.current = code
    setFinalizeState('pending')
    void finalizeAuthCode(code).then(() => {
      markAuthSucceeded()
      setFinalizeState('success')
      void queryClient.invalidateQueries({ queryKey: ['paramita-session'] })
    }).catch(() => {
      clearSessionId()
      markAuthFailed()
      setFinalizeState('error')
    })
  }, [queryClient])

  useEffect(() => {
    if (!embedded) return
    const receiveAuthCode = (event: MessageEvent) => {
      const code = getAuthCodeFromMessage(event, popupRef.current)
      if (!code) return
      popupRef.current = null
      completeAuthentication(code)
    }
    window.addEventListener('message', receiveAuthCode)
    return () => {
      window.removeEventListener('message', receiveAuthCode)
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
      popupRef.current = null
    }
  }, [completeAuthentication, embedded])

  useEffect(() => {
    if (!authCode) return
    if (window.opener && handoffAuthCodeToOpener(authCode)) return
    completeAuthentication(authCode)
  }, [authCode, completeAuthentication])

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
    return embedded ? <EmbeddedLoginPrompt onLogin={startLogin} error={popupError} /> : <AutomaticLoginRedirect onLogin={startLogin} />
  }
  if (path === '/auth/callback') return <AuthCallback onLogin={startLogin} />
  if (authFragment.present && finalizeState === 'pending') return <FinalizingAuthentication />
  if (authFragment.present && finalizeState === 'error') return <AuthenticationFailed onLogin={startLogin} />
  if (session.isPending) return <main className="auth-state"><section><h1>Validando sesión…</h1><p>Conectando con DANA.</p></section></main>
  if (session.isError) {
    const error = session.error as AuthSessionError
    if (error.status === 403) return <Forbidden />
    return <AuthError message="No fue posible validar la sesión." onRetry={() => void session.refetch()} />
  }
  if (!session.data?.authenticated) {
    if (embedded) return <EmbeddedLoginPrompt onLogin={startLogin} error={popupError} />
    if (logoutReturn) return <AutomaticLoginRedirect afterLogout onLogin={startLogin} />
    return <AutomaticLoginRedirect onLogin={startLogin} />
  }

  markAuthSucceeded()
  return <App />
}
