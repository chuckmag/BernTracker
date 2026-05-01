import ExcelJS from 'exceljs'
import { WorkoutType } from '@wodalytics/db'

// Slice 6 / #89 — bulk CSV/XLSX → parsed-row preview.
//
// Parser is intentionally narrow: it does *structural* parsing only — header
// detection, column extraction, type-enum coercion, date normalization. It
// does NOT resolve `namedWorkout` to a NamedWorkout id, check for duplicate
// (programId, scheduledAt, dayOrder) collisions, or auto-create movements.
// Those happen in the route handler at draft-creation time so the parser
// stays a pure function of (buffer, filename).
//
// Inline rather than backgrounded because the 5 MB cap keeps parse cost
// bounded (~100ms–5s) and the user is interactive on the response anyway.

const REQUIRED_COLUMNS = ['date', 'title', 'type', 'description'] as const
const KNOWN_COLUMNS = [
  'date',
  'order',
  'title',
  'type',
  'description',
  'named_workout',
  'source',
] as const
type KnownColumn = (typeof KNOWN_COLUMNS)[number]

export interface ParsedRow {
  rowIndex: number // 1-based as the user sees it in their sheet
  date: string // YYYY-MM-DD
  dayOrder: number | null
  title: string
  type: WorkoutType
  description: string
  namedWorkout: string | null
  source: string | null
}

export interface ParseIssue {
  rowIndex: number | null // null = file-level (e.g. missing header row)
  column: string | null
  level: 'warning' | 'error'
  message: string
}

export interface ParsedImport {
  rows: ParsedRow[]
  warnings: ParseIssue[]
  errors: ParseIssue[]
  rowCount: number
}

export class ParseFatalError extends Error {
  readonly issues: ParseIssue[]
  constructor(issues: ParseIssue[]) {
    super(issues.map((i) => i.message).join('; '))
    this.issues = issues
  }
}

// Excel-serial dates (the Override sheet quirk): 1900-based serial. ExcelJS
// already returns Date objects for date-formatted cells; this branch handles
// the case where the cell is a raw number.
function excelSerialToDate(serial: number): Date {
  // 25569 = days between 1900-01-01 and 1970-01-01 (Excel's bug-compatible 1900 epoch)
  const utcMs = (serial - 25569) * 86400 * 1000
  return new Date(utcMs)
}

function toIsoDate(value: unknown, rowIndex: number, errors: ParseIssue[], warnings: ParseIssue[]): string | null {
  if (value == null || value === '') {
    errors.push({ rowIndex, column: 'date', level: 'error', message: 'Missing date' })
    return null
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number') {
    warnings.push({
      rowIndex,
      column: 'date',
      level: 'warning',
      message: `Excel-serial date (${value}) — ISO (YYYY-MM-DD) is preferred`,
    })
    return excelSerialToDate(value).toISOString().slice(0, 10)
  }
  const str = String(value).trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (iso) return str
  const usSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(str)
  if (usSlash) {
    const [, m, d, y] = usSlash
    const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10)
    const dt = new Date(Date.UTC(year, parseInt(m, 10) - 1, parseInt(d, 10)))
    if (Number.isNaN(dt.getTime())) {
      errors.push({ rowIndex, column: 'date', level: 'error', message: `Unparseable date: "${str}"` })
      return null
    }
    warnings.push({
      rowIndex,
      column: 'date',
      level: 'warning',
      message: `Slash date "${str}" — ISO (YYYY-MM-DD) is preferred`,
    })
    return dt.toISOString().slice(0, 10)
  }
  errors.push({ rowIndex, column: 'date', level: 'error', message: `Unparseable date: "${str}"` })
  return null
}

function toWorkoutType(raw: unknown, rowIndex: number, errors: ParseIssue[]): WorkoutType | null {
  if (raw == null || raw === '') {
    errors.push({ rowIndex, column: 'type', level: 'error', message: 'Missing type' })
    return null
  }
  const upper = String(raw).trim().toUpperCase().replace(/[^A-Z_]+/g, '_')
  if (upper in WorkoutType) return WorkoutType[upper as keyof typeof WorkoutType]
  errors.push({
    rowIndex,
    column: 'type',
    level: 'error',
    message: `Unknown type "${raw}" — expected one of ${Object.values(WorkoutType).join(', ')}`,
  })
  return null
}

function trimToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object' && value !== null) {
    const obj = value as { text?: string; richText?: { text: string }[] }
    if (obj.text != null) return String(obj.text).trim()
    if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text ?? '').join('').trim()
  }
  return String(value).trim()
}

// CSV parser — handles quoted fields with embedded newlines and commas.
// Doubled quotes inside a quoted field are escaped (`""` → `"`), per RFC 4180.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (c === '"') {
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

async function readXlsxRows(buffer: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const out: unknown[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = []
    // ExcelJS rows are 1-indexed; values[0] is always null.
    const values = row.values as unknown[]
    for (let i = 1; i < values.length; i++) cells.push(values[i])
    out.push(cells)
  })
  return out
}

function normalizeHeader(value: unknown): string {
  return trimToString(value).toLowerCase().replace(/\s+/g, '_')
}

interface HeaderMap {
  index: Partial<Record<KnownColumn, number>>
  unknownHeaders: string[]
}

function buildHeaderMap(rawHeaders: unknown[]): HeaderMap {
  const index: Partial<Record<KnownColumn, number>> = {}
  const unknownHeaders: string[] = []
  rawHeaders.forEach((h, i) => {
    const key = normalizeHeader(h)
    if ((KNOWN_COLUMNS as readonly string[]).includes(key)) {
      index[key as KnownColumn] = i
    } else if (key !== '') {
      unknownHeaders.push(key)
    }
  })
  return { index, unknownHeaders }
}

export async function parseWorkoutImportFile(buffer: Buffer, filename: string): Promise<ParsedImport> {
  const lower = filename.toLowerCase()
  let raw: unknown[][]
  if (lower.endsWith('.csv')) {
    raw = parseCsv(buffer.toString('utf8'))
  } else if (lower.endsWith('.xlsx')) {
    raw = await readXlsxRows(buffer)
  } else {
    throw new ParseFatalError([
      {
        rowIndex: null,
        column: null,
        level: 'error',
        message: `Unsupported file type — expected .csv or .xlsx, got "${filename}"`,
      },
    ])
  }

  if (raw.length === 0) {
    throw new ParseFatalError([
      { rowIndex: null, column: null, level: 'error', message: 'File is empty' },
    ])
  }

  const [headerRow, ...dataRows] = raw
  const header = buildHeaderMap(headerRow)

  const fileLevelErrors: ParseIssue[] = []
  for (const required of REQUIRED_COLUMNS) {
    if (!(required in header.index)) {
      fileLevelErrors.push({
        rowIndex: null,
        column: required,
        level: 'error',
        message: `Missing required column "${required}"`,
      })
    }
  }
  if (fileLevelErrors.length > 0) throw new ParseFatalError(fileLevelErrors)

  const warnings: ParseIssue[] = []
  const errors: ParseIssue[] = []

  if (header.unknownHeaders.length > 0) {
    warnings.push({
      rowIndex: null,
      column: null,
      level: 'warning',
      message: `Unknown columns ignored: ${header.unknownHeaders.join(', ')}`,
    })
  }

  const cell = (row: unknown[], col: KnownColumn) => {
    const i = header.index[col]
    if (i == null) return undefined
    return row[i]
  }

  const rows: ParsedRow[] = []
  dataRows.forEach((rawRow, idx) => {
    const rowIndex = idx + 2 // header is row 1, data starts at row 2

    const titleStr = trimToString(cell(rawRow, 'title'))
    const descStr = trimToString(cell(rawRow, 'description'))
    const dateRaw = cell(rawRow, 'date')

    // Skip orphan rows (no title, description, or date) with a warning. The
    // Override sheet has a few of these (e.g. label-only rows like "Health"
    // or "Brief").
    if (!titleStr && !descStr && (dateRaw == null || dateRaw === '')) {
      warnings.push({
        rowIndex,
        column: null,
        level: 'warning',
        message: `Row ${rowIndex} had no workout content — skipped`,
      })
      return
    }

    const isoDate = toIsoDate(dateRaw, rowIndex, errors, warnings)
    const type = toWorkoutType(cell(rawRow, 'type'), rowIndex, errors)

    if (!titleStr) errors.push({ rowIndex, column: 'title', level: 'error', message: 'Missing title' })
    if (!descStr) errors.push({ rowIndex, column: 'description', level: 'error', message: 'Missing description' })

    const orderRaw = cell(rawRow, 'order')
    let dayOrder: number | null = null
    if (orderRaw != null && orderRaw !== '') {
      const n = Number(orderRaw)
      if (Number.isFinite(n)) dayOrder = Math.trunc(n)
      else
        warnings.push({
          rowIndex,
          column: 'order',
          level: 'warning',
          message: `Non-numeric order "${orderRaw}" — defaulting to row position`,
        })
    }

    if (isoDate && type && titleStr && descStr) {
      rows.push({
        rowIndex,
        date: isoDate,
        dayOrder,
        title: titleStr,
        type,
        description: descStr,
        namedWorkout: trimToString(cell(rawRow, 'named_workout')) || null,
        source: trimToString(cell(rawRow, 'source')) || null,
      })
    }
  })

  return { rows, warnings, errors, rowCount: dataRows.length }
}
