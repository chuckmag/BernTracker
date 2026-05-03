import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type PersonalProgram, type Workout, type WorkoutType } from '../lib/api'
import { WORKOUT_CATEGORIES, WORKOUT_TYPE_STYLES, typesInCategory } from '../lib/workoutTypeStyles'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'

function todayLocalIsoDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateBadge(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PersonalProgramPage() {
  const navigate = useNavigate()
  const [program, setProgram] = useState<PersonalProgram | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Create-form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<WorkoutType>('METCON')
  const [scheduledDate, setScheduledDate] = useState<string>(todayLocalIsoDate)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.me.personalProgram.get(),
      api.me.personalProgram.workouts.list(),
    ])
      .then(([p, w]) => {
        if (!cancelled) {
          setProgram(p)
          setWorkouts(w)
        }
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function resetForm() {
    setTitle('')
    setDescription('')
    setType('METCON')
    setScheduledDate(todayLocalIsoDate())
    setFormError(null)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (creating) return
    if (!title.trim() || !description.trim()) {
      setFormError('Title and description are required')
      return
    }
    setCreating(true)
    setFormError(null)
    try {
      // Local midnight → ISO string. Personal-program workouts have no
      // gym timezone, so the user's local clock is the source of truth.
      const scheduledAt = new Date(`${scheduledDate}T00:00:00`).toISOString()
      const created = await api.me.personalProgram.workouts.create({
        title: title.trim(),
        description: description.trim(),
        type,
        scheduledAt,
      })
      setWorkouts((prev) => [...prev, created].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)))
      resetForm()
      setShowForm(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create workout')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Personal Program</h1>
          <p className="text-sm text-gray-400 mt-1">
            Your private workouts — only you can see or edit these.
          </p>
        </div>
        {program && (
          <span
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-300"
            aria-label={`${program._count.workouts} workouts`}
          >
            {program._count.workouts} workout{program._count.workouts === 1 ? '' : 's'}
          </span>
        )}
      </header>

      {error && (
        <div className="bg-rose-950/40 border border-rose-900 text-rose-300 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        {!showForm ? (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            New workout
          </Button>
        ) : (
          <Button variant="tertiary" onClick={() => { setShowForm(false); resetForm() }}>
            Cancel
          </Button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          aria-label="New personal workout"
          className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3"
        >
          <div className="space-y-1">
            <label htmlFor="pp-title" className="text-xs text-gray-400">Title</label>
            <input
              id="pp-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Easy Z2 row"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              maxLength={120}
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="pp-description" className="text-xs text-gray-400">Description</label>
            <textarea
              id="pp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sets, reps, notes…"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm h-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="pp-type" className="text-xs text-gray-400">Type</label>
              <select
                id="pp-type"
                value={type}
                onChange={(e) => setType(e.target.value as WorkoutType)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              >
                {WORKOUT_CATEGORIES.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {typesInCategory(cat).map((t) => (
                      <option key={t} value={t}>{WORKOUT_TYPE_STYLES[t].label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="pp-date" className="text-xs text-gray-400">Date</label>
              <input
                id="pp-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                required
              />
            </div>
          </div>

          {formError && <p className="text-rose-400 text-sm">{formError}</p>}

          <div className="flex justify-end gap-2">
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create workout'}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton variant="feed-row" count={3} />
        </div>
      ) : workouts.length === 0 ? (
        <EmptyState
          title="No personal workouts yet"
          body="Add accessory work, extra cardio, or anything else you want to track outside of your gym's programming."
        />
      ) : (
        <ul className="space-y-2">
          {workouts.map((w) => {
            const style = WORKOUT_TYPE_STYLES[w.type]
            return (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/workouts/${w.id}`)}
                  className="w-full text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-3 flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                >
                  <span
                    className={`shrink-0 inline-flex items-center justify-center text-[10px] font-semibold rounded px-1.5 py-1 min-w-[2.5rem] ${style.bg} ${style.tint}`}
                    aria-hidden="true"
                  >
                    {style.abbr}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{w.title}</span>
                      <time className="text-xs text-gray-400 shrink-0">{formatDateBadge(w.scheduledAt)}</time>
                    </div>
                    {w.description && (
                      <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{w.description}</p>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
