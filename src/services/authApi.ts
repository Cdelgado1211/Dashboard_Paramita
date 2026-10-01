import { requestJson, ParamitaApiError } from './apiClient'
import { getApiBaseUrl, getOidcOrigin } from './apiConfig'
import { clearEmbeddedAuthAttempt } from './authAttemptStore'
import { clearSessionId, getSessionId, setSessionId } from './sessionStore'

export interface AuthSession {
  authenticated: boolean
  authorized?: boolean
  requiredScope?: string
  sid?: string
  user?: unknown
}

export class AuthSessionError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'AuthSessionError'
  }
}

interface PrepareAuthorizationResponse { ok?: boolean; authorizationUrl?: string }

export async function prepareAuthorizationUrl(): Promise<string> {
  const response = await requestJson<PrepareAuthorizationResponse>('/auth/prepare', { method: 'GET' }, { includeSession: false, notifyUnauthorized: false })
  if (typeof response.authorizationUrl !== 'string' || !response.authorizationUrl.trim()) {
    throw new AuthSessionError(0, 'No fue posible preparar la autenticación.')
  }

  let authorizationUrl: URL
  let expectedOrigin: URL
  try {
    authorizationUrl = new URL(response.authorizationUrl)
    expectedOrigin = new URL(getOidcOrigin())
  } catch {
    throw new AuthSessionError(0, 'La URL de autenticación no es válida.')
  }

  if (authorizationUrl.protocol !== 'https:' || authorizationUrl.origin !== expectedOrigin.origin) {
    throw new AuthSessionError(0, 'La URL de autenticación no es válida.')
  }

  return authorizationUrl.toString()
}

export async function getAuthSession(): Promise<AuthSession> {
  if (!getSessionId()) return { authenticated: false }

  try {
    return await requestJson<AuthSession>('/auth/session', {}, { notifyUnauthorized: false })
  } catch (error) {
    if (error instanceof ParamitaApiError && error.status === 401) {
      clearSessionId()
      return { authenticated: false }
    }
    if (error instanceof ParamitaApiError && error.status === 403) {
      throw new AuthSessionError(403, 'Tu usuario está autenticado, pero no tiene autorización para acceder a este dashboard.')
    }
    throw new AuthSessionError(error instanceof ParamitaApiError ? error.status : 0, 'No fue posible validar la sesión.')
  }
}

interface FinalizeResponse { sessionId?: string; expiresIn?: number }
let finalizeOnce: { authCode: string; promise: Promise<FinalizeResponse> } | null = null

export function finalizeAuthCode(authCode: string): Promise<FinalizeResponse> {
  if (finalizeOnce?.authCode === authCode) return finalizeOnce.promise

  const promise = requestJson<FinalizeResponse>('/auth/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authCode }),
  }, { includeSession: false, notifyUnauthorized: false }).then(response => {
    if (typeof response.sessionId !== 'string' || !response.sessionId.trim()) {
      throw new AuthSessionError(0, 'No fue posible completar la autenticación.')
    }
    setSessionId(response.sessionId)
    clearEmbeddedAuthAttempt()
    return response
  }).catch(error => {
    clearSessionId()
    throw error
  })

  finalizeOnce = { authCode, promise }
  return promise
}

export async function localLogout(): Promise<void> {
  try {
    await requestJson('/auth/local-logout', { method: 'GET' }, { notifyUnauthorized: false })
  } finally {
    clearSessionId()
    window.location.href = '/'
  }
}

interface OidcLogoutResponse { logoutCode?: string; expiresIn?: number }
let oidcLogoutOnce: Promise<string> | null = null

export function initiateOidcLogout(): Promise<string> {
  if (oidcLogoutOnce) return oidcLogoutOnce

  const sessionId = getSessionId()
  if (!sessionId) {
    clearSessionId()
    return Promise.reject(new ParamitaApiError(401, 'La sesión de Paramita ya no es válida.'))
  }

  const request = requestJson<OidcLogoutResponse>('/auth/logout/initiate', { method: 'POST' }, { notifyUnauthorized: false }).then(response => {
    if (typeof response.logoutCode !== 'string' || !response.logoutCode.trim()) {
      throw new AuthSessionError(0, 'No fue posible cerrar la sesión.')
    }
    clearSessionId()
    return response.logoutCode
  }).catch(error => {
    clearSessionId()
    throw error
  })
  const trackedRequest = request.finally(() => {
    if (oidcLogoutOnce === trackedRequest) oidcLogoutOnce = null
  })
  oidcLogoutOnce = trackedRequest
  return trackedRequest
}

export function buildOidcLogoutContinueUrl(logoutCode: string): string {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) throw new AuthSessionError(0, 'Falta configurar VITE_API_URL en el frontend.')
  return `${baseUrl}/auth/logout/continue?code=${encodeURIComponent(logoutCode)}`
}
