import { Link, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { authedFetch, login } from './api'
import Dashboard from './pages/Dashboard'
import RunAgent from './pages/RunAgent'
import AuditLogs from './pages/AuditLogs'
import HitlQueue from './pages/HitlQueue'

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [stats, setStats] = useState({ total_runs: 0, blocked: 0, approved: 0, alerts: 0 })
  const [dark, setDark] = useState(localStorage.getItem('dark') === '1')

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
  }, [token])

  async function doLogin() {
    const res = await login('admin', 'admin123')
    localStorage.setItem('token', res.access_token)
    setToken(res.access_token)
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-8">
        <h1 className="text-2xl font-bold mb-4">Kifaru Guard</h1>
        <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={doLogin}>Login as admin</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <nav className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 p-4 flex gap-4 items-center">
        <Link to="/">Dashboard</Link>
        <Link to="/run">Run Agent</Link>
        <Link to="/audit">Audit Logs</Link>
        <Link to="/hitl">HITL Queue</Link>
        <button className="ml-auto px-3 py-1 bg-green-600 text-white rounded" onClick={() => setDark((d) => !d)}>
          {dark ? 'Light' : 'Dark'}
        </button>
      </nav>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Dashboard stats={stats} token={token} />} />
          <Route path="/run" element={<RunAgent token={token} />} />
          <Route path="/audit" element={<AuditLogs token={token} />} />
          <Route path="/hitl" element={<HitlQueue token={token} />} />
        </Routes>
      </main>
    </div>
  )
}
