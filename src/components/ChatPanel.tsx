'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from 'ai/react'
import { Send, Sparkles } from 'lucide-react'
import { cn } from '@/utils/cn'
import MemoryReferences from '@/components/MemoryReferences'

type MemUStep =
  | { type: 'memu_step'; label: 'Put' | 'Extract' | 'Get'; detail?: string; paths?: string[] }
  | { type: 'memu_refs'; paths: string[] }

type MemoryStep = {
  type: 'memory_step'
  layer: 1 | 2 | 3
  action: 'read' | 'write'
  path: string
  label: string
}

type MemoryStepsEvent = { type: 'memory_steps'; steps: MemoryStep[] }

export default function ChatPanel() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, data, error } = useChat({
    api: '/api/chat',
    body: { userId: 'demo-user' },
  })

  const [refsByAssistantId, setRefsByAssistantId] = useState<Record<string, string[]>>({})
  const [stepsByAssistantId, setStepsByAssistantId] = useState<Record<string, Array<{ label: string; detail?: string; paths?: string[] }>>>({})
  const [memoryStepsByAssistantId, setMemoryStepsByAssistantId] = useState<Record<string, MemoryStep[]>>({})
  const [memoryStepsByAssistantSeq, setMemoryStepsByAssistantSeq] = useState<Record<number, MemoryStep[]>>({})

  const dataCursorRef = useRef(0)
  const pendingRefsRef = useRef<string[] | null>(null)
  const pendingStepsRef = useRef<Array<{ label: string; detail?: string; paths?: string[] }>>([])
  const pendingMemoryStepsRef = useRef<MemoryStep[]>([])

  const assistantSeqById = useMemo(() => {
    const map = new Map<string, number>()
    let seq = 0
    for (const m of messages) {
      if (m.role === 'assistant') {
        seq += 1
        map.set(m.id, seq)
      }
    }
    return map
  }, [messages])

  const flushPendingToAssistantId = useCallback(
    (assistantId: string) => {
      if (pendingRefsRef.current) {
        const refs = pendingRefsRef.current
        pendingRefsRef.current = null
        setRefsByAssistantId((prev) => ({ ...prev, [assistantId]: mergeUnique(prev[assistantId] ?? [], refs) }))
      }

      if (pendingStepsRef.current.length > 0) {
        const steps = pendingStepsRef.current
        pendingStepsRef.current = []
        setStepsByAssistantId((prev) => ({ ...prev, [assistantId]: [...(prev[assistantId] ?? []), ...steps] }))
      }

      if (pendingMemoryStepsRef.current.length > 0) {
        const steps = pendingMemoryStepsRef.current
        pendingMemoryStepsRef.current = []
        setMemoryStepsByAssistantId((prev) => ({ ...prev, [assistantId]: mergeUniqueMemorySteps(prev[assistantId] ?? [], steps) }))

        const seq = assistantSeqById.get(assistantId)
        if (seq) {
          setMemoryStepsByAssistantSeq((prev) => ({ ...prev, [seq]: mergeUniqueMemorySteps(prev[seq] ?? [], steps) }))
        }
      }
    },
    [assistantSeqById]
  )

  useEffect(() => {
    setMemoryStepsByAssistantSeq((prev) => {
      let next: Record<number, MemoryStep[]> | null = null
      for (const [id, seq] of assistantSeqById.entries()) {
        const steps = memoryStepsByAssistantId[id]
        if (!steps?.length) continue
        const existing = prev[seq]
        if (existing && existing.length > 0) continue
        if (!next) next = { ...prev }
        next[seq] = steps
      }
      return next ?? prev
    })
  }, [assistantSeqById, memoryStepsByAssistantId])

  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const messagesRef = useRef(messages)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, isLoading])

  useEffect(() => {
    const items = ((data ?? []).filter(Boolean) as Array<MemUStep | MemoryStepsEvent>) ?? []
    const cursor = dataCursorRef.current
    const next = items.slice(cursor)
    dataCursorRef.current = items.length

    for (const item of next) {
      if (item.type === 'memu_refs') {
        pendingRefsRef.current = item.paths
      }
      if (item.type === 'memu_step') {
        pendingStepsRef.current = [...pendingStepsRef.current, { label: item.label, detail: item.detail, paths: item.paths }]
      }
      if (item.type === 'memory_steps') {
        pendingMemoryStepsRef.current = [...pendingMemoryStepsRef.current, ...item.steps]
      }
    }

    const assistantId = currentTurnAssistantId(messagesRef.current)
    if (assistantId) flushPendingToAssistantId(assistantId)
  }, [data, flushPendingToAssistantId])

  useEffect(() => {
    const assistantId = currentTurnAssistantId(messages)
    if (assistantId) flushPendingToAssistantId(assistantId)
  }, [messages, flushPendingToAssistantId])

  const lastAssistantId = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant')
    return last?.id
  }, [messages])

  return (
    <div className="flex h-full min-h-0 flex-col bg-white/60">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <h2 className="text-sm font-semibold">Chat</h2>
        </div>
        <p className="mt-1 text-xs text-deepStone/70">Streaming chat + visible memory usage (paths only).</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr]">
        <div className="px-4 py-2">
          <MemoryReferences paths={lastAssistantId ? refsByAssistantId[lastAssistantId] ?? [] : []} defaultOpen={false} />
        </div>

        <div ref={scrollerRef} className="min-h-0 overflow-y-auto px-4 py-3">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="rounded-2xl bg-bone/70 p-4 text-sm text-deepStone">
                Ask about your schedule, deep work, screen time, or tomorrow’s plan.
              </div>
            ) : null}

            {messages.map((m, idx) => {
              const seq = m.role === 'assistant' ? assistantSeqById.get(m.id) : undefined
              const memorySteps =
                m.role === 'assistant'
                  ? ((seq ? memoryStepsByAssistantSeq[seq] : undefined) ?? memoryStepsByAssistantId[m.id])
                  : undefined
              const hasMemorySteps = Boolean(memorySteps?.length)

              return (
                <div key={`${m.id}-${idx}`} className={cn('max-w-[92%]', m.role === 'user' ? 'ml-auto' : 'mr-auto')}>
                  <div
                    className={cn(
                      'rounded-2xl px-3 py-2 text-sm leading-relaxed',
                      m.role === 'user' ? 'bg-cream/80 text-deepStone' : 'bg-white/70 text-deepStone'
                    )}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>

                  {m.role === 'assistant' ? (
                    <div className="mt-2">
                      <MemoryReferences paths={refsByAssistantId[m.id] ?? []} defaultOpen={false} />

                      {hasMemorySteps && memorySteps ? (
                        <div className="mt-2 rounded-2xl bg-cream/60 p-3">
                          <div className="text-[12px] font-medium text-deepStone/85">MemU steps</div>
                          <div className="mt-2 space-y-2">
                            {stableSortMemorySteps(memorySteps).map((s, stepIdx) => (
                              <div key={`${s.layer}-${s.action}-${s.path}-${stepIdx}`} className="rounded-xl bg-white/70 px-2 py-1">
                                <div className="flex items-baseline justify-between gap-3">
                                  <div className="truncate text-[12px] font-medium text-deepStone">
                                    {s.action === 'read' ? 'Retrieved' : 'Stored'} {s.layer === 1 ? 'raw' : s.layer === 2 ? 'insight' : 'sentiment/chat'} (Layer {s.layer})
                                  </div>
                                  <div className="shrink-0 text-[11px] text-deepStone/60">{s.label}</div>
                                </div>
                                <div className="mt-0.5 truncate font-mono text-[10px] text-deepStone/55">{s.path}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {!hasMemorySteps && stepsByAssistantId[m.id]?.length ? (
                        <div className="mt-2 rounded-2xl bg-cream/60 p-3">
                          <div className="text-[12px] font-medium text-deepStone/85">MemU steps</div>
                          <div className="mt-2 space-y-1">
                            {stepsByAssistantId[m.id].slice(-6).map((s, sIdx) => (
                              <div key={sIdx} className="text-[11px] text-deepStone/70">
                                <span className="font-medium">{s.label}</span>
                                {s.detail ? <span className="ml-2">{s.detail}</span> : null}
                                {s.paths?.length ? (
                                  <span className="ml-2 font-mono text-[10px] text-deepStone/55">{s.paths.join(', ')}</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {error ? (
              <div className="rounded-xl bg-red-50 p-3 text-xs text-red-800">{error.message}</div>
            ) : null}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white/60 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder="Ask: When should I schedule deep work tomorrow?"
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded-xl bg-cream/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold/40"
          />
          <button
            type="submit"
            disabled={isLoading || input.trim().length === 0}
            className={cn(
              'inline-flex h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition',
              isLoading || input.trim().length === 0
                ? 'cursor-not-allowed bg-bone/70 text-deepStone/50'
                : 'bg-gold/80 text-deepStone hover:bg-gold/90'
            )}
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </div>
        <div className="mt-2 text-[11px] text-deepStone/55">Only memory paths are shown (no full reasoning).</div>
      </form>
    </div>
  )
}

function mergeUnique(a: string[], b: string[]): string[] {
  const set = new Set(a)
  for (const x of b) set.add(x)
  return [...set]
}

function mergeUniqueMemorySteps(a: MemoryStep[], b: MemoryStep[]): MemoryStep[] {
  const key = (s: MemoryStep) => `${s.layer}:${s.action}:${s.path}:${s.label}`
  const seen = new Set(a.map(key))
  const out = [...a]
  for (const s of b) {
    const k = key(s)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

function lastAssistantIdFrom(refMessages: Array<{ role: string; id: string }>): string | undefined {
  const last = [...refMessages].reverse().find((m) => m.role === 'assistant')
  return last?.id
}

function currentTurnAssistantId(refMessages: Array<{ role: string; id: string }>): string | undefined {
  let lastUserIdx = -1
  for (let i = refMessages.length - 1; i >= 0; i--) {
    if (refMessages[i]?.role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx === -1) return lastAssistantIdFrom(refMessages)

  for (let i = refMessages.length - 1; i > lastUserIdx; i--) {
    if (refMessages[i]?.role === 'assistant') return refMessages[i]?.id
  }
  return undefined
}

function stableSortMemorySteps(steps: MemoryStep[]): MemoryStep[] {
  const order = (s: MemoryStep) => {
    const actionRank = s.action === 'read' ? 0 : 1
    const layerRank = s.layer
    return actionRank * 10 + layerRank
  }
  return steps
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => order(a.s) - order(b.s) || a.idx - b.idx)
    .map((x) => x.s)
}

