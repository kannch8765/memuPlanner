# memuPlanner

Planner + chat demo that makes a memory pipeline visible: you can see what gets retrieved (READ) and what gets stored (WRITE) across multiple memory layers, without exposing chain-of-thought.

## What problem does this solve?

Most “AI planners” feel stateless: you ask about tomorrow, it answers, and it forgets. This project demonstrates how a planning assistant can use memory responsibly (and transparently) so that advice improves over time and users can verify what the system actually used.

## Why memory matters

- **Planning depends on history**: deep focus timing, distraction patterns, and sleep risk are behavioral—without memory, the assistant can only give generic advice.
- **Users need trust**: showing which memories were read/written makes the system auditable.
- **Avoid hallucination**: answers are framed based on what evidence exists (day-level vs patterns vs sentiment).

## Memory architecture (tree)

This demo uses three logical layers:

```
Layer 1: Raw behavior (day-level)
  /mem/raw/time_usage/YYYY-MM-DD

Layer 2: Behavioral insights (patterns)
  /mem/insight/patterns/YYYY-MM-DD/vN

Layer 3: Sentiment / reflections (chat-like)
  /mem/sentiment/chat/<timestamp>
```

## Put / Extract / Get flow

- **Put**: store structured payloads under a memory path.
- **Extract**: MemU memorization pass that turns conversation or raw logs into storable memories.
- **Get**: retrieve memories relevant to the current question.

In the chat UI, each assistant message shows a “MemU steps” block with:
- which layers were **READ** (Layer 1/2/3)
- which layers were **WRITTEN** (Layer 3 only, when appropriate)

## Live demo scenario

Use these prompts in order:

1) Reflection (should WRITE Layer 3)
```
I stayed up too late gaming last night and I regret it.
```

2) Planning question (should READ layers, no new write)
```
When should I schedule deep work tomorrow?
```

3) Behavior question (should READ layers, no new write)
```
How was my sleep recently?
```

What to look for:
- The assistant will show explicit READ steps (Layer 1/2/3) for behavior-based questions.
- The assistant only WRITES Layer 3 when the user message is reflective/emotional, not for clarifications/constraints.

## How to run

1) Install
```bash
npm install
```

2) Configure environment
- Create a `.env` file and set:
  - `GROQ_API_KEY`
  - `MEMU_API_KEY`
  - (optional) `MEMU_BASE_URL` (defaults to `https://api.memu.so`)

3) Start dev server
```bash
npm run dev -- --port 3000
```

Open: http://localhost:3000

## Directory

```
src/
  app/
    api/chat/route.ts         # Chat route: MemU read/write + streaming + framing
    page.tsx                  # 2-panel layout
  components/
    ChatPanel.tsx             # Chat UI + per-reply MemU steps rendering
    TimelinePanel.tsx         # Planner timeline UI
    MemoryReferences.tsx      # Memory path viewer
  lib/
    memu.ts                   # MemU client (retry/backoff)
    memoryPipeline.ts         # Layer agents + seed + write gating
    localInsights.ts          # Local fallback insight (kept for demo)
```
