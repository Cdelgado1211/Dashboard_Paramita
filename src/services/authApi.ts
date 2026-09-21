import { getApiBaseUrl } from './apiConfig'

export interface AuthSession { authenticated: boolean }

export class AuthSessionError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'AuthSessionError'
  }
}

export async function getAuthSession(): Promise<AuthSession> {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) throw new AuthSessionError(0, 'Falta configurar VITE_API_URL en el frontend.')

  let response: Response
  try {
    response = await fetch(`${baseUrl}/auth/session`, { credentials: 'include', headers: { Accept: 'application/json' } })
  } catch {
    throw new AuthSessionError(0, 'No fue posible validar la sesión.')
  }

  if (response.status === 401) return { authenticated: false }
  if (response.status === 403) throw new AuthSessionError(403, 'Tu usuario está autenticado, pero no tiene autorización para acceder a este dashboard.')
  if (!response.ok) throw new AuthSessionError(response.status, 'No fue posible validar la sesión.')
  return response.json()
}

export function logout(logoutUrl = import.meta.env.VITE_LOGOUT_URL) {
  if (!logoutUrl) {
    throw new Error('El backend todavía no expone un endpoint de logout para navegador.')
  }
  window.location.replace(logoutUrl)
}
