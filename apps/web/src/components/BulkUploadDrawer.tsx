import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type ImportPreview,
  type PreviewRow,
  type ParseIssue,
  type WorkoutImportSummary,
} from '../lib/api'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import Button from './ui/Button'

interface BulkUploadDrawerProps {
  open: boolean
  programId: string
  onClose: () => void
  /** Fires after drafts are successfully created so the caller can refresh the imports list. */
  onCreated: (summary: { importId: string; createdCount: number }) => void
}

type Stage = 'pick' | 'parsing' | 'preview' | 'creating' | 'done'

export default function BulkUploadDrawer({
  open,
  programId,
  onClose,
  onCreated,
}: BulkUploadDrawerProps) {
  const [stage, setStage] = useState<Stage>('pick')
  const [file, setFile] = useState<File | null>(null)
  const [importId, setImportId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStage('pick')
    setFile(null)
    setImportId(null)
    setPreview(null)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && stage !== 'parsing' && stage !== 'creating') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, stage])

  async function handleFile(picked: File) {
    setFile(picked)
    setError(null)
    setStage('parsing')
    try {
      const res = await api.programs.imports.upload(programId, picked)
      setImportId(res.importId)
      setPreview(res.preview)
      setStage('preview')
    } catch (e) {
      setError((e as Error).message)
      setStage('pick')
    }
  }

  async function handleConfirm() {
    if (!importId) return
    setStage('creating')
    setError(null)
    try {
      const res = await api.programs.imports.draft(programId, importId)
      onCreated({ importId, createdCount: res.createdCount })
      setStage('done')
    } catch (e) {
      setError((e as Error).message)
      setStage('preview')
    }
  }

  const blockingErrorCount = preview?.errors.length ?? 0
  const warningCount = preview?.warnings.length ?? 0
  const collisionCount = useMemo(
    () => preview?.rows.filter((r) => r.collision).length ?? 0,
    [preview],
  )
  const dateCount = useMemo(() => {
    if (!preview) return 0
    const dates = new Set(preview.rows.map((r) => r.date))
    return dates.size
  }, [preview])
  const ableToCreate = (preview?.rows.length ?? 0) - collisionCount

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => stage !== 'parsing' && stage !== 'creating' && onClose()}
        />
      )}

      <div
        className={[
          'fixed top-0 right-0 h-full w-full max-w-2xl bg-gray-900 border-l border-gray-800 z-40',
          'flex flex-col shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold">
            {stage === 'pick' && 'Bulk upload workouts'}
            {stage === 'parsing' && 'Parsing…'}
            {stage === 'preview' && 'Preview'}
            {stage === 'creating' && 'Creating drafts…'}
            {stage === 'done' && 'Drafts created'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={stage === 'parsing' || stage === 'creating'}
            className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {stage === 'pick' && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-300">
                Upload a CSV or XLSX (≤ 5 MB) with one workout per row. Required columns:{' '}
                <code className="text-indigo-300">date</code>, <code className="text-indigo-300">title</code>,{' '}
                <code className="text-indigo-300">type</code>, <code className="text-indigo-300">description</code>.
                Optional: <code className="text-gray-400">order</code>, <code className="text-gray-400">named_workout</code>,{' '}
                <code className="text-gray-400">source</code>.
              </p>
              <p className="text-sm text-gray-400">
                <a
                  href="/programs/template.csv"
                  download
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  Download template (CSV)
                </a>
              </p>
              <label
                className="flex flex-col items-center justify-center gap-2 px-6 py-10 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-indigo-500 transition-colors"
                aria-label="File picker"
              >
                <span className="text-sm text-gray-300">
                  {file ? file.name : 'Click to pick a .csv or .xlsx file'}
                </span>
                <input
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleFile(f)
                  }}
                />
              </label>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          )}

          {stage === 'parsing' && (
            <div className="p-5 text-sm text-gray-400">
              Parsing <span className="text-white">{file?.name}</span>…
            </div>
          )}

          {(stage === 'preview' || stage === 'creating') && preview && (
            <div className="p-5 space-y-4">
              <SummaryStrip
                rowCount={preview.rows.length}
                dateCount={dateCount}
                warningCount={warningCount}
                blockingErrorCount={blockingErrorCount}
                collisionCount={collisionCount}
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              {preview.errors.length > 0 && (
                <IssueList title="Blocking errors" issues={preview.errors} level="error" />
              )}
              {preview.warnings.length > 0 && (
                <IssueList title="Warnings" issues={preview.warnings} level="warning" />
              )}
              <PreviewTable rows={preview.rows} />
            </div>
          )}

          {stage === 'done' && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-emerald-300">
                Drafts created — they're now visible on the program calendar for review.
              </p>
              <p className="text-xs text-gray-400">
                Use the <strong>Publish drafts</strong> button on the import row when you're ready
                to make them visible to gym members.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex items-center gap-2">
          {stage === 'preview' && (
            <>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={blockingErrorCount > 0 || ableToCreate === 0}
                className="flex-1"
              >
                {ableToCreate > 0
                  ? `Create ${ableToCreate} draft${ableToCreate === 1 ? '' : 's'}`
                  : 'No rows to create'}
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </>
          )}
          {stage === 'creating' && (
            <Button variant="primary" disabled className="flex-1">
              Creating…
            </Button>
          )}
          {stage === 'done' && (
            <Button variant="primary" onClick={onClose} className="flex-1">
              Close
            </Button>
          )}
          {(stage === 'pick' || stage === 'parsing') && (
            <Button variant="secondary" onClick={onClose} disabled={stage === 'parsing'} className="flex-1">
              Cancel
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

function SummaryStrip({
  rowCount,
  dateCount,
  warningCount,
  blockingErrorCount,
  collisionCount,
}: {
  rowCount: number
  dateCount: number
  warningCount: number
  blockingErrorCount: number
  collisionCount: number
}) {
  return (
    <div className="text-xs text-gray-300 flex flex-wrap gap-x-4 gap-y-1">
      <span>
        {rowCount} workout{rowCount === 1 ? '' : 's'} across {dateCount} date{dateCount === 1 ? '' : 's'}
      </span>
      <span className={blockingErrorCount > 0 ? 'text-rose-300' : 'text-gray-400'}>
        {blockingErrorCount} blocking error{blockingErrorCount === 1 ? '' : 's'}
      </span>
      <span className={warningCount > 0 ? 'text-amber-300' : 'text-gray-400'}>
        {warningCount} warning{warningCount === 1 ? '' : 's'}
      </span>
      {collisionCount > 0 && (
        <span className="text-amber-300">{collisionCount} collision{collisionCount === 1 ? '' : 's'} (will skip)</span>
      )}
    </div>
  )
}

function IssueList({ title, issues, level }: { title: string; issues: ParseIssue[]; level: 'warning' | 'error' }) {
  const tint = level === 'error' ? 'border-rose-500/40 bg-rose-500/5 text-rose-200' : 'border-amber-500/40 bg-amber-500/5 text-amber-200'
  return (
    <div className={`rounded border ${tint} p-3 text-xs`}>
      <p className="font-semibold mb-1">{title}</p>
      <ul className="space-y-0.5">
        {issues.map((i, idx) => (
          <li key={idx}>
            {i.rowIndex != null && <span className="font-mono mr-1">row {i.rowIndex}</span>}
            {i.column && <span className="font-mono mr-1">[{i.column}]</span>}
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="rounded border border-gray-800 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-800/60 text-gray-300">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium">Date</th>
            <th className="text-left px-2 py-1.5 font-medium">Type</th>
            <th className="text-left px-2 py-1.5 font-medium">Title</th>
            <th className="text-left px-2 py-1.5 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tint = WORKOUT_TYPE_STYLES[r.type]
            return (
              <tr
                key={r.rowIndex}
                className={[
                  'border-t border-gray-800',
                  r.collision ? 'bg-amber-500/10' : '',
                ].join(' ')}
              >
                <td className="px-2 py-1.5 align-top whitespace-nowrap text-gray-300">
                  {r.date}
                  {r.dayOrder != null && <span className="text-gray-500 ml-1">·{r.dayOrder}</span>}
                </td>
                <td className="px-2 py-1.5 align-top">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${tint?.bg ?? 'bg-gray-700'} ${tint?.tint ?? 'text-gray-200'}`}>
                    {tint?.abbr ?? r.type}
                  </span>
                </td>
                <td className="px-2 py-1.5 align-top text-white">
                  {r.title}
                  {r.namedWorkout && (
                    <span className="block text-[10px] text-indigo-300 mt-0.5">
                      {r.namedWorkoutId ? `→ named: ${r.namedWorkout}` : `unmatched named: ${r.namedWorkout}`}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 align-top text-gray-400">
                  {r.collision && <span className="text-amber-300 mr-1">collision · skipped</span>}
                  {r.source && <span className="text-gray-500">{r.source}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Re-export WorkoutImportSummary so callers can typecheck the imports list
// without re-importing from api.ts in two places.
export type { WorkoutImportSummary }
