# To-dos — Agent Governance

_Added 2026-11-19_

- [x] Make a home page: the enterprise stack (users, agents and data layers with animated flows) under All business processes, with a dashboard per layer below. Expect more iterations
- [x] Add a filter for agent lifecycle status (e.g. First draft, In review, Deployed): in prototype v1, defaults to Production
- [x] Add and edit agents from the console, stored in a backend (artifact database; `dev/mock-backend.js` locally)
- [x] Apply the executive style system (tokens, type, copy rules) to the front end
- [ ] Move the backend off the artifact: Firestore or FastAPI adapter behind the same `db` interface
- [ ] Telemetry ingestion job: Cloud Trace + Cloud Logging + BigQuery billing export, joined on the `agent_id` label, writing `usage/{agent_id}`

## To discuss later
- [ ] How to keep the agent-to-business-process mapping up to date automatically (from a business process point of view), rather than relying on manual registration at onboarding
- [ ] How to show value on the agent detail view (left blank for now)
- [ ] Detailed backend: data lineage per source (tables, fields, freshness, data owner). Today only the source system is marked
- [ ] De-duplicate unique users across agents (process-level user counts are summed per agent today). The User view now pools shared groups; process headers and tiles still sum per agent
- [ ] People from Google Cloud Identity: directory sync into `people/` and per-user usage from Cloud Logging into `people_usage/` (see DATA_MODEL.md), replacing the sample people. Microsoft Entra later
- [ ] Agent library + playground (pinned; the console itself runs nothing)
- [ ] Integration beyond GCP (Copilot Studio, Agentforce, custom builds). GCP first to get the data model right
- [x] Map agents to sub-processes (e.g. O2C → Credit management) so large processes stay scannable. Each tile shows its step in a corner tab; the steps in the title frame filter the tiles (an agent with no step shows under every step)
