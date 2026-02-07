import type { TimeUsageDataset } from '@/lib/demoTimeUsage'

export type ComputedInsight = {
  title: string
  detail: string
  confidence: number
  path: string
}

export function computeInsights(dataset: TimeUsageDataset): ComputedInsight[] {
  const nightEntertainmentMinutes = dataset.days
    .flatMap((d) => d.entries)
    .filter((e) => e.category === 'entertainment')
    .reduce((sum, e) => sum + diffMinutes(e.start, e.end), 0)

  const deepFocusMorningMinutes = dataset.days
    .flatMap((d) => d.entries)
    .filter((e) => e.category === 'deep_focus')
    .reduce((sum, e) => sum + diffMinutes(e.start, e.end), 0)

  const insights: ComputedInsight[] = []

  if (nightEntertainmentMinutes >= 180) {
    insights.push({
      title: 'High late-night screen time',
      detail: 'You tend to spend significant entertainment/screen time late at night. Consider protecting sleep and shifting deep focus to the morning.',
      confidence: 0.72,
      path: 'layer2/insights/screen_time_night',
    })
  }

  if (deepFocusMorningMinutes >= 180) {
    insights.push({
      title: 'Morning deep focus works',
      detail: 'Your deep focus blocks cluster in the morning. Plan your most important work before noon and keep afternoons lighter.',
      confidence: 0.68,
      path: 'layer2/insights/deep_focus_morning',
    })
  }

  if (insights.length === 0) {
    insights.push({
      title: 'Baseline pattern',
      detail: 'Not enough data for strong conclusions yet. Add more days to improve insight quality.',
      confidence: 0.5,
      path: 'layer2/insights/baseline',
    })
  }

  return insights
}

function diffMinutes(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime()
  const b = new Date(endIso).getTime()
  return Math.max(0, (b - a) / 60000)
}

