import { useState } from 'react'
import { TRACK_LABELS } from './StatusTag'
import { ArrowLeft, ArrowRight, Lock, CheckCircle2, UserCheck, Layers, GitPullRequest, GitMerge } from 'lucide-react'

const KANBAN_COLUMNS = [
  { id: 'unassigned', label: 'Unassigned', icon: Layers, color: 'text-dust', border: 'border-dust/30' },
  { id: 'in_progress', label: 'In Progress', icon: UserCheck, color: 'text-brass', border: 'border-brass/40' },
  { id: 'pr_open', label: 'PR Open', icon: GitPullRequest, color: 'text-blue-400', border: 'border-blue-500/40' },
  { id: 'merged', label: 'Merged', icon: GitMerge, color: 'text-emerald-400', border: 'border-emerald-500/40' },
]

const STATUS_FLOW = ['unassigned', 'in_progress', 'pr_open', 'merged']

const TRACK_COLORS = {
  'ai-ml': 'bg-purple-950/70 border-purple-800 text-purple-300',
  'data': 'bg-emerald-950/70 border-emerald-800 text-emerald-300',
  'full-stack': 'bg-blue-950/70 border-blue-800 text-blue-300',
  'rpa': 'bg-amber-950/70 border-amber-800 text-amber-300',
}

export default function KanbanBoard({ tasks = [], users = [], onAssign, onStatusChange }) {
  const [movingId, setMovingId] = useState(null)

  async function handleMove(taskId, currentStatus, direction) {
    const currIdx = STATUS_FLOW.indexOf(currentStatus)
    const nextIdx = direction === 'forward' ? currIdx + 1 : currIdx - 1
    if (nextIdx < 0 || nextIdx >= STATUS_FLOW.length) return

    const nextStatus = STATUS_FLOW[nextIdx]
    setMovingId(taskId)
    try {
      await onStatusChange(taskId, nextStatus)
    } finally {
      setMovingId(null)
    }
  }

  return (
    <div data-kanban-board className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => (t.status || 'unassigned') === col.id)
        const ColIcon = col.icon

        return (
          <div
            key={col.id}
            data-kanban-column={col.id}
            className="flex flex-col bg-bench-950 border border-bench-800 rounded-lg overflow-hidden min-h-[480px]"
          >
            {/* Column Header */}
            <div className={`px-4 py-3 border-b border-bench-800/80 bg-bench-900/60 flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <ColIcon className={`w-4 h-4 ${col.color}`} />
                <span className="font-semibold text-xs text-paper uppercase tracking-wider">{col.label}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-bench-800 text-dust">
                {colTasks.length}
              </span>
            </div>

            {/* Task Card List */}
            <div className="flex-1 p-3 space-y-3 overflow-y-auto">
              {colTasks.length === 0 ? (
                <div className="h-32 border border-dashed border-bench-800/60 rounded flex items-center justify-center text-xs text-bench-600 italic">
                  No tasks {col.label.toLowerCase()}
                </div>
              ) : (
                colTasks.map((t) => {
                  const unmergedDeps = (t.dependencies || []).filter((d) => d.status !== 'merged')
                  const isBlocked = unmergedDeps.length > 0
                  const isBusy = movingId === t.id
                  const trackClass = TRACK_COLORS[t.track] || TRACK_COLORS['full-stack']

                  const currIdx = STATUS_FLOW.indexOf(t.status || 'unassigned')
                  const canMoveLeft = currIdx > 0
                  const canMoveRight = currIdx < STATUS_FLOW.length - 1

                  return (
                    <div
                      key={t.id}
                      data-kanban-card={t.id}
                      className="p-3 bg-bench-900/90 border border-bench-800 hover:border-bench-700 rounded-lg shadow-sm space-y-2.5 transition-all text-xs"
                    >
                      {/* Card Top: Track & Identifier Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${trackClass}`}>
                          {TRACK_LABELS[t.track] || t.track}
                        </span>
                        {t.identifier && (
                          <span className="text-[10px] font-mono text-dust px-1.5 py-0.5 rounded bg-bench-950 border border-bench-800/70">
                            #{t.identifier}
                          </span>
                        )}
                        {t.source_ref && (
                          <span className="text-[10px] text-dust truncate max-w-[90px]" title={t.source_ref}>
                            {t.source_ref}
                          </span>
                        )}
                      </div>

                      {/* Card Title & Description */}
                      <div>
                        <div className="font-semibold text-paper text-sm leading-snug line-clamp-2">
                          {t.title}
                        </div>
                        {t.description && (
                          <div className="text-dust text-[11px] mt-1 line-clamp-2 leading-relaxed">
                            {t.description}
                          </div>
                        )}
                      </div>

                      {/* Dependency / Blocker Notice */}
                      {isBlocked ? (
                        <div
                          data-task-blocker-badge
                          className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-950/60 border border-amber-800/80 text-amber-300 text-[10px] leading-tight"
                        >
                          <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="truncate">
                            Blocked: Waiting on {unmergedDeps.map((d) => d.title || d.identifier).join(', ')}
                          </span>
                        </div>
                      ) : t.dependencies?.length > 0 ? (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 text-[10px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>All dependencies merged</span>
                        </div>
                      ) : null}

                      {/* Card Footer: Assignee & Move Buttons */}
                      <div className="pt-2 border-t border-bench-800/80 flex items-center justify-between gap-2">
                        {/* Assignee Dropdown */}
                        <div className="flex-1 min-w-0">
                          <select
                            data-task-assign-select
                            value={t.assigned_user_id || ''}
                            onChange={(e) => onAssign(t.id, e.target.value)}
                            className="w-full bg-bench-950 border border-bench-800 rounded px-1.5 py-1 text-[11px] text-paper truncate outline-none focus:border-brass"
                          >
                            <option value="">— Unassigned —</option>
                            {users
                              .filter((u) => u.role === 'intern')
                              .map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Move Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {canMoveLeft && (
                            <button
                              data-move-task-backward
                              onClick={() => handleMove(t.id, t.status, 'backward')}
                              disabled={isBusy}
                              title="Move to previous status"
                              className="p-1 rounded text-dust hover:text-paper hover:bg-bench-800 disabled:opacity-30 transition-colors"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canMoveRight && (
                            <button
                              data-move-task-forward
                              onClick={() => handleMove(t.id, t.status, 'forward')}
                              disabled={isBusy}
                              title="Move to next status"
                              className="p-1 rounded text-brass hover:text-paper hover:bg-bench-800 disabled:opacity-30 transition-colors"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
