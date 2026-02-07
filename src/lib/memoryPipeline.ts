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

export type MemorizeChatTurnResult =
  | { ok: true; memPath: string }
  | { ok: false; memPath: string; error: string }

export async function memorizeChatTurn(userId: string, latestUserText: string, latestAssistantText: string): Promise<MemorizeChatTurnResult> {
  const ts = String(Date.now())
  const memPath = `/mem/sentiment/chat/${ts}`

  try {
    const memu = memuFromEnv()
    const now = new Date().toISOString()
    const conversation: MemUMessage[] = [
      { role: 'user', created_at: now, content: `Put ${memPath}. Save this chat input for future planning.` },
      { role: 'assistant', created_at: now, content: 'Understood. I will store this chat memory.' },
      { role: 'user', created_at: now, content: JSON.stringify({ mem_path: memPath, timestamp: now, user: latestUserText, assistant: latestAssistantText, source: 'live_chat' }) },
    ]

    await memorizeWithWait({ userId, agentId: LAYER_AGENT.sentiment, conversation })
    return { ok: true, memPath }
  } catch (e: any) {
    return { ok: false, memPath, error: String(e?.message ?? e ?? 'Unknown error') }
  }
}

export type MemoryWriteDecision = {
  shouldWrite: boolean
  label: string
}

export function decideLayer3WriteFromUserText(text: string): MemoryWriteDecision {
  const t = text.trim()
  if (!t) return { shouldWrite: false, label: 'Empty message' }

  const looksQuestion = /\?|^(what|when|where|why|how|can you|could you|would you|please)\b/i.test(t)
  if (looksQuestion) return { shouldWrite: false, label: 'Clarification / question' }

  const emotionMarkers = [
    /\b(i\s+feel|i\s+felt|i\s+regret|i\s+was\s+happy|i\s+am\s+happy|i\s+was\s+sad|i\s+am\s+sad|i\s+was\s+stressed|i\s+am\s+stressed|i\s+was\s+anxious|i\s+am\s+anxious|i\s+was\s+proud|i\s+am\s+proud)\b/i,
    /(嬉しい|悲しい|つらい|疲れた|しんどい|後悔|イライラ|不安|焦り|落ち込|達成感|満足|うれしかった|楽しかった)/,
  ]
  if (emotionMarkers.some((re) => re.test(t))) return { shouldWrite: true, label: 'Reflection / emotion' }

  const constraintMarkers = [
    /\b(i have|i've got|i need to|i must|tomorrow|today|at \d{1,2}(:\d{2})?|meeting|appointment|deadline|call)\b/i,
    /(会議|ミーティング|予定|締切|打ち合わせ|通院|面談|出社|帰宅|\d{1,2}時(\d{1,2}分)?)/,
  ]
  if (constraintMarkers.some((re) => re.test(t))) return { shouldWrite: false, label: 'Constraint / planning info' }

  const reflectiveTone = /\b(today|tonight|yesterday|lately)\b/i.test(t) && /\b(i|my)\b/i.test(t)
  if (reflectiveTone) return { shouldWrite: true, label: 'Reflection (non-emotional)' }

  return { shouldWrite: false, label: 'Default: do not write' }
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
