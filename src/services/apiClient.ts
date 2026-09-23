import { getApiBaseUrl } from './apiConfig'
import { clearSessionId, getSessionId } from './sessionStore'
import { notifySessionExpired } from './sessionEvents'

export class ParamitaApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ParamitaApiError'
  }
}

interface RequestOptions {
  includeSession?: boolean
  notifyUnauthorized?: boolean
}

export async function requestJson<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) throw new ParamitaApiError(0, 'Falta configurar VITE_API_URL en el frontend.')

  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  if (options.includeSession !== false) {
    const sessionId = getSessionId()
    if (sessionId) headers.set('Authorization', `Session ${sessionId}`)
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  } catch {
    throw new ParamitaApiError(0, 'No fue posible conectar con Paramita.')
  }

  if (response.status === 401) {
    if (options.notifyUnauthorized !== false) {
      clearSessionId()
      notifySessionExpired()
    }
    throw new ParamitaApiError(401, 'La sesión de Paramita ya no es válida.')
  }

  if (!response.ok) throw new ParamitaApiError(response.status, `No fue posible consultar Paramita (${response.status}).`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
