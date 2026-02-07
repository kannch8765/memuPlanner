import { streamText, StreamData, type CoreMessage } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { z } from 'zod'
import { ensureSeeded, LAYER_AGENT, memorizeChatTurn } from '@/lib/memoryPipeline'
import { memuFromEnv } from '@/lib/memu'
import { readLatestLocalInsight } from '@/lib/localInsights'

const BodySchema = z.object({
  userId: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    })
  ),
})

function lastUserText(messages: Array<{ role: string; content: string }>): string {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  return last?.content ?? ''
}

function toMemUQuery(messages: Array<{ role: string; content: string }>) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-6)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
}

export async function POST(req: Request) {
  const data = new StreamData()

  try {
    const json = await req.json()
    const { userId, messages } = BodySchema.parse(json)

    if (!process.env.GROQ_API_KEY) {
      return new Response('Missing GROQ_API_KEY', { status: 500 })
    }

    let rawRes: any = { items: [] }
    let insightRes: any = { items: [] }
    let sentRes: any = { items: [] }

    const query = toMemUQuery(messages)

    try {
      data.append({ type: 'memu_step', label: 'Put', detail: 'Ensure layer memories exist' })
      const seed = await ensureSeeded(userId)
      if (seed.seeded) data.append({ type: 'memu_step', label: 'Extract', detail: 'Seeded layer1/2/3 via MemU memorize' })
      if (seed.error) data.append({ type: 'memu_step', label: 'Extract', detail: `MemU unavailable: ${seed.error}` })

      const memu = memuFromEnv()
      data.append({ type: 'memu_step', label: 'Get', detail: 'Retrieve memories for current question' })

      const results = await Promise.allSettled([
        memu.retrieve({ user_id: userId, agent_id: LAYER_AGENT.raw, query }),
        memu.retrieve({ user_id: userId, agent_id: LAYER_AGENT.insight, query }),
        memu.retrieve({ user_id: userId, agent_id: LAYER_AGENT.sentiment, query }),
      ])

      rawRes = results[0].status === 'fulfilled' ? results[0].value : rawRes
      insightRes = results[1].status === 'fulfilled' ? results[1].value : insightRes
      sentRes = results[2].status === 'fulfilled' ? results[2].value : sentRes

      for (const r of results) {
        if (r.status === 'rejected') {
          data.append({ type: 'memu_step', label: 'Get', detail: `MemU retrieve failed: ${r.reason?.message ?? 'error'}` })
        }
      }
    } catch (e: any) {
      data.append({ type: 'memu_step', label: 'Get', detail: `MemU disabled: ${e?.message ?? 'error'}` })
    }

    const referenced = new Set<string>()
    for (const p of extractMemPaths(rawRes.items)) referenced.add(p)
    const localInsight = readLatestLocalInsight()?.insight
    if (localInsight) referenced.add(localInsight.mem_path)
    if ((insightRes.items?.length ?? 0) > 0) referenced.add('/mem/insight/patterns')
    if ((sentRes.items?.length ?? 0) > 0) referenced.add('layer3/sentiment')

    const referencedPaths = [...referenced]

    data.append({ type: 'memu_refs', paths: referencedPaths })
    data.append({ type: 'memu_step', label: 'Get', paths: referencedPaths })

    const memoryContext = buildMemoryContext({ rawRes, insightRes, sentRes })

    const system: CoreMessage = {
      role: 'system',
      content: [
        'You are memuPlanner, a time planning assistant.',
        'Use the provided memories to make concrete, actionable recommendations.',
        'Do not reveal chain-of-thought. Only give the advice.',
        'Use the insight schema (if present) to place deep focus and reduce distractions.',
        '',
        'Latest local insight (if available):',
        localInsight ? JSON.stringify(localInsight) : '(none)',
        '',
        'MemU retrieved memory context:',
        memoryContext,
      ].join('\n'),
    }

    const coreMessages: CoreMessage[] = [system, ...(messages as CoreMessage[])]

    const groq = createGroq({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: normalizeGroqBaseUrl(process.env.GROQ_BASE_URL),
    })

    const result = streamText({
      model: groq('llama-3.3-70b-versatile'),
      messages: coreMessages,
      temperature: 0.4,
      onFinish: async (ev) => {
        const latestUser = lastUserText(messages)
        const latestAssistant = ev.text
        if (latestUser && latestAssistant) {
          data.append({ type: 'memu_step', label: 'Put', detail: 'Memorize this chat turn (layer3)' })
          await memorizeChatTurn(userId, latestUser, latestAssistant)
        }
        data.close()
      },
    })

    return result.toDataStreamResponse({ data })
  } catch (err: any) {
    data.close()
    return new Response(err?.message ?? 'Unknown error', { status: 500 })
  }
}

function normalizeGroqBaseUrl(input: string | undefined): string | undefined {
  if (!input) return undefined
  const trimmed = input.replace(/\/+$/, '')
  if (trimmed.endsWith('/openai/v1')) return trimmed
  return `${trimmed}/openai/v1`
}

function buildMemoryContext(input: { rawRes: any; insightRes: any; sentRes: any }): string {
  const take = (items: any[] | undefined) => (items ?? []).slice(0, 6).map((i) => `- ${i.content}`).join('\n')

  const parts = [
    'Layer 1 (raw time usage):',
    take(input.rawRes.items),
    '',
    'Layer 2 (insights):',
    take(input.insightRes.items),
    '',
    'Layer 3 (sentiment & chat):',
    take(input.sentRes.items),
  ]

  return parts.filter((p) => p.trim().length > 0).join('\n')
}

function extractMemPaths(items: Array<{ content: string }> | undefined): string[] {
  const text = (items ?? []).map((i) => i.content).join('\n')
  const matches = text.match(/\/mem\/raw\/time_usage\/\d{4}-\d{2}-\d{2}/g) ?? []
  return [...new Set(matches)]
}
