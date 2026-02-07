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

function normalizeGroqBaseUrl(input) {
  const trimmed = String(input || '').replace(/\/+$/, '')
  if (!trimmed) return 'https://api.groq.com/openai/v1'
  if (trimmed.endsWith('/openai/v1')) return trimmed
  return `${trimmed}/openai/v1`
}

function formatDate(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function buildMemPath(date) {
  return `/mem/sentiment/chat/${date}`
}

function minutesBetween(date, startHHMM, endHHMM) {
  const toMillis = (d, hm) => {
    const [hh, mm] = String(hm || '00:00').split(':').map((x) => Number(x))
    const base = new Date(`${d}T00:00:00`).getTime()
    return base + ((hh || 0) * 60 + (mm || 0)) * 60_000
  }
  const a = toMillis(date, startHHMM)
  let b = toMillis(date, endHHMM)
  if (b < a) b += 24 * 60 * 60_000
  return Math.max(0, (b - a) / 60_000)
}

function classifyPeriod(startHHMM) {
  const h = Number(String(startHHMM || '0').split(':')[0])
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'afternoon'
  return 'night'
}

function looksEntertainment(cat, summary) {
  if (cat.includes('entertain')) return true
  return /(youtube|netflix|tiktok|anime|tv|video|game|gaming|switch|ps5|steam)/i.test(summary)
}

function looksSocial(cat, summary) {
  if (cat.includes('social')) return true
  return /(friends|friend|chat|line|discord|call|dinner|party|hangout)/i.test(summary)
}

function looksDeepFocus(cat, summary) {
  if (cat.includes('deep')) return true
  return /(deep focus|focus block|coding|study|writing|project|research|build)/i.test(summary)
}

function computeDayFeatures(day) {
  const buckets = { morning: 0, afternoon: 0, night: 0 }
  let entertainmentMinutes = 0
  let socialMinutes = 0
  let focusMinutes = 0
  let lateNightMinutes = 0

  let lastEndMinutes = 0
  const topCategories = new Map()

  for (const e of Array.isArray(day.events) ? day.events : []) {
    const minutes = minutesBetween(day.date, e.start, e.end)
    const period = classifyPeriod(e.start)
    buckets[period] += minutes

    const cat = String(e.category || '').toLowerCase()
    const summary = String(e.summary || '').toLowerCase()
    const label = String(e.category || 'uncategorized')
    topCategories.set(label, (topCategories.get(label) || 0) + minutes)

    if (looksEntertainment(cat, summary)) entertainmentMinutes += minutes
    if (looksSocial(cat, summary)) socialMinutes += minutes
    if (looksDeepFocus(cat, summary)) focusMinutes += minutes

    const end = String(e.end || '00:00')
    const [eh, em] = end.split(':').map((x) => Number(x))
    const endMin = (eh || 0) * 60 + (em || 0)
    const start = String(e.start || '00:00')
    const [sh, sm] = start.split(':').map((x) => Number(x))
    const startMin = (sh || 0) * 60 + (sm || 0)
    const normalizedEndMin = endMin < startMin ? endMin + 1440 : endMin
    if (normalizedEndMin > lastEndMinutes) lastEndMinutes = normalizedEndMin
    if (startMin >= 23 * 60 || normalizedEndMin >= 24 * 60 + 30) lateNightMinutes += minutes
  }

  const dominant_period = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0] || 'morning'
  const distraction_pattern =
    entertainmentMinutes >= 45 && socialMinutes >= 45
      ? 'mixed'
      : entertainmentMinutes >= 60
        ? 'entertainment'
        : socialMinutes >= 60
          ? 'social'
          : 'none'

  const sleepRisk = lastEndMinutes >= 24 * 60 + 15 || lateNightMinutes >= 60
  const top = [...topCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, minutes]) => ({ name, minutes }))

  return {
    dominant_period,
    distraction_pattern,
    sleepRisk,
    focusMinutes: Math.round(focusMinutes),
    entertainmentMinutes: Math.round(entertainmentMinutes),
    socialMinutes: Math.round(socialMinutes),
    lastEndMinutes: Math.round(lastEndMinutes),
    topCategories: top,
  }
}

function validateSentiment(obj, date) {
  if (!obj || typeof obj !== 'object') return false
  if (obj.date !== date) return false
  if (obj.source !== 'derived_from_time_usage') return false
  if (!['positive', 'neutral', 'negative'].includes(obj.tone)) return false
  if (typeof obj.sentiment !== 'string' || obj.sentiment.length < 1 || obj.sentiment.length > 300) return false
  return true
}

async function groqSentiment(params) {
  const prompt = [
    'Generate a short first-person sentiment message as if the user wrote it about their day.',
    'Rules:',
    '- First-person only ("I felt...", "I regret...", "I was happy...").',
    '- 1–2 sentences maximum.',
    '- Emotional but realistic, reflect focus/distraction/sleep timing.',
    '- Return ONLY a JSON object, no extra text.',
    '',
    'Schema:',
    JSON.stringify({
      date: params.date,
      sentiment: 'string',
      tone: 'positive | neutral | negative',
      source: 'derived_from_time_usage',
    }),
    '',
    'Day features:',
    JSON.stringify(params.features),
  ].join('\n')

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
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

  obj.date = params.date
  obj.source = 'derived_from_time_usage'
  return obj
}

async function groqSentimentBatch(params) {
  const prompt = [
    'Generate short first-person sentiment messages as if the user wrote them about each day.',
    'Rules:',
    '- First-person only ("I felt...", "I regret...", "I was happy...").',
    '- 1–2 sentences maximum per day.',
    '- Emotional but realistic, reflect focus/distraction/sleep timing.',
    '- Return ONLY a JSON object, no extra text.',
    '',
    'Return format:',
    JSON.stringify({
      items: [
        {
          date: 'YYYY-MM-DD',
          sentiment: 'string',
          tone: 'positive | neutral | negative',
          source: 'derived_from_time_usage',
        },
      ],
    }),
    '',
    'Days:',
    JSON.stringify(
      params.days.map((d) => ({
        date: d.date,
        features: d.features,
      }))
    ),
  ].join('\n')

  const data = await groqChatJson({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.4,
    prompt,
  })
  const content = data?.choices?.[0]?.message?.content || ''
  const obj = extractJsonObject(String(content))
  if (!obj || !Array.isArray(obj.items)) throw new Error('Groq did not return {items: [...]}')

  return obj.items
}

async function groqChatJson(params) {
  const maxAttempts = 6
  let attempt = 0
  while (attempt < maxAttempts) {
    attempt++
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        messages: [{ role: 'user', content: params.prompt }],
        response_format: { type: 'json_object' },
      }),
    })

    if (res.ok) return res.json()

    const text = await res.text().catch(() => '')
    if (res.status === 429) {
      const waitSeconds = parseRetrySeconds(text) ?? Math.min(30, 2 ** attempt)
      await new Promise((r) => setTimeout(r, Math.ceil(waitSeconds * 1000) + 250))
      continue
    }

    throw new Error(`Groq chat failed: ${res.status} ${text}`)
  }

  throw new Error('Groq chat failed: exceeded retry attempts')
}

function parseRetrySeconds(text) {
  const m = String(text).match(/try again in\s+([0-9.]+)s/i)
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) ? v : null
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

function findInputDir() {
  const candidates = [
    path.join(process.cwd(), 'data', 'time_usage'),
    path.join(process.cwd(), 'mem', 'raw', 'time_usage'),
    path.join(process.cwd(), 'dataTask'),
    path.join(process.cwd(), 'data'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
    } catch {
      continue
    }
  }
  return null
}

function listDayFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort((a, b) => a.localeCompare(b))
}

async function storeSentimentToMemU(params) {
  const now = new Date().toISOString()
  const memPath = buildMemPath(params.date)
  const conversation = [
    {
      role: 'user',
      created_at: now,
      content: `Store this pseudo-chat sentiment JSON at ${memPath} as long-term memory.`,
    },
    {
      role: 'assistant',
      created_at: now,
      content: 'Understood. I will store the provided sentiment memory.',
    },
    {
      role: 'user',
      created_at: now,
      content: JSON.stringify({ mem_path: memPath, ...params.sentiment }),
    },
  ]

  const started = await memuPost('/api/v3/memory/memorize', {
    conversation,
    user_id: params.userId,
    agent_id: 'layer3_sentiment',
    session_date: now,
  })
  await waitTask(started.task_id)
  return { memPath, taskId: started.task_id }
}

async function storeSentimentBatchToMemU(params) {
  const now = new Date().toISOString()
  const conversation = [
    {
      role: 'user',
      created_at: now,
      content: 'Store each pseudo-chat sentiment JSON at its mem_path as long-term memory.',
    },
    {
      role: 'assistant',
      created_at: now,
      content: 'Understood. I will store each provided sentiment memory item at its mem_path.',
    },
    {
      role: 'user',
      created_at: now,
      content: JSON.stringify(params.items),
    },
  ]

  const started = await memuPost('/api/v3/memory/memorize', {
    conversation,
    user_id: params.userId,
    agent_id: 'layer3_sentiment',
    session_date: now,
  })
  await waitTask(started.task_id)
  return { taskId: started.task_id }
}

async function main() {
  mustEnv('MEMU_API_KEY')
  mustEnv('GROQ_API_KEY')

  const userId = process.env.USER_ID || 'demo-user'
  const inputDir = findInputDir()
  if (!inputDir) {
    console.error('No input directory found. Expected one of: data/time_usage/, mem/raw/time_usage/, dataTask/, data/')
    process.exit(1)
  }

  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined
  const onlyDate = process.env.DATE || undefined
  const force = process.env.FORCE === '1'

  const outDir = path.join(process.cwd(), 'mem', 'sentiment', 'chat')
  fs.mkdirSync(outDir, { recursive: true })

  let files = listDayFiles(inputDir)
  if (onlyDate) files = files.filter((f) => f === `${onlyDate}.json`)
  if (limit && Number.isFinite(limit)) files = files.slice(0, limit)

  if (files.length === 0) {
    console.error(`No day files found in ${inputDir}`)
    process.exit(1)
  }

  console.log(`[sentiment] input=${path.relative(process.cwd(), inputDir)} days=${files.length} userId=${userId}`)

  const batchSize = process.env.BATCH_SIZE ? Number(process.env.BATCH_SIZE) : 10
  const pendingForGroq = []
  const readyToStore = []
  let failures = 0

  for (const file of files) {
    const date = file.replace('.json', '')
    const outPath = path.join(outDir, `${date}.json`)

    if (!force && fs.existsSync(outPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'))
        if (!validateSentiment(existing, date)) throw new Error('invalid local snapshot')
        readyToStore.push({ date, sentiment: existing })
        continue
      } catch {
        pendingForGroq.push({ date, file, outPath })
        continue
      }
    }

    pendingForGroq.push({ date, file, outPath })
  }

  for (let i = 0; i < pendingForGroq.length; i += batchSize) {
    const slice = pendingForGroq.slice(i, i + batchSize)
    const dayPayload = slice.map((it) => {
      const day = JSON.parse(fs.readFileSync(path.join(inputDir, it.file), 'utf8'))
      day.date = day.date || it.date
      const features = computeDayFeatures(day)
      return { date: it.date, features }
    })

    let items
    try {
      items = await groqSentimentBatch({ days: dayPayload })
    } catch (err) {
      console.error(`[sentiment] groq batch failed ${slice[0]?.date}..${slice[slice.length - 1]?.date}: ${String(err?.message || err)}`)
      failures += slice.length
      continue
    }

    const byDate = new Map(items.map((x) => [x?.date, x]))
    for (const it of slice) {
      const s = byDate.get(it.date)
      if (!validateSentiment(s, it.date)) {
        console.error(`[sentiment] invalid schema ${it.date}`)
        failures++
        continue
      }
      fs.writeFileSync(it.outPath, JSON.stringify(s, null, 2) + '\n', 'utf8')
      readyToStore.push({ date: it.date, sentiment: s })
    }
  }

  const storeBatchSize = process.env.STORE_BATCH_SIZE ? Number(process.env.STORE_BATCH_SIZE) : 25
  for (let i = 0; i < readyToStore.length; i += storeBatchSize) {
    const slice = readyToStore.slice(i, i + storeBatchSize)
    const toMemu = slice.map((x) => ({ mem_path: buildMemPath(x.date), ...x.sentiment }))
    try {
      const stored = await storeSentimentBatchToMemU({ userId, items: toMemu })
      for (const x of slice) {
        console.log(`[sentiment] stored ${buildMemPath(x.date)} task_id=${stored.taskId}`)
      }
    } catch (err) {
      console.error(`[sentiment] memu batch failed ${slice[0]?.date}..${slice[slice.length - 1]?.date}: ${String(err?.message || err)}`)
      failures += slice.length
    }
  }

  console.log(`[sentiment] done total=${files.length} stored=${readyToStore.length} failed=${failures}`)
  if (failures > 0) process.exit(2)
}

main().catch((err) => {
  console.error(String(err?.message || err))
  process.exit(1)
})
