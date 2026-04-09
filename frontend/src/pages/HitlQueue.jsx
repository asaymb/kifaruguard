import { useEffect, useState } from 'react'
import { authedFetch, connectHitlSocket } from '../api'

export default function HitlQueue({ token }) {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)

  async function refresh() {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (status) query.set('status', status)
    const data = await authedFetch(`/hitl?${query.toString()}`, token)
    setItems(data.items || [])
    setTotal(data.total || 0)
  }

  async function action(id, actionName) {
    await authedFetch(`/hitl/${id}/${actionName}`, token, { method: 'POST' })
    await refresh()
  }

  useEffect(() => {
    refresh().catch(() => { setItems([]); setTotal(0) })
  }, [token, page, pageSize, status])

  useEffect(() => {
    const ws = connectHitlSocket(() => {
      refresh().catch(() => {})
    })
    return () => ws.close()
  }, [token])

  return (
    <div>
      <div className="flex gap-2 items-center mb-4">
        <h2 className="text-xl font-bold">HITL Queue</h2>
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }} className="border rounded p-1 dark:bg-slate-800">
          <option value="">All statuses</option>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">#{item.id} - {item.agent_type}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{item.reason}</div>
              <div className="text-xs text-gray-500">Status: {item.status}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={() => action(item.id, 'approve')}>Approve</button>
              <button className="px-3 py-1 bg-red-600 text-white rounded" onClick={() => action(item.id, 'reject')}>Reject</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2 items-center">
        <button className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <button className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-40" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        <span className="text-sm">Page {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
      </div>
    </div>
  )
}
