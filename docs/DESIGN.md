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

**Hero:** one serif sentence (agents, source systems, requests a day, people, how many write into another process), then the enterprise stack: three stacked oblique planes, users on top, agents in the middle, data at the base. Each process keeps the same position on every plane (back row governance, middle the core value chain with flow chevrons, front enabling), so a column reads as one process top to bottom.
- Users plane: an ellipse per process sized by people. Agents plane: a square per agent (tangerine degraded, crimson incident, hollow if not in production) and arcs to the processes it reaches; tangerine arcs write. Data plane: pools sized by data touchpoints, pulsing.
- Motion: dots rise from data into agents and from agents to users; dots hop along arcs (reads flow back home, writes flow out and drop into the target's data). Paused off-screen, none under reduced motion.
- Hover a process to trace its column and crossings; select to open it. "All layers / Users / Agents / Data" fades the other planes without redrawing.
- Below: Data layer (most shared systems, agents reading and writing), Agent layer (type by autonomy, busiest crossings), User layer (people by process; counted once per agent).
The old dot-matrix map and process table were removed (2026-11-21).

**Update 2026-11-21: the top of the home page is the visual only** (no title, sentence or Add agent button; the h1 is screen-reader only). This is the one view that does not lead with a serif sentence. A "Draft 1 / Draft 2" switch keeps both drafts while we iterate (remembered in local storage); the layer switch works on both.
- Draft 1: the oblique stack above.
- Draft 2 (`layersHtml`, `bindLayers`): flat 2D bands stacked like sheets, users (white), agents (navy), data (sand), each with a thicker bottom edge. Columns are the 17 business units grouped by tier, aligned through all bands. Users band: one circle per user group, sized by people. Agents band: every agent's sprite (tangerine ring degraded, crimson incident, dot top-right if it writes into another process; select to open). Data band: one tile per source system with a two-letter code, darker as more agents touch it (white 1, clay 2 to 3, navy 4+), tangerine top edge where an agent writes. An SVG overlay draws a curve from each agent to every system it uses and every user group it serves, with dots flowing along them (reads up into the agent, writes down into data). Hover a business unit or an agent to trace its curves.
- One view (`oneHtml`, `bindOne`), the default: one image instead of three bands. Each business unit is a zone (governance on top with dashed edges, the core value chain in the middle on a flow band with chevrons, enabling at the bottom on the pale sand surface). Zone width within a row scales with the unit's API requests a day (square root, with a minimum width), so busy units stand out. Inside a zone: people as dots under the name (about one dot per 8 people, two rows at most, the count top right); the unit's systems as two-letter tiles on a sand pool (white 1 agent, clay 2 to 3, navy 4+, tangerine edge if written to); the unit's agents circling the pool.
- Movement follows the data: an agent's possible trips are its input, tool and output rows that land in another unit, weighted by tool call share (writes slightly favored). It flies to that exact system tile. A write carries a tangerine dot out and drops it in (tile flashes tangerine, tangerine ripple); a read picks up a navy dot and carries it home. Agents are chosen in proportion to the square root of their API requests a day, so busier agents travel more.
- Under the image: an "Active" button (tangerine beat) that pauses everything in place ("Paused") and resumes, then a live feed of the last four trips ("Order Intake Agent wrote to SAP S/4HANA in Record-to-Report"); select a line to open that agent. Hover a zone to see only its traffic. Under reduced motion the button reads "Still", agents sit still and every crossing is a faint arc to the system it uses.
- Stage (One view only): deep navy radial gradient with a soft outer shadow; a faint floor grid; the board tilted about 14 degrees (CSS perspective) and leaning a few degrees toward the mouse; zones are raised cards with gradient faces and drop shadows; pools use a lit radial gradient; agents cast small shadows and grow with a longer shadow while travelling, so they read as lifting off the board. Controls, feed and the Active button switch to light-on-dark styles. Deep dive and Draft 1 keep the plain grey frame.
- Legend: an "i" button at the top right of every draft opens a legend written for that draft (closes on Esc or a click outside). It replaces the key that sat under the visual.
- Switch labels: "One view", "Deep dive" (draft 2), "Draft 1".

## Screen 4: Add agent / Edit spec (form)

**Hero:** none needed; it's a task screen. Calm white sections divided by hairlines; the live preview on the right is the only emphasized area. The primary button is navy and says "Add agent" (or "Save changes").

## Review against "would any dashboard look like this?"

- v1 had a five-box KPI band and a six-card stat row. Both are the generic stat-card pattern, so they're replaced by narrative sentences with numbers in context.
- v1 used three tier colors plus status colors, so color carried two meanings at once. Now tiers are text and color only means "look here".
- v1 boxed every section in a rounded card with a shadow. Now sections are open and separated by space and mist hairlines; only tiles keep a hairline border, because they are distinct clickable objects.
- v1 used monospace for codes and tool names, which made it read like a developer tool. Now everything except code is set in Plex Sans.


## Home page v2: dark executive briefing (2026-11-22)

Styled after a reference video the owner shared. Update 2026-11-22: the dark theme is now the standard for every view (tokens on `body`), and the moving background ribbons were removed. `.app.home` only removes the main padding for the home page.

- Look: near-black canvas, glass cards (hairline border, blur, inner highlight), tight sans headlines with one italic serif phrase, lowercase mono labels and pills, lime primary buttons. Sections blur and rise in on scroll; numbers count up; bars, sparklines, rings and heat cells animate in. All motion stops under reduced motion.
- Hero: status pills (agents, units, systems; incident and degraded count), "Every agent, accounted for.", three key numbers (API requests a day, people, agents writing into another unit), and the live map in a tilted glass card (Live map / Deep dive, layer focus, Live toggle, legend). The map uses lime glowing trails for reads, tangerine for writes, lime-lit system chips, cyan people dots, and a mono "last trips" log.
- Sections, each answering a CXO question:
  1. Exposure, "Where agents can change the books": agents writing into another unit (with writes received per unit), autonomous agents (one block per agent), share of write tools with a named approver, and the writers to know by name.
  2. Attention, "What needs attention today": incident and degraded cards with owner, autonomy, what it writes into and people affected; agents changed in the last 14 days.
  3. Spend, "What agents cost, and where": 30-day spend at illustrative prices with trend, cost per 1,000 requests, share of the top unit, isometric bars for the top seven units.
  4. Activity, "A month, seen from the console": unit by day heatmap of API requests; "hands off" ring (share of requests from autonomous agents); people served.
  5. Concentration, "Where one outage hits many": the most shared systems as tiles (lit at 10+ agents), model and runtime platform splits.
  6. Pipeline, "What's coming, and how governed it is": production, review and draft with a checklist (owner, guardrails, telemetry, approvers on write tools) and a button to filter to that lifecycle.
  7. Close: "Start with the unit you worry about most" (units with the most inbound writes or an unhealthy agent), and a status strip.
- Still visibility only: buttons open agents, filter or scroll; nothing approves or runs.


## Theme switch (2026-11-22)

"Neon / Light" in the top bar. Neon is the dark video-inspired look on every view, including the Deep dive (cyan people band, lime agents band, warm data band, glowing links). Light restores the navy / sand / tangerine scheme across every view, with the home page's cards flattened to white panels with hairlines and no glow or blur. The choice is saved per browser.


## Process page: Data view (2026-11-23)

A toggle at the top right of the agents section switches between Agent view and Data view (remembered per browser). Data view shows one tile per source platform holding data that belongs to the business unit (any agent's input, tool or output whose process is this unit): a two-letter mark, platform kind (ERP, Data warehouse, Email...), structure chips, dataset and agent counts, the types of data held, how many agents write to it, and a "Personal data" flag where the platform or dataset suggests it. Select a tile to open a panel listing each dataset: what it holds (from the specs), type of data, structure and format (marked inferred unless the spec sets them), tools that reach it, and agents that read or write it. Filters: free text and structure. The step filter applies to the Agent view only. No data values are ever shown.


## Process page: User view (2026-11-23)

Third option on the Agent / Data / User toggle. Scope: "This unit's agents" (people who use at least one agent homed here, counting only those agents) or "All agents" (enterprise-wide ranking). Shows a sentence with people, interactions, tokens and how concentrated use is (share from the busiest 10%), five figures, most active roles, where the people sit (or interactions by unit), and a ranked list of people (50 at a time, filterable). Selecting a person opens their row: interactions, tokens in and out, estimated cost, a 30-day trend and a per-agent breakdown.

Data honesty: the registry holds user groups per agent (process, role, head count), not people, and telemetry does not yet carry the caller. People are generated deterministically from the groups as sample data; a group shared by several agents is one pool, so a person is counted once (this also de-duplicates users across agents for this view). Interactions per agent = invocations x a user-facing share by type (conversational 1, analytical 0.6, monitoring 0.15, automation 0.08), split across groups by head count and across people by a skewed weight; tokens and cost follow the agent's tokens and cost per invocation. Replace with per-user telemetry (Cloud Logging principal joined on agent_id) when available; `peopleModel()` is the one place to change.


## Add data, identity and the home people section (2026-11-23)

- The heading button follows the view: Agent view "Add agent", Data view "Add data" (dialog: source system, dataset, what it holds, type, structure, format, owner; saves to `datasets/`), User view none.
- People are attributed to Google Cloud Identity: work email, org unit path and source shown on each person (sample until the directory sync runs).
- Home page section "Who uses AI the most": people count, concentration (share from the busiest 10%), most active role, top 8 people. Selecting a person opens their unit's User view, enterprise-wide, with that person expanded; "See everyone" opens the full list.
