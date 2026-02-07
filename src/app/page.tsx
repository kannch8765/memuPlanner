import ChatPanel from '@/components/ChatPanel'
import TimelinePanel from '@/components/TimelinePanel'

export default function HomePage() {
  return (
    <main className="mx-auto flex h-screen w-full max-w-6xl gap-4 overflow-hidden p-4">
      <section className="flex h-full w-full flex-1 flex-col overflow-hidden rounded-3xl bg-cream/60">
        <header className="flex items-center justify-between px-4 py-4">
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold tracking-wide">memuPlanner</h1>
            <p className="text-xs text-deepStone/70">Chat (left) + Timeline (right) with MemU memory</p>
          </div>
          <div className="rounded-full bg-bone/60 px-3 py-1 text-xs text-deepStone/70">Prototype</div>
        </header>
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 p-2 md:grid-cols-2">
          <div className="h-full min-h-0 overflow-hidden rounded-3xl bg-white/50">
            <ChatPanel />
          </div>
          <div className="h-full min-h-0 overflow-hidden rounded-3xl bg-white/50">
            <TimelinePanel />
          </div>
        </div>
      </section>
    </main>
  )
}
