import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const RawEventSchema = z.object({
  summary: z.string().default(''),
  start: z.string().min(1),
  end: z.string().min(1),
  category: z.string().optional().default('Uncategorized'),
  context: z.string().optional().default(''),
  is_recurring: z.boolean().optional(),
})

const RawDaySchema = z.object({
  mem_path: z.string().optional(),
  date: z.string().min(10),
  events: z.array(RawEventSchema).default([]),
})

export type RawTimeUsageDay = z.infer<typeof RawDaySchema>

export function resolveRawDataDir(): string | null {
  const candidates = [
    path.join('mem', 'raw', 'time_usage'),
    'dataTask',
    'data',
    path.join('public', 'dataTask'),
    path.join('public', 'data'),
  ]
  for (const rel of candidates) {
    const full = path.join(process.cwd(), rel)
    try {
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return full
    } catch {
      continue
    }
  }
  return null
}

export function listRawDayFiles(dir: string): string[] {
  const items = fs.readdirSync(dir)
  return items
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort((a, b) => b.localeCompare(a))
    .map((f) => path.join(dir, f))
}

export function readRawTimeUsageDays(params?: { limit?: number }): { dir: string | null; days: RawTimeUsageDay[] } {
  const dir = resolveRawDataDir()
  if (!dir) return { dir: null, days: [] }

  const files = listRawDayFiles(dir)
  const sliced = typeof params?.limit === 'number' ? files.slice(0, Math.max(0, params.limit)) : files
  const days: RawTimeUsageDay[] = []

  for (const filePath of sliced) {
    const rawText = fs.readFileSync(filePath, 'utf8')
    const parsed = RawDaySchema.parse(JSON.parse(rawText))
    days.push(parsed)
  }

  return { dir, days }
}

export function minutesBetween(date: string, startHHMM: string, endHHMM: string): number {
  const toMillis = (d: string, hm: string) => {
    const [hh, mm] = hm.split(':').map((x) => Number(x))
    const base = new Date(`${d}T00:00:00`).getTime()
    return base + ((hh || 0) * 60 + (mm || 0)) * 60_000
  }

  const a = toMillis(date, startHHMM)
  let b = toMillis(date, endHHMM)
  if (b < a) b += 24 * 60 * 60_000
  return Math.max(0, (b - a) / 60_000)
}
