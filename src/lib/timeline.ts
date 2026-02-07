import { colors } from '@/lib/colors'
import { demoDataset } from '@/lib/demoTimeUsage'
import { computeInsights } from '@/lib/insights'
import { minutesBetween, readRawTimeUsageDays } from '@/lib/rawTimeUsage'
import { readLatestLocalInsight } from '@/lib/localInsights'

export type TimelineBlock = { id: string; label: string; minutes: number; color: string }

export type TimelineDay = {
  date: string
  blocks: TimelineBlock[]
  totalMinutes: number
  totalHours: number
  insight: string
}

export type TimelineModel = { days: TimelineDay[] }

export function buildTimelineModel(): TimelineModel {
  const raw = readRawTimeUsageDays({ limit: 14 })
  if (raw.days.length > 0) {
    const insight = readLatestLocalInsight()?.insight
    const plan = insight ? buildTomorrowPlan(insight, raw.days) : null
    const days: TimelineDay[] = raw.days.map((d) => {
      const totals: TimelineBlock[] = d.events.map((e) => ({
        id: `${d.date}-${e.category}-${e.start}-${e.end}-${e.summary}`,
        label: e.category,
        minutes: minutesBetween(d.date, e.start, e.end),
        color: colorForAnyLabel(e.category),
      }))

      const totalMinutes = totals.reduce((sum, b) => sum + b.minutes, 0)

      return {
        date: d.date,
        blocks: squashByLabel(totals),
        totalMinutes,
        totalHours: totalMinutes / 60,
        insight: 'Raw events imported (Layer 1).',
      }
    })

    return { days: plan ? [plan, ...days] : days }
  }

  const insights = computeInsights(demoDataset)
  const defaultInsight = insights[0]?.detail ?? 'No insights yet.'

  const days: TimelineDay[] = demoDataset.days.map((d) => {
    const totals = d.entries.map((e) => ({
      id: `${d.date}-${e.category}-${e.start}`,
      label: e.category.replace('_', ' '),
      minutes: diffMinutes(e.start, e.end),
      color: colorForCategory(e.category),
    }))

    const totalMinutes = totals.reduce((sum, b) => sum + b.minutes, 0)

    return {
      date: d.date,
      blocks: squashByLabel(totals),
      totalMinutes,
      totalHours: totalMinutes / 60,
      insight: defaultInsight,
    }
  })

  return { days }
}

function buildTomorrowPlan(
  patterns: {
    dominant_focus_period: 'morning' | 'afternoon' | 'night'
    distraction_pattern: 'entertainment' | 'social' | 'mixed' | 'none'
    sleep_risk: boolean
  },
  existingDays: Array<{ date: string }>
): TimelineDay {
  const base = existingDays.map((d) => d.date).sort().slice(-1)[0]
  const next = base ? addDays(base, 1) : formatDate(new Date(Date.now() + 24 * 60 * 60_000))
  const blocks = planBlocks(patterns)
  const totalMinutes = blocks.reduce((sum, b) => sum + b.minutes, 0)

  const summary =
    patterns.dominant_focus_period === 'morning'
      ? 'Plan: protect morning deep focus.'
      : patterns.dominant_focus_period === 'afternoon'
        ? 'Plan: protect afternoon deep focus.'
        : 'Plan: protect night deep focus.'

  return {
    date: `${next} (plan)`,
    blocks,
    totalMinutes,
    totalHours: totalMinutes / 60,
    insight: `${summary} Distraction: ${patterns.distraction_pattern}. Sleep risk: ${patterns.sleep_risk ? 'yes' : 'no'}.`,
  }
}

function planBlocks(patterns: {
  dominant_focus_period: 'morning' | 'afternoon' | 'night'
  distraction_pattern: 'entertainment' | 'social' | 'mixed' | 'none'
  sleep_risk: boolean
}): TimelineBlock[] {
  const focus: TimelineBlock = { id: 'deep-focus', label: '', minutes: 120, color: colors.gold }
  const work: TimelineBlock = { id: 'work', label: '', minutes: 240, color: colors.deepStone }
  const admin: TimelineBlock = { id: 'admin', label: '', minutes: 60, color: colors.silver }
  const social: TimelineBlock = { id: 'social', label: '', minutes: 60, color: '#b8a28a' }
  const entertainment: TimelineBlock = { id: 'entertainment', label: '', minutes: 30, color: '#8f8b82' }
  const windDown: TimelineBlock = { id: 'wind-down', label: patterns.sleep_risk ? '21:30–22:00 Wind down (early)' : '22:30–23:00 Wind down', minutes: 30, color: colors.bone }

  if (patterns.dominant_focus_period === 'morning') {
    focus.label = '08:00–10:00 Deep focus'
    work.label = '10:30–14:30 Work blocks'
    admin.label = '15:00–16:00 Admin'
    social.label = '20:00–21:00 Social'
    entertainment.label = '21:00–21:30 Entertainment (limited)'
  } else if (patterns.dominant_focus_period === 'afternoon') {
    focus.label = '13:00–15:00 Deep focus'
    work.label = '09:00–13:00 Work blocks'
    admin.label = '15:30–16:30 Admin'
    social.label = '19:30–20:30 Social'
    entertainment.label = '21:00–21:30 Entertainment (limited)'
  } else {
    focus.label = '20:00–22:00 Deep focus'
    work.label = '10:00–14:00 Work blocks'
    admin.label = '16:00–17:00 Admin'
    social.label = '18:30–19:30 Social'
    entertainment.label = '15:00–15:30 Entertainment (limited)'
  }

  const blocks: TimelineBlock[] = [focus, work, admin]
  if (patterns.distraction_pattern === 'social') blocks.push(social)
  else if (patterns.distraction_pattern === 'entertainment') blocks.push(entertainment)
  else if (patterns.distraction_pattern === 'mixed') blocks.push({ ...social, label: social.label.replace('Social', 'Social (limited)') }, entertainment)
  else blocks.push({ ...social, label: social.label.replace('Social', 'Walk / break') })
  blocks.push(windDown)
  return blocks
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function squashByLabel(blocks: TimelineBlock[]): TimelineBlock[] {
  const map = new Map<string, TimelineBlock>()
  for (const b of blocks) {
    const prev = map.get(b.label)
    if (!prev) map.set(b.label, { ...b })
    else map.set(b.label, { ...prev, minutes: prev.minutes + b.minutes })
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes)
}

function colorForCategory(category: string): string {
  if (category === 'deep_focus') return colors.gold
  if (category === 'work') return colors.deepStone
  if (category === 'social') return colors.silver
  if (category === 'entertainment') return '#b8a28a'
  if (category === 'sleep') return '#8f8b82'
  return colors.silver
}

function colorForAnyLabel(label: string): string {
  const palette = [colors.gold, colors.deepStone, colors.silver, '#b8a28a', '#8f8b82']
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return palette[hash % palette.length] ?? colors.silver
}

function diffMinutes(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime()
  const b = new Date(endIso).getTime()
  return Math.max(0, (b - a) / 60000)
}
