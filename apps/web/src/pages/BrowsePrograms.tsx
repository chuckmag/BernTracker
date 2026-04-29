import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type GymProgram, type Program } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { useProgramFilter } from '../context/ProgramFilterContext.tsx'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import { DefaultBadge } from './ProgramDetail'

/**
 * Browse Programs
 *
 * Two sections:
 *   1. **Public programs** — unaffiliated, gym-less PUBLIC programs (e.g. the
 *      CrossFit Mainsite WOD program). Open to any authenticated user.
 *   2. **From your gym** — PUBLIC programs in the caller's gym they haven't
 *      joined yet. The original member-discovery path retained as a secondary
 *      section so in-gym programs stay reachable from this page.
 *
 * Both sections subscribe through the same `POST /programs/:id/subscribe`
 * endpoint and drop the user on the filtered Feed.
 */
export default function BrowsePrograms() {
  const { gymId } = useGym()
  const navigate = useNavigate()
  const { setSelected: setProgramFilter } = useProgramFilter()
  const [publicCatalog, setPublicCatalog] = useState<Program[]>([])
  const [gymPrograms, setGymPrograms] = useState<GymProgram[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [loadingGym, setLoadingGym] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingCatalog(true)
    setError(null)
    api.programs.publicCatalog()
      .then((list) => { if (!cancelled) setPublicCatalog(list) })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoadingCatalog(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!gymId) return
    let cancelled = false
    setLoadingGym(true)
    api.gyms.programs.browse(gymId)
      .then((list) => { if (!cancelled) setGymPrograms(list) })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoadingGym(false) })
    return () => { cancelled = true }
  }, [gymId])

  async function handleJoin(programId: string) {
    setJoiningId(programId)
    setError(null)
    try {
      await api.programs.subscribe(programId)
      // Drop the joined program from whichever list it lived in for snappy UX.
      setPublicCatalog((prev) => prev.filter((p) => p.id !== programId))
      setGymPrograms((prev) => prev.filter((gp) => gp.programId !== programId))
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Browse programs</h1>
      <p className="text-sm text-gray-400 mb-6">
        Find programs to follow — popular public programs like the CrossFit Mainsite WOD,
        plus public programs from your gym.
      </p>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <BrowseSection
        title="Public programs"
        subtitle="Open programs anyone can join — no gym affiliation needed."
        loading={loadingCatalog}
        emptyTitle="No public programs available"
        emptyBody="Public programs will appear here as they're added."
      >
        {publicCatalog.map((program) => (
          <ProgramCard
            key={program.id}
            program={program}
            joining={joiningId === program.id}
            onJoin={handleJoin}
          />
        ))}
      </BrowseSection>

      <div className="h-8" />

      <BrowseSection
        title="From your gym"
        subtitle={
          gymId
            ? 'Public programs in your gym that you haven’t joined yet.'
            : 'Set up your gym in Settings to see programs from your gym.'
        }
        loading={Boolean(gymId) && loadingGym}
        emptyTitle="Nothing to browse from your gym"
        emptyBody="Public programs from your gym show up here. Ask a staff member if you're expecting one and don't see it."
      >
        {gymId && gymPrograms.map((gp) => (
          <ProgramCard
            key={gp.program.id}
            program={gp.program}
            isDefault={gp.isDefault}
            joining={joiningId === gp.program.id}
            onJoin={handleJoin}
          />
        ))}
      </BrowseSection>
    </div>
  )
}

interface BrowseSectionProps {
  title: string
  subtitle: string
  loading: boolean
  emptyTitle: string
  emptyBody: string
  children: React.ReactNode
}

function BrowseSection({ title, subtitle, loading, emptyTitle, emptyBody, children }: BrowseSectionProps) {
  // Children may be a fragment / array. Detect "no cards" by counting truthy
  // ReactNode entries — keeps each section's empty-state independent.
  const cards = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : []
  const isEmpty = !loading && cards.length === 0

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-sm text-gray-400 mb-4">{subtitle}</p>

      {loading && <Skeleton variant="feed-row" count={3} />}

      {isEmpty && (
        <EmptyState title={emptyTitle} body={emptyBody} />
      )}

      {!loading && !isEmpty && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
      )}
    </section>
  )
}

interface ProgramCardProps {
  program: Program
  isDefault?: boolean
  joining: boolean
  onJoin: (programId: string) => void
}

function ProgramCard({ program, isDefault, joining, onJoin }: ProgramCardProps) {
  const stripe = program.coverColor ?? '#374151'
  const memberCount = program._count?.members ?? 0
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
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
            onClick={() => onJoin(program.id)}
            disabled={joining}
            className="flex-1"
          >
            {joining ? 'Joining…' : 'Join'}
          </Button>
        </div>
      </div>
    </div>
  )
}
