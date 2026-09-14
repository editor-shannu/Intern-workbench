import { useState, useEffect } from 'react'
import api from '../api'
import { X, GitFork, Lock, CheckCircle2, AlertCircle, Layers, RefreshCw } from 'lucide-react'
import { TRACK_LABELS } from './StatusTag'

export default function DependencyGraphModal({ isOpen, onClose }) {
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadGraph()
    } else {
      setSelectedNodeId(null)
    }
  }, [isOpen])

  async function loadGraph() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/tasks/graph')
      setGraphData(data)
      if (data.nodes.length > 0) {
        setSelectedNodeId(data.nodes[0].id)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load task graph')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const nodes = graphData?.nodes || []
  const edges = graphData?.edges || []
  const summary = graphData?.summary || { total_tasks: 0, blocked_count: 0, ready_count: 0, merged_count: 0 }

  // Compute node layers / levels using topological ranking
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const incomingEdges = new Map()
  const outgoingEdges = new Map()

  nodes.forEach((n) => {
    incomingEdges.set(n.id, [])
    outgoingEdges.set(n.id, [])
  })

  edges.forEach((e) => {
    if (incomingEdges.has(e.to_id)) incomingEdges.get(e.to_id).push(e.from_id)
    if (outgoingEdges.has(e.from_id)) outgoingEdges.get(e.from_id).push(e.to_id)
  })

  // Determine depth/level for each node
  const levels = new Map()
  function getLevel(nodeId, visited = new Set()) {
    if (levels.has(nodeId)) return levels.get(nodeId)
    if (visited.has(nodeId)) return 0 // cycle break
    visited.add(nodeId)

    const parents = incomingEdges.get(nodeId) || []
    if (parents.length === 0) {
      levels.set(nodeId, 0)
      return 0
    }
    const maxParentLevel = Math.max(...parents.map((p) => getLevel(p, new Set(visited))))
    const lvl = maxParentLevel + 1
    levels.set(nodeId, lvl)
    return lvl
  }

  nodes.forEach((n) => getLevel(n.id))

  // Group nodes by level
  const maxLevel = Math.max(0, ...Array.from(levels.values()))
  const columns = []
  for (let l = 0; l <= maxLevel; l++) {
    columns.push([])
  }
  nodes.forEach((n) => {
    const lvl = levels.get(n.id) || 0
    columns[lvl].push(n)
  })

  // Coordinates for layout
  const colWidth = 260
  const rowHeight = 110
  const startX = 60
  const startY = 60

  const positions = new Map()
  columns.forEach((colNodes, colIdx) => {
    colNodes.forEach((n, rowIdx) => {
      positions.set(n.id, {
        x: startX + colIdx * colWidth,
        y: startY + rowIdx * rowHeight,
      })
    })
  })

  const svgWidth = Math.max(860, startX + (columns.length + 1) * colWidth)
  const maxNodesInCol = Math.max(1, ...columns.map((c) => c.length))
  const svgHeight = Math.max(480, startY + maxNodesInCol * rowHeight + 80)

  const selectedNode = nodeMap.get(selectedNodeId)

  return (
    <div
      data-dependency-graph-modal
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
    >
      <div className="bg-bench-950 border border-bench-800 rounded-xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-bench-800 flex items-center justify-between bg-bench-900/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brass/10 border border-brass/30 text-brass">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-paper flex items-center gap-2">
                Task Dependency Graph (DAG)
              </h2>
              <p className="text-xs text-dust">
                Visualizing task sequence, critical blockers, and milestone dependencies.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadGraph}
              disabled={loading}
              title="Refresh Graph"
              className="p-1.5 rounded text-dust hover:text-paper hover:bg-bench-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              data-close-graph-btn
              onClick={onClose}
              className="p-1.5 rounded text-dust hover:text-paper hover:bg-bench-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Telemetry Summary Strip */}
        <div className="px-6 py-2.5 bg-bench-900/40 border-b border-bench-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-dust">
              TOTAL TASKS: <strong className="text-paper">{summary.total_tasks}</strong>
            </span>
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> MERGED: <strong>{summary.merged_count}</strong>
            </span>
            <span className="text-amber-400 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> BLOCKED: <strong>{summary.blocked_count}</strong>
            </span>
            <span className="text-blue-400">
              READY: <strong>{summary.ready_count}</strong>
            </span>
          </div>
          <div className="text-[11px] text-dust italic">
            Click any task node to highlight upstream prerequisites and downstream dependents.
          </div>
        </div>

        {/* Modal Body: Graph Canvas + Selected Inspector */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden bg-[#111111]">
          {/* Left Canvas Area */}
          <div className="flex-1 overflow-auto p-4 relative">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-dust font-mono">
                Computing topological layout...
              </div>
            ) : error ? (
              <div className="h-full flex items-center justify-center text-sm text-red-400">
                {error}
              </div>
            ) : nodes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-dust italic">
                No tasks available to graph. Import a project plan first.
              </div>
            ) : (
              <svg
                data-graph-svg
                width={svgWidth}
                height={svgHeight}
                className="overflow-visible"
              >
                <defs>
                  {/* Arrow marker for satisfied dependencies */}
                  <marker
                    id="arrow-satisfied"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                  </marker>
                  {/* Arrow marker for blocked dependencies */}
                  <marker
                    id="arrow-blocked"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
                  </marker>
                </defs>

                {/* Render Directed Edges */}
                {edges.map((e, idx) => {
                  const src = positions.get(e.from_id)
                  const dst = positions.get(e.to_id)
                  if (!src || !dst) return null

                  const x1 = src.x + 190
                  const y1 = src.y + 40
                  const x2 = dst.x
                  const y2 = dst.y + 40

                  const dx = Math.max(40, (x2 - x1) / 2)
                  const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`

                  const isHighlighted =
                    selectedNodeId === e.from_id || selectedNodeId === e.to_id

                  return (
                    <path
                      key={`edge-${idx}`}
                      d={pathD}
                      fill="none"
                      stroke={e.is_satisfied ? '#10b981' : '#f59e0b'}
                      strokeWidth={isHighlighted ? 2.5 : 1.5}
                      strokeDasharray={e.is_satisfied ? 'none' : '4,3'}
                      markerEnd={e.is_satisfied ? 'url(#arrow-satisfied)' : 'url(#arrow-blocked)'}
                      className="transition-all opacity-80 hover:opacity-100"
                    />
                  )
                })}

                {/* Render Nodes */}
                {nodes.map((n) => {
                  const pos = positions.get(n.id)
                  if (!pos) return null

                  const isSelected = selectedNodeId === n.id
                  const isBlocked = n.is_blocked
                  const isMerged = n.status === 'merged'

                  let borderColor = '#374151'
                  let bgColor = '#18181b'
                  if (isSelected) {
                    borderColor = '#d97706'
                    bgColor = '#27272a'
                  } else if (isMerged) {
                    borderColor = '#059669'
                  } else if (isBlocked) {
                    borderColor = '#b45309'
                  }

                  return (
                    <g
                      key={`node-${n.id}`}
                      data-graph-node={n.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onClick={() => setSelectedNodeId(n.id)}
                      className="cursor-pointer group"
                    >
                      <rect
                        width="190"
                        height="80"
                        rx="8"
                        fill={bgColor}
                        stroke={borderColor}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        className="transition-all group-hover:brightness-125 shadow-md"
                      />

                      {/* Status indicator bar on left edge */}
                      <rect
                        width="4"
                        height="80"
                        rx="2"
                        fill={isMerged ? '#10b981' : isBlocked ? '#f59e0b' : '#3b82f6'}
                      />

                      {/* Header inside node: Track & ID */}
                      <text x="12" y="20" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                        {n.identifier ? `#${n.identifier}` : `Task #${n.id}`}
                      </text>

                      {/* Blocker Icon */}
                      {isBlocked && (
                        <text x="170" y="20" fill="#f59e0b" fontSize="11">
                          🔒
                        </text>
                      )}
                      {isMerged && (
                        <text x="170" y="20" fill="#10b981" fontSize="11">
                          ✓
                        </text>
                      )}

                      {/* Title */}
                      <text
                        x="12"
                        y="42"
                        fill="#f3f4f6"
                        fontSize="12"
                        fontWeight="600"
                        className="truncate"
                      >
                        {n.title.length > 20 ? n.title.slice(0, 18) + '…' : n.title}
                      </text>

                      {/* Status and Assignee Footer */}
                      <text x="12" y="66" fill="#6b7280" fontSize="10">
                        {n.assigned_user_name || 'Unassigned'} • {n.status}
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}
          </div>

          {/* Right Inspector Panel for Selected Node */}
          {selectedNode && (
            <div
              data-node-inspector
              className="w-full md:w-80 border-t md:border-t-0 md:border-l border-bench-800 bg-bench-950 p-5 flex flex-col shrink-0 overflow-y-auto space-y-4 text-xs"
            >
              <div>
                <span className="text-[10px] font-mono text-dust uppercase tracking-wider">
                  Node Inspector
                </span>
                <h3 className="text-base font-semibold text-paper mt-1">{selectedNode.title}</h3>
                {selectedNode.identifier && (
                  <span className="text-xs font-mono text-brass">#{selectedNode.identifier}</span>
                )}
              </div>

              {/* Status and Track Badges */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded font-mono font-medium text-[11px] ${
                    selectedNode.status === 'merged'
                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                      : selectedNode.is_blocked
                      ? 'bg-amber-950 border border-amber-800 text-amber-300'
                      : 'bg-blue-950 border border-blue-800 text-blue-300'
                  }`}
                >
                  {selectedNode.status}
                </span>
                <span className="px-2 py-0.5 rounded bg-bench-900 border border-bench-800 text-dust font-mono text-[11px]">
                  {TRACK_LABELS[selectedNode.track] || selectedNode.track}
                </span>
              </div>

              {/* Blocker Details */}
              {selectedNode.is_blocked ? (
                <div className="p-3 bg-amber-950/50 border border-amber-800 rounded space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Prerequisites Pending</span>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    This task is blocked until the following dependencies are completed and merged:
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-amber-300 font-mono">
                    {selectedNode.blockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/70 rounded flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Prerequisites fulfilled. Ready for development!</span>
                </div>
              )}

              {/* Assignment & Source Ref */}
              <div className="space-y-2 border-t border-bench-800/80 pt-3">
                <div className="flex justify-between">
                  <span className="text-dust">Assignee:</span>
                  <span className="text-paper font-medium">
                    {selectedNode.assigned_user_name || 'Unassigned'}
                  </span>
                </div>
                {selectedNode.source_ref && (
                  <div className="flex justify-between">
                    <span className="text-dust">Milestone:</span>
                    <span className="text-paper">{selectedNode.source_ref}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-dust">Incoming Dependencies:</span>
                  <span className="font-mono text-paper">
                    {incomingEdges.get(selectedNode.id)?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dust">Dependent Tasks:</span>
                  <span className="font-mono text-paper">
                    {outgoingEdges.get(selectedNode.id)?.length || 0}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
