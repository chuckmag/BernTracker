import { useState, useEffect } from 'react'
import { api, type GymProgram, type Workout, type WorkoutType } from '../lib/api'

const TYPE_OPTIONS: { value: WorkoutType; label: string }[] = [
  { value: 'AMRAP', label: 'AMRAP' },
  { value: 'FOR_TIME', label: 'For Time' },
  { value: 'EMOM', label: 'EMOM' },
  { value: 'STRENGTH', label: 'Strength' },
  { value: 'CARDIO', label: 'Cardio' },
  { value: 'METCON', label: 'MetCon' },
  { value: 'WARMUP', label: 'Warmup' },
]

interface WorkoutDrawerProps {
  gymId: string
  dateKey: string | null
  workout?: Workout
  onClose: () => void
  onSaved: () => void
}

export default function WorkoutDrawer({ gymId, dateKey, workout, onClose, onSaved }: WorkoutDrawerProps) {
  const isOpen = dateKey !== null
  const isEdit = !!workout

  const [programs, setPrograms] = useState<GymProgram[]>([])
  const [programsLoading, setProgramsLoading] = useState(false)
  const [programId, setProgramId] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<WorkoutType>('AMRAP')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Fetch programs when drawer opens (only needed for create mode, but load always so it's ready)
  useEffect(() => {
    if (!isOpen || isEdit) return
    setProgramsLoading(true)
    api.gyms.programs.list(gymId)
      .then((list) => {
        setPrograms(list)
        setProgramId((prev) => prev || list[0]?.programId || '')
      })
      .catch(() => setError('Failed to load programs'))
      .finally(() => setProgramsLoading(false))
  }, [isOpen, isEdit, gymId])

  useEffect(() => {
    if (isOpen) {
      setTitle(workout?.title ?? '')
      setType(workout?.type ?? 'AMRAP')
      setDescription(workout?.description ?? '')
      setProgramId(workout?.programId ?? '')
      setError(null)
      setShowPublishConfirm(false)
      setShowDeleteConfirm(false)
    }
  }, [isOpen, workout?.id])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  function validate() {
    if (!isEdit && !programId) { setError('Program is required'); return false }
    if (!title.trim()) { setError('Title is required'); return false }
    return true
  }

  async function handleSaveDraft() {
    if (!validate()) return
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await api.workouts.update(workout.id, { title: title.trim(), description, type })
      } else {
        const scheduledAt = new Date(dateKey! + 'T12:00:00').toISOString()
        await api.workouts.create(gymId, { programId, title: title.trim(), description, type, scheduledAt })
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!validate()) return
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await api.workouts.update(workout.id, { title: title.trim(), description, type })
        await api.workouts.publish(workout.id)
      } else {
        const scheduledAt = new Date(dateKey! + 'T12:00:00').toISOString()
        const created = await api.workouts.create(gymId, { programId, title: title.trim(), description, type, scheduledAt })
        await api.workouts.publish(created.id)
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await api.workouts.delete(workout!.id)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  const displayDate = dateKey
    ? new Date(dateKey + 'T12:00:00').toLocaleDateString('default', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : ''

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-30" onClick={onClose} />
      )}

      <div
        className={[
          'fixed top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-800 z-40',
          'flex flex-col shadow-2xl transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">{displayDate}</p>
            <h2 className="text-base font-semibold">{isEdit ? 'Edit Workout' : 'New Workout'}</h2>
          </div>
          <div className="flex items-center gap-3">
            {isEdit && (
              <span
                className={[
                  'text-xs px-2 py-0.5 rounded-full font-medium border',
                  workout.status === 'PUBLISHED'
                    ? 'bg-green-900/60 text-green-400 border-green-700/40'
                    : 'bg-yellow-900/40 text-yellow-400 border-yellow-700/30',
                ].join(' ')}
              >
                {workout.status === 'PUBLISHED' ? 'Published' : 'Draft'}
              </span>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
              aria-label="Close drawer"
            >
              ×
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Program — required selector (create) or read-only label (edit) */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Program <span className="text-red-400">*</span>
            </label>
            {isEdit ? (
              <p className="text-sm text-white px-3 py-2 bg-gray-800/50 border border-gray-700 rounded">
                {workout.program?.name ?? '—'}
              </p>
            ) : (
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                disabled={programsLoading}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                {programsLoading && <option value="">Loading programs...</option>}
                {!programsLoading && programs.length === 0 && (
                  <option value="">No programs found — create one in Settings</option>
                )}
                {programs.map((gp) => (
                  <option key={gp.programId} value={gp.programId}>{gp.program.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as WorkoutType)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fran"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Workout details, movements, reps..."
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 space-y-2">
          {showPublishConfirm && (
            <div className="bg-gray-800 rounded p-3">
              <p className="text-sm text-white mb-3">
                Publish this workout? Members will be able to see and log results.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowPublishConfirm(false); handlePublish() }}
                  disabled={saving}
                  className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  {saving ? 'Publishing...' : 'Confirm Publish'}
                </button>
                <button
                  onClick={() => setShowPublishConfirm(false)}
                  disabled={saving}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showDeleteConfirm && (
            <div className="bg-gray-800 rounded p-3">
              <p className="text-sm text-white mb-3">Delete this workout? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showPublishConfirm && !showDeleteConfirm && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="flex-1 bg-indigo-700 hover:bg-indigo-600 text-white text-sm py-2 rounded transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
                {workout?.status !== 'PUBLISHED' && (
                  <button
                    onClick={() => setShowPublishConfirm(true)}
                    disabled={saving}
                    className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm py-2 rounded transition-colors disabled:opacity-50"
                  >
                    Publish
                  </button>
                )}
              </div>
              {isEdit && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving || deleting}
                  className="w-full text-red-400 hover:text-red-300 text-sm py-1.5 transition-colors disabled:opacity-50"
                >
                  Delete workout
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
