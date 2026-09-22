import { useEffect } from 'react'
import type { AuthSession } from '../services/authApi'
import { getApiBaseUrl } from '../services/apiConfig'

const logoutMessageType = 'SESSION_LOGOUT'

export function useSessionWebSocket(session?: AuthSession) {
  const authenticated = session?.authenticated === true
  const authorized = session?.authorized === true
  const sid = session?.sid

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL
    if (!authenticated || !authorized || !sid || !wsUrl) return

    const socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      socket.send(JSON.stringify({ action: 'registerSession', sid }))
    }

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string }
        if (message.type === logoutMessageType) {
          const apiUrl = getApiBaseUrl()
          if (apiUrl) window.location.href = `${apiUrl}/auth/local-logout`
        }
      } catch {
        // Ignore malformed messages without affecting the dashboard.
      }
    }

    socket.onerror = () => {
      // The dashboard remains usable if the session channel is unavailable.
    }

    socket.onclose = () => {
      // No automatic reconnect is performed here.
    }

    return () => {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      socket.close()
    }
  }, [authenticated, authorized, sid])
}
