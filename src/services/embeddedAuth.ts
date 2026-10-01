function getDanaParentOrigin(): string | null {
  const configuredOrigin = import.meta.env.VITE_DANA_PARENT_ORIGIN?.trim()
  if (!configuredOrigin) return null

  try {
    const origin = new URL(configuredOrigin)
    return origin.protocol === 'https:' ? origin.origin : null
  } catch {
    return null
  }
}

const DANA_UI_EVENT_TYPES = new Set(['dana:host', 'dana:visibility', 'lang', 'theme'])

export function isEmbeddedContext(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('embedded') === 'true'
}

export function isRunningInsideIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export function registerDanaUiEvents(): () => void {
  const danaParentOrigin = getDanaParentOrigin()

  const handleMessage = (event: MessageEvent) => {
    if (!danaParentOrigin || event.origin !== danaParentOrigin) return
    const type = event.data && typeof event.data === 'object' ? event.data.type : undefined
    if (typeof type !== 'string' || !DANA_UI_EVENT_TYPES.has(type)) return
    console.log(`DANA_UI_EVENT type=${type}`)
  }

  window.addEventListener('message', handleMessage)
  return () => window.removeEventListener('message', handleMessage)
}
