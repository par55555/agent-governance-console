# Agent.md: draft spec (v0.2)

_Drafted 2026-11-19 alongside the Agent Governance Console prototype. v0.2 adds the home rule._

Every agent ships an `Agent.md` when it's onboarded. It holds no running code. It describes what the agent does and what power it has, and it is the registration contract the console reads. The cross-process mapping comes from it: every input, tool and output names the business process it belongs to.

**Scope (decided 2026-11-19):** the Agent Governance Console provides visibility and governance reporting only. It does not approve, block or enforce anything, and it runs no agents. Sign-off workflows and access enforcement are out of scope.

## Front matter (required)

| Field | Example | Notes |
|---|---|---|
| agent_id | `o2c-intake` | Stable ID. Also the `agent_id` label on GCP resources so billing and traces join. |
| name | Order Intake Agent | |
| version | 2.4.1 | Semver; a change to tools or instructions bumps the minor version. |
| lifecycle | production / review / draft | |
| owner | Dana Whitfield | Accountable person, not a team alias. |
| home_subprocess | Cash application | The step the agent performs, picked at onboarding. `all` if it spans every step of its process. |
| home_process | O2C | Follows from `home_subprocess`. Not picked separately. |
| home_basis | users / step / decision / alerts / owner | Which home rule decided it (see below). |
| processes_touched | [O2C, I2D, Q2C, R2R, I2R] | Derived from the sections below at onboarding, not typed by hand. |
| archetype | conversational / automation / analytical / monitoring | What it does. |
| autonomy | advise / act_with_approval / autonomous | How much power it has. |
| platform, framework, gcp_project, region | Vertex AI Agent Engine, Google ADK, mrd-o2c-agents-prod, us-east4 | |
| model.primary, model.temperature | gemini-3-flash, 0.1 | |
| trigger | Event / Schedule / Chat + detail | |

## Home rule (decided 2026-11-19)

An agent's home is **the process that owns the work it does**, not where its results end up. Where results end up is what the cross-process labels show.

| Archetype | Home is the process of… | home_basis |
|---|---|---|
| Conversational | the people who use it most | users |
| Process automation | the process that owns the step it runs | step |
| Analytical | the people who act on its output | decision |
| Monitoring | the people who act on its alerts | alerts |
| Still unclear | the accountable owner | owner |

Examples: AP Invoice Agent → P2P (owns the Invoice processing step), even though its postings land in R2R. Fraud Pattern Sentinel → ID2M (fraud analysts act on its alerts), even though it watches P2P and O2C. A close call can be recorded as a short note (e.g. Flux Commentary Agent: R2R by the analytical rule, though FP&A also relies on it).

## Body sections (required)

1. **Purpose**: two or three sentences in plain language.
2. **Instructions**: the system prompt, verbatim.
3. **Data inputs**: table of `source system | what | process | read/write`.
4. **Tools**: table of `tool | system | process | read/write | approval by`.
5. **Outputs**: table of `destination | what | process`.
6. **Users**: table of `process | role | people`.
7. **Guardrails**: bullet list (limits, approval gates, scopes, injection screening).
8. **Telemetry**: where traces, logs and billing for this agent can be found.

## Cross-process rule

An agent crosses into another process if any data input, tool or output belongs to it. People from another process using the agent make it show up in that process's cross-process section as **secondary users**. Writing into another process is the main thing the console surfaces: it shows as an amber label with a pencil icon.

## Storage

In the console each Agent.md is one document at `agents/{agent_id}`, with telemetry kept separately at `usage/{agent_id}`. Field-level detail is in `DATA_MODEL.md`. People add and edit agents through the console's form; usage is written only by the telemetry pipeline.

## Open questions

- How the mapping stays current after onboarding (see to-dos).
