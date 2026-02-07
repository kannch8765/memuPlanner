import { z } from 'zod'
import { memuFromEnv } from '@/lib/memu'
import { listLocalInsights, readLatestLocalInsight } from '@/lib/localInsights'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId') ?? 'demo-user'

  const local = {
    latest: readLatestLocalInsight(),
    items: listLocalInsights(50),
  }

  try {
    const memu = memuFromEnv()
    const result = await memu.retrieve({
      user_id: userId,
      agent_id: 'layer2_insights',
      query: '/mem/insight/patterns',
    })

    const safe = z
      .object({ items: z.array(z.any()).optional(), categories: z.array(z.any()).optional(), rewritten_query: z.string().optional() })
      .parse(result)

    return Response.json({ ok: true, userId, local, memu: safe })
  } catch (err: any) {
    return Response.json({ ok: true, userId, local, memu_error: err?.message ?? 'MemU error' })
  }
}

