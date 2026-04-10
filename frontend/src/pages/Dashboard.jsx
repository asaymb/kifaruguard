import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authedFetch, getComplianceExportCount } from '../api'

function StatCard({ title, value, hint, tone }) {
  const tones = {
    default: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
    ok: 'border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20',
    danger: 'border-red-200/80 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20',
    warn: 'border-orange-200/80 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-950/20',
    info: 'border-blue-200/80 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20',
  }
  return (
    <div className={`rounded-lg border p-5 shadow-sm ${tones[tone] || tones.default}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{hint}</p> : null}
    </div>
  )
}

export default function Dashboard({ stats, token, pendingHitl }) {
  const [agents, setAgents] = useState({ mine: true, bank: true })
  const [blockStatuses, setBlockStatuses] = useState('BLOCKED')
  const [exportCount, setExportCount] = useState(() => getComplianceExportCount())

  useEffect(() => {
    const onExp = () => setExportCount(getComplianceExportCount())
    window.addEventListener('kifaru-exports-changed', onExp)
    return () => window.removeEventListener('kifaru-exports-changed', onExp)
  }, [])

  useEffect(() => {
    authedFetch('/config/runtime', token)
      .then((cfg) => setAgents(cfg?.agents || { mine: true, bank: true }))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    authedFetch('/config/guardrails', token)
      .then((d) => {
        const fromRules = (d.rules || [])
          .filter((r) => r.enabled && r.action === 'BLOCK')
          .map((r) => r.condition)
        setBlockStatuses((fromRules.length ? fromRules : d.block_on_status || ['BLOCKED']).join(','))
      })
      .catch(() => {})
  }, [token])

  async function toggle(name) {
    const next = { ...agents, [name]: !agents[name] }
    setAgents(next)
    await authedFetch('/config/agents', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
  }

  async function saveGuardrails() {
    const statuses = blockStatuses
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
    await authedFetch('/config/guardrails', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_on_status: statuses }),
    })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          At-a-glance posture for agent executions, policy blocks, human reviews, and compliance exports.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total runs"
          value={stats.total_runs}
          hint="Completed agent executions (audit END events)."
          tone="default"
        />
        <StatCard
          title="Failed / blocked"
          value={stats.blocked}
          hint="Runs where policy returned BLOCKED."
          tone="danger"
        />
        <StatCard
          title="Pending HITL"
          value={pendingHitl ?? 0}
          hint="Awaiting human decision."
          tone="warn"
        />
        <StatCard
          title="Reports exported"
          value={exportCount}
          hint="PDF downloads tracked in this browser."
          tone="info"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Quick actions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/run"
              className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Run agent
            </Link>
            <Link
              to="/audit"
              className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              View audit log
            </Link>
            <Link
              to="/hitl"
              className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Open HITL queue
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Signals</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Approved outcomes</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{stats.approved}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Rule alerts</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-orange-700 dark:text-orange-400">{stats.alerts}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Operational controls</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 mb-4">
          For detailed policies and guardrail rules, use{' '}
          <Link to="/policies" className="font-semibold text-blue-700 dark:text-blue-400 hover:underline">
            Policies
          </Link>
          .
        </p>
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Agents enabled</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggle('mine')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  agents.mine
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Mine: {agents.mine ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => toggle('bank')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  agents.bank
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Bank: {agents.bank ? 'On' : 'Off'}
              </button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Block on statuses</p>
            <div className="flex flex-wrap gap-2">
              <input
                className="flex-1 min-w-[200px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={blockStatuses}
                onChange={(e) => setBlockStatuses(e.target.value)}
                placeholder="BLOCKED, REVIEW"
              />
              <button
                type="button"
                onClick={saveGuardrails}
                className="rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
