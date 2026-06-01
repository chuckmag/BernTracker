import { z } from 'zod'
import { createLogger } from '@wodalytics/server'

const log = createLogger('wodup-client')

const FETCH_TIMEOUT_MS = 15_000
const WODUP_GRAPHQL_URL = 'https://www.wodup.com/api/graphql?op=TimelineFetchMore'

// Fetches the signed-in user's activity timeline for a date range. Returns
// the gym-programmed WODs scheduled on each day in that range.
const TIMELINE_QUERY = `
  query TimelineFetchMore($startDate: Date!, $endDate: Date!) {
    currentUser {
      activityTimeline(startDate: $startDate, endDate: $endDate) {
        date
        completedWodsOccursOnDate {
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

const WodComponentSchema = z.object({
  id: z.string(),
  prefix: z.string(),
  workout: z.object({
    id: z.string(),
    type: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    details: z.string().nullable().optional(),
  }),
})

const WodSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  occursOn: z.string(), // YYYY-MM-DD
  publishAt: z.string().nullable().optional(),
  wodComponents: z.array(WodComponentSchema),
})

const TimelineResponseSchema = z.object({
  data: z.object({
    currentUser: z.object({
      activityTimeline: z.array(
        z.object({
          date: z.string(),
          completedWodsOccursOnDate: z.array(WodSchema),
        }),
      ),
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
 * Fetches programmed WODs from the WODup GraphQL API for the given date range.
 *
 * Auth uses the session_token cookie (obtained from browser DevTools, ~4 month TTL).
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
        operationName: 'TimelineFetchMore',
        query: TIMELINE_QUERY,
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

  const parsed = TimelineResponseSchema.safeParse(raw)
  if (!parsed.success) {
    log.warning(`schema mismatch from WODup response: ${parsed.error.message}`)
    return []
  }

  const wods: WodUpWod[] = []
  for (const day of parsed.data.data.currentUser.activityTimeline) {
    for (const wod of day.completedWodsOccursOnDate) {
      wods.push(wod)
    }
  }

  return wods
}
