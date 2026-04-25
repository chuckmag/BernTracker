import { z } from 'zod'
import { createLogger } from './logger.js'

const log = createLogger('crossfit-wod-client')

const FETCH_TIMEOUT_MS = 10_000

const CrossfitWodPayloadSchema = z.object({
  wods: z.object({
    id: z.string(),
    cleanID: z.string(),
    title: z.string(),
    wodRaw: z.string(),
    wodHtml: z.string(),
    publishingState: z.string(),
    publishingDate: z.string(),
    url: z.string(),
    topicId: z.string(),
    previous: z
      .union([z.object({ url: z.string() }), z.literal(false)])
      .optional(),
  }),
})

export interface NormalizedCrossfitWod {
  externalId: string
  title: string
  descriptionRaw: string
  descriptionHtml: string
  scheduledAt: string
  canonicalUrl: string
  previousUrl: string | null
}

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>

function buildUrl(date: Date): string {
  const yyyy = date.getUTCFullYear().toString()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `https://www.crossfit.com/workout/${yyyy}/${mm}/${dd}`
}

/**
 * Fetches the CrossFit Mainsite WOD for the given date from the undocumented
 * JSON endpoint the crossfit.com SPA uses.
 *
 * Returns a normalized payload on success, or `null` for any failure mode the
 * caller should treat as "skip this tick":
 *   - HTTP non-200 (4xx / 5xx / 429)
 *   - non-JSON content-type
 *   - JSON shape mismatch (Zod parse failure)
 *   - publishingState !== "published" (drafts)
 *   - network timeout / fetch error
 *
 * The optional `fetchImpl` parameter lets tests inject a stub. Defaults to
 * the global `fetch`.
 */
export async function fetchCrossfitWod(
  date: Date,
  fetchImpl: FetchImpl = fetch,
): Promise<NormalizedCrossfitWod | null> {
  const url = buildUrl(date)

  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BernTracker/1.0 (+https://github.com/chuckmag/BernTracker)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    log.warning(`fetch failed: ${url} — ${err instanceof Error ? err.message : err}`)
    return null
  }

  if (!res.ok) {
    log.warning(`non-OK response: ${url} — status=${res.status}`)
    return null
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    log.warning(`unexpected content-type: ${url} — ${contentType}`)
    return null
  }

  let raw: unknown
  try {
    raw = await res.json()
  } catch (err) {
    log.warning(`json parse failed: ${url} — ${err instanceof Error ? err.message : err}`)
    return null
  }

  const parsed = CrossfitWodPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    log.warning(`schema mismatch: ${url} — ${parsed.error.message}`)
    return null
  }

  const wod = parsed.data.wods

  if (wod.publishingState !== 'published') {
    log.info(`skipping non-published wod: ${wod.id} state=${wod.publishingState}`)
    return null
  }

  const previousUrl =
    wod.previous && typeof wod.previous === 'object' ? wod.previous.url : null

  return {
    externalId: wod.id,
    title: wod.title,
    descriptionRaw: wod.wodRaw,
    descriptionHtml: wod.wodHtml,
    scheduledAt: wod.publishingDate,
    canonicalUrl: wod.url,
    previousUrl,
  }
}
