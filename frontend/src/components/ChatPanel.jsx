import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api, { streamChat } from '../api'
import { Send, Paperclip, Check, X, Eye, Trash2 } from 'lucide-react'
import DiffModal from './DiffModal'
import HighlightedCode from './HighlightedCode'
import { languageFor } from './Editor'

const FILE_BLOCK_RE = /<<<FILE:\s*([^\n>]+?)\s*>>>\n(.*?)\n<<<END FILE>>>/gs

function parseFileBlocks(text) {
  const blocks = []
  let m
  while ((m = FILE_BLOCK_RE.exec(text)) !== null) {
    blocks.push({ path: m[1].trim(), content: m[2] })
  }
  FILE_BLOCK_RE.lastIndex = 0
  return blocks
}

export default function ChatPanel({
  workspaceId,
  activeFilePath,
  onApplyEdit,
  contextVersion,
  prefillInput,
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')

  useEffect(() => {
    if (prefillInput) {
      setInput(prefillInput)
    }
  }, [prefillInput])
  const [model, setModel] = useState('workbench-local')
  const [customModel, setCustomModel] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [applied, setApplied] = useState({})
  const [attachedNotice, setAttachedNotice] = useState('')
  const bottomRef = useRef(null)

  const [hasKey, setHasKey] = useState(null)
  const [contexts, setContexts] = useState([])
  const [diffPreview, setDiffPreview] = useState(null)
  const [modelOptions, setModelOptions] = useState([
    { value: 'workbench-local', label: 'Workbench Built-in Assistant (Local)' },
  ])
  const [loadingModels, setLoadingModels] = useState(false)
  const [inspectData, setInspectData] = useState(null)
  const [inspecting, setInspecting] = useState(false)

  const loadContexts = () => {
    api.get(`/workspaces/${workspaceId}/context`).then((r) => setContexts(r.data)).catch(() => {})
  }

  useEffect(() => {
    let isMounted = true
    setLoadingModels(true)
    Promise.all([
      api.get('/users/me/openrouter-key/status').catch(() => ({ data: { has_key: false } })),
      api.get('/users/me/openrouter-models').catch(() => ({
        data: [{ id: 'workbench-local', name: 'Workbench Built-in Assistant (Local)' }],
      })),
    ])
      .then(([keyRes, modelsRes]) => {
        if (!isMounted) return
        const keyPresent = Boolean(keyRes.data?.has_key)
        setHasKey(keyPresent)
        const fetchedModels = modelsRes.data || []
        const opts = fetchedModels.map((m) => ({ value: m.id, label: m.name }))
        if (keyPresent) {
          opts.push({ value: 'custom', label: 'Custom model slug…' })
        }
        if (opts.length > 0) {
          setModelOptions(opts)
          setModel(opts[0].value)
        }
      })
      .finally(() => {
        if (isMounted) setLoadingModels(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    loadContexts()
  }, [contextVersion, workspaceId])

  useEffect(() => {
    api
      .get(`/workspaces/${workspaceId}/chat`)
      .then((r) => {
        const msgs = r.data.map((m) => ({
          ...m,
          proposed_edits: m.role === 'assistant' ? parseFileBlocks(m.content) : [],
        }))
        setMessages(msgs)
      })
      .catch(() => {})
  }, [workspaceId])

  async function handleOpenInspectModal() {
    try {
      setInspecting(true)
      const { data } = await api.get(`/workspaces/${workspaceId}/context/inspect`)
      setInspectData(data)
    } catch {
      alert('Failed to inspect context bundle.')
    } finally {
      setInspecting(false)
    }
  }

  async function handleClearChat() {
    if (!window.confirm('Clear all chat messages in this workspace?')) return
    try {
      await api.delete(`/workspaces/${workspaceId}/chat`)
      setMessages([])
    } catch {
      alert('Failed to clear chat history.')
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function attachActiveFile() {
    if (!activeFilePath) return
    try {
      await api.post(`/workspaces/${workspaceId}/context/attach`, { path: activeFilePath })
      setAttachedNotice(`Attached ${activeFilePath} as context`)
      loadContexts()
    } catch {
      setAttachedNotice('Failed to attach file')
    }
    setTimeout(() => setAttachedNotice(''), 2500)
  }

  async function removeContext(id) {
    try {
      await api.delete(`/workspaces/${workspaceId}/context/${id}`)
      loadContexts()
    } catch {
      setAttachedNotice('Failed to remove context')
      setTimeout(() => setAttachedNotice(''), 2500)
    }
  }

  async function send() {
    if (!input.trim() || streaming || loadingModels) return
    const modelToUse = model === 'custom' ? customModel.trim() : model
    if (!modelToUse) {
      alert("Please enter a custom model slug or select a model.")
      return
    }

    const userText = input
    setMessages((m) => [
      ...m,
      { role: 'user', content: userText, id: `local-${Date.now()}` },
      { role: 'assistant', content: '', id: 'streaming', proposed_edits: [] },
    ])
    setInput('')
    setStreaming(true)

    await streamChat(
      workspaceId,
      { message: userText, model: modelToUse },
      (delta) =>
        setMessages((m) => {
          const copy = [...m]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, content: last.content + delta }
          return copy
        }),
      (final) => {
        setMessages((m) => {
          const copy = [...m]
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            id: final.message_id,
            proposed_edits: final.proposed_edits || [],
          }
          return copy
        })
        setStreaming(false)
      },
      (err) => {
        setMessages((m) => {
          const copy = [...m]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, content: last.content + `\n\n[${err}]` }
          return copy
        })
        setStreaming(false)
      }
    )
  }

  async function previewAndApply(msgId, block) {
    try {
      const { data } = await api.get(`/workspaces/${workspaceId}/files`, { params: { path: block.path } })
      setDiffPreview({
        msgId,
        block,
        originalContent: data.content,
        proposedContent: block.content,
        path: block.path,
      })
    } catch {
      // If file doesn't exist yet, original is empty
      setDiffPreview({
        msgId,
        block,
        originalContent: '',
        proposedContent: block.content,
        path: block.path,
      })
    }
  }

  async function confirmApply() {
    if (!diffPreview) return
    const { msgId, block } = diffPreview
    await onApplyEdit(block.path, block.content)
    setApplied((a) => ({ ...a, [`${msgId}:${block.path}`]: true }))
    setDiffPreview(null)
  }

  function renderContent(text) {
    if (!text) return null
    const parts = text.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const match = part.match(/```(\w+)?\n([\s\S]*?)```/)
        if (match) {
          const [, lang, code] = match
          return <HighlightedCode key={i} code={code} language={lang} />
        }
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="flex flex-col h-full bg-bench-900">
      {/* Header bar: Model selection, Inspect Context, and Clear Chat */}
      <div className="px-3 py-2 border-b border-bench-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <select
            data-model-select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loadingModels}
            className="flex-1 bg-bench-950 border border-bench-800 px-2 py-1 text-xs text-paper rounded max-w-xs truncate outline-none"
          >
            {loadingModels ? (
              <option value="workbench-local">Loading available models...</option>
            ) : (
              modelOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            )}
          </select>
          {model === 'custom' && (
            <input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="vendor/model-slug"
              className="w-28 bg-bench-950 border border-bench-800 px-2 py-1 text-xs font-mono rounded text-paper"
            />
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            data-inspect-context-btn
            onClick={handleOpenInspectModal}
            disabled={inspecting}
            title="Inspect Context Bundle & System Prompt"
            className="flex items-center gap-1 px-2 py-1 text-xs bg-bench-950 hover:bg-bench-800 border border-bench-800 text-dust hover:text-paper rounded transition-colors disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5 text-blueprint" />
            <span className="hidden sm:inline">Context</span>
          </button>
          <button
            data-clear-chat-btn
            onClick={handleClearChat}
            disabled={streaming || messages.length === 0}
            title="Clear Chat Conversation"
            className="p-1 text-dust hover:text-red-400 hover:bg-bench-800 border border-bench-800 rounded disabled:opacity-30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && (
          <p className="text-xs text-dust leading-relaxed">
            Ask for help implementing this task. Responses may propose file edits you can review and apply.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <div className="text-[11px] text-dust mb-1">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-paper">
              {m.content ? renderContent(m.content) : (streaming && m.id === 'streaming' ? '…' : '')}
            </div>
            {(m.proposed_edits || []).map((block, i) => (
              <div key={i} className="mt-2 border border-bench-800 rounded overflow-hidden">
                <div className="flex items-center justify-between bg-bench-950 px-2 py-1 text-xs">
                  <span className="text-dust font-mono truncate">{block.path}</span>
                  <button
                    data-preview-apply-btn
                    onClick={() => previewAndApply(m.id, block)}
                    className="flex items-center gap-1 text-brass hover:text-paper font-medium"
                  >
                    {applied[`${m.id}:${block.path}`] ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" /> Applied
                      </>
                    ) : (
                      'Apply'
                    )}
                  </button>
                </div>
                <HighlightedCode code={block.content} language={languageFor(block.path)} />
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Attached Contexts and Chat Input Area */}
      <div className="border-t border-bench-800 p-2 space-y-1.5">
        <div className="flex flex-wrap gap-1">
          {contexts.map((ctx) => (
            <div key={ctx.id} className="flex items-center gap-1 bg-bench-950 border border-bench-800 px-1.5 py-0.5 rounded text-[10px] text-dust">
              <span className="truncate max-w-[160px]">{ctx.source_path}</span>
              <button onClick={() => removeContext(ctx.id)} className="hover:text-brass">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        {activeFilePath && (
          <button onClick={attachActiveFile} className="flex items-center gap-1 text-[11px] text-dust hover:text-paper">
            <Paperclip className="w-3 h-3 text-brass" /> Attach {activeFilePath} as context
          </button>
        )}
        {attachedNotice && <div className="text-[11px] text-moss font-mono">{attachedNotice}</div>}

        {!hasKey && model !== 'workbench-local' ? (
          <div className="flex flex-col items-center justify-center p-3 bg-bench-950 border border-bench-800 rounded text-center">
            <span className="text-xs text-dust mb-1">
              ⚠️ Cloud models require an OpenRouter API key.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModel('workbench-local')}
                className="text-xs text-brass hover:text-paper underline"
              >
                Use Built-in Assistant
              </button>
              <span className="text-dust text-xs">•</span>
              <Link to="/settings" className="text-xs text-dust hover:text-paper underline">
                Settings
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <textarea
              data-chat-input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loadingModels || streaming}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={2}
              placeholder={loadingModels ? 'Loading models...' : 'Ask the AI to generate or edit code…'}
              className="flex-1 bg-bench-950 border border-bench-800 px-2 py-1.5 text-sm resize-none rounded focus:outline-none focus:border-brass disabled:opacity-50 text-paper placeholder:text-dust/60"
            />
            <button
              data-chat-send-btn
              onClick={send}
              disabled={streaming || loadingModels || !input.trim()}
              className="self-end bg-brass hover:bg-brass/90 disabled:opacity-40 text-bench-950 p-2 rounded transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Diff Review Modal */}
      {diffPreview && (
        <DiffModal
          originalContent={diffPreview.originalContent}
          proposedContent={diffPreview.proposedContent}
          path={diffPreview.path}
          onCancel={() => setDiffPreview(null)}
          onAccept={confirmApply}
        />
      )}

      {/* Context Inspector Modal */}
      {inspectData && (
        <div data-context-inspect-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="bg-bench-950 border border-bench-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-bench-800 bg-bench-900 shrink-0">
              <div>
                <h3 className="font-semibold text-paper text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blueprint" /> AI Context Inspector
                </h3>
                <p className="text-xs text-dust mt-0.5">
                  Review the exact bundle, attached files, and tokens delivered to the model
                </p>
              </div>
              <button
                data-close-inspect-btn
                onClick={() => setInspectData(null)}
                className="text-dust hover:text-paper p-1 rounded hover:bg-bench-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Metadata Stats */}
            <div className="px-4 py-2.5 bg-bench-900/40 border-b border-bench-800/80 flex flex-wrap items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-dust">Task: </span>
                <span data-inspect-task-title className="text-paper font-medium">{inspectData.task_title || 'N/A'}</span>
                {inspectData.task_track && (
                  <span data-inspect-task-track className="ml-1.5 px-1.5 py-0.5 rounded bg-bench-800 text-brass text-[10px]">
                    {inspectData.task_track}
                  </span>
                )}
              </div>
              <div>
                <span className="text-dust">Est. Tokens: </span>
                <span data-inspect-tokens className="text-emerald-400 font-bold">~{inspectData.estimated_tokens}</span>
              </div>
              <div>
                <span className="text-dust">Chars: </span>
                <span className="text-paper">{inspectData.total_characters}</span>
              </div>
            </div>

            {/* Attached Files & Sources */}
            <div className="px-4 py-2 bg-bench-950 border-b border-bench-800/60 flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-dust text-[11px] font-semibold shrink-0">SOURCES:</span>
              {inspectData.sources?.length === 0 ? (
                <span className="text-bench-600 text-xs italic">No attached files</span>
              ) : (
                inspectData.sources?.map((src, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-bench-900 border border-bench-800 text-brass text-[11px] font-mono shrink-0">
                    {src}
                  </span>
                ))
              )}
            </div>

            {/* Full Bundle Content */}
            <div className="flex-1 min-h-0 p-4 overflow-y-auto bg-[#181818]">
              <pre data-inspect-bundle className="font-mono text-xs text-dust whitespace-pre-wrap leading-relaxed select-text">
                {inspectData.bundle}
              </pre>
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-bench-800 bg-bench-900 flex justify-end shrink-0">
              <button
                data-close-inspect-btn
                onClick={() => setInspectData(null)}
                className="px-4 py-1 text-xs bg-bench-800 hover:bg-bench-700 text-paper font-medium rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
