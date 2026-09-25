import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AuthSessionError, finalizeAuthCode, getAuthSession } from '../services/authApi'
import { consumeAuthCodeFromHash, hasAuthCodeFragment } from '../services/authFlow'
import { beginManualLogin, clearAuthAttempt, markAuthFailed, markAuthSucceeded, tryBeginAutomaticLogin } from '../services/authAttemptStore'
import { createSilentAuthFrame, getEmbeddedAuthMessage, handoffAuthCodeToContainer, handoffSilentAuthFailureToParent, isEmbeddedContext, openDanaAuthPopup, removeSilentAuthFrame } from '../services/embeddedAuth'
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
      if (error && handoffSilentAuthFailureToParent(error)) return
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
  const [embeddedAuthState, setEmbeddedAuthState] = useState<'idle' | 'silent' | 'popup' | 'fallback'>('idle')
  const popupRef = useRef<Window | null>(null)
  const silentFrameRef = useRef<HTMLIFrameElement | null>(null)
  const silentAttemptedRef = useRef(false)
  const automaticPopupAttemptedRef = useRef(false)
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
    setEmbeddedAuthState('popup')
    setPopupError(null)
  }, [embedded])

  const clearSilentFrame = useCallback(() => {
    removeSilentAuthFrame(silentFrameRef.current)
    silentFrameRef.current = null
  }, [])

  const startAutomaticPopup = useCallback(() => {
    if (automaticPopupAttemptedRef.current) return
    automaticPopupAttemptedRef.current = true
    const baseUrl = getApiBaseUrl()
    if (!baseUrl) {
      markAuthFailed()
      setPopupError('Falta configurar VITE_API_URL en el frontend.')
      setEmbeddedAuthState('fallback')
      return
    }
    const popup = openDanaAuthPopup(`${baseUrl}/auth/login`)
    if (!popup) {
      markAuthFailed()
      setPopupError('No se pudo abrir la ventana de DANA. Selecciona “Continuar con DANA” para intentarlo nuevamente.')
      setEmbeddedAuthState('fallback')
      return
    }
    popupRef.current = popup
    setEmbeddedAuthState('popup')
  }, [])

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
    const receiveEmbeddedAuthMessage = (event: MessageEvent) => {
      const popupMessage = getEmbeddedAuthMessage(event, popupRef.current)
      const silentMessage = getEmbeddedAuthMessage(event, silentFrameRef.current?.contentWindow ?? null)
      const message = popupMessage ?? silentMessage
      if (!message) return
      if (message.type === 'authCode') {
        clearSilentFrame()
        popupRef.current = null
        completeAuthentication(message.authCode)
        return
      }
      clearSilentFrame()
      startAutomaticPopup()
    }
    window.addEventListener('message', receiveEmbeddedAuthMessage)
    return () => {
      window.removeEventListener('message', receiveEmbeddedAuthMessage)
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close()
      popupRef.current = null
      clearSilentFrame()
    }
  }, [clearSilentFrame, completeAuthentication, embedded, startAutomaticPopup])

  useEffect(() => {
    if (!authCode) return
    if (handoffAuthCodeToContainer(authCode)) return
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
    if (!embedded || path !== '/' || session.isPending || session.isError || session.data?.authenticated || finalizeState === 'pending' || silentAttemptedRef.current) return
    silentAttemptedRef.current = true
    if (!tryBeginAutomaticLogin()) {
      markAuthFailed()
      setEmbeddedAuthState('fallback')
      return
    }
    const baseUrl = getApiBaseUrl()
    if (!baseUrl) {
      markAuthFailed()
      setPopupError('Falta configurar VITE_API_URL en el frontend.')
      setEmbeddedAuthState('fallback')
      return
    }
    silentFrameRef.current = createSilentAuthFrame(`${baseUrl}/auth/login?silent=true`)
    setEmbeddedAuthState('silent')
  }, [embedded, finalizeState, path, session.data?.authenticated, session.isError, session.isPending])

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
    if (embedded) {
      if (embeddedAuthState === 'fallback') return <EmbeddedLoginPrompt onLogin={startLogin} error={popupError} />
      return <FinalizingAuthentication />
    }
    if (logoutReturn) return <AutomaticLoginRedirect afterLogout onLogin={startLogin} />
    return <AutomaticLoginRedirect onLogin={startLogin} />
  }

  markAuthSucceeded()
  return <App />
}
