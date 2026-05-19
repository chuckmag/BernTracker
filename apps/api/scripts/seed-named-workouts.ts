/**
 * Seed script for named workouts (benchmarks, Girls, Hero WODs, etc.)
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run:
 *   cd apps/api && npx dotenv-cli -e ../../.env -- npx tsx scripts/seed-named-workouts.ts
 *
 * Strategy:
 * - Signs a short-lived token using the first OWNER/PROGRAMMER found in the DB
 * - POSTs each workout to /api/named-workouts
 * - Skips any that already exist (name is @unique — API returns 400 on duplicate)
 * - Logs created ID or skip reason for every entry
 *
 * To add more named workouts, add an object to the NAMED_WORKOUTS array below
 * following the same shape. See the Fran entry as the reference example.
 */

import { prisma } from '@berntracker/db'
import { signAccessToken } from '../src/lib/jwt.js'

const BASE = 'http://localhost:3000/api'

// ─── Data ─────────────────────────────────────────────────────────────────────

interface NamedWorkoutSeed {
  name: string
  category: 'GIRL_WOD' | 'HERO_WOD' | 'OPEN_WOD' | 'GAMES_WOD' | 'BENCHMARK'
  aliases: string[]
  template: {
    type: 'STRENGTH' | 'FOR_TIME' | 'EMOM' | 'CARDIO' | 'AMRAP' | 'METCON' | 'WARMUP'
    description: string   // rep scheme + RX weights (♂/♀) + "\n\nSource: <url>"
    movements: string[]   // lowercase, no weights — used for chip UI + filtering
  }
}

const NAMED_WORKOUTS: NamedWorkoutSeed[] = [
  // ── Girls ──────────────────────────────────────────────────────────────────

  {
    name: 'Fran',
    category: 'GIRL_WOD',
    aliases: ['fran'],
    template: {
      type: 'FOR_TIME',
      description:
        '21-15-9 reps for time:\n' +
        '- Thrusters (95 lb ♂ / 65 lb ♀)\n' +
        '- Pull-ups\n\n' +
        'Source: https://www.crossfit.com/fran',
      movements: ['thrusters', 'pull-ups'],
    },
  },

  // Add more here — copy the Fran block and adjust.
  // Naming conventions:
  //   name      → Title-cased canonical name ("Helen", not "HELEN")
  //   category  → See mapping: "The Girls" → GIRL_WOD, "Hero WOD" → HERO_WOD,
  //               "Open workout" → OPEN_WOD, "Games" → GAMES_WOD, else → BENCHMARK
  //   aliases   → lowercase slugs (["helen"]), useful for fuzzy-match later
  //   type      → FOR_TIME if "time to complete"; AMRAP if "rounds/reps"; EMOM if "every minute"
  //   movements → bare lowercase names, no weights ("thrusters" not "95 lb thrusters")
  //   description ends with "\n\nSource: https://www.crossfit.com/<slug>"
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Find any user with a staff role to sign a token for
  const user = await prisma.userGym.findFirst({
    where: { role: { in: ['OWNER', 'PROGRAMMER'] } },
    select: { userId: true, role: true },
  })

  if (!user) {
    console.error('No OWNER or PROGRAMMER found in the DB. Log in via the web app first.')
    process.exit(1)
  }

  const token = signAccessToken(user.userId, user.role)
  console.log(`Signing as userId=${user.userId} role=${user.role}\n`)

  let created = 0
  let skipped = 0
  let failed = 0

  for (const workout of NAMED_WORKOUTS) {
    const res = await fetch(`${BASE}/named-workouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workout),
    })

    const body = await res.json() as Record<string, unknown>

    if (res.status === 201) {
      console.log(`  ✓ ${workout.name} — id=${body.id}`)
      created++
    } else if (res.status === 400 && typeof body.error === 'string' && body.error.includes('Unique constraint')) {
      console.log(`  ○ ${workout.name} — already exists, skipped`)
      skipped++
    } else {
      console.log(`  ✗ ${workout.name} — ${res.status} ${JSON.stringify(body)}`)
      failed++
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed`)
  await prisma.$disconnect()
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
