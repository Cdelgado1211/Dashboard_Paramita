export function getApiBaseUrl() {
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
}

export function getOidcOrigin() {
  return import.meta.env.VITE_OIDC_ORIGIN || 'https://auth.danaconnect-qa.com'
}
