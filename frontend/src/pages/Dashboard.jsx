import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authedFetch } from '../api'

export default function Dashboard({ stats, token }) {
  const [agents, setAgents] = useState({ mine: true, bank: true })
  const [blockStatuses, setBlockStatuses] = useState("BLOCKED")

  useEffect(() => {
    authedFetch('/config/runtime', token)
      .then((cfg) => {
        setAgents(cfg?.agents || { mine: true, bank: true })
      })
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
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
    await authedFetch('/config/guardrails', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_on_status: statuses }),
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded border dark:border-slate-700">
          <div className="text-sm text-gray-500">Agents Executed</div>
          <div className="text-2xl font-semibold">{stats.total_runs}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded border dark:border-slate-700">
          <div className="text-sm text-gray-500">Blocked</div>
          <div className="text-2xl font-semibold text-red-600">{stats.blocked}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded border dark:border-slate-700">
          <div className="text-sm text-gray-500">Approved</div>
          <div className="text-2xl font-semibold text-green-600">{stats.approved}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded border dark:border-slate-700">
          <div className="text-sm text-gray-500">Alerts</div>
          <div className="text-2xl font-semibold text-amber-500">{stats.alerts}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 rounded border dark:border-slate-700">
        <h3 className="font-semibold mb-3">Agent Controls</h3>
        <div className="flex gap-4">
          <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={() => toggle('mine')}>
            Mine: {agents.mine ? 'ON' : 'OFF'}
          </button>
          <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={() => toggle('bank')}>
            Bank: {agents.bank ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 rounded border dark:border-slate-700">
        <h3 className="font-semibold mb-3">Guardrails (quick)</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Comma-separated statuses to <strong>block</strong>. For REVIEW actions and messages, use{' '}
          <Link to="/policies" className="text-green-700 dark:text-green-400 underline">
            Policies
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="border rounded p-2 dark:bg-slate-700 flex-1 min-w-[200px]"
            value={blockStatuses}
            onChange={(e) => setBlockStatuses(e.target.value)}
            placeholder="BLOCKED,REVIEW"
          />
          <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={saveGuardrails}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
