const AUTH_ATTEMPTED_KEY = 'paramita_auth_attempted'

export function hasAuthAttempted(): boolean {
  try {
    return sessionStorage.getItem(AUTH_ATTEMPTED_KEY) === 'true'
  } catch {
    return false
  }
}

export function clearAuthAttempt(): void {
  try {
    sessionStorage.removeItem(AUTH_ATTEMPTED_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function markAuthAttempt(): void {
  try {
    sessionStorage.setItem(AUTH_ATTEMPTED_KEY, 'true')
  } catch {
    // Ignore storage failures.
  }
}
