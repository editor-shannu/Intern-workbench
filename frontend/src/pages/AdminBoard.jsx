import { useEffect, useState } from 'react'
import api from '../api'
import StatusTag, { TRACK_LABELS } from '../components/StatusTag'
import AdminMetrics from '../components/AdminMetrics'
import PlanImporterModal from '../components/PlanImporterModal'
import KanbanBoard from '../components/KanbanBoard'
import DependencyGraphModal from '../components/DependencyGraphModal'
import { Plus, X, Upload, LayoutGrid, List, GitFork } from 'lucide-react'

const TRACKS = ['ai-ml', 'data', 'full-stack', 'rpa']

export default function AdminBoard() {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [notes, setNotes] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [showGraphModal, setShowGraphModal] = useState(false)
  const [viewMode, setViewMode] = useState('table') // 'table' | 'kanban'
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', track: 'full-stack', source_ref: '' })
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'intern' })
  const [noteText, setNoteText] = useState('')
  const [formError, setFormError] = useState('')

  async function handleStatusChange(taskId, newStatus) {
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus })
      refresh()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not update task status')
    }
  }

  async function refresh() {
    try {
      const [t, u, n, w, m] = await Promise.all([
        api.get('/tasks'),
        api.get('/users'),
        api.get('/project-notes'),
        api.get('/workspaces'),
        api.get('/admin/metrics').catch(() => ({ data: null })),
      ])
      setTasks(t.data)
      setUsers(u.data)
      setNotes(n.data)
      setWorkspaces(w.data)
      if (m.data) setMetrics(m.data)
    } catch {
      // ignore
    }
  }

  async function handlePrune(workspaceId) {
    if (!window.confirm('Prune this worktree directory from disk?')) return
    try {
      await api.post(`/workspaces/${workspaceId}/prune`)
      refresh()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to prune workspace')
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
      {/* Top: Admin Analytics & Telemetry Dashboard */}
      <AdminMetrics metrics={metrics} />

      {/* Task Board Header */}
      <div className="flex flex-wrap items-center justify-between border-t border-bench-800/80 pt-6 gap-4">
        <div>
          <h1 className="text-lg font-medium text-paper">Task board</h1>
          <p className="text-xs text-dust">Manage sprint tasks, track assignments, and intern progress.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-bench-950 border border-bench-800 rounded p-0.5 text-xs">
            <button
              data-view-table-btn
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                viewMode === 'table' ? 'bg-bench-800 text-paper font-medium' : 'text-dust hover:text-paper'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Table
            </button>
            <button
              data-view-kanban-btn
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                viewMode === 'kanban' ? 'bg-bench-800 text-paper font-medium' : 'text-dust hover:text-paper'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Kanban
            </button>
          </div>

          <button
            data-open-graph-btn
            onClick={() => setShowGraphModal(true)}
            className="text-sm border border-bench-800 hover:border-bench-700 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors text-paper"
            title="Open interactive milestone dependency graph"
          >
            <GitFork className="w-3.5 h-3.5 text-brass" /> Dependency Graph
          </button>
          <button
            data-import-plan-btn
            onClick={() => setShowPlanModal(true)}
            className="text-sm border border-bench-800 hover:border-bench-700 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors text-paper"
          >
            <Upload className="w-3.5 h-3.5 text-brass" /> Import Plan (.md)
          </button>
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

      {/* Tasks View: Kanban Board OR Data Table */}
      {viewMode === 'kanban' ? (
        <KanbanBoard
          tasks={tasks}
          users={users}
          onAssign={assign}
          onStatusChange={handleStatusChange}
        />
      ) : (
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
      )}

      {/* Workspaces & Git Lifecycle Section */}
      <div className="border border-bench-800 bg-bench-950">
        <div className="border-b border-bench-800 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-paper">Active Workspaces & Worktrees</h2>
            <p className="text-xs text-dust">Manage disk worktrees and prune completed environments.</p>
          </div>
          <span className="text-xs font-mono text-dust">{workspaces.length} total</span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-dust text-xs border-b border-bench-800">
            <tr>
              <th className="text-left px-4 py-2 font-normal">Task</th>
              <th className="text-left px-4 py-2 font-normal">Branch</th>
              <th className="text-left px-4 py-2 font-normal">Worktree Path</th>
              <th className="text-left px-4 py-2 font-normal">Status</th>
              <th className="text-right px-4 py-2 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((ws, i) => (
              <tr key={ws.id} className={i > 0 ? 'border-t border-bench-800' : ''}>
                <td className="px-4 py-3 font-medium text-paper">
                  {ws.task?.title || `Task #${ws.task_id}`}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-dust truncate max-w-[200px]" title={ws.branch_name}>
                  {ws.branch_name}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-bench-500 truncate max-w-[220px]" title={ws.worktree_path}>
                  {ws.worktree_path}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 text-xs font-mono rounded ${
                      ws.status === 'active'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                        : 'bg-bench-900 text-dust border border-bench-800'
                    }`}
                  >
                    {ws.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {ws.status === 'active' ? (
                    <button
                      data-prune-btn={ws.id}
                      onClick={() => handlePrune(ws.id)}
                      className="text-xs border border-bench-800 hover:border-red-500/50 hover:text-red-400 px-2.5 py-1 rounded transition-colors text-paper"
                      title="Prune worktree directory from disk"
                    >
                      Prune
                    </button>
                  ) : (
                    <span className="text-xs text-dust italic">archived</span>
                  )}
                </td>
              </tr>
            ))}
            {workspaces.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-dust">
                  No workspaces created yet.
                </td>
              </tr>
            )}
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

      {showPlanModal && (
        <PlanImporterModal
          onClose={() => setShowPlanModal(false)}
          onImportSuccess={() => refresh()}
        />
      )}

      <DependencyGraphModal
        isOpen={showGraphModal}
        onClose={() => setShowGraphModal(false)}
      />
    </div>
  )
}
