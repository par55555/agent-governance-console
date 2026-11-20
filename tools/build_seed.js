// Builds the backend seed dataset (processes / agents / usage / config) from data.js.
// Output: seed.json (pretty, for loading into a database) and registry-snapshot.json (compact, the read-only offline fallback the UI fetches).
// Run: node tools/build_seed.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data', 'data.js'), 'utf8'), ctx);
const W = ctx.window;

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const humanize = (id) => { const s = id.replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
const BP = Object.fromEntries(W.BPS.map((b) => [b.id, b]));
const AUTONOMY_BLURB = { 1: 'Read-only or drafts; a person takes every action.', 2: 'Takes actions, but key ones wait for a named approver.', 3: 'Acts on its own inside guardrails; humans handle exceptions.' };
const BASIS_BY_ARCH = { conversational: 'users', automation: 'step', analytical: 'decision', monitoring: 'alerts' };
const LIGHT = {
  tok: { automation: [3000, 350], conversational: [6000, 550], analytical: [12000, 1500], monitoring: [3500, 400] },
  pat: { automation: 'weekday', conversational: 'chat', analytical: 'weekday', monitoring: 'daily' },
  p95: { automation: 3200, conversational: 4800, analytical: 15000, monitoring: 3000 },
  trigger: { automation: 'Event: new record in the source system', conversational: 'Chat: Gemini Enterprise', analytical: 'Schedule: daily batch, plus on-demand questions', monitoring: 'Schedule: hourly checks' }
};
const PATTERN_OVERRIDE = { 'h2r-payroll': 'close', 's2e-scenario': 'close', 's2v-esg': 'close' };

// ---- normalize the two source shapes into one internal shape
function fromFull(a) {
  return Object.assign({}, a, {
    inputs: a.inputs.map(([system, what, bp, mode]) => ({ system, what, bp, mode })),
    tools: a.tools.map(([name, desc, system, bp, mode, approval, w]) => ({ name, desc, system, bp, mode, approval, w: w == null ? 1 : w })),
    outputs: a.outputs.map(([dest, what, bp, mode]) => ({ dest, what, bp, mode })),
    users: a.users.map(([bp, role, n]) => ({ bp, role, n })),
    fees: (a.fees || []).map(([label, unit, rate, qty]) => ({ label, unit, rate, qty })),
    guard: a.guard || [], sample: false
  });
}
function fromLight(t) {
  const [id, name, home, arch, auto, model, short, inputs, tools, outputs, users, rpd, inv, status] = t;
  const b = BP[home]; const r = rng(hash(id)); const tok = LIGHT.tok[arch]; const st = status || 'production';
  const rule = auto === 1 ? 'You only advise. Do not take actions in any system except writing your own output.'
    : auto === 2 ? 'Actions marked for approval must wait for the named approver. Explain every proposed action.'
      : 'You may act on your own inside the guardrails below. Send anything outside them to a person.';
  return {
    id, name, home, status: st, arch, auto, health: 'healthy', sample: true,
    owner: b.owner, ownerTitle: b.ownerTitle,
    version: '1.' + (hash(id) % 6) + '.' + (hash(id + 'p') % 5),
    deployed: st === 'production' ? '2026-0' + (1 + (hash(id) % 9)) + '-1' + (hash(id) % 9) : '', updated: '2026-11-0' + (1 + (hash(id) % 9)),
    platform: arch === 'conversational' ? 'Gemini Enterprise · Agent Engine' : 'Vertex AI Agent Engine',
    framework: 'Google ADK (Python) 1.18', project: 'mrd-' + home + '-agents-' + (st === 'production' ? 'prod' : 'stg'), region: 'us-east4',
    model, temp: 0.2, trigger: LIGHT.trigger[arch], short, desc: short,
    inputs: inputs.map(([system, what, bp, mode]) => ({ system, what, bp, mode })),
    tools: tools.map(([tn, system, bp, mode, approval]) => ({ name: tn, desc: humanize(tn) + ' in ' + system.split(' · ')[0] + '.', system, bp, mode, approval, w: mode === 'w' ? 0.6 : 1.4 })),
    outputs: outputs.map(([dest, what, bp, mode]) => ({ dest, what, bp, mode })),
    users: users.map(([bp, role, n]) => ({ bp, role, n })),
    instr: 'You are the ' + name + ' for Meridian Consumer Brands. ' + short + '\n\nUse only these tools: ' + tools.map((x) => x[0]).join(', ') + '.\n' + rule + '\nIf data you need is missing or stale, say so instead of guessing.',
    guard: [AUTONOMY_BLURB[auto], 'Tool scope limited to the systems listed in Agent.md.', 'Model Armor prompt-injection screening on retrieved content.'],
    use: { rpd, ms: 0.4, tin: tok[0], tout: tok[1], inv, pat: PATTERN_OVERRIDE[id] || LIGHT.pat[arch], trend: 0.03 + r() * 0.05, err: +(0.2 + r() * 0.6).toFixed(1), p95: Math.round(LIGHT.p95[arch] * (0.8 + r() * 0.4)) },
    fees: [], telemetry: ['Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=' + id]
  };
}

// ---- 30-day daily request series (Oct 20 - Nov 18, 2026)
const WINDOW_START = '2026-10-20';
const START = Date.parse(WINDOW_START + 'T00:00:00Z');
const DAYS = Array.from({ length: 30 }, (_, i) => new Date(START + i * 864e5));
const CLOSE_FACTOR = { '2026-10-29': 1.3, '2026-10-30': 1.8, '2026-10-31': 0.35, '2026-11-01': 0.35, '2026-11-02': 2.4, '2026-11-03': 2.8, '2026-11-04': 2.6, '2026-11-05': 2.0, '2026-11-06': 1.4 };
function series(a) {
  const u = a.use; const r = rng(hash(a.id) ^ 0x9e3779b9);
  const raw = DAYS.map((d, i) => {
    const dow = d.getUTCDay(); const wk = dow === 0 || dow === 6; const key = d.toISOString().slice(0, 10);
    let f;
    switch (u.pat) {
      case 'web': f = wk ? 0.78 : 1; break;
      case 'chat': f = wk ? 0.08 : (dow === 1 ? 1.1 : 1); break;
      case 'close': f = CLOSE_FACTOR[key] != null ? CLOSE_FACTOR[key] : (wk ? 0.08 : 0.75); break;
      case 'daily': f = 1; break;
      default: f = wk ? 0.22 : 1;
    }
    f *= 1 + (u.trend || 0) * (i / 29);
    f *= 0.9 + r() * 0.2;
    return f;
  });
  const s = raw.reduce((x, y) => x + y, 0);
  return raw.map((v) => Math.round((v / s) * u.rpd * 30));
}

// ---- convert to backend documents
const access = (m) => (m === 'w' ? 'write' : 'read');
const agents = W.AGENTS.map(fromFull).concat(W.LIGHT_AGENTS.map(fromLight));
const agentDocs = agents.map((a) => {
  const sub = W.HOME_SUBPROCESS[a.id];
  return {
    schema_version: 1,
    agent_id: a.id, name: a.name, version: a.version, lifecycle: a.status,
    owner: { name: a.owner, title: a.ownerTitle || '' },
    home_process: a.home, home_subprocess: sub === undefined ? null : sub,
    home_basis: BASIS_BY_ARCH[a.arch], home_basis_note: (W.HOME_BASIS_NOTE || {})[a.id] || '',
    archetype: a.arch, autonomy: a.auto,
    platform: a.platform, framework: a.framework, gcp_project: a.project, region: a.region,
    model: { primary: a.model, temperature: a.temp },
    trigger: a.trigger, summary: a.short, description: a.desc === a.short ? '' : a.desc, instructions: a.instr || '',
    inputs: a.inputs.map((x) => ({ system: x.system, what: x.what, process: x.bp, access: access(x.mode) })),
    tools: a.tools.map((t) => ({ name: t.name, description: t.desc, system: t.system, process: t.bp, access: access(t.mode), approval_by: t.approval || '' })),
    outputs: a.outputs.map((o) => ({ destination: o.dest, what: o.what, process: o.bp, access: access(o.mode) })),
    users: a.users.map((u) => ({ process: u.bp, role: u.role, people: u.n })),
    guardrails: a.guard, telemetry_sources: a.telemetry || [],
    deployed_at: a.deployed || '', updated_at: a.updated || '', created_at: a.updated || '', created_by: null,
    source: 'seed', sample_generated: !!a.sample
  };
});
const usageDocs = agents.filter((a) => a.status === 'production' && a.use && a.use.rpd > 0).map((a) => ({
  agent_id: a.id, window_start: WINDOW_START, days: 30,
  daily_requests: series(a),
  model_call_share: a.use.ms, tokens_in_per_call: a.use.tin, tokens_out_per_call: a.use.tout,
  invocations: a.use.inv, pattern: a.use.pat, error_rate_pct: a.use.err, p95_ms: a.use.p95,
  fees: a.fees.map((f) => ({ label: f.label, unit: f.unit, rate: f.rate, qty: f.qty })),
  tool_weights: Object.fromEntries(a.tools.map((t) => [t.name, t.w])),
  health: a.health || 'healthy', health_note: a.healthNote || '', source: 'sample'
}));
const processDocs = W.BPS.map((b, i) => ({
  id: b.id, code: b.code, name: b.name, alt: b.alt || '', tier: b.tier, order: i + 1,
  owner: { name: b.owner, title: b.ownerTitle }, summary: b.summary,
  subprocesses: b.id === 'o2c' ? b.subs : b.subs, featured: !!b.featured
}));
const config = {
  name: W.TENANT.name, note: W.TENANT.note, as_of: W.TENANT.asOf,
  tiers: W.TIERS, model_prices: W.MODEL_PRICES, runtime_per_invocation: W.RUNTIME_PER_INVOCATION,
  telemetry_window: { start: WINDOW_START, days: 30 }, close_band: [10, 17]
};

const seed = { config, processes: processDocs, agents: agentDocs, usage: usageDocs };
fs.writeFileSync(path.join(root, 'data', 'seed.json'), JSON.stringify(seed, null, 1));
fs.writeFileSync(path.join(root, 'registry-snapshot.json'), JSON.stringify(seed));
const size = (o) => Buffer.byteLength(JSON.stringify(o));
console.log('processes', processDocs.length, size(processDocs), 'bytes');
console.log('agents', agentDocs.length, size(agentDocs), 'bytes');
console.log('usage', usageDocs.length, size(usageDocs), 'bytes');
console.log('config', size(config), 'bytes');
