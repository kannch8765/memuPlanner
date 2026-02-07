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
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`MemU GET ${path} failed: ${res.status} ${text}`)
    }
    return res.json()
  }

  private async post(path: string, body: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`MemU POST ${path} failed: ${res.status} ${text}`)
    }
    return res.json()
  }
}

export function memuFromEnv(): MemUClient {
  const apiKey = process.env.MEMU_API_KEY
  const baseUrl = process.env.MEMU_BASE_URL
  if (!apiKey) throw new Error('Missing MEMU_API_KEY')
  return new MemUClient({ apiKey, baseUrl })
}

