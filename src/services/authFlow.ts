export function consumeAuthCodeFromHash(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith('#')) return null

  const authCode = new URLSearchParams(hash.slice(1)).get('auth_code')
  if (!authCode) return null

  window.history.replaceState(window.history.state, document.title, `${window.location.pathname}${window.location.search}`)
  return authCode
}
