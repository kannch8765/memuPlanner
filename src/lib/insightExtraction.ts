import type { MemUMessage } from '@/lib/memu'
import { memuFromEnv } from '@/lib/memu'
import { readRawTimeUsageDays } from '@/lib/rawTimeUsage'
import { generateObject } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { InsightPatternsSchema, InsightPatternsCoreSchema, type InsightPatterns, buildInsightMemPath } from '@/lib/insightsLayer'
import { nextLocalInsightVersion, writeLocalInsight } from '@/lib/localInsights'

export async function extractPatternsInsightWithMemU(params: {
  userId: string
  aggregateDays?: number
  date?: string
}): Promise<{ taskId: string; memPath: string; storedLocalPath?: string; validated: boolean; retrievedSample?: any }>
{
  const aggregateDays = params.aggregateDays ?? 30
  const date = params.date ?? formatDate(new Date())
  const version = nextLocalInsightVersion(date)
  const memPath = buildInsightMemPath({ date, version })

  const { days } = readRawTimeUsageDays({ limit: aggregateDays })
  if (days.length === 0) throw new Error('No raw time usage days found under mem/raw/time_usage or dataTask/data')

  const memu = memuFromEnv()

  const conversation: MemUMessage[] = buildExtractionConversation({ memPath, days })

  const started = await memu.memorize({
    user_id: params.userId,
    agent_id: 'layer2_insights',
    session_date: new Date().toISOString(),
    conversation,
  })

  await waitForMemorize(memu, started.task_id)

  const retrieved = await memu.retrieve({
    user_id: params.userId,
    agent_id: 'layer2_insights',
    query: memPath,
  })

  const extractedTexts = (retrieved.items ?? []).map((i) => i.content)

  const structured = await structureInsightFromExtractedItems({ memPath, extractedTexts })
  const validated = InsightPatternsSchema.safeParse(structured).success
  const storedLocalPath = validated ? writeLocalInsight(structured) : undefined

  if (validated) {
    const putConversation: MemUMessage[] = [
      { role: 'user', created_at: new Date().toISOString(), content: `Put ${memPath}. Structured insight object follows.` },
      { role: 'assistant', created_at: new Date().toISOString(), content: 'Understood. I will store this insight as a structured memory object.' },
      { role: 'user', created_at: new Date().toISOString(), content: JSON.stringify(structured) },
    ]
    const putTask = await memu.memorize({ user_id: params.userId, agent_id: 'layer2_insights', session_date: new Date().toISOString(), conversation: putConversation })
    await waitForMemorize(memu, putTask.task_id)
  }

  return {
    taskId: started.task_id,
    memPath,
    storedLocalPath,
    validated,
    retrievedSample: (retrieved.items ?? []).slice(0, 3),
  }
}

async function structureInsightFromExtractedItems(params: { memPath: string; extractedTexts: string[] }): Promise<InsightPatterns> {
  const groq = createGroq({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: normalizeGroqBaseUrl(process.env.GROQ_BASE_URL),
  })

  const prompt = [
    'You are converting extracted behavioral memory items into a strict JSON insight object.',
    'Return ONLY valid JSON, no extra text.',
    'Schema:',
    JSON.stringify({
      dominant_focus_period: 'morning | afternoon | night',
      distraction_pattern: 'entertainment | social | mixed | none',
      sleep_risk: 'boolean',
      confidence: 'number (0-1)',
    }),
    '',
    'Extracted items:',
    params.extractedTexts.map((t) => `- ${t}`).join('\n').slice(0, 12_000),
  ].join('\n')

  const result = await generateObject({
    model: groq('llama-3.3-70b-versatile'),
    schema: InsightPatternsCoreSchema,
    prompt,
  })

  return { mem_path: params.memPath, ...result.object }
}

function buildExtractionConversation(params: { memPath: string; days: any[] }): MemUMessage[] {
  const now = new Date().toISOString()
  const schema = {
    mem_path: params.memPath,
    dominant_focus_period: 'morning | afternoon | night',
    distraction_pattern: 'entertainment | social | mixed | none',
    sleep_risk: 'boolean',
    confidence: 'number (0-1)',
  }

  return [
    {
      role: 'user',
      created_at: now,
      content: [
        'Extract behavioral insights from raw time usage JSON across multiple days.',
        `Store the insight as a structured JSON object under memU path: ${params.memPath}.`,
        'Output MUST be a single JSON object with exactly these keys:',
        JSON.stringify(schema),
        'Rules:',
        '- Aggregate across the provided days.',
        '- Do not include any extra text outside JSON.',
      ].join('\n'),
    },
    {
      role: 'assistant',
      created_at: now,
      content: 'Understood. I will extract the insight and store it as a structured memory object.',
    },
    {
      role: 'user',
      created_at: now,
      content: JSON.stringify({ source: '/mem/raw/time_usage/*', days: params.days }),
    },
  ]
}

async function waitForMemorize(memu: ReturnType<typeof memuFromEnv>, taskId: string): Promise<void> {
  const timeoutMs = 90_000
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await memu.memorizeStatus(taskId)
    if (status.status === 'SUCCESS') return
    if (status.status === 'FAILED') throw new Error('MemU memorize task failed')
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('MemU memorize timed out')
}

function findFirstJsonObject(texts: string[]): any | null {
  for (const t of texts) {
    const extracted = extractJsonObject(t)
    if (extracted) return extracted
  }
  return null
}

function extractJsonObject(text: string): any | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = text.slice(start, end + 1)
  try {
    return JSON.parse(slice)
  } catch {
    return null
  }
}

function normalizeGroqBaseUrl(input: string | undefined): string | undefined {
  if (!input) return undefined
  const trimmed = input.replace(/\/+$/, '')
  if (trimmed.endsWith('/openai/v1')) return trimmed
  return `${trimmed}/openai/v1`
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
