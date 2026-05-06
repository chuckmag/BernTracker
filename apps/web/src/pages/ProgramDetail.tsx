import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type GymProgram, type Program, type ProgramVisibility } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { makeGymProgramScope } from '../lib/gymProgramScope'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import ProgramFormDrawer from '../components/ProgramFormDrawer'
import ProgramMembersTab from '../components/ProgramMembersTab'
import ProgramOverviewMeta from '../components/ProgramOverviewMeta'

type Tab = 'overview' | 'members' | 'workouts'

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>()
  const { gymRole } = useGym()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<GymProgram | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canWrite = gymRole === 'OWNER' || gymRole === 'PROGRAMMER'
  const canDelete = gymRole === 'OWNER'
  const canSeeMembers = canWrite || gymRole === 'COACH'
  // Detail row carries gymId; the scope only really needs it once detail
  // resolves, so derive lazily.
  const scope = useMemo(
    () => makeGymProgramScope({ gymId: detail?.gymId ?? '', gymRole: gymRole ?? null }),
    [detail?.gymId, gymRole],
  )

  useEffect(() => {
    if (!id) return
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [id])

  async function load(signal?: { cancelled: boolean }) {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.programs.get(id)
      if (!signal?.cancelled) setDetail(data)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  function handleSaved(_updated: Program) {
    setDrawerOpen(false)
    load()
  }

  async function handleDelete() {
    if (!detail) return
    if (!window.confirm(`Delete program "${detail.program.name}"? This cannot be undone. Workouts will remain but become unassigned.`)) return
    setDeleting(true)
    setError(null)
    try {
      await api.programs.delete(detail.program.id)
      navigate('/programs', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  if (loading) return <Skeleton variant="feed-row" count={3} />

  if (!detail) {
    return (
      <div>
        <p className="text-red-400 mb-3">{error ?? 'Program not found.'}</p>
        <Link to="/programs" className="text-primary hover:opacity-80 text-sm">← Back to Programs</Link>
      </div>
    )
  }

  const { program } = detail
  const stripe = program.coverColor ?? '#374151'

  return (
    <div>
      <div className="mb-4">
        <Link to="/programs" className="text-xs text-primary hover:opacity-80">← Programs</Link>
      </div>

      <div className="flex items-start gap-4 mb-6">
        <div style={{ backgroundColor: stripe }} className="w-1.5 h-12 rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{program.name}</h1>
            <VisibilityBadge visibility={program.visibility} />
            {detail.isDefault && <DefaultBadge />}
          </div>
          {program.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{program.description}</p>
          )}
        </div>
        {canWrite && (
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Edit</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-gray-800 mb-6">
        <nav className="flex gap-1">
          {(['overview', 'members', 'workouts'] as Tab[]).map((t) => {
            // MEMBER role can't see the Members tab — hide it (the API would 403 anyway).
            if (t === 'members' && !canSeeMembers) return null
            const memberCount = program._count?.members ?? 0
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  'px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors flex items-center gap-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
                  tab === t
                    ? 'border-primary text-slate-950 dark:text-white'
                    : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white',
                ].join(' ')}
              >
                {t}
                {t === 'members' && memberCount > 0 && (
                  <span className="text-[10px] bg-slate-200 dark:bg-gray-800 text-slate-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full">
                    {memberCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {tab === 'overview' && (
        <OverviewTab
          program={program}
          isDefault={detail.isDefault}
          canWrite={canWrite}
          canSetDefault={gymRole === 'OWNER'}
          gymId={detail.gymId}
          canSeeMembers={canSeeMembers}
          onOpenMembers={() => setTab('members')}
          onDefaultChanged={load}
        />
      )}
      {tab === 'members' && canSeeMembers && (
        <ProgramMembersTab
          programId={program.id}
          gymId={detail.gymId}
          canManage={canWrite}
          onMembershipChanged={load}
        />
      )}
      {tab === 'workouts' && <ComingSoon label="Program-filtered workout list and bulk upload" />}

      {canDelete && tab === 'overview' && (
        <div className="mt-10 pt-6 border-t border-slate-200 dark:border-gray-800">
          <h3 className="text-xs uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-3">Danger zone</h3>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete program'}
          </Button>
        </div>
      )}

      <ProgramFormDrawer
        scope={scope}
        program={program}
        isDefault={detail.isDefault}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}

function OverviewTab({
  program,
  isDefault,
  canWrite,
  canSetDefault,
  gymId,
  canSeeMembers,
  onOpenMembers,
  onDefaultChanged,
}: {
  program: Program
  isDefault: boolean
  canWrite: boolean
  canSetDefault: boolean
  gymId: string
  canSeeMembers: boolean
  onOpenMembers: () => void
  onDefaultChanged: () => void
}) {
  const [setDefaultLoading, setSetDefaultLoading] = useState(false)
  const [setDefaultError, setSetDefaultError] = useState<string | null>(null)

  async function handleSetAsDefault() {
    setSetDefaultLoading(true)
    setSetDefaultError(null)
    try {
      await api.gyms.programs.setDefault(gymId, program.id)
      onDefaultChanged()
    } catch (e) {
      setSetDefaultError((e as Error).message)
    } finally {
      setSetDefaultLoading(false)
    }
  }

  // Default must be PUBLIC — server enforces this with a 400, but we surface
  // the rule in the UI so OWNERs don't waste a click.
  const isPublic = program.visibility === 'PUBLIC'
  const defaultDisabled = isDefault || !isPublic || setDefaultLoading
  const defaultTooltip = !isPublic
    ? 'Default programs must be public. Change visibility first.'
    : isDefault
    ? 'Already the gym default'
    : undefined

  return (
    <>
      <ProgramOverviewMeta
        program={program}
        onOpenMembers={canSeeMembers ? onOpenMembers : undefined}
      />

      {canSetDefault && (
        <div className="mb-6">
          <Button
            variant="secondary"
            onClick={handleSetAsDefault}
            disabled={defaultDisabled}
            title={defaultTooltip}
          >
            {isDefault ? '⭐ Gym default' : setDefaultLoading ? 'Setting…' : 'Set as gym default'}
          </Button>
          {setDefaultError && <p className="text-red-400 text-xs mt-2">{setDefaultError}</p>}
          {!isPublic && !isDefault && (
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-2">{defaultTooltip}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to={`/feed?programIds=${program.id}`}>
          <Button variant="secondary">Open in Feed</Button>
        </Link>
        {canWrite && (
          <Link to={`/calendar?programIds=${program.id}`}>
            <Button variant="secondary">Open in Calendar</Button>
          </Link>
        )}
      </div>
    </>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="text-center py-12 border border-dashed border-slate-200 dark:border-gray-800 rounded-lg">
      <p className="text-sm text-slate-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Coming in a later slice of #82</p>
    </div>
  )
}

export function VisibilityBadge({ visibility, className = '' }: { visibility: ProgramVisibility; className?: string }) {
  const isPublic = visibility === 'PUBLIC'
  return (
    <span
      aria-label={isPublic ? 'Public program' : 'Private program'}
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        isPublic
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30'
          : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 border-slate-300 dark:border-gray-700',
        className,
      ].filter(Boolean).join(' ')}
    >
      {isPublic ? '🌐 Public' : '🔒 Private'}
    </span>
  )
}

export function DefaultBadge({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="Gym default program"
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        'bg-amber-500/15 text-amber-300 border-amber-400/30',
        className,
      ].filter(Boolean).join(' ')}
    >
      ⭐ Default
    </span>
  )
}
