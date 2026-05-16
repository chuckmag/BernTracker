import { describe, it, expect } from 'vitest'
import { detectMovementsInText } from '@wodalytics/types'

// Lives in apps/web rather than packages/types because vitest is already
// set up here. The import path goes through the workspace symlink so this
// covers the shipped util byte-for-byte (no separate "test version").
//
// Mirrors the API integration cases that previously covered POST /movements/detect
// (apps/api/tests/movements.ts T11/T12), now ported to the pure function
// since the endpoint was removed in #330.

const CATALOG = [
  { id: 'mv-thr', name: 'Thruster',         aliases: ['thruster'] },
  { id: 'mv-pu',  name: 'Pull-up',          aliases: ['pull-up', 'pull up', 'pullup'] },
  { id: 'mv-wb',  name: 'Wall-ball Shot',   aliases: ['wall ball', 'wb'] },
  { id: 'mv-kbs', name: 'Kettlebell Swing', aliases: ['kbs', 'kettlebell swing'] },
  { id: 'mv-dl',  name: 'Deadlift',         aliases: ['deadlift', 'dl'] },
  { id: 'mv-bp',  name: 'Burpee Pull-up',   aliases: ['burpee pull-up'] },
]

describe('detectMovementsInText', () => {
  it('returns empty for an empty description', () => {
    expect(detectMovementsInText('', CATALOG)).toEqual([])
    expect(detectMovementsInText('   ', CATALOG)).toEqual([])
  })

  it('returns empty when the catalog is empty', () => {
    expect(detectMovementsInText('thruster pull-up', [])).toEqual([])
  })

  it('detects via canonical name (Pass 2 fuzzy match) — Fran-style description', () => {
    const matches = detectMovementsInText('21-15-9 Thruster and Pull-up', CATALOG)
    const ids = matches.map((m) => m.id)
    expect(ids).toContain('mv-thr')
    expect(ids).toContain('mv-pu')
  })

  it('detects via short alias (Pass 1 exact-token) — "WB" → Wall-ball Shot', () => {
    const matches = detectMovementsInText('AMRAP 12: 10 WB, 5 KBS', CATALOG)
    const ids = matches.map((m) => m.id)
    // Both short forms hit via alias index — Fuse alone would never match
    // 2-char tokens against multi-word canonical names.
    expect(ids).toContain('mv-wb')
    expect(ids).toContain('mv-kbs')
  })

  it('detects multi-word aliases — "Wall Ball" → Wall-ball Shot', () => {
    const matches = detectMovementsInText('5 rounds of 20 Wall Ball Shots', CATALOG)
    expect(matches.map((m) => m.id)).toContain('mv-wb')
  })

  it('60% length-ratio gate prevents short n-grams ("pull") matching long names', () => {
    // "pull" alone shouldn't match "Burpee Pull-up" — that's the gate's
    // whole point. The aliases for Pull-up (pull-up, pull up, pullup) DO
    // include the literal "pull-up", which means descriptions containing
    // that token can still match. Bare "pull" should not.
    const matches = detectMovementsInText('5 sets of pull strength', CATALOG)
    expect(matches.map((m) => m.id)).not.toContain('mv-bp')
    expect(matches.map((m) => m.id)).not.toContain('mv-pu')
  })

  it('skips fuzzy matching for single tokens shorter than 4 chars', () => {
    // "dl" is a short alias for Deadlift (Pass 1 hits). But unrelated
    // 2-3 char tokens shouldn't flood the suggestions via Fuse — that's
    // the explicit `length >= 4` gate on Pass 2's single-token n-grams.
    const matches = detectMovementsInText('go go go', CATALOG)
    expect(matches).toEqual([])
  })

  it('respects display order from the catalog (preserves caller-supplied order)', () => {
    // Detect filter() iterates the catalog in input order, so the output
    // matches whatever order the caller passed in. Useful when the caller
    // pre-sorts the catalog by name + wants the suggestions in that order.
    const reordered = [...CATALOG].reverse()
    const matches = detectMovementsInText('thruster pull-up', reordered)
    // Pull-up appears earlier than Thruster in the reversed catalog → it
    // should appear earlier in the output too.
    const ids = matches.map((m) => m.id)
    expect(ids.indexOf('mv-pu')).toBeLessThan(ids.indexOf('mv-thr'))
  })
})
