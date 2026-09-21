import { getApiBaseUrl } from './apiConfig'

export interface AuthSession { authenticated: boolean }
export async function getAuthSession(): Promise<AuthSession> {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) throw new Error('Falta configurar VITE_API_URL en el frontend.')
  const response = await fetch(`${baseUrl}/auth/session`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (response.status === 401) return { authenticated: false }
  if (!response.ok) throw new Error(`La validación de sesión no está disponible (${response.status}). El backend necesita exponer GET /auth/session.`)
  return response.json()
}

export function logout(logoutUrl = import.meta.env.VITE_LOGOUT_URL) {
  if (!logoutUrl) {
    throw new Error('El backend todavía no expone un endpoint de logout para navegador.')
  }
  window.location.replace(logoutUrl)
}
