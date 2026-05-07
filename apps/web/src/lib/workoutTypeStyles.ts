import type { WorkoutType } from './api'

export type WorkoutCategory =
  | 'Strength'
  | 'Metcon'
  | 'MonoStructural'
  | 'Skill Work'
  | 'Warmup/Recovery'

/** Display order for categories in pickers and lists. */
export const WORKOUT_CATEGORIES: WorkoutCategory[] = [
  'Strength',
  'Metcon',
  'MonoStructural',
  'Skill Work',
  'Warmup/Recovery',
]

export interface WorkoutTypeStyle {
  abbr: string
  label: string
  category: WorkoutCategory
  tint: string       // foreground color, e.g. 'text-indigo-300'
  bg: string         // translucent background, e.g. 'bg-indigo-500/15'
  accentBar: string  // border color for left-accent bars, e.g. 'border-indigo-400'
  /** Hidden from new-workout pickers but valid for existing records. */
  deprecated?: boolean
}

export const WORKOUT_TYPE_STYLES: Record<WorkoutType, WorkoutTypeStyle> = {
  // ─── Strength ───────────────────────────────────────────────────────────────
  STRENGTH:       { abbr: 'STR', label: 'Strength',       category: 'Strength', tint: 'text-rose-300',    bg: 'bg-rose-500/15',    accentBar: 'border-rose-400',    deprecated: true },
  POWER_LIFTING:  { abbr: 'PL',  label: 'Power Lifting',  category: 'Strength', tint: 'text-red-300',     bg: 'bg-red-500/15',     accentBar: 'border-red-400'     },
  WEIGHT_LIFTING: { abbr: 'WL',  label: 'Weight Lifting', category: 'Strength', tint: 'text-orange-300',  bg: 'bg-orange-500/15',  accentBar: 'border-orange-400'  },
  BODY_BUILDING:  { abbr: 'BB',  label: 'Bodybuilding',   category: 'Strength', tint: 'text-pink-300',    bg: 'bg-pink-500/15',    accentBar: 'border-pink-400'    },
  MAX_EFFORT:     { abbr: 'ME',  label: 'Max Effort',     category: 'Strength', tint: 'text-fuchsia-300', bg: 'bg-fuchsia-500/15', accentBar: 'border-fuchsia-400' },

  // ─── Metcon ─────────────────────────────────────────────────────────────────
  AMRAP:     { abbr: 'AM',  label: 'AMRAP',     category: 'Metcon', tint: 'text-indigo-300',  bg: 'bg-indigo-500/15',  accentBar: 'border-indigo-400'  },
  FOR_TIME:  { abbr: 'FT',  label: 'For Time',  category: 'Metcon', tint: 'text-amber-300',   bg: 'bg-amber-500/15',   accentBar: 'border-amber-400'   },
  EMOM:      { abbr: 'EM',  label: 'EMOM',      category: 'Metcon', tint: 'text-teal-300',    bg: 'bg-teal-500/15',    accentBar: 'border-teal-400'    },
  METCON:    { abbr: 'MET', label: 'Metcon',    category: 'Metcon', tint: 'text-violet-300',  bg: 'bg-violet-500/15',  accentBar: 'border-violet-400', deprecated: true },
  TABATA:    { abbr: 'TB',  label: 'Tabata',    category: 'Metcon', tint: 'text-purple-300',  bg: 'bg-purple-500/15',  accentBar: 'border-purple-400'  },
  INTERVALS: { abbr: 'IN',  label: 'Intervals', category: 'Metcon', tint: 'text-blue-300',    bg: 'bg-blue-500/15',    accentBar: 'border-blue-400'    },
  CHIPPER:   { abbr: 'CH',  label: 'Chipper',   category: 'Metcon', tint: 'text-cyan-300',    bg: 'bg-cyan-500/15',    accentBar: 'border-cyan-400'    },
  LADDER:    { abbr: 'LD',  label: 'Ladder',    category: 'Metcon', tint: 'text-emerald-300', bg: 'bg-emerald-500/15', accentBar: 'border-emerald-400' },
  DEATH_BY:  { abbr: 'DB',  label: 'Death By',  category: 'Metcon', tint: 'text-yellow-300',  bg: 'bg-yellow-500/15',  accentBar: 'border-yellow-400'  },

  // ─── MonoStructural ─────────────────────────────────────────────────────────
  CARDIO:     { abbr: 'CAR', label: 'Cardio',      category: 'MonoStructural', tint: 'text-sky-300',     bg: 'bg-sky-500/15',     accentBar: 'border-sky-400',     deprecated: true },
  RUNNING:    { abbr: 'RN',  label: 'Running',     category: 'MonoStructural', tint: 'text-lime-300',    bg: 'bg-lime-500/15',    accentBar: 'border-lime-400'    },
  ROWING:     { abbr: 'RW',  label: 'Rowing',      category: 'MonoStructural', tint: 'text-green-300',   bg: 'bg-green-500/15',   accentBar: 'border-green-400'   },
  BIKING:     { abbr: 'BK',  label: 'Biking',      category: 'MonoStructural', tint: 'text-stone-300',   bg: 'bg-stone-500/15',   accentBar: 'border-stone-400'   },
  SWIMMING:   { abbr: 'SW',  label: 'Swimming',    category: 'MonoStructural', tint: 'text-blue-300',    bg: 'bg-blue-500/15',    accentBar: 'border-blue-400'    },
  SKI_ERG:    { abbr: 'SK',  label: 'Ski Erg',     category: 'MonoStructural', tint: 'text-zinc-300',    bg: 'bg-zinc-500/15',    accentBar: 'border-zinc-400'    },
  MIXED_MONO: { abbr: 'MM',  label: 'Mixed Mono',  category: 'MonoStructural', tint: 'text-neutral-300', bg: 'bg-neutral-500/15', accentBar: 'border-neutral-400' },

  // ─── Skill Work ─────────────────────────────────────────────────────────────
  GYMNASTICS:              { abbr: 'GM', label: 'Gymnastics',              category: 'Skill Work', tint: 'text-emerald-300', bg: 'bg-emerald-500/15', accentBar: 'border-emerald-400' },
  WEIGHTLIFTING_TECHNIQUE: { abbr: 'WT', label: 'Weightlifting Technique', category: 'Skill Work', tint: 'text-orange-300',  bg: 'bg-orange-500/15',  accentBar: 'border-orange-400'  },

  // ─── Warmup / Recovery ──────────────────────────────────────────────────────
  WARMUP:   { abbr: 'WU', label: 'Warmup',   category: 'Warmup/Recovery', tint: 'text-slate-300', bg: 'bg-slate-500/15', accentBar: 'border-slate-400' },
  MOBILITY: { abbr: 'MB', label: 'Mobility', category: 'Warmup/Recovery', tint: 'text-gray-600 dark:text-gray-300',  bg: 'bg-gray-500/15',  accentBar: 'border-gray-400'  },
  COOLDOWN: { abbr: 'CD', label: 'Cooldown', category: 'Warmup/Recovery', tint: 'text-stone-300', bg: 'bg-stone-500/15', accentBar: 'border-stone-400' },
}

/** Returns the category for a given workout type. */
export function categoryOf(type: WorkoutType): WorkoutCategory {
  return WORKOUT_TYPE_STYLES[type].category
}

/** Returns all workout types belonging to the given category, in enum-declaration order. */
export function typesInCategory(category: WorkoutCategory): WorkoutType[] {
  return (Object.keys(WORKOUT_TYPE_STYLES) as WorkoutType[]).filter(
    (t) => WORKOUT_TYPE_STYLES[t].category === category,
  )
}
