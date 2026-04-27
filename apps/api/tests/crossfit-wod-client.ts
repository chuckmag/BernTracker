/**
 * Unit tests for the CrossFit WOD JSON client.
 *
 * Pure-logic tests — no live API or DB required. The client is exercised
 * with a stub `fetch` that returns canned `Response` objects, plus a
 * captured fixture for the happy path.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fetchCrossfitWod, type FetchImpl } from '../src/lib/crossfitWodClient.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(__dirname, 'fixtures', 'crossfit-wod-260425.json')
const fixtureRaw = readFileSync(fixturePath, 'utf8')
const fixturePayload = JSON.parse(fixtureRaw)

let pass = 0
let fail = 0

function check(label: string, expected: unknown, actual: unknown) {
  if (String(expected) === String(actual)) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  [expected=${expected} actual=${actual}]`)
    fail++
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Sample date: April 25, 2026 (matches the fixture).
const D = new Date(Date.UTC(2026, 3, 25))

async function main() {
  console.log('fetchCrossfitWod — happy path')
  {
    let calledUrl: string | null = null
    const stub: FetchImpl = async (url) => {
      calledUrl = url
      return jsonResponse(fixturePayload)
    }
    const result = await fetchCrossfitWod(D, stub)
    check('returns non-null', true, result !== null)
    check('hits the date-formatted URL', 'https://www.crossfit.com/workout/2026/04/25', calledUrl)
    check('externalId from wods.id', 'w20260425', result?.externalId)
    check('title preserved', 'Saturday 260425', result?.title)
    check('descriptionRaw preserved', fixturePayload.wods.wodRaw, result?.descriptionRaw)
    check('descriptionHtml preserved', fixturePayload.wods.wodHtml, result?.descriptionHtml)
    check('scheduledAt is publishingDate', '2026-04-24T23:55:00+00:00', result?.scheduledAt)
    check('canonicalUrl from wods.url', '/260425', result?.canonicalUrl)
    check('previousUrl extracted', '/260424', result?.previousUrl)
  }

  console.log('\nfetchCrossfitWod — draft / non-published')
  {
    const draft = { ...fixturePayload, wods: { ...fixturePayload.wods, publishingState: 'draft' } }
    const stub: FetchImpl = async () => jsonResponse(draft)
    const result = await fetchCrossfitWod(D, stub)
    check('returns null for draft state', null, result)
  }

  console.log('\nfetchCrossfitWod — HTTP errors')
  {
    const stub500: FetchImpl = async () => new Response('boom', { status: 500 })
    check('returns null for HTTP 500', null, await fetchCrossfitWod(D, stub500))

    const stub429: FetchImpl = async () => new Response('rate', { status: 429 })
    check('returns null for HTTP 429', null, await fetchCrossfitWod(D, stub429))

    const stub404: FetchImpl = async () => new Response('not found', { status: 404 })
    check('returns null for HTTP 404', null, await fetchCrossfitWod(D, stub404))
  }

  console.log('\nfetchCrossfitWod — non-JSON content-type')
  {
    const stub: FetchImpl = async () =>
      new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    check('returns null when content-type is not JSON', null, await fetchCrossfitWod(D, stub))
  }

  console.log('\nfetchCrossfitWod — malformed JSON')
  {
    const stub: FetchImpl = async () =>
      new Response('{not json', { status: 200, headers: { 'content-type': 'application/json' } })
    check('returns null when JSON parse fails', null, await fetchCrossfitWod(D, stub))
  }

  console.log('\nfetchCrossfitWod — schema mismatch')
  {
    const broken = { wods: { id: 123, title: 'wrong types' } }
    const stub: FetchImpl = async () => jsonResponse(broken)
    check('returns null when Zod validation fails', null, await fetchCrossfitWod(D, stub))
  }

  console.log('\nfetchCrossfitWod — fetch throws')
  {
    const stub: FetchImpl = async () => {
      throw new Error('network down')
    }
    check('returns null when fetch throws', null, await fetchCrossfitWod(D, stub))
  }

  console.log('\nfetchCrossfitWod — previous: false')
  {
    const noPrev = { ...fixturePayload, wods: { ...fixturePayload.wods, previous: false as const } }
    const stub: FetchImpl = async () => jsonResponse(noPrev)
    const result = await fetchCrossfitWod(D, stub)
    check('handles previous: false (returns previousUrl null)', null, result?.previousUrl)
    check('still returns the workout', 'w20260425', result?.externalId)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error('test runner crashed:', err)
  process.exit(1)
})
