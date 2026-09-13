import Editor from '@monaco-editor/react'

const EXT_LANGUAGE_MAP = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  css: 'css',
  html: 'html',
  sh: 'shell',
  sql: 'sql',
  toml: 'ini',
  env: 'ini',
}

export function languageFor(path) {
  if (!path) return 'plaintext'
  const ext = path.split('.').pop()
  return EXT_LANGUAGE_MAP[ext] || 'plaintext'
}

export default function CodeEditor({ path, value, onChange, onSave }) {
  if (!path) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-dust text-sm bg-bench-950 select-none">
        <p className="text-bench-500 font-mono text-xs">No file open</p>
        <p className="text-bench-600 text-xs mt-1">Select a file from the workspace tree on the left</p>
      </div>
    )
  }

  function handleEditorDidMount(editor, monaco) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.()
    })
  }

  return (
    <Editor
      height="100%"
      theme="vs-dark"
      path={path}
      language={languageFor(path)}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleEditorDidMount}
      options={{
        fontSize: 13,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
        renderWhitespace: 'selection',
      }}
    />
  )
}
