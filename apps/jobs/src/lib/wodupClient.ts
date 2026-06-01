import { z } from 'zod'
import { createLogger } from '@wodalytics/server'

const log = createLogger('wodup-client')

const FETCH_TIMEOUT_MS = 15_000
// activityTimeline only returns WODs the user has already logged results for —
// useless for future weeks. publishedWods on the gym returns ALL scheduled WODs
// regardless of whether the member has completed them.
const WODUP_GRAPHQL_URL = 'https://www.wodup.com/api/graphql?op=GymPublishedWods'

const GYM_WODS_QUERY = `
  query GymPublishedWods($startDate: Date!, $endDate: Date!) {
    currentUser {
      themeGym {
        id
        name
        publishedWods(startDate: $startDate, endDate: $endDate, limit: 50) {
          id
          name
          occursOn
          publishAt
          wodComponents {
            id
            prefix
            workout {
              id
              type
              name
              description
              details
            }
          }
        }
      }
    }
  }
`

// `details` is a polymorphic object whose shape varies by workout type:
//   - Generic/WarmUp: { description: string, name: string, type: string, ... }
//   - ForTime/FranStyle/Strength named workouts: { movements: [...], type: string }
// We only access `details.description` in the copier via a safe getter.
const WodComponentSchema = z.object({
  id: z.string(),
  prefix: z.string().nullable(),
  workout: z.object({
    id: z.string(),
    type: z.string().nullable().optional(),
    // Named workout name (e.g. "Hildy", "Donny") or null for unnamed
    name: z.string().nullable().optional(),
    // Short label / prescription for named workouts (e.g. "For Time: Rowing…")
    // and WarmUp components. Generic workouts put full text in details.description.
    description: z.string().nullable().optional(),
    details: z.record(z.unknown()).nullable().optional(),
  }),
})

const WodSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  occursOn: z.string(), // YYYY-MM-DD
  publishAt: z.string().nullable().optional(),
  wodComponents: z.array(WodComponentSchema),
})

const GymWodsResponseSchema = z.object({
  data: z.object({
    currentUser: z.object({
      themeGym: z.object({
        id: z.string(),
        name: z.string(),
        publishedWods: z.array(WodSchema),
      }),
    }),
  }),
})

export type WodUpWod = z.infer<typeof WodSchema>
export type WodUpComponent = z.infer<typeof WodComponentSchema>
export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>

function formatDate(date: Date): string {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Fetches the gym's published WODs for the given date range from WODup.
 *
 * Uses `currentUser.themeGym.publishedWods` which returns all scheduled class
 * WODs regardless of whether the member has logged results — unlike the
 * `activityTimeline` field which only returns completed workouts.
 *
 * Auth: session_token cookie from browser DevTools (~4 month TTL).
 * Returns [] on any upstream error — callers soft-fail per jobs convention.
 */
export async function fetchWodUpWeek(
  startDate: Date,
  endDate: Date,
  sessionToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<WodUpWod[]> {
  const variables = {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  }

  let res: Response
  try {
    res = await fetchImpl(WODUP_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `session_token=${sessionToken}`,
        'wodup-version': '1.0',
        Referer: 'https://www.wodup.com/timeline',
        'User-Agent': 'WODalytics/1.0 (+https://github.com/chuckmag/WODalytics)',
      },
      body: JSON.stringify({
        operationName: 'GymPublishedWods',
        query: GYM_WODS_QUERY,
        variables,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    log.warning(`fetch failed: ${err instanceof Error ? err.message : err}`)
    return []
  }

  if (res.status === 401) {
    log.warning(
      'WODup returned 401 — session token is expired. Refresh WODUP_SESSION_TOKEN in Railway.',
    )
    return []
  }

  if (!res.ok) {
    log.warning(`non-OK response from WODup: status=${res.status}`)
    return []
  }

  let raw: unknown
  try {
    raw = await res.json()
  } catch (err) {
    log.warning(`json parse failed: ${err instanceof Error ? err.message : err}`)
    return []
  }

  const parsed = GymWodsResponseSchema.safeParse(raw)
  if (!parsed.success) {
    log.warning(`schema mismatch from WODup response: ${parsed.error.message}`)
    return []
  }

  return parsed.data.data.currentUser.themeGym.publishedWods
}
