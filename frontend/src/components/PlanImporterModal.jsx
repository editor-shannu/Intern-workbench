import { useState } from 'react'
import api from '../api'
import { X, Upload, FileText, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { TRACK_LABELS } from './StatusTag'

const SAMPLE_PLAN = `# Conversion Project Plan
Repo: https://github.com/example/sample-repo
Branch: main

## Milestone 1: Database & Core Setup
### [full-stack] Initialize Database Models
TaskID: db-models
AssignTo: intern1@example.com
Create the core SQLAlchemy models and migrations for the project.

### [data] Data Ingestion Pipeline
TaskID: data-pipeline
DependsOn: db-models
AssignTo: intern1@example.com
Build ingestion pipeline for incoming client analytics datasets.

## Milestone 2: Intelligent Assistant
### [ai-ml] Train Classifier Model
TaskID: ai-classifier
DependsOn: data-pipeline
Train and evaluate fine-tuned task classification model.
`

export default function PlanImporterModal({ onClose, onImportSuccess }) {
  const [markdown, setMarkdown] = useState(SAMPLE_PLAN)
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('text') // 'text' | 'file'

  async function handleFileSelected(file) {
    if (!file) return
    try {
      const text = await file.text()
      setMarkdown(text)
      generatePreview(text)
    } catch {
      setError('Could not read selected file.')
    }
  }

  async function generatePreview(textToPreview = markdown) {
    if (!textToPreview.trim()) return
    setError('')
    setLoadingPreview(true)
    try {
      const { data } = await api.post('/admin/plan/preview', { markdown: textToPreview })
      setPreview(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to parse plan preview.')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleConfirmImport() {
    if (!markdown.trim()) return
    setError('')
    setImporting(true)
    try {
      const { data } = await api.post('/project-plans/import', { markdown })
      onImportSuccess(data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to import project plan.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      data-plan-importer-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6"
    >
      <div className="bg-bench-950 border border-bench-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-bench-800 bg-bench-900 shrink-0">
          <div>
            <h3 className="font-semibold text-paper text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-brass" /> Project Plan Importer
            </h3>
            <p className="text-xs text-dust mt-0.5">
              Parse Markdown milestones, task tracks, dependencies, and intern assignments.
            </p>
          </div>
          <button
            data-close-plan-modal
            onClick={onClose}
            className="text-dust hover:text-paper p-1 rounded hover:bg-bench-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher: Direct Paste vs File Upload */}
        <div className="flex items-center justify-between px-5 py-2 border-b border-bench-800/80 bg-bench-900/30 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('text')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'text'
                  ? 'bg-bench-800 text-paper font-medium'
                  : 'text-dust hover:text-paper'
              }`}
            >
              Markdown Text Input
            </button>
            <button
              onClick={() => setActiveTab('file')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'file'
                  ? 'bg-bench-800 text-paper font-medium'
                  : 'text-dust hover:text-paper'
              }`}
            >
              File Dropzone
            </button>
          </div>

          <button
            data-generate-preview-btn
            onClick={() => generatePreview()}
            disabled={loadingPreview || !markdown.trim()}
            className="flex items-center gap-1.5 px-3 py-1 bg-bench-800 hover:bg-bench-700 disabled:opacity-50 text-paper rounded font-medium transition-colors"
          >
            {loadingPreview ? 'Parsing…' : 'Generate Preview'}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 my-2.5 px-3 py-2 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Container */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-bench-800">
          {/* Left Column: Input Form */}
          <div className="flex-1 min-h-0 p-4 flex flex-col overflow-y-auto">
            {activeTab === 'file' ? (
              <div
                data-plan-dropzone
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleFileSelected(e.dataTransfer.files?.[0])
                }}
                className="border-2 border-dashed border-bench-700 hover:border-brass rounded-lg p-8 flex flex-col items-center justify-center text-center transition-colors h-64 cursor-pointer"
                onClick={() => document.getElementById('plan-file-input')?.click()}
              >
                <Upload className="w-8 h-8 text-dust mb-2 animate-bounce" />
                <span className="text-sm font-medium text-paper">Drop `.md` project plan here</span>
                <span className="text-xs text-dust mt-1">or click to browse from your device</span>
                <input
                  id="plan-file-input"
                  type="file"
                  accept=".md"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0])}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <textarea
                  data-plan-textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder="Paste your project plan markdown here..."
                  className="flex-1 w-full bg-[#161616] border border-bench-800 rounded p-3 font-mono text-xs text-paper resize-none outline-none focus:border-brass leading-relaxed"
                  rows={14}
                />
              </div>
            )}
          </div>

          {/* Right Column: Live Dry-Run Preview */}
          <div className="flex-1 min-h-0 p-4 overflow-y-auto bg-bench-950 flex flex-col">
            <div className="text-xs font-semibold text-dust uppercase tracking-wider mb-3">
              Dry-Run Plan Preview
            </div>

            {!preview ? (
              <div className="flex-1 flex flex-col items-center justify-center text-dust text-xs text-center p-6">
                <FileText className="w-8 h-8 text-bench-800 mb-2" />
                <span>Click <strong>"Generate Preview"</strong> to inspect detected milestones, tracks, and task dependencies.</span>
              </div>
            ) : (
              <div data-plan-preview-area className="space-y-4">
                {/* Plan Metadata */}
                <div className="bg-bench-900/60 border border-bench-800 rounded p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-dust">Project:</span>
                    <strong data-preview-plan-name className="text-paper font-mono">
                      {preview.plan_name}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-dust">Branch:</span>
                    <span className="text-paper font-mono">{preview.base_branch}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-dust">Tasks Detected:</span>
                    <span className="text-emerald-400 font-bold font-mono">{preview.total_tasks}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-dust">Tracks:</span>
                    {preview.tracks_detected?.map((tr) => (
                      <span key={tr} className="px-1.5 py-0.5 rounded bg-bench-800 text-[10px] text-brass font-mono">
                        {TRACK_LABELS[tr] || tr}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Validation Warnings */}
                {preview.warnings && preview.warnings.length > 0 && (
                  <div data-preview-warnings className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded text-amber-200 text-xs space-y-1">
                    <div className="font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Warnings:
                    </div>
                    {preview.warnings.map((w, idx) => (
                      <div key={idx} className="text-[11px] font-mono">• {w}</div>
                    ))}
                  </div>
                )}

                {/* Parsed Tasks List */}
                <div className="space-y-2">
                  <div className="text-[11px] text-dust font-medium">DETECTED TASKS:</div>
                  {preview.tasks?.map((t, idx) => (
                    <div
                      key={idx}
                      data-preview-task-item
                      className="p-2.5 bg-bench-900 border border-bench-800 rounded text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-paper truncate">{t.title}</span>
                        <span className="px-1.5 py-0.2 rounded bg-bench-800 text-[10px] text-brass font-mono shrink-0">
                          {t.track}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-dust font-mono">
                        {t.identifier && <span>ID: {t.identifier}</span>}
                        {t.assign_to && <span className="text-blueprint">Assign: {t.assign_to}</span>}
                        {t.depends_on?.length > 0 && (
                          <span className="text-amber-400">Depends on: {t.depends_on.join(', ')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-bench-800 bg-bench-900 flex items-center justify-between shrink-0">
          <button
            data-cancel-plan-btn
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-dust hover:text-paper hover:bg-bench-800 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            data-confirm-import-btn
            onClick={handleConfirmImport}
            disabled={importing || !markdown.trim()}
            className="flex items-center gap-2 px-4 py-1.5 text-xs bg-brass hover:bg-brass/90 text-bench-950 font-semibold rounded disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            {importing ? 'Importing Tasks…' : 'Confirm & Import Tasks'}
          </button>
        </div>
      </div>
    </div>
  )
}
