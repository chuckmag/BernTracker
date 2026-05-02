// Mobile parity for apps/web/src/lib/workoutTypeStyles.ts.
//
// Same abbreviations + categories + color hues as the web map, translated
// from Tailwind class names into RN-friendly hex / rgba strings:
//   tint      = text-{color}-300        → '#hex' (foreground)
//   bgTint    = bg-{color}-500/15       → 'rgba(...,0.15)' (badge background)
//   accentBar = border-{color}-400      → '#hex' (accent bar / left border)
//
// Keep this file in sync with the web one when types are added or recolored.

import type { WorkoutType } from './api'

export type WorkoutCategory =
  | 'Strength'
  | 'Metcon'
  | 'MonoStructural'
  | 'Skill Work'
  | 'Warmup/Recovery'

export interface WorkoutTypeStyle {
  abbr: string
  label: string
  category: WorkoutCategory
  tint: string       // foreground color
  bgTint: string     // translucent background
  accentBar: string  // left-accent bar / border color
  /** Hidden from new-workout pickers but valid for existing records. */
  deprecated?: boolean
}

export const WORKOUT_TYPE_STYLES: Record<WorkoutType, WorkoutTypeStyle> = {
  // ─── Strength ───────────────────────────────────────────────────────────────
  STRENGTH:       { abbr: 'STR', label: 'Strength',       category: 'Strength', tint: '#fda4af', bgTint: 'rgba(244,63,94,0.15)',  accentBar: '#fb7185', deprecated: true },
  POWER_LIFTING:  { abbr: 'PL',  label: 'Power Lifting',  category: 'Strength', tint: '#fca5a5', bgTint: 'rgba(239,68,68,0.15)',  accentBar: '#f87171' },
  WEIGHT_LIFTING: { abbr: 'WL',  label: 'Weight Lifting', category: 'Strength', tint: '#fdba74', bgTint: 'rgba(249,115,22,0.15)', accentBar: '#fb923c' },
  BODY_BUILDING:  { abbr: 'BB',  label: 'Bodybuilding',   category: 'Strength', tint: '#f9a8d4', bgTint: 'rgba(236,72,153,0.15)', accentBar: '#f472b6' },
  MAX_EFFORT:     { abbr: 'ME',  label: 'Max Effort',     category: 'Strength', tint: '#f0abfc', bgTint: 'rgba(217,70,239,0.15)', accentBar: '#e879f9' },

  // ─── Metcon ─────────────────────────────────────────────────────────────────
  AMRAP:     { abbr: 'AM',  label: 'AMRAP',     category: 'Metcon', tint: '#a5b4fc', bgTint: 'rgba(99,102,241,0.15)',  accentBar: '#818cf8' },
  FOR_TIME:  { abbr: 'FT',  label: 'For Time',  category: 'Metcon', tint: '#fcd34d', bgTint: 'rgba(245,158,11,0.15)',  accentBar: '#fbbf24' },
  EMOM:      { abbr: 'EM',  label: 'EMOM',      category: 'Metcon', tint: '#5eead4', bgTint: 'rgba(20,184,166,0.15)',  accentBar: '#2dd4bf' },
  METCON:    { abbr: 'MET', label: 'Metcon',    category: 'Metcon', tint: '#c4b5fd', bgTint: 'rgba(139,92,246,0.15)',  accentBar: '#a78bfa', deprecated: true },
  TABATA:    { abbr: 'TB',  label: 'Tabata',    category: 'Metcon', tint: '#d8b4fe', bgTint: 'rgba(168,85,247,0.15)',  accentBar: '#c084fc' },
  INTERVALS: { abbr: 'IN',  label: 'Intervals', category: 'Metcon', tint: '#93c5fd', bgTint: 'rgba(59,130,246,0.15)',  accentBar: '#60a5fa' },
  CHIPPER:   { abbr: 'CH',  label: 'Chipper',   category: 'Metcon', tint: '#67e8f9', bgTint: 'rgba(6,182,212,0.15)',   accentBar: '#22d3ee' },
  LADDER:    { abbr: 'LD',  label: 'Ladder',    category: 'Metcon', tint: '#6ee7b7', bgTint: 'rgba(16,185,129,0.15)',  accentBar: '#34d399' },
  DEATH_BY:  { abbr: 'DB',  label: 'Death By',  category: 'Metcon', tint: '#fde047', bgTint: 'rgba(234,179,8,0.15)',   accentBar: '#facc15' },

  // ─── MonoStructural ─────────────────────────────────────────────────────────
  CARDIO:     { abbr: 'CAR', label: 'Cardio',     category: 'MonoStructural', tint: '#7dd3fc', bgTint: 'rgba(14,165,233,0.15)',  accentBar: '#38bdf8', deprecated: true },
  RUNNING:    { abbr: 'RN',  label: 'Running',    category: 'MonoStructural', tint: '#bef264', bgTint: 'rgba(132,204,22,0.15)',  accentBar: '#a3e635' },
  ROWING:     { abbr: 'RW',  label: 'Rowing',     category: 'MonoStructural', tint: '#86efac', bgTint: 'rgba(34,197,94,0.15)',   accentBar: '#4ade80' },
  BIKING:     { abbr: 'BK',  label: 'Biking',     category: 'MonoStructural', tint: '#d6d3d1', bgTint: 'rgba(120,113,108,0.15)', accentBar: '#a8a29e' },
  SWIMMING:   { abbr: 'SW',  label: 'Swimming',   category: 'MonoStructural', tint: '#93c5fd', bgTint: 'rgba(59,130,246,0.15)',  accentBar: '#60a5fa' },
  SKI_ERG:    { abbr: 'SK',  label: 'Ski Erg',    category: 'MonoStructural', tint: '#d4d4d8', bgTint: 'rgba(113,113,122,0.15)', accentBar: '#a1a1aa' },
  MIXED_MONO: { abbr: 'MM',  label: 'Mixed Mono', category: 'MonoStructural', tint: '#d4d4d4', bgTint: 'rgba(115,115,115,0.15)', accentBar: '#a3a3a3' },

  // ─── Skill Work ─────────────────────────────────────────────────────────────
  GYMNASTICS:              { abbr: 'GM', label: 'Gymnastics',              category: 'Skill Work', tint: '#6ee7b7', bgTint: 'rgba(16,185,129,0.15)', accentBar: '#34d399' },
  WEIGHTLIFTING_TECHNIQUE: { abbr: 'WT', label: 'Weightlifting Technique', category: 'Skill Work', tint: '#fdba74', bgTint: 'rgba(249,115,22,0.15)', accentBar: '#fb923c' },

  // ─── Warmup / Recovery ──────────────────────────────────────────────────────
  WARMUP:   { abbr: 'WU', label: 'Warmup',   category: 'Warmup/Recovery', tint: '#cbd5e1', bgTint: 'rgba(100,116,139,0.15)', accentBar: '#94a3b8' },
  MOBILITY: { abbr: 'MB', label: 'Mobility', category: 'Warmup/Recovery', tint: '#d1d5db', bgTint: 'rgba(107,114,128,0.15)', accentBar: '#9ca3af' },
  COOLDOWN: { abbr: 'CD', label: 'Cooldown', category: 'Warmup/Recovery', tint: '#d6d3d1', bgTint: 'rgba(120,113,108,0.15)', accentBar: '#a8a29e' },
}

/** Returns the category for a given workout type. */
export function categoryOf(type: WorkoutType): WorkoutCategory {
  return WORKOUT_TYPE_STYLES[type].category
}

/** Falls back to a neutral style for any unknown type — mirrors web's `?? '?'`
 *  pattern at the call site, but here we return a real style record so consumers
 *  can pull abbr + colors uniformly. */
export const UNKNOWN_TYPE_STYLE: WorkoutTypeStyle = {
  abbr: '?',
  label: 'Unknown',
  category: 'Warmup/Recovery',
  tint: '#9ca3af',
  bgTint: 'rgba(75,85,99,0.15)',
  accentBar: '#6b7280',
}

export function styleFor(type: string): WorkoutTypeStyle {
  return WORKOUT_TYPE_STYLES[type as WorkoutType] ?? UNKNOWN_TYPE_STYLE
}
