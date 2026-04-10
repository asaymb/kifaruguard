// Single base for REST; keep in sync with RunAgent and VITE_API_BASE_URL in Docker / Railway.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const API = API_BASE_URL

export async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('Login failed')
  return res.json()
}

export async function fetchInbox(token) {
  return authedFetch('/inbox', token)
}

export async function uploadInboxFile(token, file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API}/inbox/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/** Run agent on a PDF already stored in the inbox (basename under server upload dir). */
export async function runAgentFromInbox(token, agentType, filename) {
  const fd = new FormData()
  fd.append('agent_type', agentType)
  fd.append('file_path', filename)
  const res = await fetch(`${API}/agents/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  let data
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    const msg = data.detail || data.error || (typeof data === 'string' ? data : null) || res.statusText
    throw new Error(typeof msg === 'string' ? msg : 'Run failed')
  }
  return data
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

/** Download compliance PDF for one agent run (GET /audit/export/{run_id}). */
export async function exportAuditReportPdf(token, runId) {
  const res = await fetch(`${API}/audit/export/${encodeURIComponent(runId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Export failed (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kifaru-compliance-report-${String(runId).slice(0, 8)}.pdf`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function connectHitlSocket(token, onMessage) {
  const wsBase = import.meta.env.VITE_WS_BASE_URL
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  const base = wsBase || `${scheme}://${host}/ws/hitl`
  const sep = base.includes('?') ? '&' : '?'
  // Backend requires JWT on HITL WebSocket (same token as REST).
  const url = `${base}${sep}token=${encodeURIComponent(token)}`
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
