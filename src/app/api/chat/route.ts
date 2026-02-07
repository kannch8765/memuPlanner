import { streamText, StreamData, type CoreMessage } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { z } from 'zod'
import { decideLayer3WriteFromUserText, ensureSeeded, LAYER_AGENT, memorizeChatTurn } from '@/lib/memoryPipeline'
import { memuFromEnv } from '@/lib/memu'
import { readLatestLocalInsight } from '@/lib/localInsights'

type MemoryStep = {
  type: 'memory_step'
  layer: 1 | 2 | 3
  action: 'read' | 'write'
  path: string
  label: string
}

type MemoryStepsEvent = { type: 'memory_steps'; steps: MemoryStep[] }

const BodySchema = z.object({
  userId: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    })
  ),
})

type QuestionType = 'pattern' | 'date_specific' | 'emotion' | 'other'

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

function isBehaviorBasedQuestion(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false

  if (/(sleep|slept|insomnia|bedtime|wake|tired|fatigue|energy|rest|recharge)/i.test(t)) return true
  if (/(performance|productive|productivity|focus|focused|screen\s*time|habit|habits|gaming|youtube|netflix|distraction)/i.test(t)) return true
  if (/(睡眠|寝|起き|疲れ|だる|休息|パフォーマンス|集中|生産性|スクリーン|依存|習慣|ゲーム|動画|誘惑|だらだら)/.test(text)) return true

  return false
}

function detectQuestionType(text: string): QuestionType {
  const t = text.trim().toLowerCase()
  if (!t) return 'other'

  const emotion =
    /(how\s+did\s+i\s+feel|how\s+was\s+i\s+feeling|mood|emotion|emotions|anxious|stress|stressed|sad|depressed|happy|regret|guilty)/i.test(t) ||
    /(気分|感情|不安|ストレス|落ち込|悲し|嬉し|後悔|罪悪感|イライラ|焦り)/.test(text)
  if (emotion) return 'emotion'

  const dateSpecific =
    /(yesterday|last\s+night|today|this\s+morning|tonight)\b/i.test(t) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(t) ||
    /(昨日|今日|今朝|昨夜|今夜|\d{4}年\d{1,2}月\d{1,2}日)/.test(text)
  if (dateSpecific) return 'date_specific'

  const pattern = /(usually|tend\s+to|in\s+general|pattern|habit|typically)/i.test(t) || /(傾向|いつも|普段|パターン|習慣)/.test(text)
  if (pattern) return 'pattern'

  return 'other'
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
    const questionText = lastUserText(messages)
    const behaviorBased = isBehaviorBasedQuestion(questionText)
    const questionType = detectQuestionType(questionText)

    try {
      data.append({ type: 'memu_step', label: 'Put', detail: 'Ensure layer memories exist' })
      const seed = await ensureSeeded(userId)
      if (seed.seeded) data.append({ type: 'memu_step', label: 'Extract', detail: 'Seeded layer1/2/3 via MemU memorize' })
      if (seed.error) data.append({ type: 'memu_step', label: 'Extract', detail: `MemU unavailable: ${seed.error}` })
    } catch (e: any) {
      data.append({ type: 'memu_step', label: 'Extract', detail: `MemU seed failed: ${e?.message ?? 'error'}` })
    }

    try {
      const memu = memuFromEnv()
      data.append({
        type: 'memu_step',
        label: 'Get',
        detail: behaviorBased ? 'Retrieve behavior memories (Layer 2/3) for this question' : 'Retrieve memories for current question',
      })

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

    const localInsight = readLatestLocalInsight()?.insight

    const referenced = new Set<string>()
    const rawPaths = extractMemPaths(rawRes.items)
    const insightPaths = extractMemPaths(insightRes.items)
    const sentimentPaths = extractMemPaths(sentRes.items)
    for (const p of rawPaths) referenced.add(p)
    for (const p of insightPaths) referenced.add(p)
    for (const p of sentimentPaths) referenced.add(p)
    if (localInsight?.mem_path) referenced.add(localInsight.mem_path)

    const referencedPaths = [...referenced]

    const readSteps: MemoryStep[] = []

    const rawPath = rawPaths[0]
    if (rawPath) {
      const d = rawPath.split('/').slice(-1)[0]
      readSteps.push({ type: 'memory_step', layer: 1, action: 'read', path: rawPath, label: `Raw time usage (${d})` })
    } else {
      readSteps.push({ type: 'memory_step', layer: 1, action: 'read', path: '/mem/raw/time_usage/*', label: 'Raw time usage (no match)' })
    }

    if (localInsight) {
      const label = `${localInsight.dominant_focus_period} focus, ${localInsight.distraction_pattern} distraction${localInsight.sleep_risk ? ', sleep risk' : ''}`
      readSteps.push({ type: 'memory_step', layer: 2, action: 'read', path: localInsight.mem_path, label })
    } else if (insightPaths[0]) {
      readSteps.push({ type: 'memory_step', layer: 2, action: 'read', path: insightPaths[0], label: 'Insight patterns' })
    } else {
      readSteps.push({ type: 'memory_step', layer: 2, action: 'read', path: '/mem/insight/patterns/*', label: 'Insight patterns (no match)' })
    }

    const sentPath = sentimentPaths[0]
    if (sentPath) {
      readSteps.push({ type: 'memory_step', layer: 3, action: 'read', path: sentPath, label: 'Recent sentiment / chat memory' })
    } else {
      readSteps.push({ type: 'memory_step', layer: 3, action: 'read', path: '/mem/sentiment/chat/*', label: 'Sentiment/chat (no match)' })
    }

    const readEvent: MemoryStepsEvent = { type: 'memory_steps', steps: readSteps }
    data.append({ type: 'memu_refs', paths: referencedPaths })
    data.append(readEvent)

    const memoryContext = buildMemoryContext({ rawRes, insightRes, sentRes })
    const evidence = {
      layer1: rawPaths[0] ?? null,
      layer2: localInsight?.mem_path ?? insightPaths[0] ?? null,
      layer3: sentimentPaths[0] ?? null,
    }

    const system: CoreMessage = {
      role: 'system',
      content: [
        'You are memuPlanner, a time planning assistant.',
        'Use the provided memories to make concrete, actionable recommendations.',
        'Do not reveal chain-of-thought. Only give the advice.',
        'Use the insight schema (if present) to place deep focus and reduce distractions.',
        '',
        'Answer framing requirements (be transparent, do not hallucinate):',
        `- Question type: ${questionType}`,
        `- Evidence available:`,
        `  - Layer 1 raw day-level: ${evidence.layer1 ? `yes (${evidence.layer1})` : 'no'}`,
        `  - Layer 2 insight pattern: ${evidence.layer2 ? `yes (${evidence.layer2})` : 'no'}`,
        `  - Layer 3 sentiment/chat: ${evidence.layer3 ? `yes (${evidence.layer3})` : 'no'}`,
        'Rules:',
        '- If question type is pattern: speak probabilistically (patterns, not certainties).',
        '- If question type is date_specific and Layer 1 is missing: explicitly say you cannot be precise for that day and explain you are inferring from patterns (if Layer 2 exists).',
        '- If question type is emotion: only make claims when supported by Layer 3; if Layer 3 is missing, say you do not have enough evidence about feelings and ask a gentle follow-up question.',
        '- Never invent specific numbers, durations, or events not present in memory context.',
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
          const decision = decideLayer3WriteFromUserText(latestUser)
          if (decision.shouldWrite) {
            data.append({ type: 'memu_step', label: 'Put', detail: `Write sentiment/chat memory (Layer 3): ${decision.label}` })
            const memResult = await memorizeChatTurn(userId, latestUser, latestAssistant)
            if (memResult.ok) {
              const writeStep: MemoryStep = {
                type: 'memory_step',
                layer: 3,
                action: 'write',
                path: memResult.memPath,
                label: 'Stored reflection',
              }
              data.append({ type: 'memory_steps', steps: [writeStep] })
            } else {
              const writeStep: MemoryStep = {
                type: 'memory_step',
                layer: 3,
                action: 'write',
                path: memResult.memPath,
                label: `Write failed: ${memResult.error}`,
              }
              data.append({ type: 'memory_steps', steps: [writeStep] })
            }
          } else {
            const noWrite: MemoryStep = {
              type: 'memory_step',
              layer: 3,
              action: 'write',
              path: '(none)',
              label: `No new memory written (${decision.label})`,
            }
            data.append({ type: 'memory_steps', steps: [noWrite] })
          }
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
  const matches = [
    ...(text.match(/\/mem\/raw\/time_usage\/\d{4}-\d{2}-\d{2}/g) ?? []),
    ...(text.match(/\/mem\/insight\/patterns\/\d{4}-\d{2}-\d{2}\/v\d+/g) ?? []),
    ...(text.match(/\/mem\/sentiment\/chat\/\d{4}-\d{2}-\d{2}/g) ?? []),
    ...(text.match(/\/mem\/sentiment\/chat\/\d{10,}/g) ?? []),
  ]
  return [...new Set(matches)]
}

