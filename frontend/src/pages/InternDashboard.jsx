import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import StatusTag, { TRACK_LABELS } from '../components/StatusTag'

export default function InternDashboard() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const fetchTasks = () => api.get('/tasks').then((r) => setTasks(r.data)).catch(() => {})
    
    api.get('/tasks').then((r) => setTasks(r.data)).finally(() => setLoading(false))
    const interval = setInterval(fetchTasks, 15000)
    return () => clearInterval(interval)
  }, [])

  async function openTask(taskId) {
    setOpeningId(taskId)
    try {
      const { data } = await api.post(`/workspaces/open/${taskId}`)
      navigate(`/workspace/${data.id}`)
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not open workspace')
    } finally {
      setOpeningId(null)
    }
  }

  if (loading) return <div className="p-8 text-dust text-sm">Loading your tasks…</div>

  return (
    <div className="max-w-3xl mx-auto w-full p-8">
      <h1 className="text-lg font-medium mb-5">Your tasks</h1>
      {tasks.length === 0 && (
        <p className="text-sm text-dust">Nothing assigned yet — check with your admin.</p>
      )}
      <div className="border border-bench-800">
        {tasks.map((t, i) => (
          <div
            key={t.id}
            className={`flex items-center justify-between px-4 py-4 ${i > 0 ? 'border-t border-bench-800' : ''}`}
          >
            <div className="min-w-0">
              <div className="text-xs text-dust">
                {TRACK_LABELS[t.track] || t.track}
                {t.source_ref ? ` — ${t.source_ref}` : ''}
              </div>
              <h2 className="font-medium mt-0.5 truncate">{t.title}</h2>
              {t.description && <p className="text-sm text-dust mt-1 line-clamp-2">{t.description}</p>}
            </div>
            <div className="flex items-center gap-4 shrink-0 ml-4">
              <StatusTag status={t.status} />
              <button
                onClick={() => openTask(t.id)}
                disabled={openingId === t.id}
                className="text-sm bg-brass hover:bg-brass/90 disabled:opacity-50 text-bench-950 font-medium px-3 py-1.5 rounded"
              >
                {openingId === t.id ? 'Opening…' : 'Open workspace'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
