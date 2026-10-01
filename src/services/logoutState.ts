const LOGOUT_PENDING_KEY = 'paramita_logout_pending'

export function markLogoutPending(): void {
  try {
    sessionStorage.setItem(LOGOUT_PENDING_KEY, JSON.stringify({ timestamp: Date.now() }))
  } catch {
    // Ignore storage failures; the backend remains the source of truth.
  }
}

export function consumeLogoutPending(): boolean {
  try {
    const value = sessionStorage.getItem(LOGOUT_PENDING_KEY)
    sessionStorage.removeItem(LOGOUT_PENDING_KEY)
    if (!value) return false
    const parsed = JSON.parse(value) as { timestamp?: unknown }
    return typeof parsed.timestamp === 'number'
  } catch {
    return false
  }
}

export function clearLogoutPending(): void {
  try {
    sessionStorage.removeItem(LOGOUT_PENDING_KEY)
  } catch {
    // Ignore storage failures.
  }
}
