import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type GymProgram } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { useProgramFilter } from '../context/ProgramFilterContext.tsx'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import { DefaultBadge } from './ProgramDetail'

/**
 * Browse Programs (slice 4 / #87)
 *
 * Lists PUBLIC programs in the caller's gym they have NOT yet joined. Click
 * Join → POST /programs/:id/subscribe → land on the Feed filtered to the
 * newly-joined program.
 */
export default function BrowsePrograms() {
  const { gymId } = useGym()
  const navigate = useNavigate()
  const { setSelected: setProgramFilter } = useProgramFilter()
  const [programs, setPrograms] = useState<GymProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  useEffect(() => {
    if (!gymId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api.gyms.programs.browse(gymId)
      .then((list) => { if (!cancelled) setPrograms(list) })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gymId])

  async function handleJoin(programId: string) {
    setJoiningId(programId)
    setError(null)
    try {
      await api.programs.subscribe(programId)
      // Drop the joined program from the list immediately for snappier UX.
      setPrograms((prev) => prev.filter((gp) => gp.programId !== programId))
      // Drop the user on the filtered Feed for the new program — completes the
      // "found something interesting → seeing today's workout" loop in one click.
      setProgramFilter([programId])
      navigate('/feed')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setJoiningId(null)
    }
  }

  if (!gymId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Browse programs</h1>
        <p className="text-gray-400">Set up your gym in Settings first.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Browse programs</h1>
      <p className="text-sm text-gray-400 mb-6">Public programs you can join in this gym.</p>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {loading && <Skeleton variant="feed-row" count={3} />}

      {!loading && programs.length === 0 && !error && (
        <EmptyState
          title="Nothing to browse right now"
          body="Public programs will show up here when staff create them. Check back later, or ask a staff member for an invite to a private program."
        />
      )}

      {programs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((gp) => {
            const { program, isDefault } = gp
            const stripe = program.coverColor ?? '#374151'
            const memberCount = program._count?.members ?? 0
            return (
              <div
                key={program.id}
                className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col"
              >
                <div style={{ backgroundColor: stripe }} className="h-1.5 w-full" />
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h3 className="font-semibold text-white truncate flex-1 min-w-0">{program.name}</h3>
                    {isDefault && <DefaultBadge className="shrink-0" />}
                  </div>
                  {program.description && (
                    <p className="mt-1 text-xs text-gray-400 line-clamp-3">{program.description}</p>
                  )}
                  <p className="mt-3 text-xs text-gray-400">
                    {memberCount} {memberCount === 1 ? 'member' : 'members'}
                  </p>
                  <div className="mt-4 flex">
                    <Button
                      variant="primary"
                      onClick={() => handleJoin(program.id)}
                      disabled={joiningId === program.id}
                      className="flex-1"
                    >
                      {joiningId === program.id ? 'Joining…' : 'Join'}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
