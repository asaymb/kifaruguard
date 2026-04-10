import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authedFetch, exportAuditReportPdf } from '../api'
import { aggregateAuditRuns, shortRunId } from '../lib/auditUtils'

function OutcomeBadge({ code }) {
  if (!code) {
    return <span className="text-slate-400 dark:text-slate-500 text-xs font-medium">—</span>
  }
  const base =
    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide'
  if (code === 'OK' || code === 'APPROVED') {
    return <span className={`${base} bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300`}>{code === 'APPROVED' ? 'OK' : code}</span>
  }
  if (code === 'BLOCKED') {
    return <span className={`${base} bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300`}>BLOCKED</span>
  }
  if (code === 'REVIEW') {
    return <span className={`${base} bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200`}>REVIEW</span>
  }
  return <span className={`${base} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200`}>{code}</span>
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  )
}

const PAGE_SIZE = 15

export default function AuditLogs({ token }) {
  const navigate = useNavigate()
  const [rawItems, setRawItems] = useState([])
  const [totalLines, setTotalLines] = useState(0)
  const [agentType, setAgentType] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [runSearch, setRunSearch] = useState('')
  const [exporting, setExporting] = useState(null)
  const [exportError, setExportError] = useState('')
  const [exportSuccess, setExportSuccess] = useState(false)
  const successTimer = useRef(null)

  async function refresh() {
    const query = new URLSearchParams({ page: '1', page_size: '200' })
    if (agentType) query.set('agent_type', agentType)
    const data = await authedFetch(`/audit?${query.toString()}`, token)
    setRawItems(data.items || [])
    setTotalLines(data.total || 0)
  }

  async function onExport(runId, e) {
    e?.stopPropagation()
    setExportError('')
    setExportSuccess(false)
    if (successTimer.current) clearTimeout(successTimer.current)
    setExporting(runId)
    try {
      await exportAuditReportPdf(token, runId)
      setExportSuccess(true)
      successTimer.current = setTimeout(() => setExportSuccess(false), 5000)
    } catch (err) {
      setExportError(err?.message || 'Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  const aggregated = useMemo(() => aggregateAuditRuns(rawItems), [rawItems])

  const filtered = useMemo(() => {
    let rows = aggregated
    const q = runSearch.trim().toLowerCase()
    if (q) rows = rows.filter((r) => r.run_id.toLowerCase().includes(q))
    if (statusFilter) {
      rows = rows.filter((r) => {
        const s = (r.status || '').toUpperCase()
        if (statusFilter === 'OK') return s === 'OK' || s === 'APPROVED'
        return s === statusFilter
      })
    }
    return rows
  }, [aggregated, runSearch, statusFilter])

  const [uiPage, setUiPage] = useState(1)
  useEffect(() => {
    setUiPage(1)
  }, [statusFilter, runSearch, agentType])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(() => {
    const start = (uiPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, uiPage])

  useEffect(() => {
    refresh().catch(() => {
      setRawItems([])
      setTotalLines(0)
    })
  }, [token, agentType])

  useEffect(() => () => successTimer.current && clearTimeout(successTimer.current), [])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Audit logs</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          Immutable execution history. Each row is one agent run. Open a case for the full timeline and compliance export.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by run ID…"
            value={runSearch}
            onChange={(e) => setRunSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-3 text-sm text-slate-900 dark:text-slate-100 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All outcomes</option>
            <option value="OK">OK</option>
            <option value="BLOCKED">Blocked</option>
            <option value="REVIEW">Review</option>
          </select>
          <select
            value={agentType}
            onChange={(e) => setAgentType(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All agents</option>
            <option value="mine">Mine</option>
            <option value="bank">Bank</option>
          </select>
        </div>
      </div>

      {exportSuccess ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200"
          role="status"
        >
          <span className="font-medium">Report downloaded.</span> PDF saved to your device.
        </div>
      ) : null}

      {exportError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-200" role="alert">
          {exportError}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Run ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Last activity (UTC)
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Agent
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 w-[1%] whitespace-nowrap">
                  Export
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paged.map((row) => (
                <tr
                  key={row.run_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/cases/${encodeURIComponent(row.run_id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/cases/${encodeURIComponent(row.run_id)}`)
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  <td className="px-4 py-3">
                    <code className="text-xs font-mono text-slate-800 dark:text-slate-200" title={row.run_id}>
                      {shortRunId(row.run_id)}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <OutcomeBadge code={row.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums text-xs">
                    {String(row.latest_ts).replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white capitalize">{row.agent_type}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/cases/${encodeURIComponent(row.run_id)}`}
                        className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Case
                      </Link>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                        disabled={exporting === row.run_id}
                        onClick={(e) => onExport(row.run_id, e)}
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                        {exporting === row.run_id ? '…' : 'PDF'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paged.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No runs match your filters.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>
          Showing <span className="font-medium text-slate-900 dark:text-slate-200">{filtered.length}</span> run
          {filtered.length !== 1 ? 's' : ''} from this fetch
          <span className="text-slate-400 dark:text-slate-500"> · {totalLines} log lines in index</span>
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-40"
            disabled={uiPage <= 1}
            onClick={() => setUiPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium disabled:opacity-40"
            disabled={uiPage >= pageCount}
            onClick={() => setUiPage((p) => p + 1)}
          >
            Next
          </button>
          <span className="flex items-center px-2 text-xs tabular-nums">
            Page {uiPage} / {pageCount}
          </span>
        </div>
      </div>
    </div>
  )
}
