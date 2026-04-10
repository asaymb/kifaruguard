import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { authedFetch, connectHitlSocket } from '../api'

function riskFromAgentStatus(agentResult) {
  const s = String(agentResult || '').toUpperCase()
  if (s === 'BLOCKED') return { label: 'High', className: 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300' }
  if (s === 'REVIEW') return { label: 'Medium', className: 'bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200' }
  return { label: 'Standard', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
}

export default function HitlQueue({ token }) {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [busyId, setBusyId] = useState(null)

  async function refresh() {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (status) query.set('status', status)
    const data = await authedFetch(`/hitl?${query.toString()}`, token)
    setItems(data.items || [])
    setTotal(data.total || 0)
  }

  async function action(id, actionName) {
    setBusyId(id)
    try {
      await authedFetch(`/hitl/${id}/${actionName}`, token, { method: 'POST' })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  useEffect(() => {
    refresh().catch(() => {
      setItems([])
      setTotal(0)
    })
  }, [token, page, pageSize, status])

  useEffect(() => {
    const ws = connectHitlSocket(token, () => {
      refresh().catch(() => {})
    })
    return () => ws.close()
  }, [token])

  const sorted = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      const pa = a.status === 'pending' ? 0 : 1
      const pb = b.status === 'pending' ? 0 : 1
      if (pa !== pb) return pa - pb
      return String(b.timestamp).localeCompare(String(a.timestamp))
    })
    return copy
  }, [items])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Human review queue</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          Pending items need a decision. Approve or reject with full audit attribution.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="hitl-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="hitl-filter"
          value={status}
          onChange={(e) => {
            setPage(1)
            setStatus(e.target.value)
          }}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm"
        >
          <option value="">All items</option>
          <option value="pending">Pending only</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="space-y-4">
        {sorted.map((item) => {
          const risk = riskFromAgentStatus(item.agent_result_status)
          const pending = item.status === 'pending'
          return (
            <article
              key={item.id}
              className={`rounded-lg border bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${
                pending
                  ? 'border-orange-200 dark:border-orange-900/50 ring-1 ring-orange-500/10'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Request #{item.id}
                    </span>
                    <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700 dark:text-slate-200">
                      {item.agent_type}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${risk.className}`}>Risk: {risk.label}</span>
                    {pending ? (
                      <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
                        Action required
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 dark:text-slate-300">
                        {item.status}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Context</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{item.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                    {item.run_id ? (
                      <Link
                        to={`/cases/${encodeURIComponent(item.run_id)}`}
                        className="font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        Open case →
                      </Link>
                    ) : null}
                    <span className="tabular-nums">{String(item.timestamp).replace('T', ' ').slice(0, 19)} UTC</span>
                  </div>
                  {!pending && (item.reviewed_by || item.reviewed_at) ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-medium text-slate-500">Reviewer:</span> {item.reviewed_by || '—'}
                      {item.reviewed_at ? (
                        <span className="tabular-nums"> · {String(item.reviewed_at).replace('T', ' ').slice(0, 19)} UTC</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {pending ? (
                  <div className="flex shrink-0 gap-2 sm:flex-col sm:min-w-[140px]">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => action(item.id, 'approve')}
                      className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => action(item.id, 'reject')}
                      className="flex-1 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/30 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          No items in this view.
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4 text-sm text-slate-600 dark:text-slate-400">
        <span>
          Page <span className="font-semibold text-slate-900 dark:text-slate-200">{page}</span> /{' '}
          {Math.max(1, Math.ceil(total / pageSize))}
          <span className="text-slate-400"> · {total} total</span>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 font-medium disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 font-medium disabled:opacity-40"
            disabled={page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
