import { useEffect, useState } from 'react'
import type { Program, ProgramVisibility } from '../lib/api'
import type { ProgramScope } from '../lib/programScope'
import Button from './ui/Button'

const COVER_COLORS = [
  '#1E5AA8', // primary
  '#EC4899', // pink
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#0EA5E9', // sky
  '#8B5CF6', // violet
  '#14B8A6', // teal
]

interface ProgramFormDrawerProps {
  scope: ProgramScope
  program?: Program  // edit mode when provided
  /** Whether the program is currently the gym's default. Gym-only edit mode. */
  isDefault?: boolean
  open: boolean
  onClose: () => void
  onSaved: (program: Program) => void
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export default function ProgramFormDrawer({
  scope,
  program,
  isDefault: initialIsDefault = false,
  open,
  onClose,
  onSaved,
}: ProgramFormDrawerProps) {
  const canSetDefault = scope.capabilities.canSetDefault
  const isEdit = !!program
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [coverColor, setCoverColor] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<ProgramVisibility>('PRIVATE')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(program?.name ?? '')
    setDescription(program?.description ?? '')
    setStartDate(toDateInputValue(program?.startDate))
    setEndDate(toDateInputValue(program?.endDate))
    setCoverColor(program?.coverColor ?? null)
    setVisibility(program?.visibility ?? 'PRIVATE')
    setIsDefault(initialIsDefault)
    setError(null)
  }, [open, program?.id, initialIsDefault])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!startDate) { setError('Start date is required'); return }
    setSaving(true)
    setError(null)
    try {
      if (isEdit && program) {
        // Order matters when both default and visibility change in one save:
        //   - Unmarking default + flipping to PRIVATE: must clear default
        //     FIRST so the visibility PATCH isn't refused.
        //   - Marking default: must flip to PUBLIC (or already-be-public)
        //     before setDefault, otherwise setDefault is refused.
        // Settling on: PATCH program first (handles visibility, etc.), then
        // run any default mutation. The "clear default first" path is for
        // the user who wants to flip default→PRIVATE — they have to uncheck
        // default in the same save, and we send the clearDefault before the
        // PATCH only when both flips are happening.
        const becomingPrivate = visibility === 'PRIVATE' && program.visibility !== 'PRIVATE'
        if (initialIsDefault && !isDefault && becomingPrivate && scope.clearProgramDefault) {
          await scope.clearProgramDefault(program.id)
        }
        const updated = await scope.updateProgram(program.id, {
          name: name.trim(),
          description: description.trim() || null,
          startDate,
          endDate: endDate || null,
          coverColor: coverColor || null,
          visibility,
        })
        if (canSetDefault && initialIsDefault !== isDefault && !becomingPrivate) {
          if (isDefault) await scope.setProgramAsDefault?.(program.id)
          else await scope.clearProgramDefault?.(program.id)
        }
        onSaved(updated)
      } else {
        const created = await scope.createProgram({
          name: name.trim(),
          description: description.trim() || undefined,
          startDate,
          endDate: endDate || undefined,
          coverColor: coverColor || undefined,
          visibility,
        })
        // Allow OWNERs to mark as default at create-time too.
        if (canSetDefault && isDefault && visibility === 'PUBLIC') {
          await scope.setProgramAsDefault?.(created.id)
        }
        onSaved(created)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-30" onClick={onClose} />}

      <div
        className={[
          'fixed top-0 right-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-slate-200 dark:border-gray-800 z-40',
          'flex flex-col shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{isEdit ? 'Edit Program' : 'New Program'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div>
            <label className="block text-xs text-slate-600 dark:text-gray-400 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Override — March 2026"
              className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of the program…"
              rows={3}
              className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 dark:text-gray-400 mb-1">
                Start date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-slate-950 dark:text-white focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-gray-400 mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-slate-950 dark:text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-gray-400 mb-2">Cover color</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCoverColor(null)}
                aria-label="No color"
                aria-pressed={coverColor === null}
                className={[
                  'w-7 h-7 rounded-full border transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
                  coverColor === null ? 'border-slate-950 dark:border-white ring-2 ring-primary' : 'border-slate-300 dark:border-gray-700 hover:border-slate-500 dark:hover:border-gray-400',
                  'bg-slate-100 dark:bg-gray-800 flex items-center justify-center text-slate-400 dark:text-gray-400 text-xs',
                ].join(' ')}
              >
                ∅
              </button>
              {COVER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCoverColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={coverColor === c}
                  style={{ backgroundColor: c }}
                  className={[
                    'w-7 h-7 rounded-full border transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
                    coverColor === c ? 'border-white ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-white' : 'border-slate-300 dark:border-gray-700 hover:scale-110',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-600 dark:text-gray-400 mb-2">Visibility</label>
            <div className="grid grid-cols-1 gap-2">
              {([
                { value: 'PRIVATE', label: '🔒 Private', body: 'Staff invite only — members must be added to see the program.' },
                { value: 'PUBLIC',  label: '🌐 Public',  body: 'Any gym member can find and join from Browse Programs.' },
              ] as const).map((opt) => {
                const checked = visibility === opt.value
                // A gym default must stay PUBLIC so every member can see it.
                // Force OWNERs to clear the default first instead of silently
                // un-defaulting the program when they flip to PRIVATE.
                const lockPrivate = opt.value === 'PRIVATE' && isDefault
                return (
                  <label
                    key={opt.value}
                    className={[
                      'flex items-start gap-3 px-3 py-2 rounded border transition-colors',
                      lockPrivate
                        ? 'border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900/50 cursor-not-allowed opacity-60'
                        : checked
                          ? 'border-primary bg-primary/10 cursor-pointer'
                          : 'border-slate-300 dark:border-gray-700 hover:border-slate-400 dark:hover:border-gray-600 cursor-pointer',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={opt.value}
                      checked={checked}
                      disabled={lockPrivate}
                      onChange={() => setVisibility(opt.value)}
                      className="mt-1 h-4 w-4 border-slate-400 dark:border-gray-600 bg-white dark:bg-gray-800 text-primary focus:ring-primary disabled:cursor-not-allowed"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-950 dark:text-white">{opt.label}</span>
                      <span className="block text-xs text-slate-500 dark:text-gray-400 mt-0.5">{opt.body}</span>
                      {lockPrivate && (
                        <span className="block text-xs text-amber-600 dark:text-amber-300 mt-1">
                          Uncheck "Set as gym default" first to make this program private.
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {canSetDefault && (
            <div>
              <label className="block text-xs text-slate-600 dark:text-gray-400 mb-2">Gym default</label>
              <label
                className={[
                  'flex items-start gap-3 px-3 py-2 rounded border transition-colors',
                  visibility !== 'PUBLIC'
                    ? 'border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-900/50 cursor-not-allowed opacity-60'
                    : isDefault
                      ? 'border-amber-500/60 bg-amber-500/10 cursor-pointer'
                      : 'border-slate-300 dark:border-gray-700 hover:border-slate-400 dark:hover:border-gray-600 cursor-pointer',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={isDefault}
                  disabled={visibility !== 'PUBLIC'}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="mt-1 h-4 w-4 border-slate-400 dark:border-gray-600 bg-white dark:bg-gray-800 text-amber-500 focus:ring-amber-500 disabled:cursor-not-allowed"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-950 dark:text-white">⭐ Set as gym default</span>
                  <span className="block text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    Every gym member sees the default program in their feed without joining it.
                    Only one program can be the default at a time.
                  </span>
                  {visibility !== 'PUBLIC' && (
                    <span className="block text-xs text-amber-600 dark:text-amber-300 mt-1">
                      Default programs must be public.
                    </span>
                  )}
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-gray-800 flex gap-2">
          <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Program'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  )
}
