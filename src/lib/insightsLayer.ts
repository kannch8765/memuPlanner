import { z } from 'zod'

export const InsightPatternsSchema = z.object({
  mem_path: z.string().min(1),
  dominant_focus_period: z.enum(['morning', 'afternoon', 'night']),
  distraction_pattern: z.enum(['entertainment', 'social', 'mixed', 'none']),
  sleep_risk: z.boolean(),
  confidence: z.number().min(0).max(1),
})

export const InsightPatternsCoreSchema = InsightPatternsSchema.omit({ mem_path: true })

export type InsightPatterns = z.infer<typeof InsightPatternsSchema>
export type InsightPatternsCore = z.infer<typeof InsightPatternsCoreSchema>

export function isInsightPatterns(value: unknown): value is InsightPatterns {
  return InsightPatternsSchema.safeParse(value).success
}

export function buildInsightMemPath(params: { date: string; version: number }): string {
  return `/mem/insight/patterns/${params.date}/v${params.version}`
}
