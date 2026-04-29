import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import Button from '../components/ui/Button'

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
]

// Always-available "create a new gym" form, reachable from the GymPicker
// dropdown. Distinct from /gym-settings (which only shows the create form
// when the user has no active gym) so an existing-gym member can spin up
// a second gym without first leaving their current one.
export default function GymCreate() {
  const navigate = useNavigate()
  const { setGymId } = useGym()
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const gym = await api.gyms.create({ name: name.trim(), timezone })
      setGymId(gym.id)
      navigate('/gym-settings', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create gym')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Set up a new gym</h1>
        <p className="text-sm text-gray-400">
          You'll be the owner. After creation you can invite members and add programs from Gym Settings.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-xs text-gray-400 mb-1 block">Gym name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Crossfit Bern"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-xs text-gray-400 mb-1 block">Timezone</span>
          <select
            id="gym-create-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create gym'}
          </Button>
          <Button variant="secondary" type="button" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
