import fs from 'node:fs'
import path from 'node:path'

loadDotEnv(path.join(process.cwd(), '.env'))

const MEMU_BASE_URL = process.env.MEMU_BASE_URL || 'https://api.memu.so'
const MEMU_API_KEY = process.env.MEMU_API_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_BASE_URL = normalizeGroqBaseUrl(process.env.GROQ_BASE_URL || 'https://api.groq.com')

function mustEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing ${name}`)
    process.exit(1)
  }
  return v
}

function loadDotEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim()
      if (!key) continue
      if (process.env[key] !== undefined) continue
      process.env[key] = value
    }
  } catch {
    return
  }
}

function formatDate(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function nextVersion(date) {
  const dir = path.join(process.cwd(), 'mem', 'insight', 'patterns', date)
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 1
  } catch {
    return 1
  }
  const files = fs.readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f))
  const max = files.reduce((acc, f) => {
    const n = Number(f.slice(1).replace('.json', ''))
    return Number.isFinite(n) ? Math.max(acc, n) : acc
  }, 0)
  return max + 1
}

function listDayFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort((a, b) => b.localeCompare(a))
}

function readRawDays(limit) {
  const dir = path.join(process.cwd(), 'mem', 'raw', 'time_usage')
  if (!fs.existsSync(dir)) {
    console.error('Missing mem/raw/time_usage. Run: npm run sync:mem:layer1')
    process.exit(1)
  }
  const files = listDayFiles(dir).slice(0, limit)
  const days = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  return { dir, days }
}

async function memuPost(pathname, body) {
  const res = await fetch(`${MEMU_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MEMU_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MemU POST ${pathname} failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function memuGet(pathname) {
  const res = await fetch(`${MEMU_BASE_URL}${pathname}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${MEMU_API_KEY}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`MemU GET ${pathname} failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function waitTask(taskId) {
  const start = Date.now()
  const timeoutMs = 90_000
  while (Date.now() - start < timeoutMs) {
    const status = await memuGet(`/api/v3/memory/memorize/status/${encodeURIComponent(taskId)}`)
    if (status.status === 'SUCCESS') return
    if (status.status === 'FAILED') throw new Error('MemU memorize task failed')
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('MemU memorize timed out')
}

function extractJsonObject(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

function validateInsight(obj, memPath) {
  if (!obj || typeof obj !== 'object') return false
  const okPeriod = ['morning', 'afternoon', 'night'].includes(obj.dominant_focus_period)
  const okDistraction = ['entertainment', 'social', 'mixed', 'none'].includes(obj.distraction_pattern)
  const okSleep = typeof obj.sleep_risk === 'boolean'
  const okConf = typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
  const okPath = typeof obj.mem_path === 'string' && obj.mem_path.length > 0
  return okPeriod && okDistraction && okSleep && okConf && okPath && obj.mem_path === memPath
}

async function main() {
  mustEnv('MEMU_API_KEY')
  mustEnv('GROQ_API_KEY')
  const userId = process.env.USER_ID || 'demo-user'
  const aggregateDays = Number(process.env.AGGREGATE_DAYS || '30')

  const date = formatDate(new Date())
  const version = nextVersion(date)
  const memPath = `/mem/insight/patterns/${date}/v${version}`

  const { days } = readRawDays(aggregateDays)
  if (days.length === 0) {
    console.error('No raw days found.')
    process.exit(1)
  }

  const now = new Date().toISOString()
  const conversation = [
    {
      role: 'user',
      created_at: now,
      content: [
        'Extract behavioral insights from raw time usage JSON across multiple days.',
        `Store the insight as a structured JSON object under memU path: ${memPath}.`,
        'Output MUST be a single JSON object with exactly these keys:',
        JSON.stringify({
          mem_path: memPath,
          dominant_focus_period: 'morning | afternoon | night',
          distraction_pattern: 'entertainment | social | mixed | none',
          sleep_risk: 'boolean',
          confidence: 'number (0-1)',
        }),
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
      content: JSON.stringify({ source: '/mem/raw/time_usage/*', days }),
    },
  ]

  console.log(`[extract] starting memU memorize for ${memPath} (days=${days.length})`)
  const started = await memuPost('/api/v3/memory/memorize', {
    conversation,
    user_id: userId,
    agent_id: 'layer2_insights',
    session_date: now,
  })
  console.log(`[extract] task_id=${started.task_id}`)

  await waitTask(started.task_id)
  console.log('[extract] status=SUCCESS')

  const retrieved = await memuPost('/api/v3/memory/retrieve', {
    user_id: userId,
    agent_id: 'layer2_insights',
    query: memPath,
  })
  console.log(`[extract] retrieve items=${(retrieved.items || []).length}`)

  const extractedTexts = (retrieved.items || []).map((i) => String(i.content || ''))

  console.log('[extract] structuring insight via Groq (from memU extracted items)')
  const structured = await groqToJson({ memPath, extractedTexts })
  const ok = validateInsight(structured, memPath)
  console.log(`[extract] validated=${ok}`)
  if (!ok) {
    console.error('[extract] Candidate JSON did not match required schema')
    console.error(JSON.stringify(structured, null, 2))
    process.exit(3)
  }

  const putStarted = await memuPost('/api/v3/memory/memorize', {
    conversation: [
      { role: 'user', created_at: new Date().toISOString(), content: `Put ${memPath}. Structured insight object follows.` },
      { role: 'assistant', created_at: new Date().toISOString(), content: 'Understood. I will store this insight as a structured memory object.' },
      { role: 'user', created_at: new Date().toISOString(), content: JSON.stringify(structured) },
    ],
    user_id: userId,
    agent_id: 'layer2_insights',
    session_date: new Date().toISOString(),
  })
  await waitTask(putStarted.task_id)
  console.log(`[extract] stored structured insight to memU (${putStarted.task_id})`)

  const dir = path.join(process.cwd(), 'mem', 'insight', 'patterns', date)
  fs.mkdirSync(dir, { recursive: true })
  const outPath = path.join(dir, `v${version}.json`)
  fs.writeFileSync(outPath, JSON.stringify(structured, null, 2) + '\n', 'utf8')
  console.log(`[extract] wrote ${path.relative(process.cwd(), outPath)}`)
}

main().catch((err) => {
  console.error(String(err?.message || err))
  process.exit(1)
})

async function groqToJson(params) {
  const prompt = [
    'Convert the extracted memory items into a strict JSON insight object.',
    'Return ONLY JSON, no extra text.',
    'Schema:',
    JSON.stringify({
      mem_path: params.memPath,
      dominant_focus_period: 'morning | afternoon | night',
      distraction_pattern: 'entertainment | social | mixed | none',
      sleep_risk: 'boolean',
      confidence: 'number (0-1)',
    }),
    '',
    'Extracted items:',
    params.extractedTexts.map((t) => `- ${t}`).join('\n').slice(0, 12_000),
  ].join('\n')

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Groq chat failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  const obj = extractJsonObject(String(content))
  if (!obj) throw new Error('Groq did not return JSON')
  obj.mem_path = params.memPath
  return obj
}

function normalizeGroqBaseUrl(input) {
  const trimmed = String(input || '').replace(/\/+$/, '')
  if (!trimmed) return 'https://api.groq.com/openai/v1'
  if (trimmed.endsWith('/openai/v1')) return trimmed
  return `${trimmed}/openai/v1`
}
