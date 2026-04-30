import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  type GymProgram,
  type Program,
  type ProgramVisibility,
  type WorkoutImportSummary,
} from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import ProgramFormDrawer from '../components/ProgramFormDrawer'
import ProgramMembersTab from '../components/ProgramMembersTab'
import BulkUploadDrawer from '../components/BulkUploadDrawer'

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
        <Link to="/programs" className="text-indigo-400 hover:text-indigo-300 text-sm">← Back to Programs</Link>
      </div>
    )
  }

  const { program } = detail
  const stripe = program.coverColor ?? '#374151'

  return (
    <div>
      <div className="mb-4">
        <Link to="/programs" className="text-xs text-indigo-400 hover:text-indigo-300">← Programs</Link>
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
            <p className="mt-1 text-sm text-gray-400">{program.description}</p>
          )}
        </div>
        {canWrite && (
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Edit</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 mb-6">
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
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                  tab === t
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white',
                ].join(' ')}
              >
                {t}
                {t === 'members' && memberCount > 0 && (
                  <span className="text-[10px] bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded-full">
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
      {tab === 'workouts' && (
        <WorkoutsTab
          programId={program.id}
          startDate={program.startDate}
          endDate={program.endDate}
          workoutCount={program._count?.workouts ?? 0}
          canManage={canWrite}
        />
      )}

      {canDelete && tab === 'overview' && (
        <div className="mt-10 pt-6 border-t border-gray-800">
          <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3">Danger zone</h3>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete program'}
          </Button>
        </div>
      )}

      <ProgramFormDrawer
        gymId={detail.gymId}
        program={program}
        isDefault={detail.isDefault}
        canSetDefault={gymRole === 'OWNER'}
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
  const memberCount = program._count?.members ?? 0
  const workoutCount = program._count?.workouts ?? 0
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '—'

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
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm mb-8">
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Start date</dt>
          <dd className="text-white">{fmt(program.startDate)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">End date</dt>
          <dd className="text-white">{fmt(program.endDate)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Members</dt>
          <dd className="text-white">
            {canSeeMembers ? (
              <button
                type="button"
                onClick={onOpenMembers}
                className="text-white hover:text-indigo-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 rounded"
              >
                {memberCount}
              </button>
            ) : (
              memberCount
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Workouts</dt>
          <dd className="text-white">{workoutCount}</dd>
        </div>
      </dl>

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
            <p className="text-xs text-gray-400 mt-2">{defaultTooltip}</p>
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
    <div className="text-center py-12 border border-dashed border-gray-800 rounded-lg">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-xs text-gray-400">Coming in a later slice of #82</p>
    </div>
  )
}

// Workouts tab: counts, filtered-calendar link, bulk upload trigger, and the
// import history. Slice 6 / #89.
function WorkoutsTab({
  programId,
  startDate,
  endDate,
  workoutCount,
  canManage,
}: {
  programId: string
  startDate: string
  endDate: string | null
  workoutCount: number
  canManage: boolean
}) {
  const [imports, setImports] = useState<WorkoutImportSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!canManage) return
    const signal = { cancelled: false }
    void load(signal)
    return () => { signal.cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, canManage])

  async function load(signal?: { cancelled: boolean }) {
    setLoading(true)
    setError(null)
    try {
      const list = await api.programs.imports.list(programId)
      if (!signal?.cancelled) setImports(list)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  const range = endDate ? `${fmt(startDate)} – ${fmt(endDate)}` : `from ${fmt(startDate)}`

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-white">
            {workoutCount} workout{workoutCount === 1 ? '' : 's'} scheduled
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{range}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/calendar?programIds=${programId}`}>
            <Button variant="secondary">Open in Calendar</Button>
          </Link>
          {canManage && (
            <Button variant="primary" onClick={() => setDrawerOpen(true)}>
              Bulk Upload
            </Button>
          )}
        </div>
      </div>

      {canManage && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Imports</h3>
          {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
          {loading && <p className="text-xs text-gray-500">Loading…</p>}
          {!loading && imports.length === 0 && (
            <p className="text-xs text-gray-500">
              No imports yet. Use the <strong>Bulk Upload</strong> button to import workouts from a CSV or XLSX.
            </p>
          )}
          <ul className="space-y-2">
            {imports.map((imp) => (
              <ImportRow
                key={imp.id}
                programId={programId}
                imp={imp}
                onChanged={() => load()}
              />
            ))}
          </ul>
        </div>
      )}

      {canManage && (
        <BulkUploadDrawer
          open={drawerOpen}
          programId={programId}
          onClose={() => { setDrawerOpen(false); void load() }}
          onCreated={() => { void load() }}
        />
      )}
    </div>
  )
}

function ImportRow({
  programId,
  imp,
  onChanged,
}: {
  programId: string
  imp: WorkoutImportSummary
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePublish() {
    if (!window.confirm(
      `Publish ${imp.createdCount} draft workout${imp.createdCount === 1 ? '' : 's'} from "${imp.filename}"? Members in your gym will see them in their feed immediately.`,
    )) return
    setBusy(true)
    setError(null)
    try {
      await api.programs.imports.publish(programId, imp.id)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="border border-gray-800 rounded p-3 text-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-white truncate">{imp.filename}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(imp.createdAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {' · '}
            {imp.status === 'PUBLISHED'
              ? `${imp.createdCount} published`
              : imp.status === 'DRAFT'
                ? `${imp.createdCount} draft${imp.createdCount === 1 ? '' : 's'}`
                : `${imp.rowCount} row${imp.rowCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportStatusBadge status={imp.status} />
          {imp.status === 'DRAFT' && (
            <Button variant="primary" onClick={handlePublish} disabled={busy}>
              {busy ? 'Publishing…' : `Publish ${imp.createdCount}`}
            </Button>
          )}
          {imp.status === 'DRAFT' && (
            <Link to={`/calendar?programIds=${programId}`}>
              <Button variant="tertiary">Review on calendar</Button>
            </Link>
          )}
        </div>
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {imp.status === 'FAILED' && imp.errorJson && imp.errorJson.length > 0 && (
        <details className="mt-2 text-xs text-rose-300">
          <summary className="cursor-pointer">{imp.errorJson.length} error{imp.errorJson.length === 1 ? '' : 's'}</summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {imp.errorJson.slice(0, 8).map((iss, idx) => (
              <li key={idx}>
                {iss.rowIndex != null && <span className="font-mono">row {iss.rowIndex} </span>}
                {iss.message}
              </li>
            ))}
            {imp.errorJson.length > 8 && (
              <li className="text-gray-400">…and {imp.errorJson.length - 8} more</li>
            )}
          </ul>
        </details>
      )}
    </li>
  )
}

function ImportStatusBadge({ status }: { status: WorkoutImportSummary['status'] }) {
  const tint =
    status === 'PUBLISHED'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
      : status === 'DRAFT'
        ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
        : status === 'PENDING'
          ? 'bg-indigo-500/15 text-indigo-300 border-indigo-400/30'
          : 'bg-rose-500/15 text-rose-300 border-rose-400/30'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${tint}`}>
      {status}
    </span>
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
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
          : 'bg-gray-800 text-gray-300 border-gray-700',
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
