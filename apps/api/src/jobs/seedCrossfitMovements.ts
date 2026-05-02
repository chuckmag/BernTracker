import { prisma } from '@wodalytics/db'
import { createLogger } from '../lib/logger.js'

const log = createLogger('jobs.seed-crossfit-movements')

/**
 * Static catalog of movements + reference URLs from CrossFit's
 * `/crossfit-movements` listing page. Hand-curated rather than scraped at
 * runtime — the source page changes rarely, and a static array keeps the job
 * deterministic + safe to re-run without depending on crossfit.com being
 * reachable.
 *
 * To refresh: paste the new HTML from the listing into the source comment
 * (TODO link in the PR), strip "The " from each name when copying, keep the
 * URL exactly as it appears in the `<a href>` (some entries don't carry a
 * "the-" prefix even though the label does).
 *
 * Aliases are deliberately sparse — only added where the canonical name
 * isn't enough for fuzzy matching to find the movement (acronyms, common
 * shorthand). Don't add alternates that fuzzy already handles
 * (Wall-ball → wall ball, plurals, hyphen-vs-space).
 */
interface SeedMovement {
  name: string
  sourceUrl: string
  aliases?: string[]
}

const MOVEMENTS: SeedMovement[] = [
  // A
  { name: 'AbMat Sit-up',                    sourceUrl: 'https://www.crossfit.com/essentials/the-abmat-sit-up' },
  { name: 'Air Squat',                       sourceUrl: 'https://www.crossfit.com/essentials/the-air-squat' },
  // B
  { name: 'Back Scale',                      sourceUrl: 'https://www.crossfit.com/essentials/back-scales-progression' },
  { name: 'Back Squat',                      sourceUrl: 'https://www.crossfit.com/essentials/the-back-squat',                aliases: ['BS'] },
  { name: 'Barbell Front-rack Lunge',        sourceUrl: 'https://www.crossfit.com/essentials/barbell-front-rack-lunge',      aliases: ['Front Rack Lunge'] },
  { name: 'Bench Press',                     sourceUrl: 'https://www.crossfit.com/essentials/the-bench-press',               aliases: ['BP'] },
  { name: 'Box Jump',                        sourceUrl: 'https://www.crossfit.com/essentials/the-box-jump' },
  { name: 'Box Step-up',                     sourceUrl: 'https://www.crossfit.com/essentials/the-box-step-up',               aliases: ['Step-up'] },
  { name: 'Burpee',                          sourceUrl: 'https://www.crossfit.com/essentials/the-burpee-2' },
  { name: 'Burpee Box Jump-over',            sourceUrl: 'https://www.crossfit.com/essentials/the-burpee-box-jump-over',      aliases: ['BBJO', 'Burpee Box Jump Over'] },
  { name: 'Butterfly Pull-up',               sourceUrl: 'https://www.crossfit.com/essentials/the-butterfly-pull-up' },
  // C
  { name: 'Chest-to-wall Handstand Push-up', sourceUrl: 'https://www.crossfit.com/essentials/the-chest-to-wall-handstand-push-up' },
  { name: 'Clean',                           sourceUrl: 'https://www.crossfit.com/essentials/the-clean-2',                  aliases: ['Squat Clean'] },
  { name: 'Clean and Jerk',                  sourceUrl: 'https://www.crossfit.com/essentials/the-clean-and-jerk',            aliases: ['C&J', 'CJ', 'Clean & Jerk'] },
  { name: 'Clean and Push Jerk',             sourceUrl: 'https://www.crossfit.com/essentials/the-squat-clean-and-push-jerk' },
  // D
  { name: 'Deadlift',                        sourceUrl: 'https://www.crossfit.com/essentials/the-deadlift',                  aliases: ['DL'] },
  { name: 'Dip',                             sourceUrl: 'https://www.crossfit.com/essentials/the-dip' },
  { name: 'Double-under',                    sourceUrl: 'https://www.crossfit.com/essentials/the-double-under',              aliases: ['DU', 'doubles', 'Double Under'] },
  { name: 'Dumbbell Clean',                  sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-clean',            aliases: ['DB clean'] },
  { name: 'Dumbbell Deadlift',               sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-deadlift',         aliases: ['DB deadlift'] },
  { name: 'Dumbbell Farmers Carry',          sourceUrl: 'https://www.crossfit.com/essentials/the-farmer-carry',              aliases: ['farmers carry', 'farmer carry'] },
  { name: 'Dumbbell Front-rack Lunge',       sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-front-rack-lunge', aliases: ['DB front-rack lunge'] },
  { name: 'Dumbbell Front Squat',            sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-front-squat',      aliases: ['DB front squat'] },
  { name: 'Dumbbell Hang Clean',             sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-hang-clean',       aliases: ['DB hang clean'] },
  { name: 'Dumbbell Hang Power Clean',       sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-hang-power-clean', aliases: ['DB HPC'] },
  { name: 'Dumbbell Overhead Squat',         sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-overhead-squat',   aliases: ['DBOHS', 'DB OHS'] },
  { name: 'Dumbbell Overhead Walking Lunge', sourceUrl: 'https://www.crossfit.com/essentials/dumbbell-overhead-walking-lunge' },
  { name: 'Dumbbell Power Clean',            sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-power-clean',      aliases: ['DBPC', 'DB PC'] },
  { name: 'Dumbbell Power Snatch',           sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-power-snatch',     aliases: ['DBPS', 'DB PS'] },
  { name: 'Dumbbell Push Jerk',              sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-push-jerk',        aliases: ['DBPJ', 'DB PJ'] },
  { name: 'Dumbbell Push Press',             sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-push-press',       aliases: ['DBPP', 'DB PP'] },
  { name: 'Dumbbell Squat Snatch',           sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-snatch',           aliases: ['DB snatch'] },
  { name: 'Dumbbell Thruster',               sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-thruster',         aliases: ['DB thruster'] },
  { name: 'Dumbbell Turkish Get-up',         sourceUrl: 'https://www.crossfit.com/essentials/the-dumbbell-turkish-get-up',   aliases: ['TGU', 'Turkish get-up'] },
  // F
  { name: 'Forward Roll From Support',       sourceUrl: 'https://www.crossfit.com/essentials/forward-roll-from-support' },
  { name: 'Freestanding Handstand Push-up',  sourceUrl: 'https://www.crossfit.com/essentials/the-freestanding-handstand-push-up' },
  { name: 'Front Scale',                     sourceUrl: 'https://www.crossfit.com/essentials/front-scales-progression' },
  { name: 'Front Squat',                     sourceUrl: 'https://www.crossfit.com/essentials/the-front-squat',               aliases: ['FS'] },
  // G
  { name: 'GHD Back Extension',              sourceUrl: 'https://www.crossfit.com/essentials/the-ghd-back-extension' },
  { name: 'GHD Hip and Back Extension',      sourceUrl: 'https://www.crossfit.com/essentials/the-ghd-hip-and-back-extension' },
  { name: 'GHD Hip, Back, and Hip-back Extension', sourceUrl: 'https://www.crossfit.com/at-home/hip-back-and-hip-back-extensions' },
  { name: 'GHD Hip Extension',               sourceUrl: 'https://www.crossfit.com/essentials/the-ghd-hip-extension' },
  { name: 'GHD Sit-up',                      sourceUrl: 'https://www.crossfit.com/essentials/the-ghd-sit-up',                aliases: ['GHD'] },
  { name: 'Glide Kip',                       sourceUrl: 'https://www.crossfit.com/essentials/the-glide-kip' },
  { name: 'Good Morning',                    sourceUrl: 'https://www.crossfit.com/essentials/the-good-morning' },
  // H
  { name: 'Handstand',                       sourceUrl: 'https://www.crossfit.com/essentials/freestanding-handstand' },
  { name: 'Handstand Pirouette',             sourceUrl: 'https://www.crossfit.com/essentials/pirouettes' },
  { name: 'Handstand Push-up Variations',    sourceUrl: 'https://www.crossfit.com/essentials/handstand-push-up-variations',  aliases: ['HSPU', 'Handstand Push-up'] },
  { name: 'Handstand Walk',                  sourceUrl: 'https://www.crossfit.com/essentials/the-handstand-walk',            aliases: ['HSW'] },
  { name: 'Hang Clean',                      sourceUrl: 'https://www.crossfit.com/essentials/the-hang-squat-clean',          aliases: ['HC', 'Hang Squat Clean'] },
  { name: 'Hang Clean and Push Jerk',        sourceUrl: 'https://www.crossfit.com/essentials/the-hang-clean-and-push-jerk' },
  { name: 'Hanging L-sit',                   sourceUrl: 'https://www.crossfit.com/essentials/the-hanging-l-sit' },
  { name: 'Hang Power Clean',                sourceUrl: 'https://www.crossfit.com/essentials/the-hang-power-clean',          aliases: ['HPC'] },
  { name: 'Hang Power Snatch',               sourceUrl: 'https://www.crossfit.com/essentials/the-hang-power-snatch',         aliases: ['HPS'] },
  { name: 'Hang Snatch',                     sourceUrl: 'https://www.crossfit.com/essentials/the-hang-snatch',               aliases: ['HSN', 'Hang Squat Snatch'] },
  // I
  { name: 'Inverted Burpee',                 sourceUrl: 'https://www.crossfit.com/essentials/the-inverted-burpee' },
  // K
  { name: 'Kettlebell Snatch',               sourceUrl: 'https://www.crossfit.com/essentials/the-kettlebell-snatch',         aliases: ['KB snatch'] },
  { name: 'Kettlebell Swing',                sourceUrl: 'https://www.crossfit.com/essentials/the-kettlebell-swing',          aliases: ['KBS', 'KB swing', 'American Kettlebell Swing'] },
  { name: 'Kipping Bar Muscle-up',           sourceUrl: 'https://www.crossfit.com/essentials/the-kipping-bar-muscle-up',     aliases: ['BMU', 'bar muscle-up', 'Bar Muscle-up'] },
  { name: 'Kipping Chest-to-bar Pull-up',    sourceUrl: 'https://www.crossfit.com/essentials/the-kipping-chest-to-bar-pull-up', aliases: ['C2B', 'CTB', 'chest-to-bar', 'Chest-to-Bar Pull-up'] },
  { name: 'Kipping Deficit Handstand Push-up', sourceUrl: 'https://www.crossfit.com/essentials/the-kipping-deficit-handstand-push-up', aliases: ['deficit HSPU', 'Deficit Handstand Push-up'] },
  { name: 'Kipping Handstand Push-up',       sourceUrl: 'https://www.crossfit.com/essentials/the-kipping-handstand-push-up', aliases: ['kipping HSPU'] },
  { name: 'Kipping Muscle-up',               sourceUrl: 'https://www.crossfit.com/essentials/the-kipping-muscle-up',         aliases: ['MU', 'muscle-up', 'Muscle-up', 'Ring Muscle-up', 'Ring Muscle Up'] },
  { name: 'Kipping Pull-up',                 sourceUrl: 'https://www.crossfit.com/essentials/the-kipping-pull-up' },
  { name: 'Kipping Toes-to-bar',             sourceUrl: 'https://www.crossfit.com/essentials/the-kipping-toes-to-bar',       aliases: ['T2B', 'TTB', 'toes to bar', 'Toes-to-Bar'] },
  // L
  { name: 'Legless Rope Climb',              sourceUrl: 'https://www.crossfit.com/essentials/the-legless-rope-climb' },
  { name: 'L Pull-up',                       sourceUrl: 'https://www.crossfit.com/essentials/the-l-pull-up' },
  { name: 'L-sit',                           sourceUrl: 'https://www.crossfit.com/essentials/the-l-sit' },
  { name: 'L-sit on Rings',                  sourceUrl: 'https://www.crossfit.com/essentials/the-l-sit-on-rings' },
  { name: 'L-sit Rope Climb',                sourceUrl: 'https://www.crossfit.com/essentials/the-l-sit-rope-climb' },
  { name: 'L-sit to Shoulder Stand',         sourceUrl: 'https://www.crossfit.com/essentials/the-l-sit-to-shoulder-stand' },
  // M
  { name: 'Medicine-ball Clean',             sourceUrl: 'https://www.crossfit.com/essentials/the-medicine-ball-clean',       aliases: ['MBC', 'med ball clean'] },
  { name: 'Modified Rope Climb',             sourceUrl: 'https://www.crossfit.com/essentials/the-modified-rope-climb' },
  { name: 'Muscle Snatch',                   sourceUrl: 'https://www.crossfit.com/essentials/the-muscle-snatch',             aliases: ['MSN'] },
  // O
  { name: 'Overhead Squat',                  sourceUrl: 'https://www.crossfit.com/essentials/the-overhead-squat',            aliases: ['OHS'] },
  // P
  { name: 'Power Clean',                     sourceUrl: 'https://www.crossfit.com/essentials/the-power-clean',               aliases: ['PC'] },
  { name: 'Power Clean and Split Jerk',      sourceUrl: 'https://www.crossfit.com/essentials/the-power-clean-split-jerk',    aliases: ['PCSJ'] },
  { name: 'Power Snatch',                    sourceUrl: 'https://www.crossfit.com/essentials/the-power-snatch',              aliases: ['PSN'] },
  { name: 'Pull-over',                       sourceUrl: 'https://www.crossfit.com/essentials/the-pull-over' },
  { name: 'Push Jerk',                       sourceUrl: 'https://www.crossfit.com/essentials/the-push-jerk',                 aliases: ['PJ'] },
  { name: 'Push Press',                      sourceUrl: 'https://www.crossfit.com/essentials/the-push-press',                aliases: ['PP'] },
  { name: 'Push-up',                         sourceUrl: 'https://www.crossfit.com/essentials/the-push-up' },
  // R
  { name: 'Ring Dip',                        sourceUrl: 'https://www.crossfit.com/essentials/the-ring-dip' },
  { name: 'Ring Push-up',                    sourceUrl: 'https://www.crossfit.com/essentials/the-ring-push-up' },
  { name: 'Ring Row',                        sourceUrl: 'https://www.crossfit.com/essentials/the-ring-row' },
  { name: 'Rope Climb (Basket)',             sourceUrl: 'https://www.crossfit.com/essentials/the-rope-climb-basket',         aliases: ['rope climb', 'RC'] },
  { name: 'Rope Climb (Wrapping)',           sourceUrl: 'https://www.crossfit.com/essentials/the-rope-climb-wrapping' },
  { name: 'Row',                             sourceUrl: 'https://www.crossfit.com/essentials/rowing',                        aliases: ['rowing'] },
  // S
  { name: 'Shoot-through',                   sourceUrl: 'https://www.crossfit.com/essentials/the-shoot-through' },
  { name: 'Shoulder Press',                  sourceUrl: 'https://www.crossfit.com/essentials/the-shoulder-press',            aliases: ['strict press'] },
  { name: 'Single-leg Squat (Pistol)',       sourceUrl: 'https://www.crossfit.com/essentials/the-single-leg-squat',          aliases: ['pistol', 'pistols', 'SLS'] },
  { name: 'Single-under',                    sourceUrl: 'https://www.crossfit.com/essentials/the-single-under',              aliases: ['singles', 'Single Under'] },
  { name: 'Skin the Cat',                    sourceUrl: 'https://www.crossfit.com/essentials/skin-the-cat' },
  { name: 'Slam Ball',                       sourceUrl: 'https://www.crossfit.com/essentials/the-slam-ball' },
  { name: 'Snatch',                          sourceUrl: 'https://www.crossfit.com/essentials/the-snatch',                   aliases: ['Squat Snatch'] },
  { name: 'Snatch Balance',                  sourceUrl: 'https://www.crossfit.com/essentials/the-snatch-balance' },
  { name: 'Sots Press',                      sourceUrl: 'https://www.crossfit.com/essentials/the-sots-press' },
  { name: 'Split Clean',                     sourceUrl: 'https://www.crossfit.com/essentials/the-split-clean' },
  { name: 'Split Jerk',                      sourceUrl: 'https://www.crossfit.com/essentials/the-split-jerk',                aliases: ['SJ'] },
  { name: 'Split Snatch',                    sourceUrl: 'https://www.crossfit.com/essentials/the-split-snatch' },
  { name: 'Straddle Press to Handstand',     sourceUrl: 'https://www.crossfit.com/essentials/the-straddle-press' },
  { name: 'Strict Bar Muscle-up',            sourceUrl: 'https://www.crossfit.com/essentials/the-strict-bar-muscle-up',      aliases: ['strict BMU'] },
  { name: 'Strict Chest-to-bar Pull-up',     sourceUrl: 'https://www.crossfit.com/essentials/the-strict-chest-to-bar-pull-up', aliases: ['strict C2B'] },
  { name: 'Strict Handstand Push-up',        sourceUrl: 'https://www.crossfit.com/essentials/the-strict-handstand-push-up',  aliases: ['strict HSPU'] },
  { name: 'Strict Knees-to-elbows',          sourceUrl: 'https://www.crossfit.com/essentials/the-strict-knees-to-elbow',     aliases: ['K2E', 'knees to elbows', 'Knees-to-Elbow'] },
  { name: 'Strict Muscle-up',                sourceUrl: 'https://www.crossfit.com/essentials/the-strict-muscle-up',          aliases: ['strict MU'] },
  { name: 'Strict Pull-up',                  sourceUrl: 'https://www.crossfit.com/essentials/the-strict-pull-up',            aliases: ['Pull-up'] },
  { name: 'Strict Toes-to-bar',              sourceUrl: 'https://www.crossfit.com/essentials/the-strict-toes-to-bar',        aliases: ['strict T2B'] },
  { name: 'Strict Toes-to-rings',            sourceUrl: 'https://www.crossfit.com/essentials/the-strict-toes-to-rings',      aliases: ['strict T2R'] },
  { name: 'Sumo Deadlift',                   sourceUrl: 'https://www.crossfit.com/essentials/the-sumo-deadlift',             aliases: ['SDL'] },
  { name: 'Sumo Deadlift High Pull',         sourceUrl: 'https://www.crossfit.com/essentials/the-sumo-deadlift-high-pull',   aliases: ['SDHP', 'SDLHP'] },
  { name: 'Swing to Backward Roll to Support', sourceUrl: 'https://www.crossfit.com/essentials/backward-roll-to-support' },
  // T
  { name: 'Thruster',                        sourceUrl: 'https://www.crossfit.com/essentials/the-thruster' },
  // W
  { name: 'Walking Lunge',                   sourceUrl: 'https://www.crossfit.com/essentials/the-walking-lunge',             aliases: ['lunge', 'Lunge'] },
  { name: 'Wall-ball Shot',                  sourceUrl: 'https://www.crossfit.com/essentials/the-wall-ball',                 aliases: ['WB', 'Wall Ball', 'wallball'] },
  { name: 'Wall Walk',                       sourceUrl: 'https://www.crossfit.com/essentials/the-wall-walk',                 aliases: ['WW'] },
  { name: 'Windshield Wiper',                sourceUrl: 'https://www.crossfit.com/essentials/the-windshield-wiper' },
  // Z
  { name: 'Zercher Squat',                   sourceUrl: 'https://www.crossfit.com/essentials/the-zercher-squat' },
]

export const CROSSFIT_MOVEMENT_CATALOG: ReadonlyArray<SeedMovement> = MOVEMENTS

export interface SeedSummary {
  total: number
  created: number
  updated: number
  unchanged: number
}

/**
 * Upserts every movement in CROSSFIT_MOVEMENT_CATALOG by name. Existing rows
 * with the same name (e.g. seeded by a gym manually or by a prior run) get
 * their sourceUrl + aliases updated; the status / parentId / createdAt are
 * left untouched. Idempotent — re-running yields zero changes after the
 * catalog has stabilized.
 */
export async function runSeedCrossfitMovementsJob(): Promise<SeedSummary> {
  const summary: SeedSummary = { total: MOVEMENTS.length, created: 0, updated: 0, unchanged: 0 }

  for (const m of MOVEMENTS) {
    const existing = await prisma.movement.findUnique({
      where: { name: m.name },
      select: { id: true, sourceUrl: true, aliases: true },
    })

    const aliases = m.aliases ?? []

    if (!existing) {
      await prisma.movement.create({
        data: { name: m.name, status: 'ACTIVE', sourceUrl: m.sourceUrl, aliases },
      })
      summary.created += 1
      continue
    }

    const sameUrl = existing.sourceUrl === m.sourceUrl
    const sameAliases =
      existing.aliases.length === aliases.length &&
      existing.aliases.every((a, i) => a === aliases[i])

    if (sameUrl && sameAliases) {
      summary.unchanged += 1
      continue
    }

    await prisma.movement.update({
      where: { id: existing.id },
      data: { sourceUrl: m.sourceUrl, aliases },
    })
    summary.updated += 1
  }

  log.info(`seed complete — total=${summary.total} created=${summary.created} updated=${summary.updated} unchanged=${summary.unchanged}`)
  return summary
}
