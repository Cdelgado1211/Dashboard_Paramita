export const PARAMITA_AUTH_CODE_MESSAGE = 'PARAMITA_AUTH_CODE'
export const PARAMITA_SILENT_AUTH_FAILED_MESSAGE = 'PARAMITA_SILENT_AUTH_FAILED'

export type EmbeddedAuthMessage =
  | { type: 'authCode'; authCode: string }
  | { type: 'silentFailure'; error: string }

export function isEmbeddedContext(): boolean {
  const params = new URLSearchParams(window.location.search)
  try {
    return params.get('embedded') === 'true' || window.self !== window.top
  } catch {
    return true
  }
}

export function openDanaAuthPopup(loginUrl: string): Window | null {
  return window.open(loginUrl, 'paramita-dana-auth', 'popup,width=600,height=750')
}

export function createSilentAuthFrame(loginUrl: string): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  frame.src = loginUrl
  frame.style.display = 'none'
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', 'Autenticación silenciosa de DANA')
  document.body.appendChild(frame)
  return frame
}

export function removeSilentAuthFrame(frame: HTMLIFrameElement | null): void {
  frame?.remove()
}

export function handoffAuthCodeToOpener(authCode: string): boolean {
  if (!window.opener) return false
  window.opener.postMessage({ type: PARAMITA_AUTH_CODE_MESSAGE, authCode }, window.location.origin)
  window.close()
  return true
}

export function handoffAuthCodeToContainer(authCode: string): boolean {
  if (handoffAuthCodeToOpener(authCode)) return true
  if (window.parent === window) return false
  window.parent.postMessage({ type: PARAMITA_AUTH_CODE_MESSAGE, authCode }, window.location.origin)
  return true
}

export function handoffSilentAuthFailureToParent(error: string | null): boolean {
  if (window.parent === window) return false
  const safeError = error === 'login_required' || error === 'interaction_required' || error === 'consent_required'
    ? error
    : 'silent_auth_failed'
  window.parent.postMessage({ type: PARAMITA_SILENT_AUTH_FAILED_MESSAGE, error: safeError }, window.location.origin)
  return true
}

export function getAuthCodeFromMessage(event: MessageEvent, popup: Window | null): string | null {
  if (!popup || event.origin !== window.location.origin || event.source !== popup) return null
  if (!event.data || typeof event.data !== 'object') return null
  const data = event.data as { type?: unknown; authCode?: unknown }
  if (data.type !== PARAMITA_AUTH_CODE_MESSAGE || typeof data.authCode !== 'string' || !data.authCode.trim()) return null
  return data.authCode
}

export function getEmbeddedAuthMessage(event: MessageEvent, source: Window | null): EmbeddedAuthMessage | null {
  if (!source || event.origin !== window.location.origin || event.source !== source) return null
  if (!event.data || typeof event.data !== 'object') return null
  const data = event.data as { type?: unknown; authCode?: unknown; error?: unknown }
  if (data.type === PARAMITA_AUTH_CODE_MESSAGE && typeof data.authCode === 'string' && data.authCode.trim()) {
    return { type: 'authCode', authCode: data.authCode }
  }
  if (data.type === PARAMITA_SILENT_AUTH_FAILED_MESSAGE && typeof data.error === 'string') {
    return { type: 'silentFailure', error: data.error }
  }
  return null
}
