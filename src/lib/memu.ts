import { z } from 'zod'

const MemUMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  name: z.string().optional(),
  created_at: z.string().optional(),
  content: z.string(),
})

export type MemUMessage = z.infer<typeof MemUMessageSchema>

export type MemURetrieveItem = {
  memory_type?: string
  content: string
}

export type MemURetrieveResult = {
  rewritten_query?: string
  categories?: Array<{ name: string; description?: string; summary?: string }>
  items?: MemURetrieveItem[]
}

export class MemUClient {
  private baseUrl: string
  private apiKey: string

  constructor(params: { baseUrl?: string; apiKey: string }) {
    this.baseUrl = params.baseUrl ?? 'https://api.memu.so'
    this.apiKey = params.apiKey
  }

  async memorize(input: {
    conversation: MemUMessage[]
    user_id: string
    user_name?: string
    agent_id: string
    agent_name?: string
    session_date?: string
  }): Promise<{ task_id: string; status: string; message?: string }> {
    const parsed = z
      .object({
        conversation: z.array(MemUMessageSchema).min(3),
        user_id: z.string().min(1),
        user_name: z.string().optional(),
        agent_id: z.string().min(1),
        agent_name: z.string().optional(),
        session_date: z.string().optional(),
      })
      .parse(input)

    return this.post('/api/v3/memory/memorize', parsed)
  }

  async memorizeStatus(taskId: string): Promise<{ task_id: string; status: string; created_at?: string; completed_at?: string }> {
    return this.get(`/api/v3/memory/memorize/status/${encodeURIComponent(taskId)}`)
  }

  async categories(input: { user_id: string; agent_id: string }): Promise<{ categories: Array<{ name: string; description: string; summary?: string }> }> {
    return this.post('/api/v3/memory/categories', input)
  }

  async retrieve(input: { user_id: string; agent_id: string; query: string | MemUMessage[] }): Promise<MemURetrieveResult> {
    return this.post('/api/v3/memory/retrieve', input)
  }

  async ping(): Promise<boolean> {
    const user_id = 'ping_user'
    const agent_id = 'ping_agent'
    await this.categories({ user_id, agent_id })
    return true
  }

  private async get(path: string): Promise<any> {
    return this.request({ method: 'GET', path })
  }

  private async post(path: string, body: any): Promise<any> {
    return this.request({ method: 'POST', path, body })
  }

  private async request(params: { method: 'GET' | 'POST'; path: string; body?: any }): Promise<any> {
    const maxAttempts = 5
    let lastErr: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${params.path}`, {
          method: params.method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(params.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(params.method === 'POST' ? { body: JSON.stringify(params.body) } : {}),
        })

        if (res.ok) return res.json()

        const text = await res.text().catch(() => '')
        const retryable = isRetryableStatus(res.status)
        if (retryable && attempt < maxAttempts) {
          const waitMs = computeBackoffMs({
            attempt,
            retryAfter: res.headers.get('retry-after'),
            hintText: text,
          })
          await sleep(waitMs)
          continue
        }

        throw new Error(`${params.method} ${params.path} failed: ${res.status} ${summarizeHttpBody(text)}`)
      } catch (e) {
        lastErr = e
        const msg = String((e as any)?.message ?? e)
        const retryable = /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(msg)
        if (retryable && attempt < maxAttempts) {
          await sleep(computeBackoffMs({ attempt }))
          continue
        }
        break
      }
    }

    const msg = String((lastErr as any)?.message ?? lastErr ?? 'Unknown error')
    throw new Error(`MemU ${params.method} ${params.path} failed after retries: ${msg}`)
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function summarizeHttpBody(text: string): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return '(empty response)'
  const m = t.match(/<title>([^<]+)<\/title>/i)
  const title = m?.[1]?.trim()
  const cleaned = title ? `HTML: ${title}` : t
  return cleaned.length > 240 ? `${cleaned.slice(0, 240)}…` : cleaned
}

function computeBackoffMs(params: { attempt: number; retryAfter?: string | null; hintText?: string }): number {
  const retryAfterSeconds = parseRetryAfterSeconds(params.retryAfter)
  if (retryAfterSeconds !== null) return Math.min(30_000, retryAfterSeconds * 1000)

  const hintSeconds = parseRetrySecondsFromBody(params.hintText)
  if (hintSeconds !== null) return Math.min(30_000, hintSeconds * 1000)

  const base = Math.min(8000, 400 * 2 ** (params.attempt - 1))
  const jitter = Math.floor(Math.random() * 250)
  return base + jitter
}

function parseRetryAfterSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function parseRetrySecondsFromBody(text: string | undefined): number | null {
  if (!text) return null
  const m = text.match(/try again in\s+([0-9.]+)s/i)
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) && v >= 0 ? v : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function memuFromEnv(): MemUClient {
  const apiKey = process.env.MEMU_API_KEY
  const baseUrl = process.env.MEMU_BASE_URL
  if (!apiKey) throw new Error('Missing MEMU_API_KEY')
  return new MemUClient({ apiKey, baseUrl })
}
