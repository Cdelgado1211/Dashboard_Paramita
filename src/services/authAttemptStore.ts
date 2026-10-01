export const AUTH_LOGIN_COOLDOWN_MS = 60_000

const AUTH_ATTEMPT_KEY = 'paramita_auth_attempt'
const LEGACY_AUTH_ATTEMPT_KEY = 'paramita_auth_attempted'
const EMBEDDED_AUTH_ATTEMPT_KEY = 'paramita_embedded_auth_attempted'
let memoryState: AuthAttemptState | null = null
let embeddedAttemptedInMemory = false

export type AuthAttemptStatus = 'started' | 'failed' | 'succeeded'
export interface AuthAttemptState {
  status: AuthAttemptStatus
  timestamp: number
}

function readState(): AuthAttemptState | null {
  try {
    const stored = sessionStorage.getItem(AUTH_ATTEMPT_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AuthAttemptState>
      if ((parsed.status === 'started' || parsed.status === 'failed' || parsed.status === 'succeeded') && typeof parsed.timestamp === 'number') return parsed as AuthAttemptState
    }
    if (sessionStorage.getItem(LEGACY_AUTH_ATTEMPT_KEY) === 'true') return { status: 'failed', timestamp: Date.now() }
    if (memoryState) return memoryState
  } catch {
    return memoryState
  }
  return null
}

function writeState(status: AuthAttemptStatus): void {
  memoryState = { status, timestamp: Date.now() }
  try {
    sessionStorage.setItem(AUTH_ATTEMPT_KEY, JSON.stringify(memoryState))
    sessionStorage.removeItem(LEGACY_AUTH_ATTEMPT_KEY)
  } catch {
    // Ignore storage failures; the backend remains the source of truth.
  }
}

export function getAuthAttemptState(): AuthAttemptState | null {
  return readState()
}

export function isAuthAttemptInCooldown(now = Date.now()): boolean {
  const state = readState()
  return Boolean(state && now - state.timestamp < AUTH_LOGIN_COOLDOWN_MS)
}

export function tryBeginAutomaticLogin(): boolean {
  const state = readState()
  if (state) return false
  writeState('started')
  return true
}

export function beginManualLogin(): void {
  clearAuthAttempt()
  writeState('started')
}

export function markAuthAttempt(): void {
  writeState('started')
}

export function markAuthFailed(): void {
  writeState('failed')
}

export function markAuthSucceeded(): void {
  writeState('succeeded')
}

export function hasAuthAttempted(): boolean {
  return Boolean(readState())
}

export function clearAuthAttempt(): void {
  memoryState = null
  try {
    sessionStorage.removeItem(AUTH_ATTEMPT_KEY)
    sessionStorage.removeItem(LEGACY_AUTH_ATTEMPT_KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function tryBeginEmbeddedAuth(): boolean {
  try {
    if (sessionStorage.getItem(EMBEDDED_AUTH_ATTEMPT_KEY) === 'true') return false
    sessionStorage.setItem(EMBEDDED_AUTH_ATTEMPT_KEY, 'true')
    return true
  } catch {
    if (embeddedAttemptedInMemory) return false
    embeddedAttemptedInMemory = true
    return true
  }
}

export function hasEmbeddedAuthAttempted(): boolean {
  try {
    return sessionStorage.getItem(EMBEDDED_AUTH_ATTEMPT_KEY) === 'true'
  } catch {
    return embeddedAttemptedInMemory
  }
}

export function clearEmbeddedAuthAttempt(): void {
  embeddedAttemptedInMemory = false
  try {
    sessionStorage.removeItem(EMBEDDED_AUTH_ATTEMPT_KEY)
  } catch {
    // Ignore storage failures; the backend remains the source of truth.
  }
}
