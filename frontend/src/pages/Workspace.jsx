import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'
import FileTree from '../components/FileTree'
import CodeEditor from '../components/Editor'
import ChatPanel from '../components/ChatPanel'
import { GitCommit, GitPullRequest, ExternalLink, Download } from 'lucide-react'

export default function Workspace() {
  const { id } = useParams()
  const [workspace, setWorkspace] = useState(null)
  const [task, setTask] = useState(null)
  const [tree, setTree] = useState([])
  const [activePath, setActivePath] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [pr, setPr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const [refreshingTree, setRefreshingTree] = useState(false)

  const loadTree = useCallback(async () => {
    try {
      setRefreshingTree(true)
      const { data } = await api.get(`/workspaces/${id}/tree`)
      setTree(data)
    } catch {
      // silently ignore — tree will remain stale
    } finally {
      setTimeout(() => setRefreshingTree(false), 500)
    }
  }, [id])

  useEffect(() => {
    api.get(`/workspaces/${id}`).then((r) => {
      setWorkspace(r.data)
      setTask(r.data.task)
      setPr(r.data.pull_request || null)
    })
    loadTree()
  }, [id, loadTree])

  // Lightweight background refresh so a merge picked up by the poller shows here too.
  useEffect(() => {
    const t = setInterval(() => {
      api.get(`/workspaces/${id}`).then((r) => {
        setPr(r.data.pull_request || null)
      }).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [id])

  function flash(text) {
    setNotice(text)
    setTimeout(() => setNotice(''), 3500)
  }

  async function saveFile(path, content) {
    await api.put(`/workspaces/${id}/files`, { path, content })
  }

  async function openFile(path) {
    try {
      if (dirty && activePath) await saveFile(activePath, fileContent)
      const { data } = await api.get(`/workspaces/${id}/files`, { params: { path } })
      setActivePath(path)
      setFileContent(data.content)
      setDirty(false)
    } catch (err) {
      flash(err.response?.data?.detail || 'Could not open file')
    }
  }

  async function handleSaveClick() {
    if (!activePath) return
    try {
      await saveFile(activePath, fileContent)
      setDirty(false)
      flash('Saved.')
    } catch (err) {
      flash(err.response?.data?.detail || 'Save failed')
    }
  }

  async function handleApplyEdit(path, content) {
    try {
      await saveFile(path, content)
      await loadTree()
      if (path === activePath) {
        setFileContent(content)
        setDirty(false)
      }
      flash(`Applied change to ${path}`)
    } catch (err) {
      flash(err.response?.data?.detail || 'Apply failed')
    }
  }

  async function commit(e) {
    e.preventDefault()
    if (!commitMsg.trim()) return
    setBusy(true)
    try {
      await api.post(`/workspaces/${id}/commit`, { message: commitMsg })
      setCommitMsg('')
      flash('Committed.')
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
        flash('Code pushed successfully! (PR skipped: Admin config needed)')
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
      await api.post(`/workspaces/${id}/sync`)
      await loadTree()
      flash('Synced perfectly with main!')
    } catch (err) {
      flash(err.response?.data?.detail || 'Merge conflict or sync failed')
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) return <div className="p-8 text-dust text-sm">Loading workspace…</div>

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="border-b border-bench-800 px-6 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-dust font-mono truncate">{workspace.branch_name}</div>
          <h1 className="font-medium truncate">{task?.title}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {notice && <span className="text-xs text-dust">{notice}</span>}
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
              className="bg-bench-950 border border-bench-800 rounded px-2 py-1.5 text-xs w-44"
            />
            <button
              disabled={busy}
              className="flex items-center gap-1 text-xs border border-bench-800 hover:border-bench-700 px-2 py-1.5 rounded disabled:opacity-50"
            >
              <GitCommit className="w-3.5 h-3.5" /> Commit
            </button>
          </form>
          <button
            onClick={pushAndOpenPR}
            disabled={busy}
            className="flex items-center gap-1 text-xs bg-brass hover:bg-brass/90 disabled:opacity-50 text-bench-950 font-medium px-3 py-1.5 rounded"
          >
            <GitPullRequest className="w-3.5 h-3.5" /> Push & open PR
          </button>
          <button
            onClick={syncWorkspace}
            disabled={busy}
            className="flex items-center gap-1 text-xs border border-bench-800 hover:border-bench-700 disabled:opacity-50 px-3 py-1.5 rounded"
            title="Pull completed dependencies from main"
          >
            <Download className="w-3.5 h-3.5" /> Sync from main
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-56 border-r border-bench-800 overflow-y-auto bg-bench-950 shrink-0">
          <FileTree nodes={tree} activePath={activePath} onSelect={openFile} onRefresh={loadTree} refreshing={refreshingTree} />
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-3 py-1.5 border-b border-bench-800 text-xs text-dust flex items-center justify-between shrink-0">
            <span className="font-mono truncate">
              {activePath || 'No file open'}
              {dirty ? ' •' : ''}
            </span>
            {activePath && (
              <button onClick={handleSaveClick} className="text-brass hover:text-paper">
                Save
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <CodeEditor
              path={activePath}
              value={fileContent}
              onChange={(v) => {
                setFileContent(v)
                setDirty(true)
              }}
            />
          </div>
        </div>

        <div className="w-96 border-l border-bench-800 flex flex-col min-h-0 shrink-0">
          <ChatPanel workspaceId={id} activeFilePath={activePath} onApplyEdit={handleApplyEdit} />
        </div>
      </div>
    </div>
  )
}
