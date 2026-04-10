import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../api'

const emptyRule = () => ({
  enabled: true,
  condition: '',
  action: 'BLOCK',
  message: '',
})

export default function Policies({ token }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyRule)
  const [notice, setNotice] = useState({ type: '', text: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setNotice({ type: '', text: '' })
    try {
      const data = await authedFetch('/config/guardrails', token)
      setRules(Array.isArray(data.rules) ? data.rules : [])
    } catch {
      setRules([])
      setNotice({ type: 'error', text: 'Could not load policies.' })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  function updateForm(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function addRule(e) {
    e.preventDefault()
    const condition = (form.condition || '').trim().toUpperCase()
    if (!condition) {
      setNotice({ type: 'error', text: 'Condition is required (e.g. BLOCKED, OK, REVIEW, APPROVED).' })
      return
    }
    const next = [
      ...rules,
      {
        enabled: form.enabled,
        condition,
        action: form.action,
        message: (form.message || '').trim(),
      },
    ]
    await persist(next, 'Policy added.')
    setForm(emptyRule())
  }

  async function persist(nextRules, successMsg) {
    setSaving(true)
    setNotice({ type: '', text: '' })
    try {
      await authedFetch('/config/guardrails', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: nextRules }),
      })
      setRules(nextRules)
      setNotice({ type: 'ok', text: successMsg || 'Policies saved.' })
    } catch (err) {
      setNotice({ type: 'error', text: err?.message || 'Save failed.' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleRule(index) {
    const next = rules.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r))
    await persist(next, 'Updated.')
  }

  async function removeRule(index) {
    const next = rules.filter((_, i) => i !== index)
    await persist(next, 'Rule removed.')
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Policies</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          When an agent returns a <strong>status</strong> that matches a rule’s condition, Kifaru applies the action.
          Matching is exact (e.g. <code className="text-xs bg-slate-200 dark:bg-slate-700 px-1 rounded">BLOCKED</code>) — no formulas.
        </p>
      </div>

      {notice.text ? (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            notice.type === 'ok'
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Add a rule</h2>
        <form onSubmit={addRule} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Condition (agent status)
              </label>
              <input
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-900"
                placeholder="e.g. BLOCKED, OK, REVIEW"
                value={form.condition}
                onChange={(e) => updateForm('condition', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Action
              </label>
              <select
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-900"
                value={form.action}
                onChange={(e) => updateForm('action', e.target.value)}
              >
                <option value="BLOCK">Block — force BLOCKED outcome</option>
                <option value="REVIEW">Review — send to human review (REVIEW)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Message (shown internally / in audit context)
            </label>
            <input
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-900"
              placeholder="Short explanation for compliance staff"
              value={form.message}
              onChange={(e) => updateForm('message', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="new-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => updateForm('enabled', e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="new-enabled" className="text-sm text-slate-700 dark:text-slate-300">
              Enabled
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            Add rule
          </button>
        </form>
      </section>

      <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900 dark:text-white">Active rules</h2>
          <button
            type="button"
            onClick={() => load()}
            className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No rules yet. Add one above or use the Dashboard quick editor.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {rules.map((r, i) => (
              <li
                key={`${r.condition}-${r.action}-${i}`}
                className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4 ${!r.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{r.condition}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        r.action === 'BLOCK'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                      }`}
                    >
                      {r.action}
                    </span>
                    {!r.enabled ? (
                      <span className="text-xs text-slate-500 uppercase">Off</span>
                    ) : (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">On</span>
                    )}
                  </div>
                  {r.message ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{r.message}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleRule(i)}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {r.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRule(i)}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-700 border border-red-200 hover:bg-red-50 dark:text-red-300 dark:border-red-900 dark:hover:bg-red-950/50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
