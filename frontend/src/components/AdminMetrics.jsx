import { Layers, CheckCircle2, GitPullRequest, Sparkles } from 'lucide-react'
import { TRACK_LABELS } from './StatusTag'

const TRACK_COLORS = {
  'full-stack': 'bg-blue-500',
  'ai-ml': 'bg-purple-500',
  'data': 'bg-emerald-500',
  'rpa': 'bg-amber-500',
}

export default function AdminMetrics({ metrics }) {
  if (!metrics) return null

  const totalTasks = metrics.total_tasks || 0
  const tracks = ['full-stack', 'ai-ml', 'data', 'rpa']

  return (
    <div data-admin-analytics className="space-y-4">
      {/* 4 Core Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Worktrees */}
        <div
          data-metric-worktrees
          className="bg-bench-950 border border-bench-800 rounded-lg p-4 flex flex-col justify-between hover:border-bench-700 transition-colors"
        >
          <div className="flex items-center justify-between text-dust text-xs">
            <span className="font-medium tracking-wide">ACTIVE WORKTREES</span>
            <Layers className="w-4 h-4 text-blueprint" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-paper font-mono">{metrics.active_worktrees}</div>
          </div>
          <div className="text-[11px] text-dust truncate font-mono">
            {metrics.archived_worktrees} pruned • {metrics.total_interns} registered interns
          </div>
        </div>

        {/* Card 2: Task Completion Velocity */}
        <div
          data-metric-tasks
          className="bg-bench-950 border border-bench-800 rounded-lg p-4 flex flex-col justify-between hover:border-bench-700 transition-colors"
        >
          <div className="flex items-center justify-between text-dust text-xs">
            <span className="font-medium tracking-wide">PIPELINE VELOCITY</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-emerald-400 font-mono">
              {metrics.completion_rate_pct}%
            </div>
          </div>
          <div className="text-[11px] text-dust truncate font-mono">
            {metrics.tasks_by_status?.merged || 0} merged • {metrics.tasks_by_status?.in_progress || 0} active • {totalTasks} total
          </div>
        </div>

        {/* Card 3: Git Commits & PRs */}
        <div
          data-metric-prs
          className="bg-bench-950 border border-bench-800 rounded-lg p-4 flex flex-col justify-between hover:border-bench-700 transition-colors"
        >
          <div className="flex items-center justify-between text-dust text-xs">
            <span className="font-medium tracking-wide">GIT COMMITS & PRS</span>
            <GitPullRequest className="w-4 h-4 text-brass" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-paper font-mono">
              {metrics.total_commits} <span className="text-xs text-dust font-normal">commits</span>
            </div>
          </div>
          <div className="text-[11px] text-dust truncate font-mono">
            {metrics.prs_merged} PRs merged • {metrics.prs_open} open
          </div>
        </div>

        {/* Card 4: AI Telemetry & Tokens */}
        <div
          data-metric-ai
          className="bg-bench-950 border border-bench-800 rounded-lg p-4 flex flex-col justify-between hover:border-bench-700 transition-colors"
        >
          <div className="flex items-center justify-between text-dust text-xs">
            <span className="font-medium tracking-wide">AI ASSISTANT TOKENS</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold text-paper font-mono">
              ~{metrics.ai_estimated_tokens?.toLocaleString() || 0}
            </div>
          </div>
          <div className="text-[11px] text-dust truncate font-mono">
            {metrics.ai_local_messages} local messages • {metrics.ai_cloud_messages} cloud
          </div>
        </div>
      </div>

      {/* Track Distribution Bar */}
      <div className="bg-bench-950 border border-bench-800 rounded-lg p-3">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-paper">Track Distribution</span>
          <span className="text-dust font-mono text-[11px]">{totalTasks} tasks total</span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full bg-bench-900 rounded overflow-hidden flex">
          {totalTasks > 0 ? (
            tracks.map((tr) => {
              const count = metrics.tasks_by_track?.[tr] || 0
              const pct = (count / totalTasks) * 100
              if (pct === 0) return null
              return (
                <div
                  key={tr}
                  style={{ width: `${pct}%` }}
                  className={`${TRACK_COLORS[tr] || 'bg-bench-700'} h-full transition-all`}
                  title={`${TRACK_LABELS[tr] || tr}: ${count} tasks (${Math.round(pct)}%)`}
                />
              )
            })
          ) : (
            <div className="w-full h-full bg-bench-800" />
          )}
        </div>

        {/* Track Legend Badges */}
        <div className="flex flex-wrap items-center gap-4 mt-2.5 text-[11px]">
          {tracks.map((tr) => {
            const count = metrics.tasks_by_track?.[tr] || 0
            return (
              <div key={tr} className="flex items-center gap-1.5 font-mono">
                <span className={`w-2 h-2 rounded-full ${TRACK_COLORS[tr] || 'bg-bench-700'}`} />
                <span className="text-dust">{TRACK_LABELS[tr] || tr}:</span>
                <span className="text-paper font-bold">{count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
