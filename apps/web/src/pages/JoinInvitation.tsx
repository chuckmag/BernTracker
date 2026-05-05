import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type InvitationLookup } from '../lib/api'

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  PROGRAMMER: 'Programmer',
  COACH: 'Coach',
  MEMBER: 'Member',
}

function formatInviter(
  invitedBy: { firstName: string | null; lastName: string | null } | null,
): string {
  if (!invitedBy) return 'a staff member'
  const first = invitedBy.firstName?.trim()
  const last = invitedBy.lastName?.trim()
  if (first && last) return `${first} ${last}`
  return first ?? 'a staff member'
}

type PageState =
  | { status: 'loading' }
  | { status: 'found'; invite: InvitationLookup }
  | { status: 'not-found' }
  | { status: 'expired' }
  | { status: 'error'; message: string }

export default function JoinInvitation() {
  const { code } = useParams<{ code: string }>()
  const [state, setState] = useState<PageState>({ status: 'loading' })

  useEffect(() => {
    if (!code) {
      setState({ status: 'not-found' })
      return
    }
    api.gyms.codeInvitations.lookup(code)
      .then((invite) => {
        if (new Date(invite.expiresAt) < new Date()) {
          setState({ status: 'expired' })
        } else {
          setState({ status: 'found', invite })
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('404') || msg.includes('not found') || msg.toLowerCase().includes('invalid')) {
          setState({ status: 'not-found' })
        } else if (msg.includes('410') || msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('revoked')) {
          setState({ status: 'expired' })
        } else {
          setState({ status: 'error', message: msg || 'Something went wrong' })
        }
      })
  }, [code])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-widest">WODalytics</p>
          <h1 className="text-2xl font-bold">You've been invited</h1>
        </header>

        {state.status === 'loading' && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-center">
            <p className="text-sm text-gray-400">Looking up your invitation…</p>
          </div>
        )}

        {state.status === 'found' && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-5">
            <div className="space-y-1">
              {state.invite.gym ? (
                <p className="text-lg font-semibold text-white">{state.invite.gym.name}</p>
              ) : (
                <p className="text-lg font-semibold text-white">WODalytics</p>
              )}
              <p className="text-sm text-gray-400">
                Invited as{' '}
                <span className="text-indigo-300 font-medium">
                  {ROLE_LABEL[state.invite.roleToGrant] ?? state.invite.roleToGrant}
                </span>
                {' '}by {formatInviter(state.invite.invitedBy)}
              </p>
              <p className="text-xs text-gray-500">
                Expires {new Date(state.invite.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <div className="space-y-2">
              <Link
                to={`/register?invite=${code}`}
                className="block w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-center text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              >
                Create account →
              </Link>
              <Link
                to={`/login?invite=${code}`}
                className="block w-full rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2.5 text-sm font-semibold text-center text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              >
                Sign in to an existing account
              </Link>
            </div>
          </div>
        )}

        {state.status === 'not-found' && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4 text-center">
            <p className="text-sm text-white font-semibold">Invitation not found</p>
            <p className="text-xs text-gray-400">
              This link may be invalid or the invitation may have already been used.
            </p>
            <Link
              to="/login"
              className="inline-block text-sm text-indigo-400 hover:text-indigo-300 underline"
            >
              Sign in to WODalytics
            </Link>
          </div>
        )}

        {state.status === 'expired' && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 space-y-4 text-center">
            <p className="text-sm text-white font-semibold">Invitation expired or revoked</p>
            <p className="text-xs text-gray-400">
              Ask your gym staff to send a new invitation.
            </p>
            <Link
              to="/login"
              className="inline-block text-sm text-indigo-400 hover:text-indigo-300 underline"
            >
              Sign in to WODalytics
            </Link>
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-center">
            <p className="text-sm text-rose-400">{state.status === 'error' && state.message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
