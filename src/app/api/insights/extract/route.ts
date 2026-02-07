import { z } from 'zod'
import { extractPatternsInsightWithMemU } from '@/lib/insightExtraction'

const BodySchema = z.object({
  userId: z.string().min(1).default('demo-user'),
  aggregateDays: z.number().int().min(1).max(60).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}))
  const body = BodySchema.parse(json)

  const startedAt = Date.now()
  const result = await extractPatternsInsightWithMemU({
    userId: body.userId,
    aggregateDays: body.aggregateDays,
    date: body.date,
  })
  const elapsedMs = Date.now() - startedAt

  console.log('[insights.extract] ok', { userId: body.userId, memPath: result.memPath, taskId: result.taskId, validated: result.validated, elapsedMs })

  return Response.json({ ok: true, elapsedMs, ...result })
}

