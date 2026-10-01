import { useEffect } from 'react'
import type { AuthSession } from '../services/authApi'
import { localLogout } from '../services/authApi'

const logoutMessageType = 'SESSION_LOGOUT'

export function isSessionLogoutMessage(data: string): boolean {
  try {
    return (JSON.parse(data) as { type?: string }).type === logoutMessageType
  } catch {
    return false
  }
}

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
      if (isSessionLogoutMessage(event.data)) void localLogout()
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
