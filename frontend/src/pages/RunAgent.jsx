import { useState } from 'react'
import { API_BASE_URL } from '../api'

export default function RunAgent({ token }) {
  const [agentType, setAgentType] = useState('mine')
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)

  async function run() {
    if (!file) return
    const fd = new FormData()
    fd.append('agent_type', agentType)
    fd.append('file', file)
    // Use same API base as authedFetch (avoids hardcoded localhost in Docker / Nginx).
    const res = await fetch(`${API_BASE_URL}/agents/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    setResult(await res.json())
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Run Agent</h2>
      <select value={agentType} onChange={(e) => setAgentType(e.target.value)} className="border p-2 rounded">
        <option value="mine">Mine</option>
        <option value="bank">Bank</option>
      </select>
      <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded" onClick={run}>
        Run
      </button>
      {result && <pre className="bg-white dark:bg-slate-800 p-4 border dark:border-slate-700 rounded overflow-auto">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}
