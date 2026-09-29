import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeAuthCodeFromHash } from './authFlow'
import { buildOidcLogoutContinueUrl, finalizeAuthCode, getAuthSession, initiateOidcLogout, localLogout, prepareAuthorizationUrl } from './authApi'
import { requestJson } from './apiClient'
import { clearSessionId, getSessionId, setSessionId } from './sessionStore'
import { getDashboard, getMovementByCaseId } from './paramitaApi'
import { isSessionLogoutMessage } from '../hooks/useSessionWebSocket'
import { beginManualLogin, clearAuthAttempt, clearEmbeddedAuthAttempt, getAuthAttemptState, hasEmbeddedAuthAttempted, isAuthAttemptInCooldown, markAuthFailed, tryBeginAutomaticLogin, tryBeginEmbeddedAuth } from './authAttemptStore'
import { clearLogoutPending, consumeLogoutPending, markLogoutPending } from './logoutState'
import { DANA_PARENT_ORIGIN, isEmbeddedContext, registerDanaUiEvents } from './embeddedAuth'

const storage = new Map<string, string>()
const location = { hash: '', pathname: '/', search: '', href: '', origin: 'https://qa.d1jxb89in36d10.amplifyapp.com' }
const history = { state: null, replaceState: vi.fn() }
const browserWindow: Record<string, unknown> = { location, history, dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), postMessage: vi.fn(), self: null, top: null, parent: null, opener: null, open: vi.fn(), close: vi.fn() }

beforeEach(() => {
  storage.clear()
  vi.restoreAllMocks()
  vi.stubEnv('VITE_API_URL', 'https://qa-api.example.com')
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  vi.stubGlobal('window', browserWindow)
  vi.stubGlobal('document', { title: 'Paramita' })
  clearAuthAttempt()
  clearEmbeddedAuthAttempt()
  clearLogoutPending()
  location.hash = ''
  location.search = ''
  location.href = ''
  browserWindow.self = browserWindow
  browserWindow.top = browserWindow
  browserWindow.parent = browserWindow
  browserWindow.postMessage = vi.fn()
  browserWindow.addEventListener = vi.fn()
  browserWindow.removeEventListener = vi.fn()
  browserWindow.opener = null
  browserWindow.open = vi.fn()
  browserWindow.close = vi.fn()
  history.replaceState.mockReset()
})

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('BFF auth flow', () => {
  it('detects #auth_code and removes the fragment immediately', () => {
    location.hash = '#auth_code=one-time-code'
    expect(consumeAuthCodeFromHash()).toBe('one-time-code')
    expect(history.replaceState).toHaveBeenCalledWith(null, 'Paramita', '/')
  })

  it('does not persist authCode', () => {
    location.hash = '#auth_code=temporary-code'
    consumeAuthCodeFromHash()
    expect(storage.has('paramita_session')).toBe(false)
    expect(storage.has('auth_code')).toBe(false)
  })

  it('finalizes an authCode once, stores only the sessionId, and clears the embedded attempt', async () => {
    tryBeginEmbeddedAuth()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sessionId: 'opaque-session', expiresIn: 3600 }))
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([finalizeAuthCode('code-once'), finalizeAuthCode('code-once')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://qa-api.example.com/auth/finalize', expect.objectContaining({ method: 'POST', body: JSON.stringify({ authCode: 'code-once' }) }))
    expect(getSessionId()).toBe('opaque-session')
    expect(hasEmbeddedAuthAttempted()).toBe(false)
    expect(storage.has('code-once')).toBe(false)
  })

  it('clears the session when finalize fails', async () => {
    setSessionId('old-session')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'invalid' }, 400)))
    await expect(finalizeAuthCode('failed-code')).rejects.toThrow()
    expect(getSessionId()).toBeNull()
  })

  it('prepares OAuth through the API and returns only a validated DANA authorization URL', async () => {
    const authorizationUrl = 'https://auth.danaconnect-qa.com/oauth2/authorize?state=opaque-state'
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, authorizationUrl }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(prepareAuthorizationUrl()).resolves.toBe(authorizationUrl)
    expect(fetchMock).toHaveBeenCalledWith('https://qa-api.example.com/auth/prepare', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock.mock.calls[0][0]).not.toContain('/auth/login')
  })

  it('rejects an invalid or unexpected authorization URL without navigating', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, authorizationUrl: 'not-a-url' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, authorizationUrl: 'https://unexpected.example.com/authorize' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(prepareAuthorizationUrl()).rejects.toThrow('La URL de autenticación no es válida.')
    await expect(prepareAuthorizationUrl()).rejects.toThrow('La URL de autenticación no es válida.')
    expect(location.href).toBe('')
  })

  it('surfaces an API error when authorization preparation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)))
    await expect(prepareAuthorizationUrl()).rejects.toThrow()
    expect(location.href).toBe('')
  })

  it('uses Authorization: Session for /auth/session', async () => {
    setSessionId('session-123')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ authenticated: true, authorized: true }))
    vi.stubGlobal('fetch', fetchMock)
    await getAuthSession()
    expect(fetchMock).toHaveBeenCalledWith('https://qa-api.example.com/auth/session', expect.objectContaining({ headers: expect.any(Headers) }))
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get('Authorization')).toBe('Session session-123')
  })

  it('does not call /auth/session without a stored session', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAuthSession()).resolves.toEqual({ authenticated: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears an invalid stored session after /auth/session returns 401', async () => {
    setSessionId('expired-session')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAuthSession()).resolves.toEqual({ authenticated: false })
    expect(fetchMock).toHaveBeenCalledWith('https://qa-api.example.com/auth/session', expect.any(Object))
    expect(getSessionId()).toBeNull()
  })

  it('validates the session after a successful finalize', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sessionId: 'session-after-finalize', expiresIn: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, authorized: true }))
    vi.stubGlobal('fetch', fetchMock)
    await finalizeAuthCode('fresh-code')
    await expect(getAuthSession()).resolves.toMatchObject({ authenticated: true, authorized: true })
    expect(fetchMock.mock.calls[1][0]).toBe('https://qa-api.example.com/auth/session')
  })

  it('uses Authorization: Session for dashboard and order requests', async () => {
    setSessionId('session-456')
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ orders: [] })))
    vi.stubGlobal('fetch', fetchMock)
    await getDashboard()
    await getMovementByCaseId('OT-1')
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get('Authorization')).toBe('Session session-456')
    expect(((fetchMock.mock.calls[1][1] as RequestInit).headers as Headers).get('Authorization')).toBe('Session session-456')
  })

  it('omits Authorization when there is no session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ orders: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await getDashboard()
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).has('Authorization')).toBe(false)
  })

  it('clears the session and emits the auth event on protected 401', async () => {
    setSessionId('expired-session')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)))
    await expect(requestJson('/dashboard')).rejects.toMatchObject({ status: 401 })
    expect(getSessionId()).toBeNull()
    expect(browserWindow.dispatchEvent).toHaveBeenCalled()
  })

  it('sends the local logout authorization and clears the session', async () => {
    setSessionId('logout-session')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await localLogout()
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get('Authorization')).toBe('Session logout-session')
    expect(getSessionId()).toBeNull()
    expect(location.href).toBe('/')
  })

  it('recognizes SESSION_LOGOUT without exposing session data', () => {
    expect(isSessionLogoutMessage('{"type":"SESSION_LOGOUT"}')).toBe(true)
    expect(isSessionLogoutMessage('{"type":"OTHER"}')).toBe(false)
    expect(isSessionLogoutMessage('invalid')).toBe(false)
  })

  it('initiates OIDC logout with Authorization and returns only a one-time code', async () => {
    setSessionId('session-for-logout')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ logoutCode: 'logout-code-123', expiresIn: 60 }))
    vi.stubGlobal('fetch', fetchMock)
    const logoutCode = await initiateOidcLogout()
    const request = fetchMock.mock.calls[0][1] as RequestInit
    const url = buildOidcLogoutContinueUrl(logoutCode)
    expect(fetchMock).toHaveBeenCalledWith('https://qa-api.example.com/auth/logout/initiate', expect.objectContaining({ method: 'POST' }))
    expect(request.body).toBeUndefined()
    expect((request.headers as Headers).get('Authorization')).toBe('Session session-for-logout')
    expect(url).toBe('https://qa-api.example.com/auth/logout/continue?code=logout-code-123')
    expect(url).not.toContain('session-for-logout')
    expect(getSessionId()).toBeNull()
    expect(storage.has('logout-code-123')).toBe(false)
  })

  it('clears the session and does not produce a continue code on initiate 401', async () => {
    setSessionId('expired-logout-session')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    vi.stubGlobal('fetch', fetchMock)
    await expect(initiateOidcLogout()).rejects.toMatchObject({ status: 401 })
    expect(getSessionId()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears the session and does not produce a continue code on initiate 500', async () => {
    setSessionId('failed-logout-session')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500))
    vi.stubGlobal('fetch', fetchMock)
    await expect(initiateOidcLogout()).rejects.toMatchObject({ status: 500 })
    expect(getSessionId()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not call initiate without a session', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(initiateOidcLogout()).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows automatic login once and blocks a second render', () => {
    expect(tryBeginAutomaticLogin()).toBe(true)
    expect(tryBeginAutomaticLogin()).toBe(false)
    expect(getAuthAttemptState()?.status).toBe('started')
  })

  it('blocks automatic login during the cooldown and after a failed attempt', () => {
    expect(tryBeginAutomaticLogin()).toBe(true)
    expect(isAuthAttemptInCooldown()).toBe(true)
    markAuthFailed()
    expect(tryBeginAutomaticLogin()).toBe(false)
  })

  it('does not start another login when focus or visibility revalidates auth', () => {
    expect(tryBeginAutomaticLogin()).toBe(true)
    expect(tryBeginAutomaticLogin()).toBe(false)
    expect(tryBeginAutomaticLogin()).toBe(false)
  })

  it('does not restart OAuth after a post-login 401', () => {
    markAuthFailed()
    expect(tryBeginAutomaticLogin()).toBe(false)
  })

  it('supports an explicit manual retry by resetting the failed attempt', () => {
    markAuthFailed()
    beginManualLogin()
    expect(getAuthAttemptState()?.status).toBe('started')
    expect(tryBeginAutomaticLogin()).toBe(false)
  })

  it('stores logout pending as a non-sensitive sessionStorage flag', () => {
    markLogoutPending()
    const value = storage.get('paramita_logout_pending')
    expect(value).toBeTruthy()
    expect(value).not.toContain('session')
    expect(value).not.toContain('code')
    expect(storage.has('localStorage')).toBe(false)
  })

  it('consumes logout pending before allowing the post-logout login', () => {
    markLogoutPending()
    expect(consumeLogoutPending()).toBe(true)
    expect(storage.has('paramita_logout_pending')).toBe(false)
    expect(consumeLogoutPending()).toBe(false)
  })

  it('allows exactly one automatic login after a logout return', () => {
    markLogoutPending()
    expect(consumeLogoutPending()).toBe(true)
    clearAuthAttempt()
    expect(tryBeginAutomaticLogin()).toBe(true)
    expect(tryBeginAutomaticLogin()).toBe(false)
  })

  it('detects embedded mode only from the embedded query parameter', () => {
    expect(isEmbeddedContext()).toBe(false)
    location.search = '?embedded=true&lang=EN'
    expect(isEmbeddedContext()).toBe(true)
    location.search = ''
    browserWindow.self = {}
    browserWindow.top = {}
    expect(isEmbeddedContext()).toBe(false)
  })

  it('starts embedded authentication only once until it succeeds or is cleared', () => {
    expect(tryBeginEmbeddedAuth()).toBe(true)
    expect(hasEmbeddedAuthAttempted()).toBe(true)
    expect(tryBeginEmbeddedAuth()).toBe(false)
    clearEmbeddedAuthAttempt()
    expect(tryBeginEmbeddedAuth()).toBe(true)
  })

  it('registers only approved DANA UI event types from the configured origin', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const cleanup = registerDanaUiEvents()
    const listener = (browserWindow.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0][1] as (event: MessageEvent) => void
    listener({ origin: 'https://other.example.com', data: { type: 'dana:host' } } as MessageEvent)
    listener({ origin: DANA_PARENT_ORIGIN, data: { type: 'dana:auth', token: 'secret' } } as MessageEvent)
    expect(log).not.toHaveBeenCalled()
    listener({ origin: DANA_PARENT_ORIGIN, data: { type: 'dana:host' } } as MessageEvent)
    expect(log).toHaveBeenCalledWith('DANA_UI_EVENT type=dana:host')
    cleanup()
    expect(browserWindow.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })
})
