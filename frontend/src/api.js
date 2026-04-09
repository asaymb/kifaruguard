const API = import.meta.env.VITE_API_BASE_URL || ''

export async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('Login failed')
  return res.json()
}

export async function authedFetch(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function connectHitlSocket(onMessage) {
  const wsBase = import.meta.env.VITE_WS_BASE_URL
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  const url = wsBase || `${scheme}://${host}/ws/hitl`
  const ws = new WebSocket(url)
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data))
    } catch {
      onMessage({ event: 'unknown' })
    }
  }
  return ws
}
