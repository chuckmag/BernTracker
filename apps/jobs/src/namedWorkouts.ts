import { WorkoutCategory, findNamedWorkoutByName, createNamedWorkoutFromExternalSource } from '@wodalytics/db'
import { createLogger } from '@wodalytics/server'
import { parse } from 'node-html-parser'
import { classifyWorkoutType } from './lib/crossfitWodClassifier.js'

const log = createLogger('jobs.named-workouts')

const CROSSFIT_HEROES_URL = 'https://www.crossfit.com/heroes'
const CROSSFIT_BENCHMARK_BASE = 'https://www.crossfit.com'
const WODWELL_API_BASE = 'https://wodwell.com/wp-json/wp/v2/wods'
const WODWELL_GIRLS_TAG = 2681
const WODWELL_BENCHMARKS_CATEGORY = 2415
const FETCH_TIMEOUT_MS = 15_000
const WODWELL_PAGE_SIZE = 100
const DETAIL_FETCH_DELAY_MS = 300

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

export interface RunNamedWorkoutsJobDeps {
  fetchImpl?: FetchImpl
}

interface CrossfitHeroRaw {
  name: string
  slug: string
  prescriptionFromList: string | null
}

interface CrossfitHero {
  name: string
  slug: string
  prescription: string | null
}

interface WodwellEntry {
  id: number
  title: { rendered: string }
  link: string
}

interface WodwellDetail {
  prescription: string
  notes: string | null
}

/**
 * Ingests named workouts from two public sources into the NamedWorkout catalog:
 *
 *   1. CrossFit Mainsite `/heroes` — HTML-parsed (no public JSON API exists). Fetches
 *      the list page to get hero names/slugs, then follows each detail page for the
 *      full RX prescription and weight standards. Saves as HERO_WOD.
 *
 *   2. WODwell WordPress REST API — JSON, paginated. Fetches Girls WODs (tag 2681)
 *      as GIRL_WOD and Classic Benchmarks (category 2415) as BENCHMARK. Any entry
 *      whose name matches a CrossFit hero (case-insensitive) is skipped.
 *
 * Idempotent: skips any NamedWorkout whose `name` already exists in the DB
 * (unique constraint). Safe to run repeatedly on a weekly cron — already-saved
 * entries produce a skip log and no DB write.
 *
 * Soft-fail per source: if CrossFit.com or WODwell returns an error, that phase
 * logs a warning and moves on. Hard-fail on DB errors (propagates so the
 * dispatcher exits non-zero).
 *
 * `deps.fetchImpl` lets tests inject a stub so the job can run without hitting
 * live URLs.
 */
export async function runNamedWorkoutsJob(deps: RunNamedWorkoutsJobDeps = {}): Promise<void> {
  const fetchImpl: FetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init))

  let savedCount = 0
  let skippedCount = 0
  const heroNameSet = new Set<string>()

  // --- Phase 1: CrossFit Hero WODs (HTML — no JSON API) ---
  log.info('step: fetching CrossFit heroes list page')
  try {
    const rawHeroes = await fetchCrossfitHeroList(fetchImpl)
    log.info(`step: found ${rawHeroes.length} entries on crossfit.com/heroes`)

    for (const hero of rawHeroes) {
      heroNameSet.add(hero.name.toLowerCase())

      const existing = await findNamedWorkoutByName(hero.name)
      if (existing) {
        log.info(`skip: "${hero.name}" already exists`)
        skippedCount++
        continue
      }

      // Only fetch detail page for heroes not yet in the DB — avoids ~200
      // requests on every subsequent weekly cron run.
      const detail = await fetchCrossfitHeroDetail(hero, fetchImpl)
      await sleep(DETAIL_FETCH_DELAY_MS)

      const prescriptionText = detail.prescription ?? ''
      await createNamedWorkoutFromExternalSource({
        name: detail.name,
        category: WorkoutCategory.HERO_WOD,
        description: prescriptionText || null,
        sourceUrl: `${CROSSFIT_BENCHMARK_BASE}/benchmark/${detail.slug}`,
        template: {
          type: classifyWorkoutType(prescriptionText),
          description: prescriptionText,
        },
      })
      log.info(`saved HERO_WOD: "${detail.name}"`)
      savedCount++
    }
  } catch (err) {
    log.warning(`CrossFit heroes source failed (soft-fail) — ${err instanceof Error ? err.message : err}`)
  }

  // --- Phase 2: WODwell Girls WODs ---
  log.info('step: fetching WODwell Girls WODs')
  try {
    const entries = await fetchAllWodwellPages(fetchImpl, { tags: WODWELL_GIRLS_TAG })
    log.info(`step: got ${entries.length} WODwell Girls entries`)

    for (const entry of entries) {
      const name = decodeHtmlEntities(entry.title.rendered).trim()
      if (heroNameSet.has(name.toLowerCase())) {
        log.info(`skip: "${name}" is a CrossFit hero — not re-ingesting as GIRL_WOD`)
        skippedCount++
        continue
      }
      const existing = await findNamedWorkoutByName(name)
      if (existing) {
        skippedCount++
        continue
      }
      const detail = await fetchWodwellDetail(entry.link, fetchImpl)
      await sleep(DETAIL_FETCH_DELAY_MS)
      const description = detail.notes
        ? `${detail.prescription}\n\n${detail.notes}`
        : detail.prescription
      await createNamedWorkoutFromExternalSource({
        name,
        category: WorkoutCategory.GIRL_WOD,
        description: description || null,
        sourceUrl: entry.link,
        template: { type: classifyWorkoutType(detail.prescription), description },
      })
      log.info(`saved GIRL_WOD: "${name}"`)
      savedCount++
    }
    log.info('step: WODwell Girls WODs complete')
  } catch (err) {
    log.warning(`WODwell Girls WODs source failed (soft-fail) — ${err instanceof Error ? err.message : err}`)
  }

  // --- Phase 3: WODwell Benchmarks ---
  log.info('step: fetching WODwell Classic Benchmarks')
  try {
    const entries = await fetchAllWodwellPages(fetchImpl, { categories: WODWELL_BENCHMARKS_CATEGORY })
    log.info(`step: got ${entries.length} WODwell Benchmark entries`)

    for (const entry of entries) {
      const name = decodeHtmlEntities(entry.title.rendered).trim()
      if (heroNameSet.has(name.toLowerCase())) {
        skippedCount++
        continue
      }
      const existing = await findNamedWorkoutByName(name)
      if (existing) {
        skippedCount++
        continue
      }
      const detail = await fetchWodwellDetail(entry.link, fetchImpl)
      await sleep(DETAIL_FETCH_DELAY_MS)
      const description = detail.notes
        ? `${detail.prescription}\n\n${detail.notes}`
        : detail.prescription
      await createNamedWorkoutFromExternalSource({
        name,
        category: WorkoutCategory.BENCHMARK,
        description: description || null,
        sourceUrl: entry.link,
        template: { type: classifyWorkoutType(detail.prescription), description },
      })
      log.info(`saved BENCHMARK: "${name}"`)
      savedCount++
    }
    log.info('step: WODwell Benchmarks complete')
  } catch (err) {
    log.warning(`WODwell Benchmarks source failed (soft-fail) — ${err instanceof Error ? err.message : err}`)
  }

  log.info(`summary: ${savedCount} named workouts saved, ${skippedCount} skipped (already exist or hero-deduplicated)`)
}

// --- CrossFit HTML parsing ---

async function fetchCrossfitHeroList(fetchImpl: FetchImpl): Promise<CrossfitHeroRaw[]> {
  const res = await fetchImpl(CROSSFIT_HEROES_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'WODalytics/1.0 (+https://github.com/chuckmag/WODalytics)',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`crossfit.com/heroes returned HTTP ${res.status}`)

  const html = await res.text()
  const heroes = parseCrossfitHeroList(html)
  if (heroes.length === 0) {
    throw new Error('crossfit.com/heroes: no benchmark anchors found — markup may have changed')
  }
  return heroes
}

function parseCrossfitHeroList(html: string): CrossfitHeroRaw[] {
  const doc = parse(html)
  const anchors = doc.querySelectorAll('a[href^="/benchmark/"]')
  const seen = new Set<string>()
  const results: CrossfitHeroRaw[] = []

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') ?? ''
    const slug = href.replace('/benchmark/', '').replace(/\/$/, '').trim()
    if (!slug || seen.has(slug)) continue
    seen.add(slug)

    const name = anchor.querySelector('h3')?.text?.trim()
    if (!name) continue

    // CSS modules hashes (e.g. `_prescription_abc12_1`) change on redeploy;
    // match by partial class name so the selector survives a rebuild.
    const prescriptionEl = anchor.querySelector('[class*="_prescription"]')
    const prescriptionFromList = prescriptionEl?.text?.trim() || null

    results.push({ name, slug, prescriptionFromList })
  }
  return results
}

async function fetchCrossfitHeroDetail(
  hero: CrossfitHeroRaw,
  fetchImpl: FetchImpl,
): Promise<CrossfitHero> {
  const url = `${CROSSFIT_BENCHMARK_BASE}/benchmark/${hero.slug}`
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'WODalytics/1.0 (+https://github.com/chuckmag/WODalytics)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      log.warning(`detail "${hero.slug}" returned HTTP ${res.status} — using list prescription`)
      return { name: hero.name, slug: hero.slug, prescription: hero.prescriptionFromList }
    }

    const html = await res.text()
    const doc = parse(html)

    // Prefer the prescription inside the RXD section; fall back to any element
    // with "_prescription" in its class, then to the list-page text.
    const rxSection = doc.querySelector('[class*="_rxd"]')
    const prescriptionEl =
      rxSection?.querySelector('[class*="_prescription"]') ??
      doc.querySelector('[class*="_prescription"]')
    const prescription = prescriptionEl?.text?.trim() ?? hero.prescriptionFromList

    // Weight standards are annotated with ♀/♂ — grab the whole element text.
    const weightEl = doc.querySelector('[class*="_weightStandard"]')
    const weights = weightEl?.text?.trim()

    const fullDescription = weights ? `${prescription}\n${weights}` : prescription

    return { name: hero.name, slug: hero.slug, prescription: fullDescription ?? null }
  } catch (err) {
    log.warning(`detail fetch failed for "${hero.slug}" — ${err instanceof Error ? err.message : err}`)
    return { name: hero.name, slug: hero.slug, prescription: hero.prescriptionFromList }
  }
}

// --- WODwell HTML detail parsing ---

async function fetchWodwellDetail(url: string, fetchImpl: FetchImpl): Promise<WodwellDetail> {
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'WODalytics/1.0 (+https://github.com/chuckmag/WODalytics)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      log.warning(`WODwell detail "${url}" returned HTTP ${res.status} — no description`)
      return { prescription: '', notes: null }
    }

    const html = await res.text()
    const doc = parse(html)

    // .workout-list li items contain the workout prescription (e.g. "For Time", "21-15-9 Deadlifts")
    const listItems = doc.querySelectorAll('.workout-list li')
    const prescription = listItems.map((li) => li.text.trim()).filter(Boolean).join('\n')

    // .wod-notes contains the detailed description/coaching notes
    const notesEl = doc.querySelector('.wod-notes')
    const notes = notesEl?.text?.trim() || null

    return { prescription, notes }
  } catch (err) {
    log.warning(`WODwell detail fetch failed for "${url}" — ${err instanceof Error ? err.message : err}`)
    return { prescription: '', notes: null }
  }
}

// --- WODwell JSON API ---

async function fetchAllWodwellPages(
  fetchImpl: FetchImpl,
  filter: { tags?: number; categories?: number },
): Promise<WodwellEntry[]> {
  const results: WodwellEntry[] = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const params = new URLSearchParams({
      per_page: String(WODWELL_PAGE_SIZE),
      page: String(page),
      _fields: 'id,title,link',
    })
    if (filter.tags !== undefined) params.set('tags', String(filter.tags))
    if (filter.categories !== undefined) params.set('categories', String(filter.categories))

    const url = `${WODWELL_API_BASE}?${params}`
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(`WODwell API returned HTTP ${res.status} for page ${page} (filter: ${JSON.stringify(filter)})`)
    }

    const data = (await res.json()) as WodwellEntry[]
    if (!Array.isArray(data)) {
      throw new Error(`WODwell API: expected array on page ${page}, got ${typeof data}`)
    }
    results.push(...data)

    if (page === 1) {
      const totalHeader = res.headers.get('x-wp-totalpages')
      totalPages = totalHeader ? parseInt(totalHeader, 10) : 1
      log.info(`WODwell: ${res.headers.get('x-wp-total') ?? '?'} entries across ${totalPages} pages (filter: ${JSON.stringify(filter)})`)
    }
    page++
  }

  return results
}

// --- Utilities ---

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
