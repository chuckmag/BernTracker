/**
 * Seed script: CrossFit movement library
 *
 * Safe to rerun — all operations use upsert on the unique name field.
 * To add new movements in future iterations: add entries to BASES or VARIATIONS
 * below and rerun. Existing rows will not be duplicated or overwritten.
 *
 * Run: npm run db:seed-movements --workspace=@wodalytics/db
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Base movements (parentId = null) ────────────────────────────────────────

const BASES: string[] = [
  'Snatch',
  'Clean',
  'Jerk',
  'Clean & Jerk',
  'Deadlift',
  'Back Squat',
  'Front Squat',
  'Overhead Squat',
  'Strict Press',
  'Push Press',
  'Push Jerk',
  'Thruster',
  'Pull-up',
  'Muscle-up',
  'Handstand Push-up',
  'Toes-to-Bar',
  'Knees-to-Elbow',
  'Wall Ball',
  'Kettlebell Swing',
  'Box Jump',
  'Double Under',
  'Burpee',
  'Rope Climb',
  'Row',
  'Bike',
  'Run',
  'Ski',
  'GHD Sit-up',
  'Back Extension',
  'Handstand Walk',
  'Pistol',
  'Lunge',
  'Step-up',
  'Push-up',
  'Sit-up',
]

// ─── Variations (name + parentName) ──────────────────────────────────────────

const VARIATIONS: { name: string; parentName: string }[] = [
  // Snatch
  { name: 'Power Snatch', parentName: 'Snatch' },
  { name: 'Squat Snatch', parentName: 'Snatch' },
  { name: 'Hang Power Snatch', parentName: 'Snatch' },
  { name: 'Hang Squat Snatch', parentName: 'Snatch' },
  { name: 'High Hang Power Snatch', parentName: 'Snatch' },
  { name: 'High Hang Squat Snatch', parentName: 'Snatch' },
  { name: 'Snatch Balance', parentName: 'Snatch' },

  // Clean
  { name: 'Power Clean', parentName: 'Clean' },
  { name: 'Squat Clean', parentName: 'Clean' },
  { name: 'Hang Power Clean', parentName: 'Clean' },
  { name: 'Hang Squat Clean', parentName: 'Clean' },
  { name: 'High Hang Power Clean', parentName: 'Clean' },

  // Jerk
  { name: 'Split Jerk', parentName: 'Jerk' },
  { name: 'Power Jerk', parentName: 'Jerk' },
  { name: 'Squat Jerk', parentName: 'Jerk' },

  // Deadlift
  { name: 'Romanian Deadlift', parentName: 'Deadlift' },
  { name: 'Sumo Deadlift', parentName: 'Deadlift' },
  { name: 'Sumo Deadlift High Pull', parentName: 'Deadlift' },
  { name: 'Stiff-Leg Deadlift', parentName: 'Deadlift' },

  // Pull-up
  { name: 'Strict Pull-up', parentName: 'Pull-up' },
  { name: 'Kipping Pull-up', parentName: 'Pull-up' },
  { name: 'Butterfly Pull-up', parentName: 'Pull-up' },
  { name: 'Chest-to-Bar Pull-up', parentName: 'Pull-up' },

  // Muscle-up
  { name: 'Ring Muscle-up', parentName: 'Muscle-up' },
  { name: 'Bar Muscle-up', parentName: 'Muscle-up' },

  // Handstand Push-up
  { name: 'Strict Handstand Push-up', parentName: 'Handstand Push-up' },
  { name: 'Kipping Handstand Push-up', parentName: 'Handstand Push-up' },
  { name: 'Deficit Handstand Push-up', parentName: 'Handstand Push-up' },

  // Kettlebell Swing
  { name: 'Russian Kettlebell Swing', parentName: 'Kettlebell Swing' },
  { name: 'American Kettlebell Swing', parentName: 'Kettlebell Swing' },

  // Box Jump
  { name: 'Box Jump Over', parentName: 'Box Jump' },
  { name: 'Box Step-up Over', parentName: 'Box Jump' },

  // Double Under
  { name: 'Single Under', parentName: 'Double Under' },
  { name: 'Triple Under', parentName: 'Double Under' },

  // Burpee
  { name: 'Bar-facing Burpee', parentName: 'Burpee' },
  { name: 'Burpee Box Jump Over', parentName: 'Burpee' },
  { name: 'Burpee Pull-up', parentName: 'Burpee' },

  // Bike
  { name: 'Assault Bike', parentName: 'Bike' },
  { name: 'Echo Bike', parentName: 'Bike' },

  // Lunge
  { name: 'Walking Lunge', parentName: 'Lunge' },
  { name: 'Overhead Lunge', parentName: 'Lunge' },
  { name: 'Front Rack Lunge', parentName: 'Lunge' },

  // Push-up
  { name: 'Hand Release Push-up', parentName: 'Push-up' },
  { name: 'Ring Push-up', parentName: 'Push-up' },
]

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding movements...')

  // Pass 1: base movements
  for (const name of BASES) {
    await prisma.movement.upsert({
      where: { name },
      update: {},
      create: { name, status: 'ACTIVE' },
    })
  }
  console.log(`  ✓ ${BASES.length} base movements`)

  // Pass 2: variations — resolve parentId by name
  const parentRows = await prisma.movement.findMany({
    where: { name: { in: [...new Set(VARIATIONS.map((v) => v.parentName))] } },
    select: { id: true, name: true },
  })
  const byName = new Map(parentRows.map((m) => [m.name, m.id]))

  let seeded = 0
  let skipped = 0
  for (const { name, parentName } of VARIATIONS) {
    const parentId = byName.get(parentName)
    if (!parentId) {
      console.warn(`  ⚠ parent not found for variation "${name}" (parent: "${parentName}") — skipped`)
      skipped++
      continue
    }
    await prisma.movement.upsert({
      where: { name },
      update: { parentId },
      create: { name, status: 'ACTIVE', parentId },
    })
    seeded++
  }
  console.log(`  ✓ ${seeded} variations${skipped > 0 ? `, ${skipped} skipped` : ''}`)

  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
