# Data model

Four collections, document-shaped. Paths are the same in the artifact database, the dev backend and the offline snapshot (`registry-snapshot.json` holds `{config, processes[], agents[], usage[]}`).

App code treats every document as untrusted: `procFromDoc()` and `agentFromDoc()` in `app.js` coerce types, drop rows that point at unknown processes, and fill defaults.

## `config/tenant`

| Field | Example | Notes |
|---|---|---|
| name | Meridian Consumer Brands | |
| note | Demo tenant · sample data | Shown as "Demo tenant, sample data" |
| as_of | Nov 18, 2026, 23:59 ET | Telemetry cut-off shown in the top bar |
| tiers | `{"1": {name, short, question}, ...}` | 1 Core value-creating, 2 Enabling & support, 3 Governance & strategy |
| model_prices | `{"gemini-3-pro": {in: 2, out: 12, label}, ...}` | USD per 1M tokens. Illustrative list prices |
| runtime_per_invocation | `{automation: 0.0012, conversational: 0.0045, analytical: 0.006, monitoring: 0.002}` | USD per run, by agent type |
| telemetry_window | `{start: "2026-10-20", days: 30}` | |
| close_band | `[10, 17]` | Day indexes of month-end close, shaded on charts for close-pattern agents |

## `processes/{id}`

| Field | Example |
|---|---|
| id | o2c |
| code | O2C |
| name | Order-to-Cash |
| alt | Alternative name, not shown in the current design |
| tier | 1 |
| order | 4 (nav order) |
| owner | `{name: "Priya Raman", title: "VP Customer Operations"}` |
| summary | One paragraph describing the process |
| subprocesses | `["Order capture", "Credit management", ...]` (the "Steps" an agent's home is picked from) |
| featured | true for the fully worked examples (O2C, R2R) |

## `agents/{agent_id}` (one Agent.md)

See `AGENT_MD_SPEC.md` for meaning and the home rule. Stored fields:

```
schema_version, agent_id, name, version, lifecycle (production | review | draft),
owner {name, title},
home_process, home_subprocess (null = all steps), home_basis (users | step | decision | alerts | owner), home_basis_note,
archetype (conversational | automation | analytical | monitoring), autonomy (1 advise | 2 act with approval | 3 autonomous),
platform, framework, gcp_project, region, model {primary, temperature}, trigger,
summary, description, instructions,
inputs   [{system, what, process, access: read|write}],
tools    [{name, description, system, process, access, approval_by}],
outputs  [{destination, what, process, access}],
users    [{process, role, people}],
guardrails [string], telemetry_sources [string],
deployed_at, updated_at, created_at, created_by, updated_by, source (seed | console), sample_generated
```

Rules the form enforces (`validate()` in `app.js`): `agent_id` matches `^[a-z0-9][a-z0-9-]{1,62}$` and is unique; `version` is x.y.z; name, owner, step, summary, trigger and instructions are required; at least one user group; no duplicate tool names; every row names a process.

## `usage/{agent_id}`

Written by telemetry ingestion in production. Only production agents have one; a production agent without it shows "Awaiting telemetry".

| Field | Example | Notes |
|---|---|---|
| window_start, days | 2026-10-20, 30 | |
| daily_requests | 30 integers | API requests per day (model calls + tool calls) |
| model_call_share | 0.35 | Share of requests that are model calls; the rest are tool calls |
| tokens_in_per_call, tokens_out_per_call | 3200, 380 | Per model call |
| invocations | 96200 | Runs or chat sessions in the window |
| pattern | web / chat / close / daily / weekday | How the sample series was generated; `close` turns on the close band |
| error_rate_pct, p95_ms | 0.6, 2800 | |
| fees | `[{label, unit, rate, qty}]` | Third-party API fees (D&B, Avalara, ...) |
| tool_weights | `{tool_name: weight}` | Splits tool calls across tools |
| health, health_note | healthy / degraded / incident, text | Drives the attention line in a process header |

## Derived numbers (`calc()` in `app.js`)

- Requests a day = sum(daily_requests) / days
- Model calls = requests x model_call_share; tool calls = the rest, split by tool_weights
- Token cost = model calls x tokens per call x model price
- Runtime cost = invocations x runtime_per_invocation[archetype]
- Total = tokens + runtime + fees
- Cross-process footprint (`footprint()`): every process named by an input, tool, output or user group; a write anywhere in it marks the process as written into

Users are summed per agent. A person who uses two agents counts twice until identities are joined across agents (on the to-do list).
