import type { WorkoutType } from './api'

export interface WorkoutTypeStyle {
  abbr: string
  label: string
  tint: string       // foreground color, e.g. 'text-indigo-300'
  bg: string         // translucent background, e.g. 'bg-indigo-500/15'
  accentBar: string  // border color for left-accent bars, e.g. 'border-indigo-400'
}

export const WORKOUT_TYPE_STYLES: Record<WorkoutType, WorkoutTypeStyle> = {
  AMRAP:    { abbr: 'A',  label: 'AMRAP',    tint: 'text-indigo-300', bg: 'bg-indigo-500/15', accentBar: 'border-indigo-400' },
  FOR_TIME: { abbr: 'FT', label: 'For Time', tint: 'text-amber-300',  bg: 'bg-amber-500/15',  accentBar: 'border-amber-400'  },
  EMOM:     { abbr: 'E',  label: 'EMOM',     tint: 'text-teal-300',   bg: 'bg-teal-500/15',   accentBar: 'border-teal-400'   },
  STRENGTH: { abbr: 'S',  label: 'Strength', tint: 'text-rose-300',   bg: 'bg-rose-500/15',   accentBar: 'border-rose-400'   },
  CARDIO:   { abbr: 'C',  label: 'Cardio',   tint: 'text-sky-300',    bg: 'bg-sky-500/15',    accentBar: 'border-sky-400'    },
  METCON:   { abbr: 'M',  label: 'MetCon',   tint: 'text-violet-300', bg: 'bg-violet-500/15', accentBar: 'border-violet-400' },
  WARMUP:   { abbr: 'W',  label: 'Warmup',   tint: 'text-slate-300',  bg: 'bg-slate-500/15',  accentBar: 'border-slate-400'  },
}
