import { Activity } from 'lucide-react'
import { buildTimelineModel, type TimelineBlock, type TimelineDay } from '@/lib/timeline'
import { readLatestLocalInsight } from '@/lib/localInsights'

type PlannedEvent = {
  id: string
  title: string
  start: string
  end: string
  durationMinutes: number
  color: string
}

function parsePlannedEvent(block: TimelineBlock): PlannedEvent | null {
  const m = block.label.match(/^(\d{2}:\d{2})[–-](\d{2}:\d{2})\s+(.*)$/)
  if (!m) return null
  return {
    id: block.id,
    start: m[1] ?? '00:00',
    end: m[2] ?? '00:00',
    title: m[3] ?? 'Event',
    durationMinutes: Math.round(block.minutes),
    color: block.color,
  }
}

function minutesSinceMidnight(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map((x) => Number(x))
  return (hh || 0) * 60 + (mm || 0)
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '')
  if (cleaned.length !== 6) return `rgba(0,0,0,${alpha})`
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function PlannerDay({ day }: { day: TimelineDay }) {
  const events = day.blocks.map(parsePlannedEvent).filter(Boolean) as PlannedEvent[]
  const rangeStart = 6 * 60
  const rangeEnd = 24 * 60
  const pxPerMinute = 1.05
  const height = Math.round((rangeEnd - rangeStart) * pxPerMinute)

  const hours = Array.from({ length: 19 }, (_, i) => 6 + i)
  const insight = readLatestLocalInsight()?.insight
  const memPaths = [insight?.mem_path].filter(Boolean) as string[]

  return (
    <div className="rounded-2xl bg-white/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-deepStone">{day.date}</div>
          <div className="mt-1 text-xs text-deepStone/65">Planned schedule suggested from memory</div>
        </div>
        <div className="rounded-full bg-cream/70 px-3 py-1 text-[11px] text-deepStone/70">planner view</div>
      </div>

      <div className="mt-4 grid grid-cols-[64px_1fr] gap-3">
        <div className="relative" style={{ height }}>
          {hours.map((h) => {
            const top = Math.round((h * 60 - rangeStart) * pxPerMinute)
            return (
              <div key={h} className="absolute left-0 right-0" style={{ top }}>
                <div className="text-[11px] text-deepStone/50">{String(h).padStart(2, '0')}:00</div>
              </div>
            )
          })}
        </div>

        <div className="relative rounded-2xl bg-cream/50" style={{ height }}>
          {hours.map((h) => {
            const top = Math.round((h * 60 - rangeStart) * pxPerMinute)
            return <div key={h} className="absolute left-0 right-0 h-px bg-white/70" style={{ top }} />
          })}

          {events.map((ev) => {
            const startMin = minutesSinceMidnight(ev.start)
            const endMinRaw = minutesSinceMidnight(ev.end)
            const endMin = endMinRaw < startMin ? endMinRaw + 24 * 60 : endMinRaw
            const clippedStart = Math.max(rangeStart, startMin)
            const clippedEnd = Math.min(rangeEnd, endMin)
            const top = Math.round((clippedStart - rangeStart) * pxPerMinute) + 4
            const h = Math.max(28, Math.round((clippedEnd - clippedStart) * pxPerMinute) - 8)

            return (
              <div
                key={ev.id}
                className="absolute left-3 right-3 rounded-2xl px-3 py-2"
                style={{ top, height: h, backgroundColor: hexToRgba(ev.color, 0.35) }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="truncate text-[12px] font-semibold text-deepStone">{ev.title}</div>
                  <div className="shrink-0 text-[11px] text-deepStone/60">
                    {ev.start}–{ev.end}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-deepStone/55">{ev.durationMinutes} min</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-bone/60 p-3">
        <div className="text-[12px] font-medium text-deepStone">Why this plan</div>
        <div className="mt-1 text-[12px] leading-relaxed text-deepStone/75">{day.insight}</div>

        {memPaths.length ? (
          <div className="mt-2">
            <div className="text-[12px] font-medium text-deepStone/90">🧠 Memory referenced</div>
            <div className="mt-1 space-y-1">
              {memPaths.map((p) => (
                <div key={p} className="rounded-xl bg-white/70 px-2 py-1 font-mono text-[10px] text-deepStone/60">
                  {p}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function TimelinePanel() {
  const model = buildTimelineModel()
  const planDay = model.days.find((d) => d.date.includes('(plan)')) ?? model.days[0]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white/60">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gold" />
          <h2 className="text-sm font-semibold">Timeline</h2>
        </div>
        <p className="mt-1 text-xs text-deepStone/70">Planner-style schedule (plan only).</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {planDay ? <PlannerDay day={planDay} /> : null}
      </div>
    </div>
  )
}
