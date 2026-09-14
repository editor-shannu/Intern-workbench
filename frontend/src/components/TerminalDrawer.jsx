import { useState, useRef, useEffect } from 'react'
import api from '../api'
import { Terminal, Play, CheckCircle2, AlertCircle, X, Trash2, Sparkles, ChevronUp, ChevronDown } from 'lucide-react'

const COMMAND_PRESETS = [
  { value: 'pytest', label: 'pytest (All Tests)' },
  { value: 'pytest -v', label: 'pytest -v (Verbose)' },
  { value: 'python -m unittest', label: 'python -m unittest' },
]

export default function TerminalDrawer({
  workspaceId,
  activeFilePath,
  isOpen,
  onClose,
  onSendTracebackToAi,
}) {
  const [command, setCommand] = useState('pytest')
  const [output, setOutput] = useState('')
  const [lastResult, setLastResult] = useState(null) // { exit_code, passed, duration_ms, command }
  const [running, setRunning] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const consoleRef = useRef(null)

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [output])

  async function handleRunTests() {
    if (running) return
    setRunning(true)
    const activeCommand = command === 'active_file' ? `python ${activeFilePath}` : command

    setOutput((prev) => `${prev ? prev + '\n' : ''}\u001b[36m$ ${activeCommand}\u001b[0m\nExecuting tests in isolated worktree environment...\n`)

    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/run-tests`, {
        command: activeCommand,
      })
      setLastResult(data)

      const formattedOutput = data.stdout + (data.stderr ? `\n--- STDERR ---\n${data.stderr}` : '')
      setOutput((prev) => `${prev}${formattedOutput}\n[Process finished with exit code ${data.exit_code} (${data.duration_ms}ms)]\n`)
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || 'Execution error'
      setLastResult({ exit_code: 1, passed: false, duration_ms: 0, command: activeCommand })
      setOutput((prev) => `${prev}ERROR: ${errMsg}\n[Process finished with exit code 1]\n`)
    } finally {
      setRunning(false)
    }
  }

  function handleSendToAi() {
    if (!lastResult || lastResult.passed) return
    const contextText = `The test run \`${lastResult.command}\` failed with exit code ${lastResult.exit_code}.\nOutput traceback:\n\`\`\`\n${output.slice(-2000)}\n\`\`\`\nPlease help me identify and fix this failure.`
    onSendTracebackToAi(contextText)
  }

  if (!isOpen) return null

  return (
    <div
      data-terminal-drawer
      className={`border-t border-bench-800 bg-[#121212] flex flex-col transition-all duration-200 shrink-0 ${
        isExpanded ? 'h-96' : 'h-64'
      }`}
    >
      {/* Top Controls Bar */}
      <div className="px-4 py-2 border-b border-bench-800/80 bg-bench-950 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 select-none">
        {/* Left: Title & Command Selector */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Terminal className="w-4 h-4 text-brass shrink-0" />
          <span className="font-semibold text-paper text-xs uppercase tracking-wider hidden sm:inline">
            Test Runner
          </span>

          <select
            data-test-command-select
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={running}
            className="bg-bench-900 border border-bench-800 text-paper rounded px-2 py-1 text-xs outline-none focus:border-brass max-w-xs font-mono"
          >
            {COMMAND_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            {activeFilePath && activeFilePath.endsWith('.py') && (
              <option value="active_file">python {activeFilePath}</option>
            )}
          </select>

          <button
            data-run-tests-btn
            onClick={handleRunTests}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1 bg-brass hover:bg-brass/90 disabled:opacity-40 text-bench-950 font-bold rounded transition-colors"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${running ? 'animate-spin' : ''}`} />
            <span>{running ? 'Running…' : 'Run'}</span>
          </button>
        </div>

        {/* Center / Right: Result Status Badge & AI Pipe */}
        <div className="flex items-center gap-2 shrink-0">
          {running && (
            <span
              data-test-status-badge
              className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950/60 border border-amber-800 text-amber-300 animate-pulse"
            >
              RUNNING…
            </span>
          )}

          {!running && lastResult && (
            <div className="flex items-center gap-2">
              <span
                data-test-status-badge
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                  lastResult.passed
                    ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-400'
                    : 'bg-red-950/70 border border-red-800 text-red-300'
                }`}
              >
                {lastResult.passed ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    PASS (Exit 0)
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-red-400" />
                    FAIL (Exit {lastResult.exit_code})
                  </>
                )}
              </span>
              <span className="text-[10px] text-dust font-mono">{lastResult.duration_ms}ms</span>

              {!lastResult.passed && onSendTracebackToAi && (
                <button
                  data-send-to-ai-btn
                  onClick={handleSendToAi}
                  className="flex items-center gap-1 px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-bench-950 font-semibold text-[11px] rounded transition-colors shadow-sm"
                  title="Pipe failing traceback into AI Assistant prompt"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Fix with AI</span>
                </button>
              )}
            </div>
          )}

          {/* Utility Buttons */}
          <button
            data-clear-terminal-btn
            onClick={() => {
              setOutput('')
              setLastResult(null)
            }}
            disabled={!output}
            className="p-1 text-dust hover:text-paper rounded hover:bg-bench-800 transition-colors disabled:opacity-30"
            title="Clear terminal output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsExpanded((e) => !e)}
            className="p-1 text-dust hover:text-paper rounded hover:bg-bench-800 transition-colors"
            title={isExpanded ? 'Minimize drawer' : 'Expand drawer'}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          <button
            data-close-terminal-btn
            onClick={onClose}
            className="p-1 text-dust hover:text-paper rounded hover:bg-bench-800 transition-colors"
            title="Close terminal drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Console Viewport */}
      <div ref={consoleRef} className="flex-1 min-h-0 p-3 overflow-y-auto font-mono text-xs select-text">
        {!output ? (
          <div className="text-bench-600 italic select-none">
            Ready to execute test suites. Select a test command above and click "Run".
          </div>
        ) : (
          <pre
            data-terminal-output
            className="font-mono text-paper whitespace-pre-wrap leading-relaxed break-words"
          >
            {output}
          </pre>
        )}
      </div>
    </div>
  )
}
