export const DANA_PARENT_ORIGIN = 'https://console.danaconnect-qa.com'

const DANA_UI_EVENT_TYPES = new Set(['dana:host', 'dana:visibility', 'lang', 'theme'])

export function buildAuthLoginUrl(baseUrl: string, embedded: boolean): string {
  return `${baseUrl}/auth/login${embedded ? '?silent=true' : ''}`
}

export function isEmbeddedContext(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('embedded') === 'true'
}

export function registerDanaUiEvents(): () => void {
  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== DANA_PARENT_ORIGIN) return
    const type = event.data && typeof event.data === 'object' ? event.data.type : undefined
    if (typeof type !== 'string' || !DANA_UI_EVENT_TYPES.has(type)) return
    console.log(`DANA_UI_EVENT type=${type}`)
  }

  window.addEventListener('message', handleMessage)
  return () => window.removeEventListener('message', handleMessage)
}
