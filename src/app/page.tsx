import ChatPanel from '@/components/ChatPanel'
import TimelinePanel from '@/components/TimelinePanel'

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl gap-4 p-4">
      <section className="flex h-[calc(100vh-2rem)] w-full flex-1 flex-col overflow-hidden rounded-2xl border border-silver bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-silver bg-bone px-4 py-3">
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold tracking-wide">memuPlanner</h1>
            <p className="text-xs text-deepStone/70">Chat (left) + Timeline (right) with MemU memory</p>
          </div>
          <div className="rounded-full border border-gold bg-cream px-3 py-1 text-xs">Prototype</div>
        </header>
        <div className="grid h-full grid-cols-1 gap-0 md:grid-cols-2">
          <div className="h-full min-h-0 border-b border-silver md:border-b-0 md:border-r">
            <ChatPanel />
          </div>
          <div className="h-full min-h-0">
            <TimelinePanel />
          </div>
        </div>
      </section>
    </main>
  )
}

