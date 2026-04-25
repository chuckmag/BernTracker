import { useEffect, useState } from 'react'
import { api, type Program } from '../lib/api'
import Button from './ui/Button'

const COVER_COLORS = [
  '#6366F1', // indigo
  '#EC4899', // pink
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#0EA5E9', // sky
  '#8B5CF6', // violet
  '#14B8A6', // teal
]

interface ProgramFormDrawerProps {
  gymId: string
  program?: Program  // edit mode when provided
  open: boolean
  onClose: () => void
  onSaved: (program: Program) => void
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export default function ProgramFormDrawer({ gymId, program, open, onClose, onSaved }: ProgramFormDrawerProps) {
  const isEdit = !!program
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [coverColor, setCoverColor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(program?.name ?? '')
    setDescription(program?.description ?? '')
    setStartDate(toDateInputValue(program?.startDate))
    setEndDate(toDateInputValue(program?.endDate))
    setCoverColor(program?.coverColor ?? null)
    setError(null)
  }, [open, program?.id])

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
        const updated = await api.programs.update(program.id, {
          name: name.trim(),
          description: description.trim() || null,
          startDate,
          endDate: endDate || null,
          coverColor: coverColor || null,
        })
        onSaved(updated)
      } else {
        const { program: created } = await api.gyms.programs.create(gymId, {
          name: name.trim(),
          description: description.trim() || undefined,
          startDate,
          endDate: endDate || undefined,
          coverColor: coverColor || undefined,
        })
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
          'fixed top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-800 z-40',
          'flex flex-col shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold">{isEdit ? 'Edit Program' : 'New Program'}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Override — March 2026"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of the program…"
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Start date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Cover color</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCoverColor(null)}
                aria-label="No color"
                className={[
                  'w-7 h-7 rounded-full border transition-all',
                  coverColor === null ? 'border-white ring-2 ring-indigo-500' : 'border-gray-700 hover:border-gray-500',
                  'bg-gray-800 flex items-center justify-center text-gray-500 text-xs',
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
                  style={{ backgroundColor: c }}
                  className={[
                    'w-7 h-7 rounded-full border transition-all',
                    coverColor === c ? 'border-white ring-2 ring-offset-2 ring-offset-gray-900 ring-white' : 'border-gray-700 hover:scale-110',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex gap-2">
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
