import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'
import FileTree from '../components/FileTree'
import CodeEditor from '../components/Editor'
import ChatPanel from '../components/ChatPanel'
import TerminalDrawer from '../components/TerminalDrawer'
import { GitCommit, GitPullRequest, ExternalLink, Download, X, Save, RotateCcw, AlertTriangle, Terminal } from 'lucide-react'

export default function Workspace() {
  const { id } = useParams()
  const [workspace, setWorkspace] = useState(null)
  const [task, setTask] = useState(null)
  const [tree, setTree] = useState([])

  // Multi-tab editor state
  const [openTabs, setOpenTabs] = useState([]) // Array of path strings
  const [fileContents, setFileContents] = useState({}) // { [path]: string }
  const [dirtyFiles, setDirtyFiles] = useState({}) // { [path]: boolean }
  const [activePath, setActivePath] = useState(null)

  const [commitMsg, setCommitMsg] = useState('')
  const [pr, setPr] = useState(null)
  const [conflicts, setConflicts] = useState([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [refreshingTree, setRefreshingTree] = useState(false)
  const [contextVersion, setContextVersion] = useState(0)
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  const [chatPrefill, setChatPrefill] = useState('')

  // Ref to always access latest state in hotkey listeners
  const stateRef = useRef({ activePath, fileContents, dirtyFiles, openTabs })
  useEffect(() => {
    stateRef.current = { activePath, fileContents, dirtyFiles, openTabs }
  }, [activePath, fileContents, dirtyFiles, openTabs])

  const loadTree = useCallback(async () => {
    try {
      setRefreshingTree(true)
      const { data } = await api.get(`/workspaces/${id}/tree`)
      setTree(data)
    } catch {
      // silently ignore — tree will remain stale
    } finally {
      setTimeout(() => setRefreshingTree(false), 400)
    }
  }, [id])

  useEffect(() => {
    api.get(`/workspaces/${id}`).then((r) => {
      setWorkspace(r.data)
      setTask(r.data.task)
      setPr(r.data.pull_request || null)
    })
    api
      .get(`/workspaces/${id}/conflicts`)
      .then((r) => {
        if (r.data.has_conflicts) {
          setConflicts(r.data.conflicts || [])
        }
      })
      .catch(() => {})
    loadTree()
  }, [id, loadTree])

  // Background PR merge poller
  useEffect(() => {
    const t = setInterval(() => {
      api
        .get(`/workspaces/${id}`)
        .then((r) => {
          setPr(r.data.pull_request || null)
        })
        .catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [id])

  function flash(text) {
    setNotice(text)
    setTimeout(() => setNotice(''), 3500)
  }

  async function openFile(path) {
    try {
      if (!openTabs.includes(path)) {
        if (fileContents[path] === undefined) {
          const { data } = await api.get(`/workspaces/${id}/files`, { params: { path } })
          setFileContents((prev) => ({ ...prev, [path]: data.content }))
        }
        setOpenTabs((prev) => [...prev, path])
      }
      setActivePath(path)
    } catch (err) {
      flash(err.response?.data?.detail || 'Could not open file')
    }
  }

  async function saveFile(path) {
    if (!path) return
    const content = fileContents[path] ?? ''
    try {
      await api.put(`/workspaces/${id}/files`, { path, content })
      setDirtyFiles((prev) => ({ ...prev, [path]: false }))
      const baseName = path.split('/').pop()
      flash(`Saved ${baseName}`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Save failed')
    }
  }

  async function saveActiveFile() {
    const curr = stateRef.current.activePath
    if (curr) await saveFile(curr)
  }

  function handleCloseTab(path, e) {
    e?.stopPropagation()
    if (dirtyFiles[path]) {
      const base = path.split('/').pop()
      if (!window.confirm(`"${base}" has unsaved changes. Close anyway?`)) {
        return
      }
    }

    const nextTabs = openTabs.filter((p) => p !== path)
    setOpenTabs(nextTabs)

    setDirtyFiles((prev) => {
      const next = { ...prev }
      delete next[path]
      return next
    })

    if (activePath === path) {
      if (nextTabs.length > 0) {
        const closedIdx = openTabs.indexOf(path)
        const nextActive = nextTabs[Math.min(closedIdx, nextTabs.length - 1)]
        setActivePath(nextActive)
      } else {
        setActivePath(null)
      }
    }
  }

  function handleCloseAllTabs() {
    const hasDirty = openTabs.some((p) => dirtyFiles[p])
    if (hasDirty && !window.confirm('Some open files have unsaved changes. Close all tabs?')) {
      return
    }
    setOpenTabs([])
    setActivePath(null)
    setDirtyFiles({})
  }

  // Global Ctrl+S / Cmd+S listener
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveActiveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // FileTree CRUD Handlers
  async function handleCreateFile(path, isDirectory) {
    try {
      await api.post(`/workspaces/${id}/files`, { path, is_directory: isDirectory })
      await loadTree()
      if (!isDirectory) {
        setFileContents((prev) => ({ ...prev, [path]: '' }))
        setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]))
        setActivePath(path)
      }
      flash(`Created ${isDirectory ? 'folder' : 'file'}: ${path}`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Creation failed')
    }
  }

  async function handleDeleteFile(path) {
    try {
      await api.delete(`/workspaces/${id}/files`, { data: { path } })
      await loadTree()

      // Close tab if open or any children of deleted dir
      setOpenTabs((prev) => {
        const remaining = prev.filter((p) => p !== path && !p.startsWith(`${path}/`))
        if (activePath && (activePath === path || activePath.startsWith(`${path}/`))) {
          setActivePath(remaining[0] || null)
        }
        return remaining
      })

      flash(`Deleted ${path}`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Delete failed')
    }
  }

  async function handleRenameFile(oldPath, newPath) {
    try {
      await api.patch(`/workspaces/${id}/files/rename`, { old_path: oldPath, new_path: newPath })
      await loadTree()

      // Update openTabs and fileContents if affected
      setOpenTabs((prev) =>
        prev.map((p) => {
          if (p === oldPath) return newPath
          if (p.startsWith(`${oldPath}/`)) return p.replace(oldPath, newPath)
          return p
        })
      )

      setFileContents((prev) => {
        const next = { ...prev }
        if (next[oldPath] !== undefined) {
          next[newPath] = next[oldPath]
          delete next[oldPath]
        }
        return next
      })

      if (activePath === oldPath) {
        setActivePath(newPath)
      } else if (activePath?.startsWith(`${oldPath}/`)) {
        setActivePath(activePath.replace(oldPath, newPath))
      }

      flash(`Renamed to ${newPath}`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Rename failed')
    }
  }

  async function handleApplyEdit(path, content) {
    try {
      await api.put(`/workspaces/${id}/files`, { path, content })
      await loadTree()

      setFileContents((prev) => ({ ...prev, [path]: content }))
      setDirtyFiles((prev) => ({ ...prev, [path]: false }))

      if (!openTabs.includes(path)) {
        setOpenTabs((prev) => [...prev, path])
      }
      setActivePath(path)

      flash(`Applied changes to ${path}`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Apply failed')
    }
  }

  async function handleAttachContext(path) {
    try {
      await api.post(`/workspaces/${id}/context/attach`, { path })
      flash(`Attached ${path} to AI context`)
      setContextVersion((v) => v + 1)
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to attach context')
    }
  }

  async function commit(e) {
    e.preventDefault()
    if (!commitMsg.trim()) return
    setBusy(true)
    try {
      await api.post(`/workspaces/${id}/commit`, { message: commitMsg })
      setCommitMsg('')
      flash('Committed successfully.')
    } catch (err) {
      flash(err.response?.data?.detail || 'Commit failed')
    } finally {
      setBusy(false)
    }
  }

  async function pushAndOpenPR() {
    if (!window.confirm('Push commits and open a Pull Request?')) return
    setBusy(true)
    try {
      const { data } = await api.post(`/workspaces/${id}/push-pr`)
      if (data.github_pr_url === 'error:missing_token') {
        flash('Code pushed successfully! (PR skipped: Admin token needed)')
      } else {
        setPr(data)
        flash('Pushed and opened a PR.')
      }
    } catch (err) {
      flash(err.response?.data?.detail || 'Push / PR failed')
    } finally {
      setBusy(false)
    }
  }

  async function syncWorkspace() {
    setBusy(true)
    try {
      const { data } = await api.post(`/workspaces/${id}/sync`)
      if (data.status === 'conflict') {
        setConflicts(data.conflicts || [])
        flash('Merge conflicts detected! Please resolve them.')
      } else {
        setConflicts([])
        flash('Synced perfectly with main!')
      }
      await loadTree()
    } catch (err) {
      flash(err.response?.data?.detail || 'Merge conflict or sync failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleAbortMerge() {
    setBusy(true)
    try {
      await api.post(`/workspaces/${id}/abort-merge`)
      setConflicts([])
      flash('Merge aborted')
      await loadTree()
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to abort merge')
    } finally {
      setBusy(false)
    }
  }

  async function handleCompleteMerge() {
    setBusy(true)
    try {
      await api.post(`/workspaces/${id}/complete-merge`)
      setConflicts([])
      flash('Merge completed successfully!')
      await loadTree()
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to complete merge')
    } finally {
      setBusy(false)
    }
  }

  async function handleResetWorkspace() {
    if (!window.confirm('Reset workspace to clean HEAD? All uncommitted and untracked changes will be lost.')) {
      return
    }
    setBusy(true)
    try {
      await api.post(`/workspaces/${id}/reset`)
      setConflicts([])
      setDirtyFiles({})
      flash('Workspace reset to clean HEAD')
      await loadTree()
    } catch (err) {
      flash(err.response?.data?.detail || 'Failed to reset workspace')
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) return <div className="p-8 text-dust text-sm">Loading workspace…</div>

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top Navbar */}
      <div className="border-b border-bench-800 px-6 py-3 flex items-center justify-between gap-4 shrink-0 bg-bench-950">
        <div className="min-w-0">
          <div className="text-xs text-dust font-mono truncate">{workspace.branch_name}</div>
          <h1 className="font-medium truncate text-paper">{task?.title}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {notice && <span className="text-xs text-brass font-mono animate-pulse">{notice}</span>}
          {pr && (
            <a
              href={pr.github_pr_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-blueprint hover:text-paper"
            >
              PR #{pr.github_pr_number} <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <form onSubmit={commit} className="flex items-center gap-1">
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message"
              className="bg-bench-900 border border-bench-800 rounded px-2 py-1.5 text-xs w-44 text-paper placeholder:text-bench-600 outline-none focus:border-bench-700"
            />
            <button
              disabled={busy}
              className="flex items-center gap-1 text-xs border border-bench-800 hover:border-bench-700 px-2.5 py-1.5 rounded disabled:opacity-50 text-paper transition-colors"
            >
              <GitCommit className="w-3.5 h-3.5" /> Commit
            </button>
          </form>
          <button
            onClick={pushAndOpenPR}
            disabled={busy}
            className="flex items-center gap-1 text-xs bg-brass hover:bg-brass/90 disabled:opacity-50 text-bench-950 font-medium px-3 py-1.5 rounded transition-colors"
          >
            <GitPullRequest className="w-3.5 h-3.5" /> Push & open PR
          </button>
          <button
            data-reset-btn
            onClick={handleResetWorkspace}
            disabled={busy}
            className="flex items-center gap-1 text-xs border border-bench-800 hover:border-red-500/50 hover:text-red-400 disabled:opacity-50 px-2.5 py-1.5 rounded text-paper transition-colors"
            title="Discard untracked & uncommitted changes (git reset --hard)"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            data-sync-btn
            onClick={syncWorkspace}
            disabled={busy}
            className="flex items-center gap-1 text-xs border border-bench-800 hover:border-bench-700 disabled:opacity-50 px-3 py-1.5 rounded text-paper transition-colors"
            title="Pull completed dependencies from main"
          >
            <Download className="w-3.5 h-3.5" /> Sync from main
          </button>
        </div>
      </div>

      {/* Conflict Banner */}
      {conflicts.length > 0 && (
        <div
          data-conflict-banner
          className="bg-amber-950/90 border-b border-amber-600/50 px-6 py-2.5 flex items-center justify-between gap-4 text-xs shrink-0 text-amber-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold uppercase tracking-wider text-amber-400">Merge Conflicts Detected:</span>
            <span>Please resolve conflict markers in: <strong className="font-mono text-paper">{conflicts.join(', ')}</strong></span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              data-abort-merge-btn
              onClick={handleAbortMerge}
              disabled={busy}
              className="border border-amber-600/60 hover:bg-amber-900/40 text-amber-200 px-3 py-1 rounded transition-colors font-medium"
            >
              Abort Merge
            </button>
            <button
              data-complete-merge-btn
              onClick={handleCompleteMerge}
              disabled={busy}
              className="bg-amber-500 hover:bg-amber-400 text-bench-950 px-3 py-1 rounded font-medium transition-colors"
            >
              Complete Merge
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0">
        {/* Left: File Tree */}
        <div className="w-60 border-r border-bench-800 overflow-y-auto bg-bench-950 shrink-0">
          <FileTree
            nodes={tree}
            activePath={activePath}
            onSelect={openFile}
            onRefresh={loadTree}
            refreshing={refreshingTree}
            onCreateFile={handleCreateFile}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onAttachContext={handleAttachContext}
          />
        </div>

        {/* Center: Multi-Tab Code Editor */}
        <div className="flex-1 min-w-0 flex flex-col bg-bench-950">
          {/* Tabs Bar */}
          <div className="flex items-center justify-between border-b border-bench-800 bg-bench-950/80 px-2 shrink-0 h-9">
            <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1 scrollbar-none">
              {openTabs.map((tabPath) => {
                const isActive = tabPath === activePath
                const isDirty = dirtyFiles[tabPath]
                const baseName = tabPath.split('/').pop()
                return (
                  <div
                    key={tabPath}
                    onClick={() => setActivePath(tabPath)}
                    title={tabPath}
                    className={`group flex items-center gap-2 px-3 py-1.5 text-xs font-mono cursor-pointer border-t-2 select-none shrink-0 transition-colors ${
                      isActive
                        ? 'border-t-brass bg-bench-900 text-paper font-medium'
                        : 'border-t-transparent text-dust hover:text-paper hover:bg-bench-900/40'
                    }`}
                  >
                    <span className="truncate max-w-[140px]">{baseName}</span>
                    {isDirty ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-brass shrink-0" title="Unsaved changes" />
                    ) : null}
                    <button
                      onClick={(e) => handleCloseTab(tabPath, e)}
                      className="p-0.5 text-dust hover:text-red-400 rounded transition-colors opacity-60 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
              {openTabs.length === 0 && (
                <span className="text-xs text-bench-600 px-2 font-mono select-none">No tabs open</span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 pl-2">
              <button
                data-open-terminal-btn
                onClick={() => setIsTerminalOpen((v) => !v)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors ${
                  isTerminalOpen
                    ? 'bg-brass/20 text-brass border border-brass/40 font-medium'
                    : 'text-dust hover:text-paper hover:bg-bench-900'
                }`}
                title="Toggle In-Workspace Test Runner (Terminal)"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Tests</span>
              </button>

              {activePath && (
                <button
                  onClick={saveActiveFile}
                  title="Save (Ctrl+S)"
                  className="flex items-center gap-1 text-xs text-brass hover:text-paper px-2 py-1 rounded hover:bg-bench-900 transition-colors"
                >
                  <Save className="w-3 h-3" /> Save
                </button>
              )}
              {openTabs.length > 1 && (
                <button
                  onClick={handleCloseAllTabs}
                  className="text-[11px] text-dust hover:text-paper px-1.5 py-0.5 rounded hover:bg-bench-900 transition-colors"
                >
                  Close all
                </button>
              )}
            </div>
          </div>

          {/* Editor & Terminal Container */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0">
              <CodeEditor
                path={activePath}
                value={activePath ? fileContents[activePath] ?? '' : ''}
                onChange={(newVal) => {
                  if (!activePath) return
                  setFileContents((prev) => ({ ...prev, [activePath]: newVal }))
                  setDirtyFiles((prev) => ({ ...prev, [activePath]: true }))
                }}
                onSave={saveActiveFile}
              />
            </div>
            <TerminalDrawer
              workspaceId={id}
              activeFilePath={activePath}
              isOpen={isTerminalOpen}
              onClose={() => setIsTerminalOpen(false)}
              onSendTracebackToAi={(text) => {
                setChatPrefill(text)
              }}
            />
          </div>
        </div>

        {/* Right: AI Assistant */}
        <div className="w-96 border-l border-bench-800 flex flex-col min-h-0 shrink-0 bg-bench-950">
          <ChatPanel
            workspaceId={id}
            activeFilePath={activePath}
            onApplyEdit={handleApplyEdit}
            contextVersion={contextVersion}
            prefillInput={chatPrefill}
          />
        </div>
      </div>
    </div>
  )
}
