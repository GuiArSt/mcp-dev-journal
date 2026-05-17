# Handoff: Kronus Chat — Hourglass Layout

## Overview
This is a redesign proposal for the **Chat / Kronus** view (`/chat` route) of the Tartarus workshop app. It unifies the conversation UI, the evolving "mood" artifact (an AI-painted image + haiku that evolves with the conversation), and the code/file repository panel into a single three-column "Hourglass" layout.

The design explores:
- A **cream-paper "reader"** center column for the Kronus transcript, making long philosophical answers readable like a journal page rather than a chat bubble stream.
- A **dark, runic "mood" panel** on the right that holds the current turn's painted image + haiku **and** can switch to a "repository" tab showing the code/file the AI is reasoning about.
- A **collapsible rail** on the left matching the app's existing `Sidebar.tsx` nav (Chat / Reader / Repository) with an expanded transcript drawer.
- A **floating/docked composer** at the bottom with teal rune ornamentation, draggable between free-float and docked states.
- A **carousel** inside the mood panel for cycling through past-turn images, with a matching cycler on the haiku card.
- **Kingdom Hearts "World That Never Was"** geometric edges — subtle chamfered corners + gold hairline diagonals — as a consistent visual signature across panels.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly.

Your task is to **recreate this design inside the existing `tartarus-dev-workshop` Next.js app**, using its established patterns:
- Next.js App Router (`web/app/(dashboard)/chat/page.tsx`)
- React + TypeScript
- Tailwind CSS with the `--tartarus-*` CSS variable system (see `web/DESIGN_SYSTEM.md`)
- shadcn/ui primitives from `web/components/ui/*`
- `lucide-react` icons
- Existing sidebar from `web/components/layout/Sidebar.tsx` — do not duplicate, the rail in this mock is a *visualization of the collapsed sidebar state*; integrate with the real one.

**Do not ship the HTML.** Translate it.

## Fidelity
**High-fidelity.** Colors, typography, spacing, edge geometry, and interaction states are intentional. Recreate pixel-perfectly using the existing Tartarus tokens. Where the mock uses hardcoded colors (e.g. cream `#f6efdd`), **add new tokens** to the design system rather than inlining hexes in components.

---

## Screens / Views

### Primary view: `/chat`

**Layout (desktop, ≥1280px):**
Three-column CSS grid, full viewport height.

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar (40px) — metrics only: model, ctx%, turn, tokens      │
├──────┬────────────────────────┬──────────────────────────────┤
│ Rail │  Hero (cream paper)    │  Mood / Repository panel     │
│ 54px │  1fr                   │  ~560px (tweakable)          │
│      │  scrollable            │  scrollable                  │
│      │                        │                              │
│      │                        │                              │
├──────┴────────────────────────┴──────────────────────────────┤
│ Composer (floating or docked, fixed bottom)                  │
└──────────────────────────────────────────────────────────────┘
```

Grid template:
```css
grid-template-columns: 54px 1fr 560px;
grid-template-rows: 40px 1fr;
grid-template-areas:
  "topbar  topbar  topbar"
  "rail    hero    mood";
```

---

### Component breakdown

#### 1. Topbar (`components/chat/ChatTopbar.tsx`)
- Height **40px**, 1px bottom border `var(--tartarus-border)`.
- Left: `Tartarus · Kronos · <conversation title (italic, muted)>` — Cormorant Garamond italic for the title.
- Right: metric group — `MODEL opus 4.7` · `CTX 72%` · `TURN 04/04` · `TOK 2.4k` · small `Tweaks (0)` pill.
- All metrics use `font-family: var(--font-geist-mono)`, `text-[10px]`, `uppercase`, `tracking-wider`, color `var(--tartarus-ivory-muted)`; values slightly brighter (`var(--tartarus-ivory-dim)`).
- Background `var(--tartarus-void)` with a subtle SVG noise overlay (see **Design Tokens → Textures**).

#### 2. Rail (left sidebar, 54px collapsed)
This is the **collapsed state of the existing `Sidebar.tsx`** — reuse the component, don't fork.

- Icons in order: `MessageSquare` (Chat, active), `BookOpen` (Reader), `Archive` (Repository). Match `navItems` in `Sidebar.tsx` **exactly** — if/when Atropos/Hermes are re-added, they appear here automatically.
- Active state: teal color `var(--tartarus-teal)` (`#00CED1`) + a 2px teal vertical bar on the left edge of the icon button (see `tartarus-sidebar-item.active` existing class).
- Below the nav: a thin divider, then a transcript toggle icon (three horizontal lines) and a "new chat" icon (plus).
- A **pip stack** at the bottom — 4 small dots representing turns in the current conversation (three muted, one gold for the current turn).
- Background has a **subtle teal runic pattern** as a decorative overlay (see **Design Tokens → Textures → Runic pattern**). Opacity 0.15, `mix-blend-mode: screen`, `pointer-events: none`.
- Hover-expands to ~260px revealing conversation titles (use existing `Sidebar.tsx` hover behavior).

#### 3. Hero — the "Reader" paper (center column)
This is the biggest visual shift. Kronus's messages are rendered **as a document**, not chat bubbles.

**Background:**
- Base: warm cream gradient `linear-gradient(175deg, #f6efdd 0%, #ece2ca 60%, #e4d8bc 100%)`.
- Top-left highlight: `radial-gradient(ellipse 80% 60% at 15% 10%, rgba(255, 248, 220, 0.5), transparent 60%)`.
- Edge vignette: `radial-gradient(ellipse 120% 100% at 50% 50%, transparent 50%, rgba(120, 90, 55, 0.08) 100%)`.
- Paper fibers: SVG fractal noise tile (see **Textures → Paper grain**) + horizontal 2px fiber repeating lines at `rgba(90, 60, 30, 0.022)`.
- Subtle inner right-edge shadow `inset -10px 0 24px -10px rgba(40, 30, 20, 0.25)` — suggests the paper sits in a frame.
- The texture must scroll **with the content** — `background-attachment: local`.

**Typography:**
- Body: `Cormorant Garamond`, `17px`, `line-height: 1.78`, color `#1a2a4a` (dark navy "ink").
- Italic intro lines: `#3b4d72`, italic, used for Kronos's stage-direction openings ("A pause. This is the blind-edit problem in a new shape.").
- Strong/emphasis: red `#a63a2a` — used for ticket IDs (`ENG-4216`), phrase emphasis, `<strong>`.
- Italic emphasis: red `#c23a20`.
- Code: inline `code` in `rgba(166, 58, 42, 0.08)` bg, `#8b3220` text; `pre` blocks on dark navy `#2a3450` with red left-border and ivory text.
- Lists: red `::marker`.
- Annotations (margin notes): left-to-right fade `linear-gradient(90deg, rgba(139, 176, 214, 0.15), transparent)`, with a tiny uppercase `note · margin` label in blue `#3b6fa0`.

**Turn block structure (each exchange):**
```
[turn head]  ● turn 04 · now ─────────────── 10:06 · streaming
[user-msg]   italic "YOU" label + the user's message
[kronos]     avatar ○  Kronos (red title)
             └ document body (intro italic → paragraphs → h3/h4 sections → code → blockquote → list)
             └ tool-pill row (e.g. `⚡ search · linear`, `🎨 paint · mood`)
             └ turn-actions (⟳ regen · ⎘ copy · ↗ send to Linear · ✎ edit)
```

Past turns fade to ~55% opacity; the current turn is full opacity. Scrolling up shows a "← return to now (turn 04)" pill that fixes to the top-left of the hero.

**Streaming effect:**
Current turn's body uses a **sand-reveal animation** — each word appears with `opacity: 0 → 1`, `filter: blur(6px) → 0`, `letter-spacing: 0.1em → 0`, `transform: translateY(3px) → 0`. Stagger: 40ms per word. Matches the hourglass metaphor (sand forming words).

#### 4. Mood / Repository panel (right column)
Tabbed panel, dark background. Two tabs side-by-side at top:
- `MOOD  [IMG]`
- `REPOSITORY  [FILE]`

Active tab: gold underline `var(--tartarus-gold)` + brighter ivory text. Tab corner is chamfered (`clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)`).

**Panel chrome:**
- Top-right chamfered corner `clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%)`.
- Background: `var(--tartarus-deep)` with SVG noise overlay (`mix-blend-mode: overlay`, opacity 0.5).
- Collapse button on the left edge — small chevron pill that toggles the panel to a thin strip.

**MOOD tab contents:**

*Image hero (`artifact-hero`):*
- A **runic frame** surrounds a **black-backdrop image area**. The frame has a teal runic SVG tile background (see Textures → Runic pattern, teal variant, opacity 0.45). Image itself sits on pure `#000` so imagery reads with max contrast.
- 14px padding between frame and image.
- Frame has chamfered corners: `polygon(18px 0, calc(100% - 28px) 0, 100% 28px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)`.
- Gold hairline diagonals traced along the chamfer cuts (via layered `linear-gradient` pseudo-element, `rgba(212, 175, 55, 0.7)`).
- **Overlay badge** (top-left): `◆ TURN 04 · JUST PAINTED` — mono, gold text, dark pill.
- **Overlay actions** (top-right): regenerate / download / open-fullscreen icons.
- **Overlay caption** (bottom-left, inside image): the haiku in italic serif.
- **Carousel controls**: on `artifact-hero:hover`, left/right chevrons (`ChevronLeft`/`ChevronRight`) fade in. A dot pager (4 dots) sits at the bottom center. Chevrons have their own chamfer matching the frame.

*Haiku card (`poem-card`):*
- Below the image. Gold-toned runic pattern backdrop (same rune tile, gold variant, opacity 0.2), layered on a subtle blue→gold gradient.
- Top: `✦ a haiku — turn 04` with a caret `›` that collapses the card.
- Poem cycler nav: `‹` `····●` `›` — prev/next buttons + 4-dot pager. Swaps the haiku text with the turn label. Each of the 4 turns has its own haiku.
- Poem: Cormorant Garamond, 17px, italic first line, indented second/third lines (the poetic shape).
- Poem meta footer: `HAIKU · TURN 04` + `FOR THE IMAGE ABOVE` — mono, uppercase, tiny.
- Collapsible `<details>` for the raw image prompt.

*History drawer (bottom of panel):*
- A pill button `⏱ HISTORY · 3` — clicking opens a horizontal filmstrip of past turn mood images.

**REPOSITORY tab contents:**
- File header: icon + filename (`editImage.ts`) + sub (`342 lines · tartarus/campaign/tools`).
- File preview: monospace, line numbers, syntax coloring (keywords teal, strings gold, comments muted), showing the existing vs. proposed code diff.
- Same chamfered frame geometry as the image hero.

#### 5. Composer (fixed bottom)
Two modes: **floating** (default, 720px centered pill) and **docked** (full-width bottom bar). Togglable via a pill at the top of the composer (`DOCKED | FLOATING`) or by dragging the handle at the top-center to dock/undock.

**Visual:**
- Background: `linear-gradient(180deg, rgba(18, 26, 44, 0.98), rgba(10, 15, 26, 0.98))`.
- Border: `1px solid rgba(0, 206, 209, 0.18)` (teal hairline).
- Shadow: `0 12px 40px rgba(0, 0, 0, 0.55)` + inset teal highlight.
- **Runic decoration**: a 30px-tall strip at the top with the teal rune SVG tile, masked with a `linear-gradient(180deg, rgba(0,0,0,0.9), transparent)` so it fades down. Runes do **not** appear behind the textarea or toolbar buttons — keep the input field clean.
- Chamfered corners: floating mode all 4 corners `10px`; docked mode only the top 2 corners.

**Contents (top→bottom):**
1. Handle bar (4px tall, draggable, double-click to dock).
2. Mode pill pair: `docked | floating` (gold-on-dark active state).
3. `<textarea>` — `ask Kronos…` placeholder, min-height 44px (60px in docked mode), `background: transparent` (over the composer bg).
4. Toolbar row: `📎 attach`, `@ skills`, `☆ daimon` (active highlight), `🎨 paint`, spacer, `ctx 72% · opus 4.7`, `send →` button (gold fill).

---

## Interactions & Behavior

### Transitions
- Panel collapse/expand: `transition: width 0.28s cubic-bezier(0.23, 1, 0.32, 1)`.
- Tab switch: fade + 4px vertical translate, 180ms.
- Carousel: dot active state 200ms ease.
- Thinking indicator: a small rotating hourglass SVG with grains animating up↔down (1.4s loop). Shown at the start of the current turn while streaming.
- Sand-reveal on streaming text: 40ms stagger per word, each word 400ms duration.
- Composer mode switch: `transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1)` on `width`, `clip-path`, `border-radius`.
- Hover on mood image: carousel chevrons fade in (opacity 0 → 1, 200ms).

### State
Zustand or React Context in `web/lib/chat-store.ts` (or extend existing chat store):
```ts
interface ChatViewState {
  moodTab: 'image' | 'repo';
  moodCollapsed: boolean;
  currentTurn: number; // 1-indexed
  viewingTurn: number; // for carousel — may differ from currentTurn
  composerMode: 'floating' | 'docked';
  composerFloatingPos: { x: number; y: number } | null;
  poemIndex: number; // 0..turns.length-1
  historyDrawerOpen: boolean;
  railExpanded: boolean;
}
```

### Carousel behavior (image + poem)
Both cycle through the same `turns` array. Independent index state so users can look at turn 02's image while reading turn 04's haiku if they want — or bind them together (recommended: separate indices, because one is visual and the other is literary).

### Return-to-now pill
When user scrolls up in the hero and the current turn is offscreen, show the fixed pill top-left. Click → smooth scroll to `#turn-<currentTurn>`.

---

## Design Tokens

All colors use the existing `--tartarus-*` system. **New tokens to add** to `web/app/globals.css` `@theme` block:

```css
@theme {
  /* Existing (keep) */
  --tartarus-void: #0a0a0a;
  --tartarus-deep: #111111;
  --tartarus-surface: #1a1a1a;
  --tartarus-teal: #00CED1;
  --tartarus-teal-dim: #008B8B;
  --tartarus-gold: #D4AF37;
  --tartarus-gold-bright: #FFD700;
  --tartarus-ivory: #FFFFF0;
  --tartarus-ivory-dim: #E8E4D9;
  --tartarus-ivory-muted: #A0998A;

  /* NEW — reader paper theme */
  --tartarus-paper: #f6efdd;         /* cream base top */
  --tartarus-paper-mid: #ece2ca;
  --tartarus-paper-deep: #e4d8bc;    /* cream base bottom */
  --tartarus-paper-highlight: rgba(255, 248, 220, 0.5);
  --tartarus-paper-vignette: rgba(120, 90, 55, 0.08);
  --tartarus-paper-fiber: rgba(90, 60, 30, 0.022);

  /* NEW — reader ink */
  --tartarus-ink: #1a2a4a;           /* primary dark-navy body text */
  --tartarus-ink-muted: #3b4d72;     /* italic / intro */
  --tartarus-ink-red: #a63a2a;       /* accent red, ticket IDs, strong */
  --tartarus-ink-red-bright: #c23a20;/* emphasis */
  --tartarus-ink-blue: #3b6fa0;      /* annotation label */
  --tartarus-ink-blue-soft: #8bb0d6; /* annotation fade */
  --tartarus-ink-wash: #6d5f44;      /* turn timestamps, meta */

  /* NEW — edge geometry */
  --chamfer-sm: 6px;
  --chamfer-md: 14px;
  --chamfer-lg: 22px;
  --chamfer-xl: 28px;

  /* NEW — composer */
  --composer-bg-top: rgba(18, 26, 44, 0.98);
  --composer-bg-bottom: rgba(10, 15, 26, 0.98);
  --composer-border: rgba(0, 206, 209, 0.18);
}
```

### Spacing
Standard Tailwind. Key values in the mock:
- Panel padding: `16px` (p-4).
- Turn block vertical gap: `32px` (space-y-8).
- User-msg left border + padding: `3px` border, `16px` padding-left.
- Composer internal padding: `12px 16px`.

### Border radius
The design uses `clip-path` chamfers instead of border-radius for the distinctive "World That Never Was" geometry. Where radius is used: pills `9999px`, small buttons `6px`, cards `8px`.

### Typography
- Serif body/headings: **Cormorant Garamond** (already imported in `globals.css` per DESIGN_SYSTEM).
- Sans chrome/UI: **Inter** (existing).
- Mono metrics/code: **Geist Mono** (existing).

### Textures

All textures are inline SVG data URIs — copy the exact ones from `design_reference.html` (`<style>` block). Three key ones:

1. **Paper grain** — fractal noise tile, 300×300, `baseFrequency=0.65`, 3 octaves, seed 7, colored to warm brown `rgba(114, 84, 51, 0.12)`. Use as `background-image` with `background-blend-mode: multiply`.

2. **Paper fibers** — `repeating-linear-gradient(0.5deg, transparent 2px, rgba(90,60,30,0.022) 3px, transparent 6px)`.

3. **Runic pattern** — a custom SVG with runic glyphs (vertical bars, circles, triangles, dashed circles, X-crosses) tiled at 140×140 (mood/image variant) or 120×60 (composer variant) or 60×180 (rail variant). Two color variants:
   - Teal `#00CED1`, opacity 0.45–0.18 depending on surface.
   - Gold `#D4AF37`, opacity 0.2 for the poem card.
   Always `mix-blend-mode: screen` on dark surfaces.

Extract these as reusable CSS utilities (`.texture-paper`, `.texture-runes-teal`, `.texture-runes-gold`) or a React `<Texture variant="..." />` component.

---

## TypeScript component structure (suggested)

```
web/components/chat/hourglass/
├── HourglassLayout.tsx          # grid shell
├── ChatTopbar.tsx
├── Rail.tsx                      # extends existing Sidebar or reuses collapsed state
├── Hero/
│   ├── Hero.tsx                  # scroll container
│   ├── TurnBlock.tsx             # one exchange
│   ├── UserMessage.tsx
│   ├── KronosMessage.tsx
│   ├── DocBody.tsx               # rich document renderer
│   ├── StreamingText.tsx         # sand-reveal animation
│   ├── ThinkingIndicator.tsx     # hourglass spinner
│   ├── ToolPillRow.tsx
│   ├── TurnActions.tsx
│   └── ReturnToNowPill.tsx
├── Mood/
│   ├── MoodPanel.tsx             # tab container
│   ├── MoodTabs.tsx
│   ├── MoodImage.tsx             # black-bg image + chamfered runic frame
│   ├── MoodCarousel.tsx          # prev/next + dots over image
│   ├── HaikuCard.tsx
│   ├── HaikuCycler.tsx
│   ├── RepositoryTab.tsx
│   └── HistoryDrawer.tsx
├── Composer/
│   ├── Composer.tsx              # floating/docked state machine
│   ├── ComposerHandle.tsx
│   ├── ComposerModeToggle.tsx
│   ├── ComposerToolbar.tsx
│   └── useComposerDrag.ts        # floating-position drag handler
└── shared/
    ├── Chamfer.tsx               # <Chamfer corners="tl,tr" size="md">...</Chamfer>
    ├── RuneBackdrop.tsx          # <RuneBackdrop variant="teal" opacity={0.45} />
    └── SandReveal.tsx            # text streaming wrapper
```

### Key TypeScript types

```ts
type Turn = {
  id: string;
  index: number;           // 1-indexed for display
  startedAt: Date;
  tokens: number;
  userMessage: string;
  kronosResponse: DocBlock[];
  mood: {
    image: { url: string; prompt: string };
    haiku: [string, string, string];
  };
  toolCalls: ToolCall[];
  status: 'streaming' | 'complete' | 'failed';
};

type DocBlock =
  | { type: 'intro'; text: string }      // italic lead
  | { type: 'paragraph'; html: string }
  | { type: 'heading'; level: 3 | 4; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'quote'; text: string }
  | { type: 'annotation'; label: string; text: string };
```

---

## Assets
- Chronus logo (already in `web/public/chronus-logo.png`) — unchanged.
- Mood images: generated per-turn by the existing paint tool. The mock uses CSS gradients as placeholders. In production these come from `turn.mood.image.url`.
- Icons: all from `lucide-react` — `MessageSquare`, `BookOpen`, `Archive`, `ChevronLeft`, `ChevronRight`, `RefreshCw`, `Download`, `ArrowUpRight`, `Plus`, `Menu`, `Clock`, `X`, `Send`, `Paperclip`, `AtSign`, `Star`, `Palette`, `File`, `FileText`.
- Rune SVGs: extract from `design_reference.html`, ship as `web/components/chat/hourglass/shared/runes.tsx`.

---

## Files in this handoff

- `README.md` — this file.
- `design_reference.html` — the working HTML prototype. Open in a browser to see the design live. All CSS/JS is inline. Interactive: carousel works, haiku cycler works, composer drags between floating/docked, thinking indicator animates, sand-reveal runs on turn 04.

---

## Implementation notes / gotchas

1. **Paper texture scrolling**. The paper grain must scroll with content (`background-attachment: local`), not stay fixed. The mock fought this bug — copy the final solution.
2. **Z-index discipline** around textures. Decorative overlays use `pointer-events: none; position: absolute; inset: 0; z-index: 0`; actual content sits at `z-index: 1+`. Keep that layering in every component.
3. **Composer input must be clean** — textarea on solid dark bg, *never* over the runic texture. Runes are restricted to a 30px top strip with a fade mask.
4. **Mood image backdrop**: the image itself sits on **pure black** (`#000`) for contrast — the *frame* around the image is what carries the runes.
5. **Chamfers** use `clip-path: polygon(...)`. Wrap in a `<Chamfer>` component so sizes are consistent via the `--chamfer-*` tokens.
6. **Sand-reveal** only runs on the currently streaming turn; past turns render plain. Don't re-run on scroll.
7. **History carousel ≠ Poem carousel**. Keep indices independent.
8. **Reduced motion**: wrap sand-reveal and rune shimmer in `@media (prefers-reduced-motion: no-preference)`.
9. **Integrate with existing `Sidebar.tsx`** — do not create a parallel rail. The mock's rail is how the collapsed sidebar should *look* in this layout; extend the existing component with a "chat-hourglass" variant prop if needed.
10. **Dark/light toggle**: the existing `toggleTheme` in `Sidebar.tsx` toggles `html.dark`. The reader paper is currently always cream. Decide: does the paper invert to dark-mode "night reader" when `html.dark`? Probably yes — add a `--tartarus-paper-dark` palette mirror.

---

## Open questions for product

1. Do all 3 panels (rail / hero / mood) collapse independently, or is there a layout preset system (e.g. "focus reader" = hide mood)?
2. Should the mood panel be user-reorderable (carousel of past images) or strictly chronological?
3. The haiku is generated — where does it live in the data model? Tied to `turn.mood` (same turn) or separate?
4. Mobile: this layout is desktop-first. Proposed mobile: tabs at the top switch between Reader / Mood / Repo, composer stays pinned bottom, rail becomes a drawer (reuse existing `Sheet`).
