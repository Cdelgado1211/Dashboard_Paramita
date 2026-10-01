const SESSION_KEY = 'paramita_session'

export function getSessionId(): string | null {
  try {
    const sessionId = sessionStorage.getItem(SESSION_KEY)?.trim()
    return sessionId || null
  } catch {
    return null
  }
}

export function setSessionId(sessionId: string): void {
  const normalized = sessionId.trim()
  if (!normalized) throw new Error('La sesión de Paramita no es válida.')
  sessionStorage.setItem(SESSION_KEY, normalized)
}

export function clearSessionId(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore storage failures; the backend remains the source of truth.
  }
}
