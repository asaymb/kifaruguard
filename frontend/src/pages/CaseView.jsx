import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authedFetch, exportAuditReportPdf, replayAuditRun, verifyAuditIntegrity } from '../api'

function formatUtc(ts) {
  if (!ts) return '—'
  const s = String(ts).replace('T', ' ').slice(0, 19)
  return `${s} UTC`
}

function StatusPill({ code }) {
  if (!code) return <span className="text-slate-400 text-sm">Unknown</span>
  const c = String(code).toUpperCase()
  const base = 'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide'
  if (c === 'OK' || c === 'APPROVED') {
    return <span className={`${base} bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300`}>OK</span>
  }
  if (c === 'BLOCKED') {
    return <span className={`${base} bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300`}>BLOCKED</span>
  }
  if (c === 'REVIEW') {
    return <span className={`${base} bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200`}>REVIEW</span>
  }
  return <span className={`${base} bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200`}>{c}</span>
}

function LockBadge() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200/80 bg-blue-50/80 dark:border-blue-900/50 dark:bg-blue-950/30 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white dark:bg-blue-500">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Audit integrity</p>
        <p className="mt-1 text-xs text-blue-800/90 dark:text-blue-300/90 leading-relaxed">
          Each audit line is signed with an HMAC at write time. Exports embed the same run record for tamper-evident compliance review.
        </p>
      </div>
    </div>
  )
}

export default function CaseView({ token }) {
  const { runId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportErr, setExportErr] = useState('')
  const [integrity, setIntegrity] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [replay, setReplay] = useState(null)
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayErr, setReplayErr] = useState('')

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

  const guardrailSteps = useMemo(() => {
    const steps = data?.audit_logs || []
    return steps.filter((s) => s.step === 'CHECK_RULES' || s.step === 'DECISION' || s.step === 'GUARD')
  }, [data])

  async function onExportPdf() {
    if (!runId) return
    setExportErr('')
    setExporting(true)
    try {
      await exportAuditReportPdf(token, runId)
    } catch (e) {
      setExportErr(e?.message || 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  async function onVerifyIntegrity() {
    if (!runId) return
    setVerifying(true)
    setReplayErr('')
    try {
      const res = await verifyAuditIntegrity(token, runId)
      setIntegrity(res)
    } catch (e) {
      setReplayErr(e?.message || 'Integrity verification failed.')
    } finally {
      setVerifying(false)
    }
  }

  async function onReplayAudit() {
    if (!runId) return
    setReplayLoading(true)
    setReplayErr('')
    try {
      const res = await replayAuditRun(token, runId)
      setReplay(res)
      setIntegrity({ run_id: res.run_id, integrity_valid: res.integrity_valid, broken_at_step: res.broken_at_step })
    } catch (e) {
      setReplayErr(e?.message || 'Replay failed.')
    } finally {
      setReplayLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-sm text-slate-500 dark:text-slate-400">Loading case…</div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link to="/audit" className="text-sm font-semibold text-blue-700 dark:text-blue-400 hover:underline">
          ← Audit logs
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          {error || 'Case not found.'}
        </div>
      </div>
    )
  }

  const { summary, extracted_data: extracted, audit_logs: steps, hitl } = data
  const entries = extracted && typeof extracted === 'object' ? Object.entries(extracted).filter(([, v]) => v != null && v !== '') : []

  const isSafe =
    String(summary?.final_status || '').toUpperCase() === 'OK' ||
    String(summary?.final_status || '').toUpperCase() === 'APPROVED'
  const needsReview = String(summary?.final_status || '').toUpperCase() === 'REVIEW'
  const blocked = String(summary?.final_status || '').toUpperCase() === 'BLOCKED'
  const hasIntegrity = integrity && typeof integrity.integrity_valid === 'boolean'
  const integrityOk = Boolean(integrity?.integrity_valid)
  const brokenAt = integrity?.broken_at_step
  const replaySteps = replay?.steps || []
  const reconstructed = replay?.reconstructed_decision || null

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/audit" className="text-sm font-semibold text-blue-700 dark:text-blue-400 hover:underline">
            ← Audit logs
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Case review</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            What happened, policy outcome, and human decision — in one place.
          </p>
        </div>
        <button
          type="button"
          disabled={exporting}
          onClick={onExportPdf}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 shrink-0"
        >
          {exporting ? 'Generating PDF…' : 'Export compliance PDF'}
        </button>
      </div>

      {exportErr || replayErr ? (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-2 text-sm text-red-800 dark:text-red-200">
          {exportErr || replayErr}
        </div>
      ) : null}

      {/* Summary — decision first */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/80 dark:bg-slate-800/40">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Summary</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Is it safe?</span>
            {isSafe ? (
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                Cleared — OK
              </span>
            ) : blocked ? (
              <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-300">
                Blocked by policy
              </span>
            ) : needsReview ? (
              <span className="rounded-md bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
                Requires review
              </span>
            ) : (
              <StatusPill code={summary?.final_status} />
            )}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Run ID</dt>
              <dd className="font-mono text-xs text-slate-900 dark:text-slate-100 break-all">{data.run_id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Agent</dt>
              <dd className="text-sm font-semibold capitalize text-slate-900 dark:text-white">{data.agent_type}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Outcome</dt>
              <dd>
                <StatusPill code={summary?.final_status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Audit steps</dt>
              <dd className="text-sm text-slate-800 dark:text-slate-200">{summary?.step_count ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Started</dt>
              <dd className="text-sm tabular-nums text-slate-800 dark:text-slate-200">{formatUtc(summary?.started_at)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Completed</dt>
              <dd className="text-sm tabular-nums text-slate-800 dark:text-slate-200">{formatUtc(summary?.completed_at)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <LockBadge />

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Integrity status</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">This decision is traceable and verified from signed audit steps.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onVerifyIntegrity}
              disabled={verifying}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {verifying ? 'Verifying…' : 'Verify Integrity'}
            </button>
            <button
              type="button"
              onClick={onReplayAudit}
              disabled={replayLoading}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {replayLoading ? 'Replaying…' : 'Replay Audit'}
            </button>
          </div>
        </div>
        <div className="p-6">
          {!hasIntegrity ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Run verification to confirm tamper evidence.</p>
          ) : integrityOk ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">✅ Verified</p>
              <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">No tampering detected in signature and chain verification.</p>
            </div>
          ) : (
            <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">❌ Tampered</p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">Broken at step {typeof brokenAt === 'number' ? brokenAt + 1 : 'unknown'}.</p>
            </div>
          )}
        </div>
      </section>

      {reconstructed ? (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reconstructed decision</h2>
          </div>
          <div className="p-6 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Final decision</p>
              <StatusPill code={reconstructed.status} />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Reason</p>
              <p className="text-sm text-slate-800 dark:text-slate-200">{reconstructed.reason}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Human review</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {reconstructed.requires_human_review ? 'Required' : 'Not required'}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Guardrail decisions */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Guardrail decisions</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Policy checks applied during this run.</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {guardrailSteps.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400">No separate guardrail steps recorded for this run.</p>
          ) : (
            guardrailSteps.map((row, i) => (
              <div key={row.id || i} className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{row.step}</span>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatUtc(row.timestamp)}</span>
                  <span className="text-xs rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-600 dark:text-slate-300">
                    {row.status}
                  </span>
                </div>
                {row.output_preview ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{row.output_preview}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Extracted data */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Extracted fields</h2>
        </div>
        <div className="p-6">
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No structured fields captured.</p>
          ) : (
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
                  <dt className="text-sm font-medium text-slate-600 dark:text-slate-300 capitalize">{k.replace(/_/g, ' ')}</dt>
                  <dd className="sm:col-span-2 text-sm text-slate-900 dark:text-slate-100 break-words">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* Timeline */}
      {replaySteps.length > 0 ? (
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Replay timeline</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Step-by-step verification of the audit chain.</p>
        </div>
        <div className="p-6">
          <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-700 space-y-5 pl-6">
            {replaySteps.map((row, i) => {
              const isBroken = !row.integrity_verified && i === brokenAt
              return (
                <li key={row.id || i} className="relative">
                  <span
                    className={`absolute -left-[1.35rem] top-1.5 flex h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-900 ${
                      isBroken ? 'bg-red-500' : row.integrity_verified ? 'bg-emerald-500' : 'bg-orange-400'
                    }`}
                  />
                  <div className={`rounded-md border px-4 py-3 ${isBroken ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{row.step}</span>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatUtc(row.timestamp)}</span>
                      <span className={`text-[11px] rounded-md px-2 py-0.5 font-semibold ${row.integrity_verified ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300'}`}>
                        {row.integrity_verified ? 'OK' : 'FAIL'}
                      </span>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">View details</summary>
                      <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <p><span className="font-medium text-slate-700 dark:text-slate-200">Status:</span> {row.status}</p>
                        <p><span className="font-medium text-slate-700 dark:text-slate-200">Signature check:</span> {row.signature_valid ? 'Pass' : 'Fail'}</p>
                        <p><span className="font-medium text-slate-700 dark:text-slate-200">Chain check:</span> {row.chain_valid ? 'Pass' : 'Fail'}</p>
                        <p className="break-words"><span className="font-medium text-slate-700 dark:text-slate-200">Input:</span> {row.input_text || '—'}</p>
                        <p className="break-words"><span className="font-medium text-slate-700 dark:text-slate-200">Output:</span> {row.output_text || '—'}</p>
                      </div>
                    </details>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Execution timeline</h2>
        </div>
        <div className="p-6">
          <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-6 pl-6">
            {(steps || []).map((row, i) => (
              <li key={row.id || i} className="relative">
                <span className="absolute -left-[1.35rem] top-1.5 flex h-2 w-2 rounded-full bg-slate-400 ring-4 ring-white dark:ring-slate-900 dark:bg-slate-500" />
                <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{row.step}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{formatUtc(row.timestamp)}</span>
                  <span className="text-xs rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-600 dark:text-slate-300">
                    {row.status}
                  </span>
                </div>
                {row.input_preview ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-500">Input:</span> {row.input_preview}
                  </p>
                ) : null}
                {row.output_preview ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-500">Output:</span> {row.output_preview}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* HITL */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Human review (HITL)</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Who approved or rejected escalation?</p>
        </div>
        <div className="p-6">
          {!hitl ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No human review queue entry for this case.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-600 dark:text-slate-400">Decision</span>
                {hitl.status === 'pending' ? (
                  <span className="inline-flex rounded-md bg-orange-50 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200 px-2.5 py-1 text-xs font-semibold">
                    Pending review
                  </span>
                ) : hitl.status === 'approved' ? (
                  <span className="inline-flex rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 px-2.5 py-1 text-xs font-semibold">
                    Approved
                  </span>
                ) : (
                  <span className="inline-flex rounded-md bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300 px-2.5 py-1 text-xs font-semibold">
                    Rejected
                  </span>
                )}
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400">Reason:</span> {hitl.reason}
              </p>
              {hitl.agent_result_status ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Agent outcome when queued: <strong className="text-slate-700 dark:text-slate-300">{hitl.agent_result_status}</strong>
                </p>
              ) : null}
              {hitl.status !== 'pending' ? (
                <dl className="grid gap-3 sm:grid-cols-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Reviewer</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{hitl.reviewed_by || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Review time</dt>
                    <dd className="mt-0.5 tabular-nums text-slate-800 dark:text-slate-200">{formatUtc(hitl.reviewed_at || hitl.created_at)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-orange-800 dark:text-orange-200/90">Awaiting reviewer decision in the HITL queue.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
