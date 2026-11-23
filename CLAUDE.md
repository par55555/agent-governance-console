# CLAUDE.md: Agent Governance Console

Working notes for Claude Code. Read this before changing anything.

## What this is

An enterprise console that shows every AI agent by business process: where it lives, which other processes it reaches into (and whether it writes there), what it is allowed to do, and what it consumes. Owner: Param (agentic AI on GCP). Demo tenant: fictional Meridian Consumer Brands.

## Scope (decided, don't drift)

- **Visibility and governance reporting only.** The console runs no agents, approves nothing, blocks nothing. No sign-off workflows, no access enforcement, no "run" or "test" buttons.
- The agent library and playground are a separate, pinned idea. Not in this app.
- GCP first (Vertex AI Agent Engine, ADK, Gemini). Other platforms come later; keep the data model platform-neutral where it's free to do so.
- Agent.md holds no running code. It describes what the agent does and what power it has.
- Data sources: only the source system is shown for now. Detailed lineage (tables, fields, freshness) is a to-do.
- The Value tab stays blank until value measurement is designed.

## Run and test

```bash
python -m http.server 8765                 # from the project root
# open http://localhost:8765/index.html?dev   (local backend, add/edit works)
python tests/form_test.py                  # regression; needs `pip install playwright` + `python -m playwright install chromium`
python tests/screenshots.py r1             # 1440 and 1024 screenshots into tests/out/
node tools/build_seed.js                   # after editing data/data.js
```

After changing `app.js`, bump the `?v=` date on its script tag in `index.html` so browsers don't serve a cached copy. Run `form_test.py` after any change to the form, the data layer or connection handling. After visual changes, run `screenshots.py`, look at the images at both widths, and fix what's weak before calling it done.

## Architecture

No framework and no build step: `index.html` (shell + all CSS) and `app.js` (one IIFE, about 1,200 lines). Sections in `app.js`, in order:

1. utilities, then the **data layer**: `procFromDoc`, `agentFromDoc` (treat every doc as untrusted), `buildModel`, `homeReason`, `calc` (all cost and request math, memoized in `CALC`), `footprint` (cross-process touch map)
2. state + hash routing (`#o2c`, `#all`, `#agent-<id>`)
3. components (`chip`, `icon`, pills), pixel sprites, top bar + nav
4. views: `renderBP` (process page, with an Agent view / Data view toggle; the data view is `dataCatalog` + `dataSection`, classification rules in `DATA_PLATFORMS` and `DS_TYPES`), `renderAll` (home: a dark executive briefing; hero, the live map `oneHtml`/`bindOne` or the deep dive `layersHtml`/`bindLayers`, then sections for exposure, attention, spend, activity, concentration and pipeline; ribbons, reveals and counters in `bindHx`. `stackSvg`/`bindStack` is the retired draft 1, kept for reference), `renderModal` (agent detail with tabs Overview, Data sources, Agent spec, Consumption, Value), `bindChart`
5. connection chrome (`srcPill`, banners, loading/empty), `render()`
6. add/edit form: `blankDraft`, `draftFromDoc`, `docFromDraft`, `validate`, `renderForm`, `saveForm`
7. events (delegated clicks on `data-*` attributes), then `connect()`

Backend access goes only through `window.claude.use('db')` and `window.claude.use('user')`. In the artifact those are real; locally `dev/mock-backend.js` provides them. To move to Firestore or FastAPI, write an adapter with the same calls (README, "Swapping the backend"); don't scatter fetch calls through `app.js`.

Collections: `config/tenant`, `processes/{id}`, `agents/{agent_id}`, `usage/{agent_id}`. Field detail in `docs/DATA_MODEL.md`. People write `agents/` only; `usage/` comes from telemetry.

## Domain rules

- **Tiers.** 1 Core value-creating (I2M, L2O, Q2C, O2C, F2S Plan-to-Produce, I2D, I2R), 2 Enabling & support (P2P, R2R, H2R, A2R, R2D, C2C), 3 Governance & strategy (S2E, ID2M, M2I, S2V).
- **Home rule.** Home is the process that owns the work the agent does. Conversational → where most users are; automation → the process that owns the step it runs; analytical → the people who act on its output; monitoring → the people who act on its alerts; otherwise the accountable owner. At onboarding you pick the step (`home_subprocess`) and the home process follows from it.
- **Crossing rule.** An agent crosses into another process if any data input, tool or output belongs to it. Users from another process make it appear there as secondary users. Writing into another process is the headline signal (amber chip with a pencil icon).
- **Taxonomy.** Type (Conversational, Process automation, Analytical, Monitoring) x autonomy (Advise, Act with approval, Autonomous).
- Costs use illustrative list prices from `config/tenant`; say so wherever money appears.

## Style system (enforced; full brief in `docs/STYLE_SYSTEM.md`, plan in `docs/DESIGN.md`)

- Palette (adopted 2026-11-20): navy #1B2A4A (ink + primary), sand #E8D8B9 (warm accents, sprite frames), frame grey #F4F6F8 (page title frame), surface #F8F3EA (rail, quiet fills), tangerine #F28C28 (accent fills only, fails AA as text), orange #9A4700 (text-safe tangerine), slate #4F586C, mist #E6DCCB (hairlines), crimson #B42318, base #FFFFFF. Tints: navy-8 for hover/selected, orange-8, crimson-8. No gradients, no other hues, including in the pixel sprites (which add clay #8C7550). Full rules in `docs/STYLE_SYSTEM.md`.
- Orange/tangerine means "writes into another process" or "degraded", and also marks "you are here" (selected nav bar, active tab, latest chart point). Crimson means "incident" or "error". Color is never the only signal: pair it with an icon or words.
- Type: Source Serif 4 for page titles and narrative sentences; IBM Plex Sans for everything else. Body 16px, scale about 1.25, tabular numbers. Monospace only for the system prompt and raw Agent.md.
- **Two themes, switched by "Neon / Light" in the top bar (2026-11-22; saved in local storage as `theme`, default Neon).** Neon (`body.neon`) is the dark look styled after a reference video: near-black #07090B, ink #EEF1F4, lime #C6F24E in the role navy has in Light, cyan #5CC8FF for people, orange/tangerine for writes, crimson #FF6B5E for incidents, glass cards, mono lowercase labels. Every neon rule in the `<style>` is prefixed `body.neon`. Light (`body.light`) is the navy / sand / tangerine scheme below. Shared home-page rules (`.hx-*`) take their colors from `--fg-rgb`, `--acc-rgb`, `--on-acc`, `--hx-lime`, `--hx-cyan`, so a new home component must use those, not raw white or lime. Check both themes after any visual change.
- Home stage exception (by request, 2026-11-21): the One view on the home page sits on a navy gradient stage with depth: zone gradients, drop shadows, a perspective floor grid, a CSS 3D tilt that follows the mouse, and lifted agents. Extra shades `--navy-deep` #0D1628 and `--navy-lift` #2E4676 exist only for it. Keep all of this inside `.home-head.stage`; everywhere else the rules below still hold.
- Banned: ALL-CAPS or eyebrow labels, "A · B · C" meta strings, arrows on buttons, emoji, shadows (one subtle overlay shadow for dialogs only), rows of stat cards. Use hairlines and open layout.
- Each view leads with one serif sentence that carries the numbers (the "hero"), not a KPI row. Exception: the home page (All business processes) leads with the visual only, by request.
- Spacing on an 8px scale; radius 4px for controls and chips, 8px for panels; content max width about 1280px, left aligned.
- Charts: no gridlines, slate axis text, petrol or ink for data, direct labels on the latest value and peak.
- Motion: 150 to 200ms ease-out only, and none under `prefers-reduced-motion`.
- Copy: sentence case; buttons say exactly what happens ("Add agent", "Save changes"); plain words over jargon.
- Accessibility: WCAG AA contrast; focus ring is a 2px petrol outline with 2px offset; every dialog traps focus and closes on Esc.

CSS lives in one `<style>` block in `index.html`. Tokens and type scale are custom properties at the top. Two small "round N fixes" blocks at the end came from screenshot review; fold them into the main rules when you next touch those areas.

## Open work

See `docs/TODO.md`. Most likely next steps: a real backend adapter, the telemetry ingestion job, de-duplicating users across agents, and iterating on the home page stack (see `docs/DESIGN.md`).
