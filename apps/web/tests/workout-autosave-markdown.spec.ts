/**
 * Playwright E2E — Workout autosave + markdown description
 *
 * Covers manual verification items from the feat/workout-autosave-markdown PR:
 *   T1: New workout autosaves as draft 2s after typing (draft pill appears in calendar)
 *   T2: Closing the drawer before the debounce still flushes the draft (state preserved)
 *   T3: A PUBLISHED workout is never autosaved, even when edited
 *   T4: Pasting an HTML table into the description converts to a markdown table
 *   T5: WOD Detail renders a markdown table with <table>/<th>/<td>
 *   T6: WOD Detail renders markdown bold, headings, and lists
 *
 * Requires: turbo dev running (API on :3000, web on :5173)
 * Run: npm run test --workspace=@berntracker/web
 *   or: cd apps/web && npx dotenv-cli -e ../../.env -- npx playwright test workout-autosave-markdown
 */

import { test, expect, type Page, type Request } from '@playwright/test'
import { createRequire } from 'module'
import bcrypt from 'bcryptjs'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient, ProgramRole } = _require('@prisma/client') as any
const prisma = new PrismaClient()

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
const PROGRAMMER_EMAIL = `uat-autosave-prog-${TS}@test.com`
const PROGRAMMER_PASSWORD = 'TestPass1!'

// Use a future month isolated from other suites to avoid cross-test interference
const TEST_MONTH_LABEL = 'September 2026'
const TEST_YEAR = 2026
const TEST_MONTH = 9 // September — 1-based here; Date uses 0-based internally

// One isolated day per calendar test
const T1_DAY = 3   // autosave after typing
const T2_DAY = 4   // autosave flushed on close
const T3_DAY = 5   // published workout — no autosave

let gymId = ''
let programId = ''
let programmerUserId = ''
let publishedWorkoutId = '' // seeded for T3
let tableWorkoutId = ''     // seeded for T5 (markdown table)
let richWorkoutId = ''      // seeded for T6 (bold + heading + list)

// ─── DB helpers ───────────────────────────────────────────────────────────────

function scheduledAt(day: number) {
  return new Date(`${TEST_YEAR}-${String(TEST_MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00.000Z`)
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

async function loginAndGoToCalendar(page: Page) {
  await page.goto('/login')
  await page.fill('#email', PROGRAMMER_EMAIL)
  await page.fill('#password', PROGRAMMER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')

  await page.evaluate((id) => localStorage.setItem('gymId', id), gymId)
  await page.goto('/calendar')
  await page.waitForSelector('h1:has-text("Calendar")')

  await navigateToMonth(page, TEST_MONTH_LABEL)
}

async function navigateToMonth(page: Page, targetLabel: string) {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  for (let i = 0; i < 24; i++) {
    const raw = await page.locator('span.w-44').textContent()
    const label = raw?.trim() ?? ''
    if (label === targetLabel) return
    const [cm, cy] = [MONTHS.indexOf(label.split(' ')[0] ?? ''), parseInt(label.split(' ')[1] ?? '0')]
    const [tm, ty] = [MONTHS.indexOf(targetLabel.split(' ')[0]), parseInt(targetLabel.split(' ')[1])]
    const goForward = cy < ty || (cy === ty && cm < tm)
    await page.click(goForward ? 'button[aria-label="Next month"]' : 'button[aria-label="Previous month"]')
    await page.waitForTimeout(150)
  }
}

function cellForDay(page: Page, day: number) {
  return page.locator('div.bg-gray-950.h-24').filter({
    has: page.locator('span', { hasText: new RegExp(`^${day}$`) }),
  })
}

async function waitForProgramsLoaded(page: Page) {
  // Program <select> starts disabled while programs fetch; wait until it's enabled
  await expect(page.locator('select[disabled]')).not.toBeAttached({ timeout: 5000 })
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Workout autosave + markdown E2E', () => {
  test.beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PROGRAMMER_PASSWORD, 10)

    const gym = await prisma.gym.create({
      data: { name: `E2E Autosave Gym ${TS}`, slug: `e2e-autosave-gym-${TS}`, timezone: 'UTC' },
    })
    gymId = gym.id

    const programmer = await prisma.user.create({
      data: { email: PROGRAMMER_EMAIL, passwordHash, name: 'E2E Autosave Programmer' },
    })
    programmerUserId = programmer.id

    await prisma.userGym.create({
      data: { userId: programmerUserId, gymId, role: 'PROGRAMMER' },
    })

    const program = await prisma.program.create({
      data: {
        name: `E2E Autosave Program ${TS}`,
        startDate: new Date(`${TEST_YEAR}-01-01`),
        gyms: { create: { gymId } },
        members: {
          create: { userId: programmerUserId, role: ProgramRole.PROGRAMMER },
        },
      },
    })
    programId = program.id

    // Seed for T3: an already-PUBLISHED workout — autosave must never touch it.
    const published = await prisma.workout.create({
      data: {
        title: 'T3 Published Do Not Autosave',
        description: 'Published workout',
        type: 'AMRAP',
        status: 'PUBLISHED',
        scheduledAt: scheduledAt(T3_DAY),
        programId,
        dayOrder: 0,
      },
    })
    publishedWorkoutId = published.id

    // Seed for T5: PUBLISHED workout with a markdown table description.
    const tableMd = [
      '| Round | Reps |',
      '| --- | --- |',
      '| 1 | 21 |',
      '| 2 | 15 |',
      '| 3 | 9  |',
    ].join('\n')
    const tableWorkout = await prisma.workout.create({
      data: {
        title: 'T5 Markdown Table',
        description: tableMd,
        type: 'FOR_TIME',
        status: 'PUBLISHED',
        scheduledAt: scheduledAt(T1_DAY),
        programId,
        dayOrder: 1,
      },
    })
    tableWorkoutId = tableWorkout.id

    // Seed for T6: PUBLISHED workout with bold + heading + list.
    const richMd = [
      '## Warm up',
      '',
      'Start with **dynamic stretching**, then:',
      '',
      '- Jumping jacks',
      '- Air squats',
      '- Arm circles',
    ].join('\n')
    const richWorkout = await prisma.workout.create({
      data: {
        title: 'T6 Markdown Rich',
        description: richMd,
        type: 'METCON',
        status: 'PUBLISHED',
        scheduledAt: scheduledAt(T1_DAY),
        programId,
        dayOrder: 2,
      },
    })
    richWorkoutId = richWorkout.id
  })

  test.afterAll(async () => {
    await prisma.workout.deleteMany({ where: { programId } })
    await prisma.program.delete({ where: { id: programId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: programmerUserId } })
    await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
    await prisma.$disconnect()
  })

  // ── T1: New workout autosaves as draft after debounce ────────────────────

  test('T1: typing in a new workout autosaves as a draft and shows "Saved"', async ({ page }) => {
    await loginAndGoToCalendar(page)

    await cellForDay(page, T1_DAY).locator('button[aria-label="Add workout"]').click()
    await expect(page.locator('h2', { hasText: 'New Workout' })).toBeVisible()
    await waitForProgramsLoaded(page)

    await page.fill('input[placeholder="e.g. Fran"]', 'T1 Autosave WOD')
    await page.fill('textarea[placeholder*="Workout details"]', 'Round for time: 50 burpees')

    // Debounce is 2s — give it a little headroom to complete the POST
    await expect(page.getByTestId('autosave-status')).toHaveText('Saved', { timeout: 6000 })

    // Header flips from "New Workout" → "Edit Workout" once the server row exists
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible({ timeout: 5000 })
    // The Draft status badge appears only in edit mode
    await expect(page.locator('span', { hasText: /^Draft$/ })).toBeVisible()

    // Close the drawer; calendar should reflect the new draft pill after parent reload
    await page.click('button[aria-label="Close drawer"]')
    await expect(page.locator('div.fixed.inset-0.bg-black\\/40.z-30')).not.toBeAttached({ timeout: 5000 })
    await expect(cellForDay(page, T1_DAY).getByText('T1 Autosave WOD')).toBeVisible()

    // DB sanity: row is DRAFT, owned by the right program
    const row = await prisma.workout.findFirst({ where: { title: 'T1 Autosave WOD', programId } })
    expect(row?.status).toBe('DRAFT')
  })

  // ── T2: Closing before the debounce flushes the autosave ─────────────────

  test('T2: closing the drawer before the debounce still saves the draft', async ({ page }) => {
    await loginAndGoToCalendar(page)

    await cellForDay(page, T2_DAY).locator('button[aria-label="Add workout"]').click()
    await expect(page.locator('h2', { hasText: 'New Workout' })).toBeVisible()
    await waitForProgramsLoaded(page)

    await page.fill('input[placeholder="e.g. Fran"]', 'T2 Rapid Exit')
    await page.fill('textarea[placeholder*="Workout details"]', 'Close me before 2s elapse')

    // Immediately close — handleClose must flush the pending autosave before onClose fires
    await page.click('button[aria-label="Close drawer"]')
    await expect(page.locator('div.fixed.inset-0.bg-black\\/40.z-30')).not.toBeAttached({ timeout: 5000 })

    // Draft pill should appear in the cell after calendar reload
    await expect(cellForDay(page, T2_DAY).getByText('T2 Rapid Exit')).toBeVisible({ timeout: 5000 })

    // Reopen the workout and confirm the typed values were persisted, not lost
    await cellForDay(page, T2_DAY).getByText('T2 Rapid Exit').click()
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible()
    await expect(page.locator('input[placeholder="e.g. Fran"]')).toHaveValue('T2 Rapid Exit')
    await expect(page.locator('textarea[placeholder*="Workout details"]'))
      .toHaveValue('Close me before 2s elapse')
  })

  // ── T3: Published workouts are never autosaved ───────────────────────────

  test('T3: editing a PUBLISHED workout fires no autosave requests', async ({ page }) => {
    const writeRequests: string[] = []
    const trackWrites = (req: Request) => {
      const method = req.method()
      const url = req.url()
      if ((method === 'PATCH' || method === 'POST') && url.includes('/api/workouts')) {
        // Ignore the /publish endpoint — we're only guarding against autosave PATCH/POST
        if (!url.endsWith('/publish')) writeRequests.push(`${method} ${url}`)
      }
    }
    page.on('request', trackWrites)

    await loginAndGoToCalendar(page)

    await cellForDay(page, T3_DAY).getByText('T3 Published Do Not Autosave').click()
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible()
    await expect(page.locator('span', { hasText: /^Published$/ })).toBeVisible()

    // Change the title — this would normally flag the snapshot as dirty and trigger autosave
    const titleInput = page.locator('input[placeholder="e.g. Fran"]')
    await titleInput.fill('T3 Edited Title After Publish')

    // Wait longer than the 2s debounce; autosave must still stay silent
    await page.waitForTimeout(3500)

    // Autosave-status pill should never appear for published workouts
    await expect(page.getByTestId('autosave-status')).toHaveCount(0)

    // No PATCH/POST must have hit /api/workouts during that window
    expect(writeRequests, `Unexpected write requests: ${writeRequests.join(', ')}`).toHaveLength(0)

    // DB confirms the server title is still the original one
    const row = await prisma.workout.findUnique({ where: { id: publishedWorkoutId } })
    expect(row?.title).toBe('T3 Published Do Not Autosave')

    page.off('request', trackWrites)
  })

  // ── T4: HTML paste into the description is converted to markdown ─────────

  test('T4: pasting an HTML table converts to a markdown table in the textarea', async ({ page }) => {
    await loginAndGoToCalendar(page)

    // Open any empty day in create mode — T4 uses the table-day cell (T5 pill is there
    // too but we don't save, just dispatch a paste event).
    await cellForDay(page, T1_DAY).locator('button[aria-label="Add workout"]').click()
    await expect(page.locator('h2', { hasText: 'New Workout' })).toBeVisible()
    await waitForProgramsLoaded(page)

    const textareaSelector = 'textarea[placeholder*="Workout details"]'

    // Dispatch a native paste event with HTML clipboardData. jsdom-style shim works in
    // Chromium too: overriding clipboardData via the ClipboardEvent init.
    await page.evaluate((selector) => {
      const ta = document.querySelector(selector) as HTMLTextAreaElement
      ta.focus()
      const html =
        '<table><thead><tr><th>Round</th><th>Reps</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>21</td></tr><tr><td>2</td><td>15</td></tr></tbody></table>'
      const dt = new DataTransfer()
      dt.setData('text/html', html)
      dt.setData('text/plain', 'Round\tReps\n1\t21\n2\t15')
      const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      ta.dispatchEvent(evt)
    }, textareaSelector)

    // Converted markdown should appear in the textarea
    const textareaValue = await page.locator(textareaSelector).inputValue()
    expect(textareaValue).toContain('| Round | Reps |')
    expect(textareaValue).toContain('| 1 | 21 |')
    expect(textareaValue).toContain('| 2 | 15 |')

    // Close without saving — don't pollute T1's pill on this day. We cleared the title
    // so canAutosave stays false and nothing is persisted.
    await page.locator('input[placeholder="e.g. Fran"]').fill('')
    await page.click('button[aria-label="Close drawer"]')
  })

  // ── T5: WOD Detail renders markdown tables ───────────────────────────────

  test('T5: WOD Detail renders a markdown table as <table>/<th>/<td>', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', PROGRAMMER_EMAIL)
    await page.fill('#password', PROGRAMMER_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
    await page.evaluate((id) => localStorage.setItem('gymId', id), gymId)

    await page.goto(`/workouts/${tableWorkoutId}`)
    await expect(page.getByRole('heading', { name: 'T5 Markdown Table' })).toBeVisible()

    const description = page.getByTestId('markdown-description')

    // Headers render as <th>
    await expect(description.getByRole('columnheader', { name: 'Round' })).toBeVisible()
    await expect(description.getByRole('columnheader', { name: 'Reps' })).toBeVisible()

    // Cells render as <td>
    await expect(description.getByRole('cell', { name: '21' })).toBeVisible()
    await expect(description.getByRole('cell', { name: '15' })).toBeVisible()

    // Raw pipe characters should not appear as visible text — they should be parsed away
    const descText = await description.innerText()
    expect(descText).not.toContain('| Round | Reps |')
  })

  // ── T6: WOD Detail renders bold, heading, list ───────────────────────────

  test('T6: WOD Detail renders bold, headings, and unordered lists', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', PROGRAMMER_EMAIL)
    await page.fill('#password', PROGRAMMER_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
    await page.evaluate((id) => localStorage.setItem('gymId', id), gymId)

    await page.goto(`/workouts/${richWorkoutId}`)
    await expect(page.getByRole('heading', { name: 'T6 Markdown Rich' })).toBeVisible()

    const description = page.getByTestId('markdown-description')

    // Heading: `## Warm up` — renders as an <h2> inside the description
    await expect(description.getByRole('heading', { name: 'Warm up' })).toBeVisible()

    // Bold: `**dynamic stretching**` — renders as <strong>
    const strong = description.locator('strong', { hasText: 'dynamic stretching' })
    await expect(strong).toBeVisible()

    // List items — each bullet becomes an <li>
    await expect(description.getByRole('listitem', { name: 'Jumping jacks' })).toBeVisible()
    await expect(description.getByRole('listitem', { name: 'Air squats' })).toBeVisible()
    await expect(description.getByRole('listitem', { name: 'Arm circles' })).toBeVisible()

    // Raw markdown markers should not appear as visible text
    const descText = await description.innerText()
    expect(descText).not.toContain('**dynamic stretching**')
    expect(descText).not.toContain('## Warm up')
  })
})
