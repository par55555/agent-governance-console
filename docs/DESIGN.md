# Design plan: Agent Governance Console

Audience: senior leaders (C-suite, VPs, board-facing). Calm, credible, closer to an annual report than a developer dashboard.
This plan applies the style system in `docs/STYLE_SYSTEM.md` (the brief) to each screen.

## Token map

| Token | Value | Used for |
|---|---|---|
| `--color-base` | #FFFFFF | Content: tiles, tables, modal, inputs, the stats card in the title frame |
| `--color-ink` / `--color-navy` | #1B2A4A | Text, brand mark, primary buttons, selected states, links, healthy, chart line, home-process bars, tier 1 sprite body, map dots |
| `--color-slate` | #4F586C | Labels, captions, axes, secondary bars, tier 2 sprite body |
| `--color-mist` | #E6DCCB | Warm hairlines, chip borders |
| `--color-sand` | #E8D8B9 | Sprite frame, warm accents |
| `--color-frame` | #F4F6F8 | Page title frame (neutral grey) |
| `--surface` | #F8F3EA | Process rail, code blocks, table stripes, read-only inputs |
| `--color-tangerine` | #F28C28 | Fills only: selected nav bar, active tab underline, latest chart point, write dots in the map, brand sprite |
| `--color-orange` | #9A4700 | Text for "writes into another process", degraded health, warnings (always with a pencil or warning icon and a text label) |
| `--color-crimson` | #B42318 | Incidents and refused saves only (always with an icon and text) |
| tints | navy-8 / orange-8 / crimson-8 | Hover and selected backgrounds; attention bands |

Palette changed 2026-11-20 from petrol/mist to navy/sand/tangerine.

Removed from v1: tier colors (blue / orange / aqua), the dark theme, all gradients, card shadows, monospace labels and ALL-CAPS labels.
Tier now reads from text (nav groups, the owner sentence) instead of color.

Type: Source Serif 4 for page titles and narrative summary sentences; IBM Plex Sans for UI, labels and data. Monospace is limited to the two places that are literally code: the system prompt and the raw Agent.md.
Scale (ratio 1.25 from 16px): 13 / 16 / 20 / 25 / 31 / 39. Body 16/1.5 sans, 1.6 serif. Tabular figures everywhere.
Spacing: 8 / 16 / 24 / 32 / 48 / 64 / 96. Radius: 4 inputs and chips, 8 panels, 0 full-width bands.

## Screen 1: Business process view (default: Order-to-Cash)

**Hero:** the narrative summary. One serif paragraph that answers "what is going on in this process?" with the numbers inside the sentence. It replaces v1's row of five KPI boxes.
Loud by exception: an attention line appears only when an agent here is degraded or has an incident.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ■ Agent Governance Console   [ Search agents…              ]  Production|…  ● Live│
├──────────────┬────────────────────────────────────────────────────────────────┤
│ All processes│ Order-to-Cash                                    (serif 39)     │
│              │ Core value-creating process, owned by Priya Raman, VP…  (slate) │
│ Core value-  │                                                                 │
│ creating     │ Seven agents in production serve Order-to-Cash, handling       │
│  O2C Order…  │ about 42,400 API requests a day for 239 people …  (serif 20)   │ ╭ sparkline ╮
│  …           │ All of them reach into other processes, and twelve agents …    │ │ 42.4k/day │
│ Enabling and │                                                                 │ ╰───────────╯
│ support      │ ⚠ Collections Copilot is degraded: Gmail quota throttling…     │
│  …           │ ───────────────────────────────────────────────────────────── │
│ Governance…  │ Agents in Order-to-Cash  7        [filter] [sort] [density] [Add agent]
│              │ All types | Conversational | Automation | …   How agents are classified
│              │ ┌tile┐ ┌tile┐ ┌tile┐                                             │
│              │ ───────────────────────────────────────────────────────────── │
│              │ Cross-process agents    [From other processes 12 | Reaching out 7]
│              │ row ─ row ─ row (hairline-divided, not cards)                    │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

## Screen 2: Agent detail (modal)

**Hero:** the agent's name with its home line ("Home: Order-to-Cash, Cash application step") and the cross-process strip, which is the governance fact this product exists to show.
Tabs keep the rest quiet. The Consumption tab leads with one sentence ("7.2k API requests a day from 42 people; an estimated $2,071 over 30 days") instead of six stat cards, then a single line chart.

```
┌───────────────────────────────────────────────────────────────┐
│ [sprite] Account Reconciliation Agent              Edit spec ✕ │
│          Home: R2R Record-to-Report › Account reconciliation   │
│          Process automation   Act with approval   v2.2.0 …     │
│ Crosses into  O2C  P2P      Reads only outside R2R             │
│ Overview  Data sources  Agent spec  Consumption  Value         │
│ ─────────────────────────────────────────────────────────────  │
│ (tab content: open layout, hairlines, one chart at most)       │
└───────────────────────────────────────────────────────────────┘
```

## Screen 3: All business processes

**Hero:** one serif sentence on reach ("Forty-one agents… thirty-seven reach beyond their home process, twenty-three write into another"), then the cross-process map. The map is a dot matrix: navy dots sized by count, tangerine where an agent writes, so it reads at a glance without a color scale.

## Screen 4: Add agent / Edit spec (form)

**Hero:** none needed; it's a task screen. Calm white sections divided by hairlines; the live preview on the right is the only emphasized area. The primary button is navy and says "Add agent" (or "Save changes").

## Review against "would any dashboard look like this?"

- v1 had a five-box KPI band and a six-card stat row. Both are the generic stat-card pattern, so they're replaced by narrative sentences with numbers in context.
- v1 used three tier colors plus status colors, so color carried two meanings at once. Now tiers are text and color only means "look here".
- v1 boxed every section in a rounded card with a shadow. Now sections are open and separated by space and mist hairlines; only tiles keep a hairline border, because they are distinct clickable objects.
- v1 used monospace for codes and tool names, which made it read like a developer tool. Now everything except code is set in Plex Sans.
