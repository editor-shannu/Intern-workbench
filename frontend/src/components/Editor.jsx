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

export default function CodeEditor({ path, value, onChange }) {
  if (!path) {
    return (
      <div className="h-full flex items-center justify-center text-dust text-sm bg-bench-950">
        Select a file to start editing
      </div>
    )
  }
  return (
    <Editor
      height="100%"
      theme="vs-dark"
      path={path}
      language={languageFor(path)}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      options={{
        fontSize: 13,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
      }}
    />
  )
}
