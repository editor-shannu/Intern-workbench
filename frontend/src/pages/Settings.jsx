import { useEffect, useState } from 'react'
import api from '../api'

export default function Settings() {
  const [hasKey, setHasKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    api.get('/users/me/openrouter-key/status').then((r) => setHasKey(r.data.has_key))
  }, [])

  async function save(e) {
    e.preventDefault()
    try {
      await api.post('/users/me/openrouter-key', { api_key: apiKey })
      setApiKey('')
      setHasKey(true)
      setIsError(false)
      setStatus('Saved.')
      setTimeout(() => setStatus(''), 2000)
    } catch (err) {
      setIsError(true)
      setStatus(err.response?.data?.detail || 'Save failed')
      setTimeout(() => setStatus(''), 3000)
    }
  }

  return (
    <div className="max-w-lg mx-auto w-full p-8 space-y-6">
      <h1 className="text-lg font-medium">Settings</h1>
      <div className="border border-bench-800 bg-bench-900 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-medium">OpenRouter API key</h2>
          <p className="text-xs text-dust mt-1 leading-relaxed">
            Used only for your own AI chat requests in this app, billed to your own OpenRouter
            account. Stored encrypted at rest; never shown again after saving.
          </p>
        </div>
        <div className="text-xs">
          Status:{' '}
          {hasKey ? <span className="text-moss">key on file</span> : <span className="text-brass">no key saved</span>}
        </div>
        <form onSubmit={save} className="flex gap-2">
          <input
            type="password"
            required
            minLength={10}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-..."
            className="flex-1 bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm font-mono"
          />
          <button className="bg-brass hover:bg-brass/90 text-bench-950 font-medium px-4 rounded text-sm">
            Save
          </button>
        </form>
        {status && <div className={`text-xs ${isError ? 'text-brass' : 'text-moss'}`}>{status}</div>}
      </div>
    </div>
  )
}
