'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/utils/cn'

function labelForMemPath(memPath: string): { title: string; subtitle?: string } {
  const m1 = memPath.match(/^\/mem\/insight\/patterns\/(\d{4}-\d{2}-\d{2})\/v(\d+)$/)
  if (m1) return { title: 'Insight patterns', subtitle: `${m1[1]} · v${m1[2]}` }

  const m2 = memPath.match(/^\/mem\/raw\/time_usage\/(\d{4}-\d{2}-\d{2})$/)
  if (m2) return { title: 'Raw time usage', subtitle: m2[1] }

  const m3 = memPath.match(/^\/mem\/sentiment\/chat\/(\d{4}-\d{2}-\d{2})$/)
  if (m3) return { title: 'Daily sentiment', subtitle: m3[1] }

  const m4 = memPath.match(/^\/mem\/sentiment\/chat\/(\d{10,})$/)
  if (m4) return { title: 'Chat memory', subtitle: m4[1] }

  if (memPath === '/mem/insight/patterns') return { title: 'Insight patterns (folder)' }

  return { title: memPath }
}

export default function MemoryReferences(props: {
  title?: string
  paths: string[]
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(Boolean(props.defaultOpen))

  const unique = useMemo(() => {
    const set = new Set(props.paths)
    return [...set]
  }, [props.paths])

  if (unique.length === 0) return null

  return (
    <div className={cn('rounded-xl bg-bone/60 p-2', props.className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-1 py-1 text-left"
      >
        <div className="text-[12px] font-medium text-deepStone/90">
          {props.title ?? '🧠 Memory referenced in this reply'}
        </div>
        <div className="text-[11px] text-deepStone/60">{open ? 'Hide' : 'Show'} ({unique.length})</div>
      </button>

      {open ? (
        <div className="mt-2 space-y-1">
          {unique.map((p) => {
            const label = labelForMemPath(p)
            return (
              <div key={p} className="rounded-lg bg-white/70 px-2 py-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="truncate text-[12px] font-medium text-deepStone">{label.title}</div>
                  {label.subtitle ? <div className="shrink-0 text-[11px] text-deepStone/60">{label.subtitle}</div> : null}
                </div>
                {label.title === p ? null : (
                  <div className="mt-0.5 truncate font-mono text-[10px] text-deepStone/50">{p}</div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

