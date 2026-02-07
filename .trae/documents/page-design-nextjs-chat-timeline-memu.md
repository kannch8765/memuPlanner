# Page Design Spec — Next.js Chat (Left) + Timeline (Right)

## Global Styles (applies to all pages)
- Desktop-first layout with responsive fallbacks.
- Layout system: CSS Grid for page shell + Flexbox inside panels.
- Spacing: 8px base unit (8/16/24/32).
- Colors (light theme default):
  - Background: #0B0F17 (app shell)
  - Panel surface: #111827
  - Border/divider: rgba(255,255,255,0.08)
  - Text primary: #F9FAFB, secondary: #9CA3AF
  - Accent: #60A5FA (links, focus), Success: #34D399, Danger: #F87171
- Typography:
  - Base: 14–16px, line-height 1.5
  - Headings: 18/20/24/30 scale
  - Code/paths: monospace, slightly smaller, high-contrast chip
- Buttons:
  - Primary: solid accent; hover increases brightness; disabled reduced opacity
  - Secondary: subtle border
- Inputs:
  - Clear focus ring (2px accent), accessible contrast
- Links:
  - Underline on hover; external icon optional
- Motion:
  - Subtle 120–180ms transitions for hover/focus and panel resize affordances

---

## Page: Workspace (/)

### Meta Information
- Title: “memU Chat Workspace”
- Description: “Streaming chat with a per-turn timeline and referenced memU paths.”
- Open Graph:
  - og:title = “memU Chat Workspace”
  - og:description = same as description

### Layout
- Page shell: CSS Grid with rows: topbar (auto) + content (1fr).
- Content area: two-column grid (desktop-first):
  - Left column: Chat panel (minmax(520px, 1fr))
  - Right column: Timeline panel (360–440px typical)
- Resizing:
  - Divider handle between columns (drag to resize).
  - Timeline collapse button in header; when collapsed, chat becomes full width.
- Breakpoints:
  - >= 1024px: side-by-side split view.
  - < 1024px: stacked view (chat first, timeline below) with sticky timeline header.

### Page Structure
1. Topbar
2. Main split view
   - Left: Chat panel
   - Right: Timeline panel
3. Global toasts (errors, “stopped”, etc.)

### Sections & Components

#### 1) Topbar
- Left: App name (“memU Planner”) + page label (“Workspace”).
- Right actions:
  - “Settings” link
  - “New chat” button (clears local conversation state)

#### 2) Chat Panel (Left)
**Header row**
- Conversation title (optional, e.g., “Untitled chat”).
- Controls:
  - “Stop” (visible only while streaming)
  - “Retry” (enabled after an error)

**Transcript**
- Message list with consistent spacing.
- Message cards:
  - User messages: right-aligned, slightly different surface.
  - Assistant messages: left-aligned.
- Assistant message content rules (critical requirement):
  - Render only the assistant’s final answer text.
  - Do not show chain-of-thought / internal reasoning.
  - If present, render a dedicated block at the end:
    - Title: “Referenced memU paths”
    - List of path chips (monospace), each chip clickable.
- Referenced memU path chips:
  - Display path string; truncate middle for long paths.
  - On click: copy to clipboard + optionally highlight related timeline event.

**Composer (sticky at bottom)**
- Multiline textarea with:
  - Enter = send, Shift+Enter = newline
  - Disabled while streaming
- Send button (primary) + helper hint text

**Streaming states**
- While streaming:
  - Show animated cursor at end of assistant message
  - Disable composer; enable “Stop”
- On stop:
  - Mark assistant message as partial; timeline event still created with type “assistant_completed” but flagged as stopped (visual tag).

#### 3) Timeline Panel (Right)
**Header**
- Title: “Timeline”
- Controls:
  - Collapse/expand toggle
  - Filter: “All / Only turns with memU refs”

**Timeline list**
- Vertical list grouped by turns.
- Each event card shows:
  - Turn index + timestamp
  - Event type label (user/assistant/error)
  - Summary (short; e.g., first ~80 chars of user prompt)
  - Referenced memU paths (chips), if any
- Interactions:
  - Click event: scroll chat transcript to associated turn and briefly highlight it.

**Empty/error states**
- Empty: “Your timeline will appear here as you chat.”
- Error: show last error with “Retry” button.

---

## Page: Settings (/settings)

### Meta Information
- Title: “Settings — memU Chat”
- Description: “Configure model/provider, reference rules, and UI preferences.”
- Open Graph:
  - og:title = “Settings — memU Chat”
  - og:description = same as description

### Layout
- Centered settings container (max-width ~960px) with sections.
- Two-column form layout on desktop, single-column on mobile.

### Page Structure
1. Topbar (same as Workspace)
2. Settings sections (cards)

### Sections & Components

#### 1) Model & Provider
- Dropdown: provider preset (e.g., “OpenAI-compatible”).
- Text input: model name (validated, but stored locally).
- Helper text: “API keys are stored on the server via environment variables.”

#### 2) Reference Rules
- Read-only policy banner:
  - “Assistant must not reveal chain-of-thought.”
  - “Assistant must list only referenced memU paths.”
- Editable textarea: “Response format instruction” (stored locally and sent as a safe preference to the server if allowed).

#### 3) UI Preferences
- Toggle: timeline collapsed by default
- Slider: default split ratio
- Toggle: auto-scroll chat during streaming

#### 4) Danger Zone
- Button: “Reset local settings” (clears local storage)
- Button: “Clear chat history (local)”
