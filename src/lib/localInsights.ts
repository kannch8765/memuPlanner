import fs from 'node:fs'
import path from 'node:path'
import { InsightPatternsSchema, type InsightPatterns } from '@/lib/insightsLayer'

export function readLatestLocalInsight(): { insight: InsightPatterns; filePath: string } | null {
  const base = path.join(process.cwd(), 'mem', 'insight', 'patterns')
  try {
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return readLegacy()
  } catch {
    return readLegacy()
  }

  const dates = fs
    .readdirSync(base)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort((a, b) => b.localeCompare(a))

  for (const date of dates) {
    const dir = path.join(base, date)
    let versions: string[] = []
    try {
      versions = fs
        .readdirSync(dir)
        .filter((f) => /^v\d+\.json$/.test(f))
        .sort((a, b) => {
          const na = Number(a.slice(1).replace('.json', ''))
          const nb = Number(b.slice(1).replace('.json', ''))
          return nb - na
        })
    } catch {
      continue
    }

    for (const f of versions) {
      const filePath = path.join(dir, f)
      const parsed = readInsightFile(filePath)
      if (parsed) return { insight: parsed, filePath }
    }
  }

  return readLegacy()
}

export function listLocalInsights(limit = 50): Array<{ insight: InsightPatterns; filePath: string }> {
  const out: Array<{ insight: InsightPatterns; filePath: string }> = []
  const base = path.join(process.cwd(), 'mem', 'insight', 'patterns')
  try {
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return out
  } catch {
    return out
  }

  const dates = fs
    .readdirSync(base)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort((a, b) => b.localeCompare(a))

  for (const date of dates) {
    const dir = path.join(base, date)
    let versions: string[] = []
    try {
      versions = fs.readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f))
    } catch {
      continue
    }

    versions.sort((a, b) => {
      const na = Number(a.slice(1).replace('.json', ''))
      const nb = Number(b.slice(1).replace('.json', ''))
      return nb - na
    })

    for (const f of versions) {
      if (out.length >= limit) return out
      const filePath = path.join(dir, f)
      const parsed = readInsightFile(filePath)
      if (parsed) out.push({ insight: parsed, filePath })
    }
  }

  return out
}

export function writeLocalInsight(insight: InsightPatterns): string {
  const match = insight.mem_path.match(/\/mem\/insight\/patterns\/(\d{4}-\d{2}-\d{2})\/v(\d+)/)
  const date = match?.[1]
  const version = match?.[2]
  if (!date || !version) throw new Error('Insight mem_path must match /mem/insight/patterns/YYYY-MM-DD/vN')

  const dir = path.join(process.cwd(), 'mem', 'insight', 'patterns', date)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `v${version}.json`)
  fs.writeFileSync(filePath, JSON.stringify(insight, null, 2) + '\n', 'utf8')
  return filePath
}

export function nextLocalInsightVersion(date: string): number {
  const dir = path.join(process.cwd(), 'mem', 'insight', 'patterns', date)
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 1
  } catch {
    return 1
  }

  const versions = fs.readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f))
  const max = versions.reduce((acc, f) => {
    const n = Number(f.slice(1).replace('.json', ''))
    return Number.isFinite(n) ? Math.max(acc, n) : acc
  }, 0)
  return max + 1
}

function readInsightFile(filePath: string): InsightPatterns | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return InsightPatternsSchema.parse(JSON.parse(raw))
  } catch {
    return null
  }
}

function readLegacy(): { insight: InsightPatterns; filePath: string } | null {
  const filePath = path.join(process.cwd(), 'mem', 'insight', 'patterns.json')
  const parsed = readInsightFile(filePath)
  if (!parsed) return null
  return { insight: parsed, filePath }
}

