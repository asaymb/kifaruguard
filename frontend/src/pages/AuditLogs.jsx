import { useEffect, useState } from 'react'
import { authedFetch } from '../api'

export default function AuditLogs({ token }) {
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [agentType, setAgentType] = useState('')

  async function refresh() {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (agentType) query.set('agent_type', agentType)
    const data = await authedFetch(`/audit?${query.toString()}`, token)
    setItems(data.items || [])
    setTotal(data.total || 0)
  }

  useEffect(() => { refresh().catch(() => { setItems([]); setTotal(0) }) }, [token, page, pageSize, agentType])

  return (
    <div>
      <div className="flex gap-2 items-center mb-4">
        <h2 className="text-xl font-bold">Audit Logs</h2>
        <select value={agentType} onChange={(e) => { setPage(1); setAgentType(e.target.value) }} className="border rounded p-1 dark:bg-slate-800">
          <option value="">All agents</option>
          <option value="mine">Mine</option>
          <option value="bank">Bank</option>
        </select>
      </div>
      <div className="overflow-auto bg-white dark:bg-slate-800 border dark:border-slate-700 rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 dark:bg-slate-700">
            <tr>
              <th className="p-2 text-left">Agent</th>
              <th className="p-2 text-left">Step</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => (
              <tr key={log.id} className="border-t dark:border-slate-700">
                <td className="p-2">{log.agent_type}</td>
                <td className="p-2">{log.step}</td>
                <td className="p-2">{log.status}</td>
                <td className="p-2">{String(log.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2 items-center">
        <button className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <button className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-40" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        <span className="text-sm">Page {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
      </div>
    </div>
  )
}
