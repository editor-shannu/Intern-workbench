import { useState } from 'react'
import { ChevronRight, ChevronDown, File, Folder, RefreshCw } from 'lucide-react'

function Node({ node, activePath, onSelect, depth }) {
  const [open, setOpen] = useState(depth < 1)

  if (node.type === 'dir') {
    return (
      <div>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{ paddingLeft: depth * 12 + 8 }}
          className="flex items-center gap-1.5 py-1 text-sm text-dust hover:text-paper cursor-pointer select-none"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          <Folder className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </div>
        {open && node.children?.map((c) => (
          <Node key={c.path} node={c} activePath={activePath} onSelect={onSelect} depth={depth + 1} />
        ))}
      </div>
    )
  }

  const active = node.path === activePath
  return (
    <div
      onClick={() => onSelect(node.path)}
      style={{ paddingLeft: depth * 12 + 28 }}
      className={`flex items-center gap-1.5 py-1 text-sm cursor-pointer select-none ${
        active ? 'bg-brass-dim text-paper' : 'text-dust hover:text-paper'
      }`}
    >
      <File className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate font-mono text-[13px]">{node.name}</span>
    </div>
  )
}

export default function FileTree({ nodes, activePath, onSelect, onRefresh, refreshing }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center justify-between border-b border-bench-800 shrink-0">
        <span className="text-[11px] font-semibold text-dust tracking-wider">FILES</span>
        {onRefresh && (
          <button 
            onClick={onRefresh} 
            disabled={refreshing}
            className="text-dust hover:text-paper disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {(!nodes || nodes.length === 0) ? (
          <div className="px-4 text-sm text-dust">No files yet.</div>
        ) : (
          nodes.map((n) => (
            <Node key={n.path} node={n} activePath={activePath} onSelect={onSelect} depth={0} />
          ))
        )}
      </div>
    </div>
  )
}
