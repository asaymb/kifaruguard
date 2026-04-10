import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authedFetch } from '../api'

function formatUtc(ts) {
  if (!ts) return '—'
  const s = String(ts).replace('T', ' ').slice(0, 19)
  return `${s} UTC`
}

function StatusPill({ code }) {
  if (!code) return <span className="text-slate-400 text-sm">Unknown</span>
  const c = String(code).toUpperCase()
  const base = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold'
  if (c === 'OK' || c === 'APPROVED') {
    return <span className={`${base} bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200`}>{c}</span>
  }
  if (c === 'BLOCKED') {
    return <span className={`${base} bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200`}>{c}</span>
  }
  if (c === 'REVIEW') {
    return <span className={`${base} bg-amber-100 text-amber-950 dark:bg-amber-900/35 dark:text-amber-100`}>{c}</span>
  }
  return <span className={`${base} bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200`}>{c}</span>
}

export default function CaseView({ token }) {
  const { runId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!runId) {
      setError('Missing case reference.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    authedFetch(`/cases/${encodeURIComponent(runId)}`, token)
      .then(setData)
      .catch((e) => setError(e?.message || 'Unable to load this case.'))
      .finally(() => setLoading(false))
  }, [token, runId])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-slate-600 dark:text-slate-400 text-sm">Loading case…</div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link to="/audit" className="text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
          ← Back to audit logs
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          {error || 'Case not found.'}
        </div>
      </div>
    )
  }

  const { summary, extracted_data: extracted, audit_logs: steps, hitl } = data
  const entries = extracted && typeof extracted === 'object' ? Object.entries(extracted).filter(([, v]) => v != null && v !== '') : []

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/audit" className="text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline">
            ← Audit logs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Case detail</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Full view of one agent execution for compliance review.</p>
        </div>
      </div>

      {/* Summary */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-sm p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Summary</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">Run ID</dt>
            <dd className="font-mono text-sm text-slate-900 dark:text-slate-100 break-all">{data.run_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">Agent</dt>
            <dd className="text-sm font-medium capitalize text-slate-900 dark:text-white">{data.agent_type}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">Final outcome</dt>
            <dd>
              <StatusPill code={summary?.final_status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">Steps recorded</dt>
            <dd className="text-sm text-slate-800 dark:text-slate-200">{summary?.step_count ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">Started</dt>
            <dd className="text-sm text-slate-800 dark:text-slate-200 tabular-nums">{formatUtc(summary?.started_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">Completed</dt>
            <dd className="text-sm text-slate-800 dark:text-slate-200 tabular-nums">{formatUtc(summary?.completed_at)}</dd>
          </div>
        </dl>
      </section>

      {/* Extracted data */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-sm p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Extracted data</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No structured fields were captured for this run.</p>
        ) : (
          <dl className="divide-y divide-slate-100 dark:divide-slate-700">
            {entries.map(([k, v]) => (
              <div key={k} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-slate-600 dark:text-slate-300 capitalize">
                  {k.replace(/_/g, ' ')}
                </dt>
                <dd className="sm:col-span-2 text-sm text-slate-900 dark:text-slate-100 break-words">{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Timeline */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-sm p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Timeline</h2>
        <ol className="relative border-l border-slate-200 dark:border-slate-600 ml-2 space-y-6 pl-6">
          {(steps || []).map((row, i) => (
            <li key={row.id || i} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 flex h-2.5 w-2.5 rounded-full bg-emerald-600 ring-4 ring-white dark:ring-slate-800" />
              <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{row.step}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{formatUtc(row.timestamp)}</span>
                <span className="text-xs rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-slate-600 dark:text-slate-300">
                  {row.status}
                </span>
              </div>
              {row.input_preview ? (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-medium text-slate-500 dark:text-slate-500">In:</span> {row.input_preview}
                </p>
              ) : null}
              {row.output_preview ? (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-medium text-slate-500 dark:text-slate-500">Out:</span> {row.output_preview}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {/* HITL */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-sm p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Human review (HITL)</h2>
        {!hitl ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No human review queue entry for this case.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600 dark:text-slate-400">Queue status</span>
              {hitl.status === 'pending' ? (
                <span className="inline-flex rounded-full bg-amber-100 text-amber-950 dark:bg-amber-900/35 dark:text-amber-100 px-3 py-1 text-sm font-semibold">
                  Pending review
                </span>
              ) : hitl.status === 'approved' ? (
                <span className="inline-flex rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200 px-3 py-1 text-sm font-semibold">
                  Approved
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200 px-3 py-1 text-sm font-semibold">
                  Rejected
                </span>
              )}
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 dark:text-slate-400">Reason queued:</span> {hitl.reason}
            </p>
            {hitl.agent_result_status ? (
              <p className="text-slate-600 dark:text-slate-400 text-xs">
                Agent outcome when queued: <strong>{hitl.agent_result_status}</strong>
              </p>
            ) : null}
            {hitl.status !== 'pending' ? (
              <dl className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <div>
                  <dt className="text-xs text-slate-500">Reviewer</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">{hitl.reviewed_by || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Review time</dt>
                  <dd className="tabular-nums text-slate-800 dark:text-slate-200">{formatUtc(hitl.reviewed_at || hitl.created_at)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-amber-800 dark:text-amber-200/90 text-sm">Awaiting reviewer decision.</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
