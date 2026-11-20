# Agent Governance Console

A read-only console for seeing every AI agent in the enterprise by business process: where each agent lives, which other processes it reaches into (and whether it writes there), what it is allowed to do, and what it consumes. It runs nothing. It is for visibility and governance reporting.

The demo tenant is a fictional consumer-goods company, Meridian Consumer Brands, with 46 agents across 17 business processes in three tiers. Order-to-Cash and Record-to-Report are the fully worked examples; the other processes carry generated placeholder agents. Telemetry is sample data as of Nov 18, 2026.

## Run it

No build step. It is plain HTML, CSS and JavaScript.

```bash
cd agent-governance-console
python -m http.server 8765
```

Then open one of:

| URL | What you get |
|---|---|
| `http://localhost:8765/index.html?dev` | Full app with a local backend (`dev/mock-backend.js`). Add and edit agents; changes persist in your browser's localStorage. |
| `http://localhost:8765/index.html` | Read-only. With no backend, the app falls back to `registry-snapshot.json` and shows "Offline snapshot". |

Opening `index.html` straight from disk (`file://`) won't work, because the app fetches JSON. Serve it as above.

In the browser console in `?dev` mode:

```js
agcDev.reset()              // drop local edits, reseed from registry-snapshot.json
agcDev.readOnly(true)       // simulate a view-only user; agcDev.readOnly(false) to undo
agcDev.failNext('unavailable')  // make the next save fail, to test error handling
await agcDev.dump()         // the whole store
```

Deep links: `#o2c` (a process), `#all` (all processes), `#agent-o2c-intake` (an agent).

## Where it came from

This was built as a claude.ai artifact. There, `window.claude.use('db')` is a small document database and `window.claude.use('user')` gives the signed-in user. Neither exists on your PC, so `dev/mock-backend.js` implements the same interface on top of localStorage. To put it on real infrastructure, replace that file with an adapter that exposes the same calls (see "Swapping the backend"). `app.js` does not need to change.

The live artifact (with its seeded database) is still at the claude.ai link you were given.

## Layout

```
index.html               shell, all CSS (design tokens at the top), dev loader
app.js                   the whole app: data layer, views, form, events, connect
registry-snapshot.json   compact dataset; seed for the dev backend and offline fallback
dev/mock-backend.js      localStorage stand-in for the artifact database (?dev)
data/data.js             source mock data (processes, agent specs, usage generators)
data/seed.json           pretty-printed dataset, same content as the snapshot
tools/build_seed.js      data/data.js -> data/seed.json + registry-snapshot.json
docs/                    design plan, style system, Agent.md spec, data model, to-dos
tests/                   Playwright regression test and screenshot script
CLAUDE.md                working notes for Claude Code
```

## Data model

Four collections. Full field list in `docs/DATA_MODEL.md`; the agent fields follow `docs/AGENT_MD_SPEC.md`.

| Path | Docs | What |
|---|---|---|
| `config/tenant` | 1 | Tenant name, tiers, model prices, runtime cost per run, telemetry window, close band |
| `processes/{id}` | 17 | Business processes: code, name, tier, owner, summary, steps (sub-processes) |
| `agents/{agent_id}` | 46 | One Agent.md each: identity, home, type, autonomy, model, instructions, inputs, tools, outputs, users, guardrails |
| `usage/{agent_id}` | 41 | 30 days of daily requests plus token, error, latency and fee figures |

Agents in draft or review have no usage doc. Everything shown as cost is computed in `calc()` in `app.js` from usage x illustrative list prices.

## Regenerate the dataset

Edit `data/data.js`, then:

```bash
node tools/build_seed.js
```

That rewrites `data/seed.json` and `registry-snapshot.json`. In `?dev` mode, run `agcDev.reset()` to pick up the new snapshot.

## Tests

```bash
pip install playwright
python -m playwright install chromium
python -m http.server 8765            # in one terminal, from the project root
python tests/form_test.py             # in another
python tests/screenshots.py r1        # screenshots at 1440 and 1024 into tests/out/
```

`form_test.py` covers: live connection, required-field errors, adding an agent, editing it, a refused save, discard confirmation, and the offline snapshot. Set `CHROME_PATH` to use an installed Chrome instead of Playwright's Chromium, and `AGC_BASE` if you serve on another port.

## Swapping the backend

`app.js` uses only these calls:

```
const db = await window.claude.use('db')
db.doc('agents/o2c-intake').get() / .set(data) / .onSnapshot(next, error)
db.collection('agents').onSnapshot(next, error)      // also 'processes', 'usage'; doc 'config/tenant'
snapshot.docs[i].id / .data(),  snapshot.metadata.fromCache
const user = await window.claude.use('user')
user.can('data.write'), user.id(), user.profiles([ids])
```

Errors carry a `code`: `invalid_argument`, `unavailable`, `quota_exceeded`, `resource_exhausted`, `revoked`.

Two sensible targets:

- **Firestore.** The paths map one to one. `onSnapshot` is native. Writes to `agents/` for editors; `processes`, `config` and `usage` are admin or pipeline only (the same rules the artifact uses).
- **FastAPI over Firestore or BigQuery.** Serve `GET /registry` (everything) and `PUT /agents/{agent_id}`; poll or use SSE for updates. The adapter turns those into the snapshot shape above.

In production the `usage` collection is written by an ingestion job, not by people. On GCP that is Cloud Trace spans, Cloud Logging and the BigQuery billing export, joined on the `agent_id` resource label.
