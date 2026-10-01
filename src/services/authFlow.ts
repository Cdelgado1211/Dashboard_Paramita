export type AuthFinalizeState = 'idle' | 'pending' | 'success' | 'error'

export function consumeAuthCodeFromHash(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith('#')) return null

  const authCode = new URLSearchParams(hash.slice(1)).get('auth_code')
  if (!authCode) return null

  window.history.replaceState(window.history.state, document.title, `${window.location.pathname}${window.location.search}`)
  return authCode
}

export function shouldValidateAuthSession(hasStoredSession: boolean, authFragmentPresent: boolean, finalizeState: AuthFinalizeState): boolean {
  return hasStoredSession && (!authFragmentPresent || finalizeState === 'success') && finalizeState !== 'pending'
}

export function hasAuthCodeFragment(): boolean {
  return window.location.hash.startsWith('#auth_code')
}
