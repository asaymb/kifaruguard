import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { authedFetch, exportAuditReportPdf } from '../api'

/** Compliance outcome from stored orchestrator payload (END / DECISION / EXTRACT_DATA). */
function extractComplianceStatus(log) {
  const stripSig = (t) => (t && typeof t === 'string' ? t.split(' | sig=')[0].trim() : '')
  let raw = ''
  if (log.step === 'END') raw = stripSig(log.input_text)
  else if (log.step === 'DECISION') raw = stripSig(log.output_text)
  else if (log.step === 'EXTRACT_DATA') raw = stripSig(log.output_text)
  const m =
    raw.match(/['"]status['"]\s*:\s*['"]([A-Za-z_]+)['"]/) || raw.match(/"status"\s*:\s*"([^"]+)"/)
  if (m) return m[1].toUpperCase()
  return null
}

function shortRunId(runId) {
  if (!runId || runId.length < 10) return runId || '—'
  return `${runId.slice(0, 8)}…`
}

function OutcomeBadge({ code }) {
  if (!code) {
    return <span className="text-slate-400 dark:text-slate-500 text-xs font-medium">—</span>
  }
  const base =
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide'
  if (code === 'OK' || code === 'APPROVED') {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300`}>
        {code}
      </span>
    )
  }
  if (code === 'BLOCKED') {
    return (
      <span className={`${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`}>{code}</span>
    )
  }
  if (code === 'REVIEW') {
    return (
      <span className={`${base} bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200`}>
        {code}
      </span>
    )
  }
  return (
    <span className={`${base} bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200`}>{code}</span>
  )
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

export default function AuditLogs({ token }) {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [agentType, setAgentType] = useState('')
  const [exporting, setExporting] = useState(null)
  const [exportError, setExportError] = useState('')
  const [exportSuccess, setExportSuccess] = useState(false)
  const successTimer = useRef(null)

  async function refresh() {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (agentType) query.set('agent_type', agentType)
    const data = await authedFetch(`/audit?${query.toString()}`, token)
    setItems(data.items || [])
    setTotal(data.total || 0)
  }

  async function onExport(runId) {
    setExportError('')
    setExportSuccess(false)
    if (successTimer.current) clearTimeout(successTimer.current)
    setExporting(runId)
    try {
      await exportAuditReportPdf(token, runId)
      setExportSuccess(true)
      successTimer.current = setTimeout(() => setExportSuccess(false), 5000)
    } catch (e) {
      setExportError(e?.message || 'Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  useEffect(() => {
    refresh().catch(() => {
      setItems([])
      setTotal(0)
    })
  }, [token, page, pageSize, agentType])

  useEffect(() => () => successTimer.current && clearTimeout(successTimer.current), [])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Audit logs</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
            Review execution history and download tamper-evident compliance reports (PDF) for each run.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 sr-only sm:not-sr-only sm:inline">
            Filter
          </label>
          <select
            value={agentType}
            onChange={(e) => {
              setPage(1)
              setAgentType(e.target.value)
            }}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 outline-none"
          >
            <option value="">All agents</option>
            <option value="mine">Mine</option>
            <option value="bank">Bank</option>
          </select>
        </div>
      </div>

      {exportSuccess ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-2"
          role="status"
        >
          <span className="font-medium">Report downloaded</span>
          <span className="text-emerald-700/80 dark:text-emerald-300/80">Your PDF has been saved.</span>
        </div>
      ) : null}

      {exportError ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-200"
          role="alert"
        >
          {exportError}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Time (UTC)
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Run ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Agent
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Step
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 w-[1%] whitespace-nowrap">
                  Case
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 w-[1%] whitespace-nowrap">
                  Export
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {items.map((log) => {
                const outcome = extractComplianceStatus(log)
                const rid = log.run_id
                return (
                  <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors">
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums text-xs">
                      {String(log.timestamp).replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="px-4 py-3">
                      {rid ? (
                        <code
                          className="text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-900/60 px-2 py-1 rounded-md"
                          title={rid}
                        >
                          {shortRunId(rid)}
                        </code>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 capitalize">{log.agent_type}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{log.step}</td>
                    <td className="px-4 py-3">
                      <OutcomeBadge code={outcome} />
                    </td>
                    <td className="px-4 py-3 text-center align-middle">
                      {rid ? (
                        <Link
                          to={`/cases/${encodeURIComponent(rid)}`}
                          className="inline-flex text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          Open
                        </Link>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      {rid ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 hover:bg-slate-800 px-3 py-2 text-xs font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[8.5rem]"
                          disabled={exporting === rid}
                          onClick={() => onExport(rid)}
                        >
                          <DownloadIcon className="h-4 w-4 shrink-0 opacity-90" />
                          {exporting === rid ? 'Generating…' : 'Export Report'}
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-600 px-3 py-2 text-xs text-slate-400 dark:text-slate-500 cursor-not-allowed"
                          title="Not available for legacy records"
                        >
                          Export Report
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No audit entries on this page.</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Page <span className="font-medium text-slate-900 dark:text-slate-200">{page}</span> of{' '}
          <span className="font-medium text-slate-900 dark:text-slate-200">{Math.max(1, Math.ceil(total / pageSize))}</span>
          <span className="text-slate-400 dark:text-slate-500"> · {total} entries</span>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none"
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
