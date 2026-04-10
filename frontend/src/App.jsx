import { Route, Routes } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { authedFetch, login } from './api'
import AppLayout from './components/AppLayout'
import Dashboard from './pages/Dashboard'
import RunAgent from './pages/RunAgent'
import AuditLogs from './pages/AuditLogs'
import HitlQueue from './pages/HitlQueue'
import Policies from './pages/Policies'
import CaseView from './pages/CaseView'
import Inbox from './pages/Inbox'

function displayNameFromToken(token) {
  try {
    const part = token.split('.')[1]
    if (!part) return 'Authenticated user'
    const b = part.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b.length % 4 === 0 ? '' : '='.repeat(4 - (b.length % 4))
    const json = JSON.parse(atob(b + pad))
    return json.sub || json.username || json.user || json.email || 'Authenticated user'
  } catch {
    return 'Authenticated user'
  }
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [stats, setStats] = useState({ total_runs: 0, blocked: 0, approved: 0, alerts: 0 })
  const [pendingHitl, setPendingHitl] = useState(0)
  const [dark, setDark] = useState(localStorage.getItem('dark') === '1')

  const environmentLabel = useMemo(() => {
    const v = import.meta.env.VITE_ENVIRONMENT
    if (v && String(v).toLowerCase() === 'production') return 'Production'
    if (v && String(v).toLowerCase() === 'development') return 'Development'
    return import.meta.env.PROD ? 'Production' : 'Development'
  }, [])

  const displayName = useMemo(() => (token ? displayNameFromToken(token) : ''), [token])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('dark', dark ? '1' : '0')
  }, [dark])

  useEffect(() => {
    if (!token) return
    authedFetch('/audit?page=1&page_size=200', token)
      .then((payload) => {
        const logs = payload.items || []
        setStats({
          total_runs: logs.filter((x) => x.step === 'END').length,
          blocked: logs.filter((x) => x.step === 'DECISION' && (x.output_text || '').includes('BLOCKED')).length,
          approved: logs.filter((x) => x.step === 'DECISION' && (x.output_text || '').includes('APPROVED')).length,
          alerts: logs.filter((x) => x.step === 'CHECK_RULES' && (x.output_text || '').includes('False')).length,
        })
      })
      .catch(() => {})
    authedFetch('/hitl?status=pending&page=1&page_size=1', token)
      .then((d) => setPendingHitl(typeof d.total === 'number' ? d.total : 0))
      .catch(() => setPendingHitl(0))
  }, [token])

  async function doLogin() {
    const res = await login('admin', 'admin123')
    localStorage.setItem('token', res.access_token)
    setToken(res.access_token)
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-lg">
              K
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">Kifaru Guard</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Agent governance & audit</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Sign in to review runs, human escalations, and compliance exports.
          </p>
          <button
            type="button"
            className="w-full rounded-lg bg-slate-900 dark:bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors"
            onClick={doLogin}
          >
            Continue as admin
          </button>
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">Development demo credentials</p>
        </div>
      </div>
    )
  }

  return (
    <AppLayout
      dark={dark}
      onToggleDark={() => setDark((d) => !d)}
      environmentLabel={environmentLabel}
      displayName={displayName}
      pendingHitlCount={pendingHitl}
    >
      <Routes>
        <Route path="/" element={<Dashboard stats={stats} token={token} pendingHitl={pendingHitl} />} />
        <Route path="/run" element={<RunAgent token={token} />} />
        <Route path="/inbox" element={<Inbox token={token} />} />
        <Route path="/audit" element={<AuditLogs token={token} />} />
        <Route path="/hitl" element={<HitlQueue token={token} />} />
        <Route path="/policies" element={<Policies token={token} />} />
        <Route path="/cases/:runId" element={<CaseView token={token} />} />
      </Routes>
    </AppLayout>
  )
}
