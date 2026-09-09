const STATUS_MAP = {
  unassigned: { color: 'bg-dust', label: 'Unassigned' },
  in_progress: { color: 'bg-brass', label: 'In progress' },
  pr_open: { color: 'bg-blueprint', label: 'PR open' },
  merged: { color: 'bg-moss', label: 'Merged' },
  open: { color: 'bg-blueprint', label: 'Open' },
  closed: { color: 'bg-dust', label: 'Closed' },
}

export const TRACK_LABELS = {
  'ai-ml': 'AI / ML',
  data: 'Data',
  'full-stack': 'Full-stack',
  rpa: 'RPA',
}

export default function StatusTag({ status }) {
  const s = STATUS_MAP[status] || { color: 'bg-dust', label: status }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-dust whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
      {s.label}
    </span>
  )
}
