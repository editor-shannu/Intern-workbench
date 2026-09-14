import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  RefreshCw,
  FilePlus,
  FolderPlus,
  Trash2,
  Edit2,
  Check,
  X,
  Paperclip,
} from 'lucide-react'

function Node({
  node,
  activePath,
  onSelect,
  depth,
  onDelete,
  onRename,
  onStartCreate,
  onAttachContext,
}) {
  const [open, setOpen] = useState(depth < 1)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(node.name)

  function submitRename(e) {
    e?.stopPropagation()
    const trimmed = renameVal.trim()
    if (!trimmed || trimmed === node.name) {
      setIsRenaming(false)
      return
    }
    const parentPath = node.path.includes('/')
      ? node.path.substring(0, node.path.lastIndexOf('/'))
      : ''
    const newPath = parentPath ? `${parentPath}/${trimmed}` : trimmed
    onRename(node.path, newPath)
    setIsRenaming(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') submitRename(e)
    if (e.key === 'Escape') {
      setIsRenaming(false)
      setRenameVal(node.name)
    }
  }

  if (node.type === 'dir') {
    return (
      <div>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{ paddingLeft: depth * 12 + 8 }}
          className="group flex items-center justify-between py-1 text-sm text-dust hover:text-paper hover:bg-bench-900/50 cursor-pointer select-none pr-2 rounded-sm"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {open ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-dust" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-dust" />
            )}
            <Folder className="w-3.5 h-3.5 shrink-0 text-blueprint" />
            {isRenaming ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="bg-bench-950 border border-bench-700 rounded px-1 text-xs text-paper w-24 py-0.5 outline-none font-mono"
                />
                <button onClick={submitRename} className="text-emerald-400 hover:text-emerald-300">
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => setIsRenaming(false)} className="text-dust hover:text-paper">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </div>

          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStartCreate('file', node.path)
                setOpen(true)
              }}
              title="New file in folder"
              className="p-0.5 text-dust hover:text-paper rounded hover:bg-bench-800"
            >
              <FilePlus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsRenaming(true)
                setRenameVal(node.name)
              }}
              title="Rename folder"
              className="p-0.5 text-dust hover:text-paper rounded hover:bg-bench-800"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(`Delete folder "${node.name}" and all its contents?`)) {
                  onDelete(node.path)
                }
              }}
              title="Delete folder"
              className="p-0.5 text-dust hover:text-red-400 rounded hover:bg-bench-800"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {open &&
          node.children?.map((c) => (
            <Node
              key={c.path}
              node={c}
              activePath={activePath}
              onSelect={onSelect}
              depth={depth + 1}
              onDelete={onDelete}
              onRename={onRename}
              onStartCreate={onStartCreate}
              onAttachContext={onAttachContext}
            />
          ))}
      </div>
    )
  }

  const active = node.path === activePath
  return (
    <div
      data-path={node.path}
      onClick={() => onSelect(node.path)}
      style={{ paddingLeft: depth * 12 + 24 }}
      className={`group flex items-center justify-between py-1 text-sm cursor-pointer select-none pr-2 rounded-sm ${
        active ? 'bg-brass-dim text-paper font-medium' : 'text-dust hover:text-paper hover:bg-bench-900/40'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <File className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-brass' : 'text-dust'}`} />
        {isRenaming ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-bench-950 border border-bench-700 rounded px-1 text-xs text-paper w-28 py-0.5 outline-none font-mono"
            />
            <button onClick={submitRename} className="text-emerald-400 hover:text-emerald-300">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => setIsRenaming(false)} className="text-dust hover:text-paper">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <span className="truncate font-mono text-[13px]">{node.name}</span>
        )}
      </div>

      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
        <button
          data-attach-context-btn={node.path}
          onClick={(e) => {
            e.stopPropagation()
            onAttachContext?.(node.path)
          }}
          title="Attach to AI context"
          className="p-0.5 text-dust hover:text-amber-400 rounded hover:bg-bench-800"
        >
          <Paperclip className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsRenaming(true)
            setRenameVal(node.name)
          }}
          title="Rename file"
          className="p-0.5 text-dust hover:text-paper rounded hover:bg-bench-800"
        >
          <Edit2 className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(`Delete file "${node.name}"?`)) {
              onDelete(node.path)
            }
          }}
          title="Delete file"
          className="p-0.5 text-dust hover:text-red-400 rounded hover:bg-bench-800"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

export default function FileTree({
  nodes,
  activePath,
  onSelect,
  onRefresh,
  refreshing,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onAttachContext,
}) {
  const [createState, setCreateState] = useState(null) // { type: 'file' | 'dir', parent: string }
  const [inputVal, setInputVal] = useState('')

  function handleStartCreate(type, parent = '') {
    setCreateState({ type, parent })
    setInputVal('')
  }

  function handleCancelCreate() {
    setCreateState(null)
    setInputVal('')
  }

  async function handleConfirmCreate(e) {
    e?.preventDefault()
    const trimmed = inputVal.trim()
    if (!trimmed) {
      handleCancelCreate()
      return
    }
    const fullPath = createState.parent ? `${createState.parent}/${trimmed}` : trimmed
    await onCreateFile(fullPath, createState.type === 'dir')
    handleCancelCreate()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center justify-between border-b border-bench-800 shrink-0">
        <span className="text-[11px] font-semibold text-dust tracking-wider">WORKSPACE</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleStartCreate('file')}
            title="New File"
            className="text-dust hover:text-paper p-1 rounded hover:bg-bench-800 transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleStartCreate('dir')}
            title="New Folder"
            className="text-dust hover:text-paper p-1 rounded hover:bg-bench-800 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh Tree"
              className="text-dust hover:text-paper p-1 rounded hover:bg-bench-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {createState && (
        <form
          onSubmit={handleConfirmCreate}
          className="px-3 py-1.5 border-b border-bench-800/80 bg-bench-900/60 flex items-center gap-1.5"
        >
          {createState.type === 'dir' ? (
            <Folder className="w-3.5 h-3.5 text-blueprint shrink-0" />
          ) : (
            <File className="w-3.5 h-3.5 text-dust shrink-0" />
          )}
          <input
            autoFocus
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleCancelCreate()
            }}
            placeholder={
              createState.type === 'dir'
                ? createState.parent
                  ? `${createState.parent}/folder_name`
                  : 'folder_name'
                : createState.parent
                ? `${createState.parent}/file.py`
                : 'file.py'
            }
            className="bg-bench-950 border border-bench-700 rounded px-1.5 py-0.5 text-xs text-paper w-full outline-none font-mono placeholder:text-bench-600"
          />
          <button type="submit" className="text-emerald-400 hover:text-emerald-300 p-0.5">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={handleCancelCreate} className="text-dust hover:text-paper p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {!nodes || nodes.length === 0 ? (
          <div className="px-4 py-3 text-xs text-dust">No files found.</div>
        ) : (
          nodes.map((n) => (
            <Node
              key={n.path}
              node={n}
              activePath={activePath}
              onSelect={onSelect}
              depth={0}
              onDelete={onDeleteFile}
              onRename={onRenameFile}
              onStartCreate={handleStartCreate}
              onAttachContext={onAttachContext}
            />
          ))
        )}
      </div>
    </div>
  )
}
