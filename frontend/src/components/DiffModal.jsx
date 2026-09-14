import { DiffEditor } from '@monaco-editor/react'
import { languageFor } from './Editor'
import { X, Check } from 'lucide-react'

export default function DiffModal({ originalContent, proposedContent, path, onCancel, onAccept }) {
  return (
    <div data-diff-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div className="bg-bench-950 border border-bench-800 rounded-lg shadow-xl w-full max-w-6xl h-full max-h-[85vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bench-800 bg-bench-900 shrink-0">
          <div>
            <h3 className="font-medium text-paper text-sm">Review Changes</h3>
            <div className="text-xs text-dust font-mono mt-0.5">{path}</div>
          </div>
          <button data-cancel-diff-btn onClick={onCancel} className="text-dust hover:text-paper p-1 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 bg-[#1e1e1e]">
          <DiffEditor
            height="100%"
            theme="vs-dark"
            language={languageFor(path)}
            original={originalContent || ''}
            modified={proposedContent || ''}
            options={{
              fontSize: 13,
              fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
              minimap: { enabled: false },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              readOnly: true,
              renderSideBySide: true,
            }}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-bench-800 bg-bench-900 flex justify-end gap-3 shrink-0">
          <button
            data-cancel-diff-btn
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-dust hover:text-paper hover:bg-bench-800 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            data-apply-diff-btn
            onClick={onAccept}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-moss hover:bg-moss/90 text-bench-950 font-medium rounded transition-colors"
          >
            <Check className="w-4 h-4" />
            Accept & Apply
          </button>
        </div>
      </div>
    </div>
  )
}
