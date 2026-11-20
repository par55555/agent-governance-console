You are designing the visual system for an enterprise AI governance application
used by senior leadership (C-suite, VPs, board-facing executives). These users
are time-poor, not technical, and judge quality instantly. The interface must
feel calm, credible, and effortless — closer to a well-designed annual report
than a developer dashboard. Apply this style system to all screens and
components. Content will be provided separately; do not invent the style per
screen.

## Design principles
1. Five-second clarity: every screen answers its main question before scrolling.
2. Quiet by default, loud by exception: healthy states are visually calm; color
   appears only where a leader needs to notice or decide something.
3. Spend boldness in one place per screen — one hero element. Everything else
   is restrained and disciplined.
4. Generous whitespace is a feature. When in doubt, remove an element rather
   than add one.
5. Must look good on desktop and iPad, and screenshot cleanly into a slide.

## Color tokens (use only these; never hard-code other colors)
Palette: navy, sand, tangerine. Adopted 2026-11-20, replacing petrol/mist.
:root {
  --color-base:      #FFFFFF;  /* content surfaces: tiles, tables, dialogs, stats card */
  --color-ink:       #1B2A4A;  /* navy: primary text, headings */
  --color-navy:      #1B2A4A;  /* navy: primary actions, selected, healthy, chart lines */
  --color-slate:     #4F586C;  /* secondary text, labels, axes (AA on base, surface, sand) */
  --color-mist:      #E6DCCB;  /* warm borders and dividers */
  --color-sand:      #E8D8B9;  /* sprite frames, warm accents */
  --color-frame:     #F4F6F8;  /* page title frame (neutral grey) */
  --surface:         #F8F3EA;  /* process rail, quiet fills (code, stripes, read-only) */
  --color-tangerine: #F28C28;  /* accent FILL only: active indicators, latest-value dots, write dots */
  --color-orange:    #9A4700;  /* text-safe tangerine: writes into another process, degraded */
  --color-crimson:   #B42318;  /* incident, error. Rare */
}
Rules:
- Navy is the brand and primary-action color. Chrome is framed: pale sand for
  the rail, neutral grey for the page title frame; working content stays on white.
- Tangerine fails AA as text (2.45:1 on white). Never set text in it; use
  --color-orange for words and tangerine only for fills next to navy or an
  orange ring.
- Tangerine/orange carries two jobs: the accent for "where you are" (selected
  nav bar, active tab underline, latest chart point) and the attention signal
  (writes into another process, degraded). Attention uses always pair with a
  pencil or warning icon and words, which is what tells them apart.
- Status color is never the only signal: pair it with an icon or text label.
- One exception to "no gradients": an alpha mask (not a color) fades the right
  edge of the steps row when it overflows and scrolls at narrow widths.
- Tints allowed: --navy-8 for hover/selected, --orange-8 (#FDF1E5) behind
  orange text, --crimson-8 behind crimson text. No gradients, no other hues.
- Pixel sprites use navy, slate, clay (#8C7550, sand darkened, tier 3 body),
  sand, white and tangerine.
- No drop shadows except one subtle elevation for overlays (menus, modals).
  Separate content with whitespace and Mist hairlines, not shadows.

## Typography
- Choose typefaces deliberately; do not default to Inter or system-ui.
  Recommended: a refined serif (e.g. Source Serif 4) for page titles and
  narrative summary sentences, paired with a clear, institutional sans
  (e.g. IBM Plex Sans) for UI, labels, and data. If you choose otherwise,
  justify it.
- Use a modular type scale (ratio ~1.25). Body 16px, line-height 1.5 for sans,
  1.6 for serif. Max line length ~70 characters.
- All numbers use tabular figures (font-variant-numeric: tabular-nums).
- Sentence case everywhere. No ALL-CAPS labels, no tracked-out eyebrow text
  above headings, no accenting a single word in a headline with color or italics.
- Hierarchy comes from size and weight, not color.

## Layout & spacing
- 8px spacing scale (8, 16, 24, 32, 48, 64, 96). Section spacing is generous.
- 12-column grid, max content width ~1280px, left-aligned content.
- Radius scale by hierarchy, not one radius everywhere: 4px for inputs/chips,
  8px for panels, 0 for full-width sections.
- Prefer open layouts with hairline dividers over boxing everything into cards.
  Only use a container when it groups things that belong together.

## Data visualization
- Charts are minimal: no gridline clutter, no 3D, no legends when direct labels
  fit. Slate for axes, Ink/Petrol for data, Amber/Crimson only for flagged
  values.
- Prefer one clear number with context ("up 12% vs last quarter") over many
  small KPI tiles. Avoid the generic row-of-stat-cards pattern unless it is
  genuinely the best fit.
- Sparklines and small multiples over large decorative charts.

## Motion
- Almost none. Motion only responds to a user action (expand, open, confirm)
  and shows what changed. 150–200ms, ease-out.
- No fade/slide-up entrance animations on sections, no hover bounce on cards.
- Respect prefers-reduced-motion.

## Copy style
- Plain, executive language. Name things by business meaning, not system
  internals ("Policy review overdue", not "Governance check failed: 0x31").
- Buttons say exactly what happens ("Assign owner", not "Submit"). The same
  action keeps the same name through the flow.
- Empty states invite the next action; errors say what happened and what to do.
  No apologies, no filler, no emojis.

## Banned patterns (generic AI-design tells)
- Gradient backgrounds or gradient text
- Identical rounded cards with soft grey shadows for everything
- ALL-CAPS eyebrow labels, "A · B · C" meta strings, "→" appended to buttons
- 01 / 02 / 03 numbering unless content is truly a sequence
- Monospace fonts for labels or data
- Emoji as icons; use one consistent line-icon set (e.g. Lucide), 1.5px stroke
- Stock shadcn/ui theme without re-theming to these tokens

## Quality floor
- WCAG AA contrast, visible keyboard focus (2px Petrol outline, 2px offset).
- Responsive down to tablet; mobile is functional but not primary.

## Process
1. Before coding, write a short plan: which element is the hero on this screen,
   the layout as an ASCII wireframe, and how tokens map to components.
2. Review the plan: if any part looks like a default you'd produce for any
   dashboard, revise it and say why.
3. Build using the tokens via CSS variables (or Tailwind @theme mapped to them).
4. Render and screenshot the result at 1440px and 1024px. List the three
   weakest visual issues, fix them, and repeat once.