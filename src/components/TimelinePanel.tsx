import { Activity, Clock } from 'lucide-react'
import { buildTimelineModel, type TimelineDay } from '@/lib/timeline'

function DayCard({ day }: { day: TimelineDay }) {
  return (
    <div className="rounded-2xl border border-silver bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gold" />
          <div className="text-sm font-semibold">{day.date}</div>
        </div>
        <div className="text-xs text-deepStone/70">{day.totalHours.toFixed(1)}h tracked</div>
      </div>

      <div className="mt-3 space-y-2">
        {day.blocks.map((b) => (
          <div key={b.id} className="flex items-center gap-3">
            <div className="w-[86px] text-[11px] text-deepStone/70">{b.label}</div>
            <div className="h-7 flex-1 rounded-xl border border-silver bg-cream">
              <div
                className="h-full rounded-xl"
                style={{ width: `${Math.max(6, Math.round((b.minutes / day.totalMinutes) * 100))}%`, backgroundColor: b.color }}
              />
            </div>
            <div className="w-[50px] text-right text-[11px] text-deepStone/70">{Math.round(b.minutes)}m</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-silver bg-bone p-2 text-xs text-deepStone/80">
        <span className="font-medium">Insight:</span> {day.insight}
      </div>
    </div>
  )
}

export default function TimelinePanel() {
  const model = buildTimelineModel()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-silver bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gold" />
          <h2 className="text-sm font-semibold">Timeline</h2>
        </div>
        <p className="mt-1 text-xs text-deepStone/70">Tomorrow plan + recent history (from memory)</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {model.days.map((d) => (
            <DayCard key={d.date} day={d} />
          ))}
        </div>
      </div>
    </div>
  )
}
