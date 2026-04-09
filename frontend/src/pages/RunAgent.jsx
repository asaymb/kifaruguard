import { useState } from 'react'
export default function RunAgent({ token }) {
  const [agentType, setAgentType] = useState('mine'); const [file, setFile] = useState(null); const [result, setResult] = useState(null)
  async function run() { if (!file) return; const fd = new FormData(); fd.append('agent_type', agentType); fd.append('file', file); const res = await fetch('http://localhost:8000/agents/run', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }); setResult(await res.json()) }
  return <div className="space-y-4"><h2 className="text-xl font-bold">Run Agent</h2><select value={agentType} onChange={(e)=>setAgentType(e.target.value)} className="border p-2 rounded"><option value="mine">Mine</option><option value="bank">Bank</option></select><input type="file" accept="application/pdf" onChange={(e)=>setFile(e.target.files?.[0] || null)} /><button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={run}>Run</button>{result && <pre className="bg-white p-4 border rounded overflow-auto">{JSON.stringify(result,null,2)}</pre>}</div>
}
