'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useChat } from 'ai/react'
import { Send, Sparkles } from 'lucide-react'
import { cn } from '@/utils/cn'

type MemUStep =
  | { type: 'memu_step'; label: 'Put' | 'Extract' | 'Get'; detail?: string; paths?: string[] }
  | { type: 'memu_refs'; paths: string[] }

export default function ChatPanel() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, data, error } = useChat({
    api: '/api/chat',
    body: { userId: 'demo-user' },
  })

  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, isLoading])

  const memuSteps = useMemo(() => {
    const steps = (data ?? []).filter(Boolean) as MemUStep[]
    return steps.filter((s) => s.type === 'memu_step')
  }, [data])

  const lastRefs = useMemo(() => {
    const items = (data ?? []).filter(Boolean) as MemUStep[]
    const last = [...items].reverse().find((d) => d.type === 'memu_refs') as MemUStep | undefined
    if (!last || last.type !== 'memu_refs') return []
    return last.paths
  }, [data])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-silver bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <h2 className="text-sm font-semibold">Chat</h2>
        </div>
        <p className="mt-1 text-xs text-deepStone/70">
          This shows MemU steps and which memory paths were referenced.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr]">
        <div className="border-b border-silver bg-cream px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Referenced:</span>
            {lastRefs.length === 0 ? (
              <span className="text-xs text-deepStone/60">(none yet)</span>
            ) : (
              lastRefs.map((p) => (
                <span key={p} className="rounded-full border border-silver bg-white px-2 py-0.5 text-[11px]">
                  {p}
                </span>
              ))
            )}
          </div>
        </div>

        <div ref={scrollerRef} className="min-h-0 overflow-y-auto px-4 py-3">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-silver bg-bone p-3 text-sm">
                Ask about your schedule, deep work, screen time, or tomorrow’s plan.
              </div>
            ) : null}

            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'max-w-[92%] rounded-2xl border px-3 py-2 text-sm',
                  m.role === 'user'
                    ? 'ml-auto border-gold bg-cream'
                    : 'mr-auto border-silver bg-white'
                )}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}

            {memuSteps.length > 0 ? (
              <div className="rounded-xl border border-silver bg-white p-3">
                <div className="text-xs font-semibold">MemU steps</div>
                <div className="mt-2 space-y-1">
                  {memuSteps.slice(-6).map((s, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md border border-silver bg-bone px-2 py-0.5 font-medium">
                        {s.label}
                      </span>
                      {s.detail ? <span className="text-deepStone/70">{s.detail}</span> : null}
                      {s.paths && s.paths.length > 0 ? (
                        <span className="text-deepStone/70">[{s.paths.join(', ')}]</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {error.message}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-silver bg-white p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder="Ask: When should I schedule deep work tomorrow?"
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-silver bg-cream px-3 py-2 text-sm outline-none focus:border-gold"
          />
          <button
            type="submit"
            disabled={isLoading || input.trim().length === 0}
            className={cn(
              'inline-flex h-[44px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition',
              isLoading || input.trim().length === 0
                ? 'cursor-not-allowed border-silver bg-bone text-deepStone/50'
                : 'border-gold bg-gold text-deepStone hover:bg-gold/90'
            )}
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </div>
        <div className="mt-2 text-[11px] text-deepStone/60">
          Requires `GROQ_API_KEY` for streaming chat; requires `MEMU_API_KEY` for memory.
        </div>
      </form>
    </div>
  )
}
