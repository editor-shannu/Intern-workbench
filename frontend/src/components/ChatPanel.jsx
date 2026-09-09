import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api, { streamChat } from '../api'
import { Send, Paperclip, Check, X } from 'lucide-react'
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

export default function ChatPanel({ workspaceId, activeFilePath, onApplyEdit }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState('custom')
  const [customModel, setCustomModel] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [applied, setApplied] = useState({})
  const [attachedNotice, setAttachedNotice] = useState('')
  const bottomRef = useRef(null)

  const [hasKey, setHasKey] = useState(null)
  const [contexts, setContexts] = useState([])
  const [diffPreview, setDiffPreview] = useState(null)
  const [modelOptions, setModelOptions] = useState([{ value: 'custom', label: 'Custom model slug…' }])
  const [loadingModels, setLoadingModels] = useState(false)

  const loadContexts = () => {
    api.get(`/workspaces/${workspaceId}/context`).then((r) => setContexts(r.data)).catch(() => {})
  }

  useEffect(() => {
    let isMounted = true;
    api.get('/users/me/openrouter-key/status')
      .then((r) => {
        if (!isMounted) return;
        setHasKey(r.data.has_key)
        if (r.data.has_key) {
          setLoadingModels(true)
          api.get('/users/me/openrouter-models')
            .then(res => {
              if (!isMounted) return;
              const opts = res.data.map(m => ({ value: m.id, label: m.name }))
              opts.push({ value: 'custom', label: 'Custom model slug…' })
              setModelOptions(opts)
              if (opts.length > 1) {
                setModel(opts[0].value)
              }
            })
            .catch(() => {})
            .finally(() => {
              if (isMounted) setLoadingModels(false);
            })
        }
      })
      .catch(() => {
        if (isMounted) setHasKey(false);
      })
      
    return () => { isMounted = false; }
  }, [])

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/chat`)
      .then((r) => {
        const msgs = r.data.map((m) => ({
          ...m,
          proposed_edits: m.role === 'assistant' ? parseFileBlocks(m.content) : [],
        }))
        setMessages(msgs)
      })
      .catch(() => {})
    loadContexts()
  }, [workspaceId])

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
      <div className="px-3 py-2 border-b border-bench-800 flex items-center gap-2">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={loadingModels}
          className="flex-1 bg-bench-950 border border-bench-800 px-2 py-1.5 text-xs text-paper rounded max-w-sm truncate"
        >
          {loadingModels ? (
            <option value="custom">Loading available models...</option>
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
            className="w-32 bg-bench-950 border border-bench-800 px-2 py-1.5 text-xs font-mono rounded"
          />
        )}
      </div>

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
              <div key={i} className="mt-2 border border-bench-800">
                <div className="flex items-center justify-between bg-bench-950 px-2 py-1 text-xs">
                  <span className="text-dust font-mono">{block.path}</span>
                  <button
                    onClick={() => previewAndApply(m.id, block)}
                    className="flex items-center gap-1 text-brass hover:text-paper"
                  >
                    {applied[`${m.id}:${block.path}`] ? (
                      <>
                        <Check className="w-3 h-3" /> Applied
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

      <div className="border-t border-bench-800 p-2 space-y-1.5">
        <div className="flex flex-wrap gap-1">
          {contexts.map((ctx) => (
            <div key={ctx.id} className="flex items-center gap-1 bg-bench-950 border border-bench-800 px-1.5 py-0.5 rounded text-[10px] text-dust">
              <span>{ctx.source_path}</span>
              <button onClick={() => removeContext(ctx.id)} className="hover:text-brass">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        {activeFilePath && (
          <button onClick={attachActiveFile} className="flex items-center gap-1 text-[11px] text-dust hover:text-paper">
            <Paperclip className="w-3 h-3" /> Attach {activeFilePath} as context
          </button>
        )}
        {attachedNotice && <div className="text-[11px] text-moss">{attachedNotice}</div>}
        {!hasKey ? (
          <div className="flex flex-col items-center justify-center p-4 bg-bench-950 border border-bench-800 rounded text-center">
            <span className="text-sm text-dust mb-2">⚠️ You need to configure an OpenRouter API key before chatting.</span>
            <Link to="/settings" className="text-xs text-brass hover:text-paper underline">Go to Settings</Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <textarea
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
              placeholder={loadingModels ? "Loading models..." : "Ask the AI to generate or edit code…"}
              className="flex-1 bg-bench-950 border border-bench-800 px-2 py-1.5 text-sm resize-none rounded focus:outline-none focus:border-brass disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={streaming || loadingModels}
              className="self-end bg-brass hover:bg-brass/90 disabled:opacity-40 text-bench-950 p-2 rounded"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {diffPreview && (
        <DiffModal
          originalContent={diffPreview.originalContent}
          proposedContent={diffPreview.proposedContent}
          path={diffPreview.path}
          onCancel={() => setDiffPreview(null)}
          onAccept={confirmApply}
        />
      )}
    </div>
  )
}
