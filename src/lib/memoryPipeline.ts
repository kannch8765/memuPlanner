import { demoDataset } from '@/lib/demoTimeUsage'
import type { MemUMessage } from '@/lib/memu'
import { memuFromEnv } from '@/lib/memu'
import { readRawTimeUsageDays } from '@/lib/rawTimeUsage'
import { readLatestLocalInsight } from '@/lib/localInsights'
import { extractPatternsInsightWithMemU } from '@/lib/insightExtraction'

export const LAYER_AGENT = {
  raw: 'layer1_raw_time_usage',
  insight: 'layer2_insights',
  sentiment: 'layer3_sentiment',
} as const

export async function ensureSeeded(userId: string): Promise<{ seeded: boolean; error?: string }> {
  const g = globalThis as unknown as { __memuPlannerSeeded?: boolean }
  if (g.__memuPlannerSeeded) return { seeded: false }

  try {
    const memu = memuFromEnv()
    await memu.ping()

    const now = new Date().toISOString()

    await seedLayer1RawTimeUsage(userId, now)

    await ensureInsightsExtracted(userId)

    await memorizeWithWait({
      userId,
      agentId: LAYER_AGENT.sentiment,
      conversation: buildSentimentConversation(now),
    })

    g.__memuPlannerSeeded = true
    return { seeded: true }
  } catch (err: any) {
    return { seeded: false, error: err?.message ?? 'MemU error' }
  }
}

export function buildRawConversation(nowIso: string): MemUMessage[] {
  const payload = JSON.stringify(demoDataset)
  const memPath = '/mem/raw/time_usage/demo_dataset'
  return [
    { role: 'user', created_at: nowIso, content: `Put ${memPath}. Raw time usage dataset follows.` },
    { role: 'assistant', created_at: nowIso, content: 'Understood. I will store this raw time usage dataset for future planning.' },
    { role: 'user', created_at: nowIso, content: JSON.stringify({ mem_path: memPath, dataset: demoDataset }) },
  ]
}

async function seedLayer1RawTimeUsage(userId: string, nowIso: string): Promise<void> {
  const memu = memuFromEnv()

  const g = globalThis as unknown as { __memuPlannerSeededLayer1Dates?: Set<string> }
  if (!g.__memuPlannerSeededLayer1Dates) g.__memuPlannerSeededLayer1Dates = new Set<string>()

  const { days } = readRawTimeUsageDays({ limit: layer1SeedLimit() })
  if (days.length === 0) {
    await memorizeWithWait({ userId, agentId: LAYER_AGENT.raw, conversation: buildRawConversation(nowIso) })
    return
  }

  for (const day of days) {
    if (g.__memuPlannerSeededLayer1Dates.has(day.date)) continue

    const memPath = `/mem/raw/time_usage/${day.date}`
    const exists = await memu
      .retrieve({ user_id: userId, agent_id: LAYER_AGENT.raw, query: memPath })
      .then((r) => (r.items ?? []).some((i) => i.content.includes(memPath)))
      .catch(() => false)

    if (exists) {
      g.__memuPlannerSeededLayer1Dates.add(day.date)
      continue
    }

    const payload = JSON.stringify({ mem_path: memPath, ...day })
    const conversation: MemUMessage[] = [
      { role: 'user', created_at: nowIso, content: `Put ${memPath}. Raw daily time usage JSON follows.` },
      { role: 'assistant', created_at: nowIso, content: 'Understood. I will store this raw daily time usage for future planning.' },
      { role: 'user', created_at: nowIso, content: payload },
    ]

    await memorizeWithWait({ userId, agentId: LAYER_AGENT.raw, conversation })
    g.__memuPlannerSeededLayer1Dates.add(day.date)
  }
}

function layer1SeedLimit(): number {
  const raw = process.env.LAYER1_SEED_DAYS
  const n = raw ? Number(raw) : 7
  if (!Number.isFinite(n)) return 7
  return Math.max(1, Math.min(60, Math.floor(n)))
}

async function ensureInsightsExtracted(userId: string): Promise<void> {
  const latest = readLatestLocalInsight()?.insight
  const today = new Date().toISOString().slice(0, 10)
  if (latest?.mem_path.includes(`/mem/insight/patterns/${today}/`)) return

  try {
    await extractPatternsInsightWithMemU({ userId, aggregateDays: 30, date: today })
  } catch {
    return
  }
}

export function buildSentimentConversation(nowIso: string): MemUMessage[] {
  const lines = demoDataset.days.map((d) => {
    const entertainmentM = d.entries
      .filter((e) => e.category === 'entertainment')
      .reduce((sum, e) => sum + diffMinutes(e.start, e.end), 0)
    const deepFocusM = d.entries
      .filter((e) => e.category === 'deep_focus')
      .reduce((sum, e) => sum + diffMinutes(e.start, e.end), 0)

    if (entertainmentM >= 120) return `${d.date}: I feel frustrated that I stayed up too late with screen time.`
    if (deepFocusM >= 120) return `${d.date}: I felt happy and proud about my deep focus today.`
    return `${d.date}: Today felt average; I want to plan better.`
  })

  const pseudoChat = lines.map((l) => ({ role: 'user' as const, created_at: nowIso, content: l }))

  return [
    { role: 'assistant', created_at: nowIso, content: 'I will store dated pseudo-chat sentiment so I can tailor future planning advice.' },
    ...pseudoChat.slice(0, 2),
    { role: 'user', created_at: nowIso, content: pseudoChat.slice(2).map((m) => m.content).join('\n') },
  ]
}

export async function memorizeChatTurn(userId: string, latestUserText: string, latestAssistantText: string): Promise<void> {
  try {
    const memu = memuFromEnv()
    const now = new Date().toISOString()
    const conversation: MemUMessage[] = [
      { role: 'user', created_at: now, content: latestUserText },
      { role: 'assistant', created_at: now, content: latestAssistantText },
      { role: 'user', created_at: now, content: 'Please remember this planning conversation for future advice.' },
    ]

    await memorizeWithWait({ userId, agentId: LAYER_AGENT.sentiment, conversation })
  } catch {
    return
  }
}

async function memorizeWithWait(params: { userId: string; agentId: string; conversation: MemUMessage[] }): Promise<void> {
  const memu = memuFromEnv()
  const result = await memu.memorize({
    conversation: params.conversation,
    user_id: params.userId,
    agent_id: params.agentId,
    session_date: new Date().toISOString(),
  })

  const timeoutMs = 60_000
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await memu.memorizeStatus(result.task_id)
    if (status.status === 'SUCCESS') return
    if (status.status === 'FAILED') throw new Error('MemU memorize task failed')
    await new Promise((r) => setTimeout(r, 1500))
  }
}

function diffMinutes(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime()
  const b = new Date(endIso).getTime()
  return Math.max(0, (b - a) / 60000)
}
