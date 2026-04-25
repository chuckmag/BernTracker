import { describe, it, expect } from 'vitest'
import {
  WORKOUT_CATEGORIES,
  WORKOUT_TYPE_STYLES,
  categoryOf,
  typesInCategory,
  type WorkoutCategory,
} from './workoutTypeStyles'
import type { WorkoutType } from './api'

describe('WORKOUT_TYPE_STYLES', () => {
  it('has an entry for every WorkoutType', () => {
    // Compile-time check via Record<WorkoutType, …> covers most cases; this asserts
    // every entry's `category` is one of the declared category names.
    for (const t of Object.keys(WORKOUT_TYPE_STYLES) as WorkoutType[]) {
      expect(WORKOUT_CATEGORIES).toContain(WORKOUT_TYPE_STYLES[t].category)
    }
  })

  it('marks STRENGTH and CARDIO as deprecated; nothing else', () => {
    const deprecated = (Object.keys(WORKOUT_TYPE_STYLES) as WorkoutType[]).filter(
      (t) => WORKOUT_TYPE_STYLES[t].deprecated,
    )
    expect(deprecated.sort()).toEqual(['CARDIO', 'STRENGTH'])
  })

  it('every entry has a non-empty 2-3 char abbreviation', () => {
    for (const t of Object.keys(WORKOUT_TYPE_STYLES) as WorkoutType[]) {
      const abbr = WORKOUT_TYPE_STYLES[t].abbr
      expect(abbr.length).toBeGreaterThanOrEqual(2)
      expect(abbr.length).toBeLessThanOrEqual(3)
    }
  })

  it('every entry has tint, bg, and accentBar Tailwind classes', () => {
    for (const t of Object.keys(WORKOUT_TYPE_STYLES) as WorkoutType[]) {
      const s = WORKOUT_TYPE_STYLES[t]
      expect(s.tint).toMatch(/^text-/)
      expect(s.bg).toMatch(/^bg-/)
      expect(s.accentBar).toMatch(/^border-/)
    }
  })
})

describe('categoryOf', () => {
  it('returns the declared category for known types', () => {
    expect(categoryOf('POWER_LIFTING')).toBe('Strength')
    expect(categoryOf('AMRAP')).toBe('Conditioning')
    expect(categoryOf('RUNNING')).toBe('MonoStructural')
    expect(categoryOf('GYMNASTICS')).toBe('Skill Work')
    expect(categoryOf('WARMUP')).toBe('Warmup/Recovery')
  })

  it('routes legacy STRENGTH to Strength category and CARDIO to MonoStructural', () => {
    expect(categoryOf('STRENGTH')).toBe('Strength')
    expect(categoryOf('CARDIO')).toBe('MonoStructural')
  })
})

describe('typesInCategory', () => {
  it('returns only types whose category matches', () => {
    const expected: Record<WorkoutCategory, WorkoutType[]> = {
      'Strength':       ['STRENGTH', 'POWER_LIFTING', 'WEIGHT_LIFTING', 'BODY_BUILDING', 'MAX_EFFORT'],
      'Conditioning':   ['AMRAP', 'FOR_TIME', 'EMOM', 'METCON', 'TABATA', 'INTERVALS', 'CHIPPER', 'LADDER', 'DEATH_BY'],
      'MonoStructural': ['CARDIO', 'RUNNING', 'ROWING', 'BIKING', 'SWIMMING', 'SKI_ERG', 'MIXED_MONO'],
      'Skill Work':     ['GYMNASTICS', 'WEIGHTLIFTING_TECHNIQUE'],
      'Warmup/Recovery':['WARMUP', 'MOBILITY', 'COOLDOWN'],
    }
    for (const cat of WORKOUT_CATEGORIES) {
      expect(typesInCategory(cat).sort()).toEqual(expected[cat].sort())
    }
  })

  it('returns an empty array for an unknown category', () => {
    // @ts-expect-error — testing runtime behavior with an invalid category
    expect(typesInCategory('Nonexistent')).toEqual([])
  })
})
