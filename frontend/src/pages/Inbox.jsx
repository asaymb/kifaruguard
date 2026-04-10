import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchInbox, runAgentFromInbox, uploadInboxFile } from '../api'

function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso) {
  if (!iso) return '—'
  return String(iso).replace('T', ' ').slice(0, 19)
}

export default function Inbox({ token }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [agentType, setAgentType] = useState('mine')
  const [notice, setNotice] = useState({ type: '', text: '' })
  const [processing, setProcessing] = useState(null)
  const inputRef = useRef(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setNotice({ type: '', text: '' })
    try {
      const data = await fetchInbox(token)
      setItems(data.items || [])
    } catch (e) {
      setItems([])
      setNotice({ type: 'error', text: e?.message || 'Could not load inbox.' })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleFiles(fileList) {
    const file = fileList?.[0]
    if (!file) return
    if (!file.name?.toLowerCase().endsWith('.pdf')) {
      setNotice({ type: 'error', text: 'Please drop a PDF file.' })
      return
    }
    setUploading(true)
    setNotice({ type: '', text: '' })
    try {
      await uploadInboxFile(token, file)
      setNotice({ type: 'ok', text: `Uploaded “${file.name}”.` })
      await refresh()
    } catch (e) {
      setNotice({ type: 'error', text: e?.message || 'Upload failed.' })
    } finally {
      setUploading(false)
    }
  }

  async function process(filename) {
    setProcessing(filename)
    setNotice({ type: '', text: '' })
    try {
      const result = await runAgentFromInbox(token, agentType, filename)
      const rid = result.run_id
      setNotice({
        type: 'ok',
        text: rid ? (
          <span>
            Run complete.{' '}
            <Link className="font-semibold underline" to={`/cases/${encodeURIComponent(rid)}`}>
              Open case
            </Link>
          </span>
        ) : (
          'Run complete.'
        ),
      })
    } catch (e) {
      setNotice({
        type: 'error',
        text:
          e?.message?.includes('file_path is disabled') || e?.message?.includes('403')
            ? 'Server must allow inbox paths (AGENT_ALLOW_FILE_PATH). Check deployment settings.'
            : e?.message || 'Processing failed.',
      })
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Document inbox</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Drop PDFs here, then run the mine or bank agent without re-uploading each time.
        </p>
      </div>

      {notice.text ? (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            notice.type === 'ok'
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragOver(false)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed px-6 py-14 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30'
            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800/40 hover:border-slate-400 dark:hover:border-slate-500'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {uploading ? 'Uploading…' : 'Drag & drop a PDF here, or click to browse'}
        </p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">PDF only · stored securely on the server</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-4 py-3">
        <span className="text-sm text-slate-600 dark:text-slate-400">Process with</span>
        <select
          value={agentType}
          onChange={(e) => setAgentType(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="mine">Mine agent</option>
          <option value="bank">Bank agent</option>
        </select>
        <button
          type="button"
          onClick={() => refresh()}
          className="ml-auto text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          Refresh list
        </button>
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Inbox</h2>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No documents yet. Upload a PDF above.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {items.map((row) => (
              <li
                key={row.filename}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate" title={row.filename}>
                    {row.filename}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {formatBytes(row.size_bytes)} · {formatTime(row.uploaded_at)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!!processing}
                  onClick={() => process(row.filename)}
                  className="shrink-0 rounded-lg bg-slate-900 text-white dark:bg-emerald-700 px-4 py-2 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-emerald-600 disabled:opacity-50"
                >
                  {processing === row.filename ? 'Processing…' : 'Process with agent'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
