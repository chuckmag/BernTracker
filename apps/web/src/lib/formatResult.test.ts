import { describe, expect, test } from 'vitest'
import { formatResultValue } from './formatResult'

describe('formatResultValue', () => {
  test('TIME score → "M:SS"', () => {
    expect(formatResultValue({ score: { kind: 'TIME', seconds: 305, cappedOut: false } })).toBe('5:05')
    expect(formatResultValue({ score: { kind: 'TIME', seconds: 525, cappedOut: false } })).toBe('8:45')
    expect(formatResultValue({ score: { kind: 'TIME', seconds: 60,  cappedOut: false } })).toBe('1:00')
  })

  test('TIME score with cappedOut → "CAPPED"', () => {
    expect(formatResultValue({ score: { kind: 'TIME', seconds: 600, cappedOut: true } })).toBe('CAPPED')
  })

  test('ROUNDS_REPS with rounds → "X rounds + Y reps"', () => {
    expect(formatResultValue({ score: { kind: 'ROUNDS_REPS', rounds: 6, reps: 12, cappedOut: false } })).toBe('6 rounds + 12 reps')
  })

  test('ROUNDS_REPS without rounds → "Y reps"', () => {
    expect(formatResultValue({ score: { kind: 'ROUNDS_REPS', reps: 95, cappedOut: false } })).toBe('95 reps')
  })

  test('LOAD score → "value unit"', () => {
    expect(formatResultValue({ score: { kind: 'LOAD', load: 225, unit: 'LB' } })).toBe('225 lb')
    expect(formatResultValue({ score: { kind: 'LOAD', load: 100, unit: 'KG' } })).toBe('100 kg')
  })

  test('DISTANCE score → "value unit"', () => {
    expect(formatResultValue({ score: { kind: 'DISTANCE', distance: 500, unit: 'M' } })).toBe('500 m')
    expect(formatResultValue({ score: { kind: 'DISTANCE', distance: 5,   unit: 'KM' } })).toBe('5 km')
  })

  test('CALORIES score → "N cal"', () => {
    expect(formatResultValue({ score: { kind: 'CALORIES', calories: 30 } })).toBe('30 cal')
  })

  test('movementResults — picks the heaviest set across movements', () => {
    // 5×225, 5×235, 6×255 — third set wins on raw load.
    expect(formatResultValue({
      movementResults: [{
        loadUnit: 'LB',
        sets: [
          { reps: '5', load: 225 },
          { reps: '5', load: 235 },
          { reps: '6', load: 255 },
        ],
      }],
    })).toBe('6 x 255 lb')
  })

  test('movementResults — heaviest wins across multiple movements', () => {
    expect(formatResultValue({
      movementResults: [
        { loadUnit: 'LB', sets: [{ reps: '5', load: 225 }] },
        { loadUnit: 'LB', sets: [{ reps: '10', load: 135 }] },
      ],
    })).toBe('5 x 225 lb')
  })

  test('movementResults — ties on load break by max-rep-chunk', () => {
    expect(formatResultValue({
      movementResults: [{
        loadUnit: 'LB',
        sets: [
          { reps: '1', load: 225 },
          { reps: '5', load: 225 },
        ],
      }],
    })).toBe('5 x 225 lb')
  })

  test('movementResults — cluster reps "1.1.1" display verbatim', () => {
    expect(formatResultValue({
      movementResults: [{
        loadUnit: 'LB',
        sets: [{ reps: '1.1.1', load: 245 }],
      }],
    })).toBe('1.1.1 x 245 lb')
  })

  test('movementResults — KG unit lowercases', () => {
    expect(formatResultValue({
      movementResults: [{ loadUnit: 'KG', sets: [{ reps: '5', load: 100 }] }],
    })).toBe('5 x 100 kg')
  })

  test('movementResults — no loads recorded falls back to "N sets logged"', () => {
    expect(formatResultValue({
      movementResults: [{ sets: [{ reps: '10' }, { reps: '8' }] }],
    })).toBe('2 sets logged')
    expect(formatResultValue({ movementResults: [{ sets: [{}] }] })).toBe('1 set logged')
  })

  test('null/undefined/empty → "—"', () => {
    expect(formatResultValue(null)).toBe('—')
    expect(formatResultValue(undefined)).toBe('—')
    expect(formatResultValue({})).toBe('—')
    expect(formatResultValue({ movementResults: [] })).toBe('—')
  })
})
