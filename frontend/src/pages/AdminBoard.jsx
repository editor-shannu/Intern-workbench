import { useEffect, useState } from 'react'
import api from '../api'
import StatusTag, { TRACK_LABELS } from '../components/StatusTag'
import { Plus, X, Upload } from 'lucide-react'

const TRACKS = ['ai-ml', 'data', 'full-stack', 'rpa']

export default function AdminBoard() {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [notes, setNotes] = useState([])
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', track: 'full-stack', source_ref: '' })
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'intern' })
  const [noteText, setNoteText] = useState('')
  const [formError, setFormError] = useState('')

  async function refresh() {
    try {
      const [t, u, n] = await Promise.all([api.get('/tasks'), api.get('/users'), api.get('/project-notes')])
      setTasks(t.data)
      setUsers(u.data)
      setNotes(n.data)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [])

  async function createTask(e) {
    e.preventDefault()
    setFormError('')
    try {
      await api.post('/tasks', newTask)
      setNewTask({ title: '', description: '', track: 'full-stack', source_ref: '' })
      setShowTaskForm(false)
      refresh()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not create task')
    }
  }

  async function createUser(e) {
    e.preventDefault()
    setFormError('')
    try {
      await api.post('/users', newUser)
      setNewUser({ name: '', email: '', password: '', role: 'intern' })
      setShowUserForm(false)
      refresh()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not create account')
    }
  }

  async function assign(taskId, userId) {
    try {
      await api.post(`/tasks/${taskId}/assign`, { user_id: userId ? Number(userId) : null })
      refresh()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not assign task')
    }
  }

  async function addNote(e) {
    e.preventDefault()
    if (!noteText.trim()) return
    try {
      await api.post('/project-notes', { content: noteText })
      setNoteText('')
      refresh()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not post note')
    }
  }

  async function deleteNote(id) {
    try {
      await api.delete(`/project-notes/${id}`)
      refresh()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not delete note')
    }
  }

  async function handleUploadPlan(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      setFormError('')
      const { data } = await api.post('/project-plans/import', { markdown: text })
      let msg = `Successfully imported/updated ${data.imported} tasks!`
      if (data.warnings && data.warnings.length > 0) {
        msg += `\n\nWarnings:\n- ${data.warnings.join('\n- ')}`
      }
      alert(msg)
      refresh()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not import plan')
    }
    // reset input
    e.target.value = ''
  }

  return (
    <div className="max-w-5xl mx-auto w-full p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Task board</h1>
        <div className="flex gap-2">
          <label className="text-sm border border-bench-800 hover:border-bench-700 px-3 py-1.5 rounded flex items-center gap-1 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Upload Plan (.md)
            <input type="file" accept=".md" className="hidden" onChange={handleUploadPlan} />
          </label>
          <button
            onClick={() => setShowUserForm((s) => !s)}
            className="text-sm border border-bench-800 hover:border-bench-700 px-3 py-1.5 rounded flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Intern account
          </button>
          <button
            onClick={() => setShowTaskForm((s) => !s)}
            className="text-sm bg-brass hover:bg-brass/90 text-bench-950 font-medium px-3 py-1.5 rounded flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Task
          </button>
        </div>
      </div>

      {formError && <div className="text-sm text-danger border border-danger-dim px-3 py-2">{formError}</div>}

      {showUserForm && (
        <form onSubmit={createUser} className="border border-bench-800 bg-bench-900 p-4 grid grid-cols-2 gap-3">
          <input
            placeholder="Name"
            required
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            className="bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Email"
            type="email"
            required
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            className="bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Temporary password"
            required
            minLength={8}
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            className="bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
          />
          <select
            value={newUser.role}
            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
            className="bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
          >
            <option value="intern">Intern</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className="col-span-2 bg-brass hover:bg-brass/90 text-bench-950 font-medium rounded py-2 text-sm">
            Create account
          </button>
        </form>
      )}

      {showTaskForm && (
        <form onSubmit={createTask} className="border border-bench-800 bg-bench-900 p-4 space-y-3">
          <input
            placeholder="Task title"
            required
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            className="w-full bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Description"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            className="w-full bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
            rows={2}
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={newTask.track}
              onChange={(e) => setNewTask({ ...newTask, track: e.target.value })}
              className="bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
            >
              {TRACKS.map((t) => (
                <option key={t} value={t}>
                  {TRACK_LABELS[t]}
                </option>
              ))}
            </select>
            <input
              placeholder="Plan reference (e.g. Day 5)"
              value={newTask.source_ref}
              onChange={(e) => setNewTask({ ...newTask, source_ref: e.target.value })}
              className="bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="bg-brass hover:bg-brass/90 text-bench-950 font-medium rounded py-2 px-4 text-sm">
            Create task
          </button>
        </form>
      )}

      <div className="border border-bench-800">
        <table className="w-full text-sm">
          <thead className="text-dust text-xs border-b border-bench-800">
            <tr>
              <th className="text-left px-4 py-2 font-normal">Task</th>
              <th className="text-left px-4 py-2 font-normal">Track</th>
              <th className="text-left px-4 py-2 font-normal">Assigned to</th>
              <th className="text-left px-4 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => (
              <tr key={t.id} className={i > 0 ? 'border-t border-bench-800' : ''}>
                <td className="px-4 py-3">
                  <div className="font-medium">{t.title}</div>
                  {t.source_ref && <div className="text-xs text-dust">{t.source_ref}</div>}
                </td>
                <td className="px-4 py-3 text-dust">{TRACK_LABELS[t.track] || t.track}</td>
                <td className="px-4 py-3">
                  <select
                    value={t.assigned_user_id || ''}
                    onChange={(e) => assign(t.id, e.target.value)}
                    className="bg-bench-950 border border-bench-800 rounded px-2 py-1 text-xs"
                  >
                    <option value="">— unassigned —</option>
                    {users
                      .filter((u) => u.role === 'intern')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <StatusTag status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border border-bench-800 bg-bench-900 p-4 space-y-3">
        <h2 className="text-sm font-medium">Project update notes</h2>
        <p className="text-xs text-dust -mt-2">
          Shown to every intern's AI assistant as running context (e.g. "Postgres schema finalized").
        </p>
        <form onSubmit={addNote} className="flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 bg-bench-950 border border-bench-800 rounded px-3 py-2 text-sm"
          />
          <button className="bg-bench-800 hover:bg-bench-700 px-3 py-2 rounded text-sm">Post</button>
        </form>
        <ul className="text-sm text-dust space-y-1 max-h-40 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2 group">
              <span className="shrink-0">—</span>
              <span className="flex-1">{n.content}</span>
              <button onClick={() => deleteNote(n.id)} className="opacity-0 group-hover:opacity-100 text-brass hover:text-paper p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
