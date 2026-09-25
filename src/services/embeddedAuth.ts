export const PARAMITA_AUTH_CODE_MESSAGE = 'PARAMITA_AUTH_CODE'

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

export function handoffAuthCodeToOpener(authCode: string): boolean {
  if (!window.opener) return false
  window.opener.postMessage({ type: PARAMITA_AUTH_CODE_MESSAGE, authCode }, window.location.origin)
  window.close()
  return true
}

export function getAuthCodeFromMessage(event: MessageEvent, popup: Window | null): string | null {
  if (!popup || event.origin !== window.location.origin || event.source !== popup) return null
  if (!event.data || typeof event.data !== 'object') return null
  const data = event.data as { type?: unknown; authCode?: unknown }
  if (data.type !== PARAMITA_AUTH_CODE_MESSAGE || typeof data.authCode !== 'string' || !data.authCode.trim()) return null
  return data.authCode
}
