import { z } from 'zod'

export const SentimentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sentiment: z.string().min(1).max(400),
  tone: z.enum(['positive', 'neutral', 'negative']),
  source: z.literal('derived_from_time_usage'),
})

export type Sentiment = z.infer<typeof SentimentSchema>

export function buildSentimentMemPath(date: string): string {
  return `/mem/sentiment/chat/${date}`
}

