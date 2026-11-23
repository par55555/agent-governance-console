/* Agent Governance Console - front end. Reads the agent registry from the artifact database; see the data layer below. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- utilities */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const nf = new Intl.NumberFormat('en-US');
  function compact(n) {
    if (n == null || isNaN(n)) return '–';
    const a = Math.abs(n);
    if (a >= 1e9) return trim(n / 1e9, a >= 1e10 ? 0 : 1) + 'B';
    if (a >= 1e6) return trim(n / 1e6, a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e3) return trim(n / 1e3, a >= 1e5 ? 0 : 1) + 'k';
    return nf.format(Math.round(n));
  }
  const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const word = (n) => (n >= 0 && n < WORDS.length ? WORDS[n] : nf.format(n));
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const plural = (n, one, many) => (n === 1 ? one : (many || one + 's'));
  const roundTo = (n) => (n >= 10000 ? Math.round(n / 100) * 100 : n >= 1000 ? Math.round(n / 10) * 10 : Math.round(n));
  function trim(v, d) { return v.toFixed(d).replace(/\.0$/, ''); }
  function money(n, d) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function humanize(id) { const s = id.replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }
  const fmtDate = (iso) => { if (!iso) return '–'; const d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };

  /* ---------------------------------------------------------------- data layer
     The registry lives in the artifact's database (claude.use('db')):
       config/tenant        tenant, tiers, model prices, telemetry window
       processes/{id}       business processes (code, tier, owner, sub-processes)
       agents/{agent_id}    the Agent.md spec of each agent
       usage/{agent_id}     30-day telemetry rollup (written by the ingestion job)
     When the database can't be reached, window.SEED (same shapes) is shown read-only. */
  let TENANT = { name: '', note: '', asOf: '' };
  let TIERS = {}, PRICES = {}, RUNTIME = {};
  let BPS = [], BP = {}, AGENTS = [], AG = {};
  let DAYS = [], CLOSE_BAND = [10, 17];
  let CALC = {};
  const SRC = { mode: 'loading', db: null, user: null, userId: null, canWrite: null, slow: false, error: '', ready: false, empty: false,
    raw: { config: undefined, processes: undefined, agents: undefined, usage: undefined } };

  const ARCH = {
    conversational: { label: 'Conversational', blurb: 'People chat with it to get answers or drafts.' },
    automation: { label: 'Process automation', blurb: 'Runs steps of a business process on an event or schedule.' },
    analytical: { label: 'Analytical', blurb: 'Produces analysis, scores or recommendations from data.' },
    monitoring: { label: 'Monitoring', blurb: 'Watches data or transactions and raises alerts.' }
  };
  const AUTONOMY = {
    1: { label: 'Advise', blurb: 'Read-only or drafts; a person takes every action.' },
    2: { label: 'Act with approval', blurb: 'Takes actions, but key ones wait for a named approver.' },
    3: { label: 'Autonomous', blurb: 'Acts on its own inside guardrails; humans handle exceptions.' }
  };
  const STATUS = { production: 'Production', review: 'In review', draft: 'First draft' };
  const HEALTH = { healthy: 'Healthy', degraded: 'Degraded', incident: 'Incident', unknown: 'No telemetry' };
  const STAGES = ['Data inputs', 'Tools', 'Outputs', 'Users'];
  const BASIS_BY_ARCH = { conversational: 'users', automation: 'step', analytical: 'decision', monitoring: 'alerts' };
  const BASIS_LABEL = { users: 'Most users', step: 'Owns the step', decision: 'Acts on its output', alerts: 'Acts on its alerts', owner: 'Owner’s process' };

  const str = (v, d) => (v == null ? (d || '') : String(v));
  const arr = (v) => (Array.isArray(v) ? v : []);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d || 0));
  const mode = (acc) => (acc === 'write' ? 'w' : 'r');

  function procFromDoc(d) {
    return { id: str(d.id), code: str(d.code, d.id).toUpperCase(), name: str(d.name, d.id), alt: str(d.alt), tier: [1, 2, 3].includes(d.tier) ? d.tier : 2, order: num(d.order, 99),
      owner: str(d.owner && d.owner.name), ownerTitle: str(d.owner && d.owner.title), summary: str(d.summary), subs: arr(d.subprocesses).map((s) => str(s)), featured: !!d.featured };
  }
  // Shared data is untrusted: coerce types and drop rows that point at a process we don't know.
  function agentFromDoc(d, u) {
    if (!d || !BP[d.home_process]) throw new Error('unknown home process');
    const okBp = (x) => !!BP[x];
    const weights = (u && u.tool_weights) || {};
    const a = {
      id: str(d.agent_id), name: str(d.name, d.agent_id), home: d.home_process,
      status: STATUS[d.lifecycle] ? d.lifecycle : 'draft', arch: ARCH[d.archetype] ? d.archetype : 'automation', auto: [1, 2, 3].includes(d.autonomy) ? d.autonomy : 1,
      owner: str(d.owner && d.owner.name), ownerTitle: str(d.owner && d.owner.title), version: str(d.version, '0.1.0'),
      deployed: str(d.deployed_at), updated: str(d.updated_at), createdAt: str(d.created_at), createdBy: d.created_by || null, updatedBy: d.updated_by || null, source: str(d.source, 'seed'),
      platform: str(d.platform), framework: str(d.framework), project: str(d.gcp_project), region: str(d.region),
      model: str(d.model && d.model.primary, 'gemini-3-flash'), temp: num(d.model && d.model.temperature, 0.2),
      trigger: str(d.trigger), short: str(d.summary), desc: str(d.description) || str(d.summary), instr: str(d.instructions),
      inputs: arr(d.inputs).filter((x) => okBp(x.process)).map((x) => ({ system: str(x.system), what: str(x.what), bp: x.process, mode: mode(x.access), dtype: str(x.data_type), struct: str(x.structure), fmt: str(x.format) })),
      tools: arr(d.tools).filter((x) => okBp(x.process)).map((t) => ({ name: str(t.name), desc: str(t.description), system: str(t.system), bp: t.process, mode: mode(t.access), approval: str(t.approval_by), w: num(weights[t.name], 1) })),
      outputs: arr(d.outputs).filter((x) => okBp(x.process)).map((x) => ({ dest: str(x.destination), what: str(x.what), bp: x.process, mode: mode(x.access || 'write'), dtype: str(x.data_type), struct: str(x.structure), fmt: str(x.format) })),
      users: arr(d.users).filter((x) => okBp(x.process)).map((x) => ({ bp: x.process, role: str(x.role), n: Math.max(0, Math.round(num(x.people))) })),
      guard: arr(d.guardrails).map((g) => str(g)).filter(Boolean), telemetry: arr(d.telemetry_sources).map((g) => str(g)).filter(Boolean),
      sub: d.home_subprocess ? str(d.home_subprocess) : null, basis: BASIS_LABEL[d.home_basis] ? d.home_basis : BASIS_BY_ARCH[d.archetype] || 'step', basisNote: str(d.home_basis_note),
      sample: !!d.sample_generated, doc: d,
      health: u ? (HEALTH[u.health] ? u.health : 'healthy') : 'unknown', healthNote: u ? str(u.health_note) : '',
      use: u && Array.isArray(u.daily_requests) ? { series: u.daily_requests.map((v) => num(v)), ms: num(u.model_call_share, 0.4), tin: num(u.tokens_in_per_call), tout: num(u.tokens_out_per_call), inv: num(u.invocations), pat: str(u.pattern), err: num(u.error_rate_pct), p95: num(u.p95_ms) } : null,
      fees: u ? arr(u.fees).map((f) => ({ label: str(f.label), unit: str(f.unit), rate: num(f.rate), qty: num(f.qty) })) : []
    };
    if (!PRICES[a.model]) a.model = Object.keys(PRICES)[0];
    if (!a.users.length) a.users = [{ bp: a.home, role: 'Users', n: 0 }];
    return a;
  }
  function buildModel() {
    const r = SRC.raw;
    if (r.config === undefined || r.processes === undefined || r.agents === undefined || r.usage === undefined) return false;
    if (!r.config || !r.processes.length) { SRC.empty = true; AGENTS = []; AG = {}; BPS = []; BP = {}; return true; }
    SRC.empty = false;
    const cfg = r.config;
    TENANT = { name: str(cfg.name), note: str(cfg.note), asOf: str(cfg.as_of) };
    TIERS = cfg.tiers || {}; PRICES = cfg.model_prices || {}; RUNTIME = cfg.runtime_per_invocation || {};
    const tw = cfg.telemetry_window || { start: '2026-10-20', days: 30 };
    const start = Date.parse(str(tw.start) + 'T00:00:00Z');
    DAYS = Array.from({ length: num(tw.days, 30) }, (_, i) => new Date(start + i * 864e5));
    CLOSE_BAND = Array.isArray(cfg.close_band) ? cfg.close_band : [10, 17];
    BPS = r.processes.map(procFromDoc).filter((b) => b.id).sort((a, b) => a.order - b.order);
    BP = Object.fromEntries(BPS.map((b) => [b.id, b]));
    const U = Object.fromEntries(r.usage.filter((u) => u && u.agent_id).map((u) => [u.agent_id, u]));
    AGENTS = r.agents.map((d) => { try { return agentFromDoc(d, U[d.agent_id]); } catch (e) { console.warn('Skipped agent', d && d.agent_id, e.message); return null; } }).filter(Boolean);
    AG = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
    CALC = {};
    if (!BP[state.bp] && BPS.length) state.bp = BPS[0].id;
    return true;
  }

  function homeReason(a) {
    const b = BP[a.home]; const top = a.users.filter((u) => u.bp === a.home).sort((x, y) => y.n - x.n)[0];
    const role = top && top.role ? top.role.charAt(0).toLowerCase() + top.role.slice(1) : 'people';
    switch (a.basis) {
      case 'users': return 'Most of its users are ' + role + ' in ' + b.name + '.';
      case 'step': return 'It performs the ' + (a.sub || b.name) + ' step of ' + b.name + '.';
      case 'decision': return 'The people who act on its output are ' + role + ' in ' + b.name + '.';
      case 'alerts': return 'The people who act on its alerts are ' + role + ' in ' + b.name + '.';
      default: return 'Its accountable owner sits in ' + b.name + '.';
    }
  }
  const subLabel = (a) => a.sub || ('All ' + BP[a.home].code + ' steps');
  const hasTel = (a) => a.status === 'production' && !!a.use;

  function calc(a) {
    if (CALC[a.id]) return CALC[a.id];
    const u = a.use || { series: DAYS.map(() => 0), ms: 0, tin: 0, tout: 0, inv: 0, err: 0, p95: 0 };
    const sr = u.series;
    const req30 = sr.reduce((x, y) => x + y, 0);
    const modelCalls = Math.round(req30 * u.ms); const toolCalls = req30 - modelCalls;
    const tokIn = modelCalls * u.tin; const tokOut = modelCalls * u.tout;
    const p = PRICES[a.model] || { in: 0, out: 0 };
    const costIn = (tokIn / 1e6) * p.in; const costOut = (tokOut / 1e6) * p.out;
    const runtime = u.inv * (RUNTIME[a.arch] || 0);
    const fees = a.fees.map((f) => ({ label: f.label, unit: f.unit, rate: f.rate, qty: f.qty, cost: f.rate * f.qty }));
    const feeTotal = fees.reduce((x, f) => x + f.cost, 0);
    const total = costIn + costOut + runtime + feeTotal;
    const users = a.users.reduce((x, y) => x + y.n, 0);
    const wsum = a.tools.reduce((x, t) => x + t.w, 0) || 1;
    const toolCallsBy = a.tools.map((t) => ({ name: t.name, bp: t.bp, mode: t.mode, calls: Math.round((toolCalls * t.w) / wsum) }));
    const touch = footprint(a);
    const cross = Object.keys(touch).filter((k) => k !== a.home);
    const crossWrite = cross.filter((k) => touch[k].write);
    const out = { series: sr, req30, rpd: req30 / (sr.length || 30), modelCalls, toolCalls, tokIn, tokOut, costIn, costOut, runtime, fees, feeTotal, total, users, toolCallsBy, touch, cross, crossWrite, perInv: u.inv ? total / u.inv : 0 };
    CALC[a.id] = out; return out;
  }
  function footprint(a) {
    const touch = {};
    const add = (bp, stage, item, m) => {
      if (!bp || !BP[bp]) return;
      if (!touch[bp]) touch[bp] = { bp, stages: {}, write: false };
      (touch[bp].stages[stage] = touch[bp].stages[stage] || []).push({ item, mode: m });
      if (m === 'w') touch[bp].write = true;
    };
    if (BP[a.home]) touch[a.home] = { bp: a.home, stages: {}, write: false };
    a.inputs.forEach((x) => add(x.bp, 'Data inputs', x.system || '(unnamed source)', x.mode));
    a.tools.forEach((x) => add(x.bp, 'Tools', x.name || '(unnamed tool)', x.mode));
    a.outputs.forEach((x) => add(x.bp, 'Outputs', x.dest || '(unnamed output)', x.mode));
    a.users.forEach((x) => add(x.bp, 'Users', (x.role || 'Users') + ' (' + x.n + ')', 'r'));
    return touch;
  }

  /* ---------------------------------------------------------------- state + routing */
  const state = { bp: 'o2c', view: 'bp', lifecycle: 'production', arch: 'all', step: null, homeLayer: 'all', homeDraft: 3, theme: 'neon', bpView: 'agents', dq: '', dStruct: 'all', dataSys: null, uq: '', uScope: 'bu', uSel: null, uLimit: 50, _keepUser: false, _scrollUser: null, sort: 'req', q: '', density: 'comfortable', crossTab: 'in', agent: null, tab: 'overview', collapsed: {} };
  try { const saved = JSON.parse(localStorage.getItem('agc-prefs') || '{}'); if (saved.density) state.density = saved.density; if (saved.collapsed) state.collapsed = saved.collapsed; if ([2, 3].includes(saved.homeDraft)) state.homeDraft = saved.homeDraft; if (saved.theme === 'light') state.theme = 'light'; if (saved.bpView === 'data' || saved.bpView === 'users') state.bpView = saved.bpView; } catch (e) { /* storage unavailable */ }
  function savePrefs() { try { localStorage.setItem('agc-prefs', JSON.stringify({ density: state.density, collapsed: state.collapsed, homeDraft: state.homeDraft, theme: state.theme, bpView: state.bpView })); } catch (e) { /* ignore */ } }

  function parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (h.startsWith('agent-') && AG[h.slice(6)]) {
      const a = AG[h.slice(6)];
      if (!state._booted) { state.bp = a.home; state.view = 'bp'; }
      if (state.agent !== a.id) state.tab = 'overview';
      state.agent = a.id;
    } else if (h === 'all') { state.view = 'all'; state.agent = null; }
    else if (BP[h]) { if (state.bp !== h) { state.step = null; state.dataSys = null; state.dq = ''; state.dStruct = 'all'; if (!state._keepUser) { state.uSel = null; state.uLimit = 50; state.uq = ''; } } state._keepUser = false; state.view = 'bp'; state.bp = h; state.agent = null; }
    else { state.agent = null; }
    state._booted = true;
  }
  function go(hashName) { if (location.hash.replace('#', '') === hashName) { parseHash(); render(); } else { location.hash = hashName; } }

  const lifecycleOk = (a) => state.lifecycle === 'all' || a.status === state.lifecycle;

  /* ---------------------------------------------------------------- small components */
  function chip(bpId, opts) {
    opts = opts || {}; const b = BP[bpId];
    const cls = 'chip t' + b.tier + (opts.write ? ' w' : '') + (opts.home ? ' home' : '');
    const tt = b.name + ', ' + (((TIERS[b.tier] && TIERS[b.tier].name) || '') + ' process').toLowerCase() + (opts.write != null ? (opts.write ? '\nWrites into this process' : '\nReads only') : '');
    return '<span class="' + cls + '" data-tt="' + esc(tt) + '">' + (opts.write ? icon('write') : '') + (opts.prefix ? esc(opts.prefix) : '') + esc(b.code) + (opts.long ? ' <span class="chip-long">' + esc(b.name) + '</span>' : '') + '</span>';
  }
  function crossChips(a, limitTo) {
    const c = calc(a);
    const ids = (limitTo || c.cross).slice().sort((x, y) => BP[x].tier - BP[y].tier || BPS.indexOf(BP[x]) - BPS.indexOf(BP[y]));
    return ids.map((id) => chip(id, { write: c.touch[id].write })).join('');
  }
  const ICON = {
    conversational: '<path d="M3 4.5h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 12.5H8l-3 2.5v-2.5H3A1.5 1.5 0 0 1 1.5 11V6A1.5 1.5 0 0 1 3 4.5z"/>',
    automation: '<path d="M2.5 8a5.5 5.5 0 0 1 9.6-3.6M13.5 8a5.5 5.5 0 0 1-9.6 3.6"/><path d="M12.5 1.8v2.9H9.6M3.5 14.2v-2.9h2.9"/>',
    analytical: '<path d="M2 14h12M4 12V8M8 12V4M12 12V6.5"/>',
    monitoring: '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    healthy: '<path d="M3.5 8.5l3 3 6-7"/>',
    degraded: '<path d="M8 2.5l6 11H2z"/><path d="M8 7v3M8 11.8v.2"/>',
    incident: '<circle cx="8" cy="8" r="6"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
    unknown: '<circle cx="8" cy="8" r="6" stroke-dasharray="2.5 2"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    edit: '<path d="M10.5 2.5l3 3-8 8H2.5v-3z"/>',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
    copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5"/>',
    write: '<path d="M10.5 2.5l3 3-8 8H2.5v-3z"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.2v4M8 4.8v.2"/>',
    chev: '<path d="M5 6.5l3 3 3-3"/>',
    check: '<path d="M3.5 8.5l3 3 6-7"/>',
    users: '<circle cx="6" cy="5.5" r="2.3"/><path d="M2 13c.4-2.4 2-3.7 4-3.7s3.6 1.3 4 3.7"/><path d="M10.5 3.6a2.2 2.2 0 010 4M12 9.6c1.1.5 1.8 1.6 2 3.4"/>',
    data: '<ellipse cx="8" cy="4" rx="5" ry="1.8"/><path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8"/>'
  };
  const icon = (n, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 16 16" aria-hidden="true">' + ICON[n] + '</svg>';
  const archTag = (a) => '<span class="arch" data-tt="' + esc(ARCH[a.arch].label + ': ' + ARCH[a.arch].blurb) + '">' + icon(a.arch) + esc(ARCH[a.arch].label) + '</span>';
  function autoMeter(a, withLabel) {
    let s = '<span class="auto" data-tt="' + esc('Autonomy: ' + AUTONOMY[a.auto].label + '\n' + AUTONOMY[a.auto].blurb) + '"><span class="auto-bars" aria-hidden="true">';
    for (let i = 1; i <= 3; i++) s += '<i class="' + (i <= a.auto ? 'on' : '') + '"></i>';
    return s + '</span>' + (withLabel ? esc(AUTONOMY[a.auto].label) : '<span class="sr">' + esc(AUTONOMY[a.auto].label) + '</span>') + '</span>';
  }
  const healthPill = (a) => '<span class="health ' + a.health + '"' + (a.healthNote ? ' data-tt="' + esc(a.healthNote) + '"' : '') + '>' + icon(a.health) + HEALTH[a.health] + '</span>';
  const statusPill = (a) => '<span class="status s-' + a.status + '">' + STATUS[a.status] + '</span>';
  const spriteEl = (a, size) => '<canvas class="sprite" width="16" height="16" data-sprite="' + a.id + '" style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true"></canvas>';

  /* ---------------------------------------------------------------- pixel sprites */
  const PREVIEW = {};
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function mix(h1, h2, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = p(h1), b = p(h2);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function drawSprite(cv) {
    const a = PREVIEW[cv.dataset.sprite] || AG[cv.dataset.sprite]; if (!a || !BP[a.home]) return;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 16, 16);
    const r = rng(hash(a.id) + 7);
    const T = { base: '#FFFFFF', ink: '#1B2A4A', slate: '#4F586C', mist: '#E8D8B9', petrol: '#1B2A4A', tang: '#F28C28', clay: '#8C7550' };
    const tier = BP[a.home].tier;
    const ink = T.ink;
    const tone = r();
    const body = tier === 1 ? T.ink : tier === 2 ? T.slate : T.clay;
    const shade = tier === 3 ? T.slate : T.ink, light = T.mist;
    const W = T.base, glass = T.mist;
    const accents = [T.base, T.mist, T.tang];
    const acc = accents[Math.floor(r() * accents.length)];
    void tone;
    const g = Array.from({ length: 16 }, () => Array(16).fill(null));
    const set = (x, y, c) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = c; };
    const sym = (x, y, c) => { set(x, y, c); set(15 - x, y, c); };
    const hw = r() < 0.5 ? 4 : 5; const top = r() < 0.5 ? 4 : 5; const bot = 10;
    const L = 8 - hw, R = 7 + hw;
    for (let y = top; y <= bot; y++) for (let x = L; x <= R; x++) set(x, y, body);
    for (let x = L; x <= R; x++) { set(x, top - 1, ink); set(x, bot + 1, ink); }
    for (let y = top; y <= bot; y++) { set(L - 1, y, ink); set(R + 1, y, ink); }
    for (let y = top + 1; y <= bot; y++) set(R, y, shade);
    for (let x = L; x <= R; x++) set(x, bot, shade);
    set(L, top, light); set(L + 1, top, light); set(L, top + 1, light);
    const ey = top + 2;
    const ears = r(); const stripe = r() < 0.4; const mouthV = r();
    if (ears < 0.35) { sym(L - 2, ey, ink); sym(L - 2, ey + 1, ink); sym(L - 3, ey, shade); }
    if (stripe && top < 5) for (let x = L + 2; x <= R - 2; x++) set(x, top, light);
    if (a.arch === 'conversational') {
      sym(5, ey, W); sym(6, ey, W); sym(5, ey + 1, W); sym(6, ey + 1, ink);
      if (mouthV < 0.5) { set(6, bot - 2, ink); set(7, bot - 1, ink); set(8, bot - 1, ink); set(9, bot - 2, ink); }
      else { for (let x = 6; x <= 9; x++) set(x, bot - 1, ink); set(7, bot - 2, light); set(8, bot - 2, light); }
      [[12, 0], [13, 0], [14, 0], [11, 1], [15, 1], [12, 2], [13, 2], [14, 2], [12, 3]].forEach(([x, y]) => set(x, y, ink));
      [[12, 1], [13, 1], [14, 1]].forEach(([x, y]) => set(x, y, W));
    } else if (a.arch === 'automation') {
      sym(5, ey, light); sym(6, ey, light); sym(5, ey + 1, light); sym(6, ey + 1, ink);
      if (mouthV < 0.5) { for (let x = 5; x <= 10; x++) set(x, bot - 1, x % 2 ? ink : shade); }
      else { for (let x = 6; x <= 9; x++) set(x, bot - 1, ink); set(5, bot - 2, ink); set(10, bot - 2, ink); }
      sym(L - 2, ey + 1, T.slate); sym(L - 2, ey + 2, T.slate);
    } else if (a.arch === 'analytical') {
      for (let x = L + 1; x <= R - 1; x++) { set(x, ey, glass); set(x, ey + 1, glass); }
      sym(6, ey + 1, ink); set(7, bot - 1, ink); set(8, bot - 1, ink);
    } else {
      for (let x = 6; x <= 9; x++) for (let y = ey - 1; y <= ey + 1; y++) set(x, y, W);
      set(7, ey, ink); set(8, ey, ink); set(7, ey - 1, acc);
      set(6, bot - 1, ink); set(9, bot - 1, ink);
    }
    if (a.arch === 'monitoring') {
      for (let x = 5; x <= 10; x++) set(x, top - 3, ink);
      set(4, top - 4, ink); set(11, top - 4, ink); set(7, top - 2, ink); set(8, top - 2, ink);
    } else if (r() < 0.6) {
      set(7, top - 2, ink); set(8, top - 2, ink); set(7, top - 3, acc); set(8, top - 3, acc);
    } else {
      set(L + 1, top - 2, ink); set(R - 1, top - 2, ink); set(L + 1, top - 3, acc); set(R - 1, top - 3, acc);
    }
    for (let y = 12; y <= 14; y++) for (let x = 5; x <= 10; x++) set(x, y, shade);
    for (let y = 12; y <= 14; y++) { set(4, y, ink); set(11, y, ink); }
    for (let x = 5; x <= 10; x++) set(x, 15, ink);
    set(7, 13, acc); set(8, 13, acc);
    if (r() < 0.55) { sym(3, 12, ink); sym(2, 13, ink); }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x]) { ctx.fillStyle = g[y][x]; ctx.fillRect(x, y, 1, 1); }
  }
  function paintSprites() { $$('canvas[data-sprite]').forEach(drawSprite); }

  /* ---------------------------------------------------------------- top bar + nav */
  function renderTop() {
    document.body.classList.toggle('neon', state.theme === 'neon'); document.body.classList.toggle('light', state.theme === 'light');
    $('#theme').innerHTML = [['neon', 'Neon'], ['light', 'Light']].map(([k, l]) => '<button type="button" class="seg-btn' + (state.theme === k ? ' on' : '') + '" data-theme-set="' + k + '" aria-pressed="' + (state.theme === k) + '">' + l + '</button>').join('');
    $('#asof').textContent = TENANT.asOf ? 'Telemetry as of ' + TENANT.asOf : '';
    $('#tenant').textContent = TENANT.name || '';
    $('#src').innerHTML = srcPill();
    const counts = { production: 0, review: 0, draft: 0, all: AGENTS.length };
    AGENTS.forEach((a) => counts[a.status]++);
    $('#lifecycle').innerHTML = [['production', 'Production'], ['review', 'In review'], ['draft', 'First draft'], ['all', 'All']].map(([k, l]) =>
      '<button type="button" class="seg-btn' + (state.lifecycle === k ? ' on' : '') + '" data-life="' + k + '" aria-pressed="' + (state.lifecycle === k) + '">' + l + ' <span class="seg-n">' + counts[k] + '</span></button>').join('');
  }
  function renderNav() {
    const agentsFor = (id) => AGENTS.filter((a) => a.home === id && lifecycleOk(a)).length;
    let h = '<button type="button" class="nav-all' + (state.view === 'all' ? ' on' : '') + '" data-go="all"><span>All business processes</span><span class="nav-n">' + AGENTS.filter(lifecycleOk).length + '</span></button>';
    [1, 2, 3].forEach((t) => {
      const col = !!state.collapsed[t];
      h += '<div class="nav-tier' + (col ? ' collapsed' : '') + '">';
      h += '<button type="button" class="nav-tier-h" data-collapse="' + t + '" aria-expanded="' + !col + '"><span>' + esc((TIERS[t] && TIERS[t].name) || 'Tier ' + t) + '</span>' + icon('chev', 'chev') + '</button>';
      h += '<ul class="nav-list">';
      BPS.filter((b) => b.tier === t).forEach((b) => {
        const on = state.view === 'bp' && state.bp === b.id;
        h += '<li><button type="button" class="nav-item' + (on ? ' on' : '') + '" data-go="' + b.id + '"' + (on ? ' aria-current="page"' : '') + '><span class="nav-code">' + esc(b.code) + '</span><span class="nav-name">' + esc(b.name) + '</span><span class="nav-n">' + agentsFor(b.id) + '</span></button></li>';
      });
      h += '</ul></div>';
    });
    $('#nav').innerHTML = h;
  }

  /* ---------------------------------------------------------------- BP view */
  function sortAgents(list) {
    const key = { req: (a) => -calc(a).rpd, users: (a) => -calc(a).users, cost: (a) => -calc(a).total, name: (a) => a.name, cross: (a) => -calc(a).cross.length };
    const f = key[state.sort];
    return list.slice().sort((a, b) => { const x = f(a), y = f(b); return typeof x === 'string' ? x.localeCompare(y) : x - y || a.name.localeCompare(b.name); });
  }
  function matchesQ(a) {
    if (!state.q) return true; const q = state.q.toLowerCase();
    return [a.name, a.short, a.owner, ...a.inputs.map((x) => x.system), ...a.tools.map((x) => x.name)].join(' ').toLowerCase().includes(q);
  }
  function tile(a) {
    const c = calc(a);
    const nonProd = a.status !== 'production'; const noTel = !nonProd && !a.use;
    return '<button type="button" class="tile" data-agent="' + a.id + '" data-tip="' + esc(a.short) + '" aria-label="' + esc(a.name + '. ' + a.short) + '">' +
      '<div class="tile-top"><span class="pix">' + spriteEl(a, 44) + '</span><span class="tile-id"><span class="tile-name">' + esc(a.name) + '</span><span class="tile-meta">' + archTag(a) + autoMeter(a) + '</span></span>' +
      (nonProd ? statusPill(a) : (a.health !== 'healthy' ? healthPill(a) : '')) + '</div>' +
      '<span class="tile-step" title="Step it performs: ' + esc(a.sub || 'All steps') + '"><span class="sr">Step: </span>' + esc(a.sub || 'All steps') + '</span>' +
      '<div class="tile-stats"><span class="stat"><b>' + (nonProd || noTel ? '–' : compact(c.rpd)) + '</b><small>' + (noTel ? 'awaiting telemetry' : 'API requests / day') + '</small></span><span class="stat"><b>' + (nonProd ? c.users : nf.format(c.users)) + '</b><small>' + (nonProd ? 'pilot users' : noTel ? 'registered users' : 'unique users, 30d') + '</small></span></div>' +
      '<div class="tile-foot">' + (c.cross.length ? '<span class="foot-l">Reaches</span>' + crossChips(a) : '<span class="foot-l muted">Stays inside ' + esc(BP[a.home].code) + '</span>') + '</div>' +
      '</button>';
  }
  function crossRow(a, ctxBp, dir) {
    const c = calc(a);
    let via = '';
    if (dir === 'in') {
      const t = c.touch[ctxBp];
      via = Object.keys(t.stages).map((s) => {
        const w = t.stages[s].some((i) => i.mode === 'w');
        return '<span class="via' + (w ? ' w' : '') + '">' + (w ? icon('write') : '') + esc(s === 'Users' ? 'Secondary users' : s.replace('Data inputs', 'Data input').replace('Tools', 'Tool').replace('Outputs', 'Output')) + '</span>';
      }).join('');
    } else {
      via = c.crossWrite.length ? '<span class="via w">' + icon('write') + 'Writes into ' + c.crossWrite.map((x) => esc(BP[x].code)).join(', ') + '</span>' : '<span class="via">Reads only</span>';
    }
    const ctxUsers = a.users.filter((u) => u.bp === ctxBp).reduce((x, u) => x + u.n, 0);
    return '<button type="button" class="xrow" data-agent="' + a.id + '" data-tip="' + esc(a.short) + '">' +
      '<span class="pix sm">' + spriteEl(a, 32) + '</span>' +
      '<span class="x-id"><span class="x-name">' + esc(a.name) + '</span><span class="x-meta">' + archTag(a) + (a.status !== 'production' ? statusPill(a) : '') + '</span></span>' +
      '<span class="x-home"><small>Home</small>' + chip(a.home, { home: true, long: true }) + '</span>' +
      '<span class="x-via"><small>' + (dir === 'in' ? 'Touches ' + esc(BP[ctxBp].code) + ' through' : 'Crossing') + '</small><span class="via-list">' + via + '</span></span>' +
      '<span class="x-targets"><small>All processes it reaches</small><span class="chips">' + crossChips(a) + '</span></span>' +
      '<span class="x-stats"><span><b>' + (hasTel(a) ? compact(c.rpd) : '–') + '</b><small>req / day</small></span><span><b>' + (dir === 'in' ? ctxUsers : c.users) + '</b><small>' + (dir === 'in' ? esc(BP[ctxBp].code) + ' users' : 'users') + '</small></span></span>' +
      '</button>';
  }

  /* ---------------------------------------------------------------- data view: what data exists in a business unit */
  // What we know about a source platform. Datasets inherit these unless their name says otherwise, or the
  // agent spec sets data_type / structure / format on the row. Everything here is inferred, never read from the data.
  const DATA_PLATFORMS = [
    [/^Oracle (Fusion|E-Business|EBS|Cloud ERP|NetSuite)|^NetSuite|^Microsoft Dynamics|^Dynamics 365|^Infor|^Epicor/i, { kind: 'ERP', structure: 'Structured', format: 'Relational tables', iface: 'REST / SOAP API' }],
    [/^Oracle( Database| DB)?$|^SQL Server|^PostgreSQL|^Postgres|^MySQL|^Cloud SQL|^AlloyDB|^Spanner/i, { kind: 'Database', structure: 'Structured', format: 'Relational tables', iface: 'SQL (JDBC)' }],
    [/^Snowflake|^Databricks|^Redshift|^Synapse|^Teradata/i, { kind: 'Data warehouse', structure: 'Structured', format: 'Columnar tables', iface: 'SQL', dtype: 'Analytics' }],
    [/^Cloud Storage|^GCS|^Amazon S3|^S3\b|^Azure (Blob|Data Lake)|^ADLS/i, { kind: 'Object storage', structure: 'Semi-structured', format: 'Files (Parquet, CSV, JSON, PDF)', iface: 'Storage API' }],
    [/^SharePoint|^OneDrive|^Box\b|^Dropbox|^Confluence/i, { kind: 'Documents', structure: 'Unstructured', format: 'Office documents and PDF', iface: 'REST API', dtype: 'Documents' }],
    [/^Microsoft Teams|^Slack/i, { kind: 'Messaging', structure: 'Unstructured', format: 'Chat messages', iface: 'REST API', dtype: 'Communications' }],
    [/^Outlook|^Exchange/i, { kind: 'Email', structure: 'Unstructured', format: 'Email (MIME) + attachments', iface: 'Graph API', dtype: 'Communications', pii: true }],
    [/^Tableau|^Power BI/i, { kind: 'BI', structure: 'Structured', format: 'Workbooks and extracts', iface: 'REST API', dtype: 'Analytics' }],
    [/^Kafka|^Confluent|^Event Hubs|^Kinesis/i, { kind: 'Event stream', structure: 'Semi-structured', format: 'JSON / Avro messages', iface: 'Streaming API', dtype: 'Events' }],
    [/^SAP /, { kind: 'ERP', structure: 'Structured', format: 'Relational tables (SAP HANA)', iface: 'OData / BAPI' }],
    [/^BigQuery ML/, { kind: 'ML model', structure: 'Structured', format: 'Model scores', iface: 'SQL (ML.PREDICT)', dtype: 'Model output' }],
    [/^BigQuery/, { kind: 'Data warehouse', structure: 'Structured', format: 'Columnar tables', iface: 'SQL', dtype: 'Analytics' }],
    [/^Looker/, { kind: 'BI', structure: 'Structured', format: 'Semantic model (LookML)', iface: 'Looker API', dtype: 'Analytics' }],
    [/^Gmail/, { kind: 'Email', structure: 'Unstructured', format: 'Email (MIME) + attachments', iface: 'Gmail API', dtype: 'Communications', pii: true }],
    [/^Google Chat|^B2B portal chat|^Chat answers/, { kind: 'Messaging', structure: 'Unstructured', format: 'Chat messages', iface: 'Chat API', dtype: 'Communications' }],
    [/^Google Docs|^Google Drive/, { kind: 'Documents', structure: 'Unstructured', format: 'Docs and PDF', iface: 'Drive API', dtype: 'Documents' }],
    [/^Google Sheets/, { kind: 'Spreadsheet', structure: 'Semi-structured', format: 'Spreadsheet', iface: 'Sheets API' }],
    [/^Google Calendar/, { kind: 'Calendar', structure: 'Semi-structured', format: 'Calendar events', iface: 'Calendar API', dtype: 'Communications', pii: true }],
    [/^Document AI/, { kind: 'Document parser', structure: 'Unstructured', format: 'PDF and images in, JSON out', iface: 'Document AI API', dtype: 'Documents' }],
    [/^Vertex AI Search/, { kind: 'Search index', structure: 'Unstructured', format: 'Indexed documents (vector + keyword)', iface: 'Search API', dtype: 'Knowledge' }],
    [/^Vertex AI/, { kind: 'ML model', structure: 'Structured', format: 'Model predictions', iface: 'Vertex AI API', dtype: 'Model output' }],
    [/^Pub\/Sub/, { kind: 'Event stream', structure: 'Semi-structured', format: 'JSON messages', iface: 'Pub/Sub', dtype: 'Events' }],
    [/^Salesforce/, { kind: 'CRM', structure: 'Structured', format: 'Objects (records)', iface: 'REST API', pii: true }],
    [/^ServiceNow/, { kind: 'Service management', structure: 'Structured', format: 'Tickets and records', iface: 'REST API' }],
    [/^Jira/, { kind: 'Work tracking', structure: 'Structured', format: 'Issues', iface: 'REST API' }],
    [/^Icertis/, { kind: 'Contract management', structure: 'Semi-structured', format: 'Contract records + PDF', iface: 'REST API', dtype: 'Contracts' }],
    [/^Workiva/, { kind: 'Reporting', structure: 'Semi-structured', format: 'Linked documents and XBRL', iface: 'REST API', dtype: 'Documents' }],
    [/^Veeva/, { kind: 'Regulated documents', structure: 'Semi-structured', format: 'Controlled documents + metadata', iface: 'Vault API', dtype: 'Documents' }],
    [/^BlackLine/, { kind: 'Close and reconciliation', structure: 'Structured', format: 'Records', iface: 'REST API', dtype: 'Financial postings' }],
    [/^Kyriba/, { kind: 'Treasury', structure: 'Semi-structured', format: 'Bank files (BAI2, MT940)', iface: 'REST API / SFTP', dtype: 'Transactions' }],
    [/^Avalara/, { kind: 'Tax engine', structure: 'Structured', format: 'Tax calculations', iface: 'REST API', dtype: 'Reference' }],
    [/^Coupa/, { kind: 'Procurement', structure: 'Structured', format: 'Records', iface: 'REST API' }],
    [/^Workday|^UKG/, { kind: 'HR', structure: 'Structured', format: 'Worker records', iface: 'REST / SOAP API', pii: true }],
    [/^Okta/, { kind: 'Identity', structure: 'Structured', format: 'Users and groups', iface: 'REST API', dtype: 'Master data', pii: true }],
    [/^project44|^Blue Yonder|^Manhattan/, { kind: 'Logistics', structure: 'Semi-structured', format: 'JSON shipment events', iface: 'REST API', dtype: 'Events' }],
    [/MES|^Litmus|meters/i, { kind: 'Plant systems', structure: 'Semi-structured', format: 'Time series (sensor tags)', iface: 'OPC UA / MQTT', dtype: 'Events' }],
    [/LIMS/, { kind: 'Lab', structure: 'Structured', format: 'Samples and test results', iface: 'REST API', dtype: 'Transactions' }],
    [/^Salsify/, { kind: 'Product information', structure: 'Semi-structured', format: 'Product records (JSON)', iface: 'REST API', dtype: 'Master data' }],
    [/^AuditBoard/, { kind: 'Audit and risk', structure: 'Structured', format: 'Controls and findings', iface: 'REST API' }],
    [/^CoStar/, { kind: 'Lease accounting', structure: 'Structured', format: 'Lease records', iface: 'REST API', dtype: 'Contracts' }],
    [/^Circana|^S&P|^Dun|^EcoVadis|^Amazon Ads|^Walmart Connect|^Bazaarvoice|^Regulatory feeds/, { kind: 'Third-party data', structure: 'Semi-structured', format: 'Licensed feed (JSON / CSV)', iface: 'Vendor API', dtype: 'Reference' }],
    [/EDI|remittance/i, { kind: 'EDI', structure: 'Semi-structured', format: 'EDI X12', iface: 'EDI gateway', dtype: 'Transactions' }],
    [/worklist|queue/i, { kind: 'Work queue', structure: 'Structured', format: 'Queue items', iface: 'Pub/Sub / app API', dtype: 'Transactions' }],
    [/transcripts/i, { kind: 'Documents', structure: 'Unstructured', format: 'Text transcripts', iface: 'File drop', dtype: 'Documents' }]
  ];
  const UNKNOWN_PLATFORM = { kind: 'Unclassified', structure: 'Unknown', format: 'Not recorded', iface: 'Not recorded' };
  const platformInfo = (name) => { const hit = DATA_PLATFORMS.find(([re]) => re.test(name)); return hit ? hit[1] : UNKNOWN_PLATFORM; };
  // dataset-level hints from the dataset's own name and description
  const DS_TYPES = [
    [/EDI|\b8(50|12|20)\b/, { dtype: 'Transactions', structure: 'Semi-structured', format: 'EDI X12' }],
    [/BAI2|MT940|bank statement/i, { dtype: 'Transactions', structure: 'Semi-structured', format: 'Bank files (BAI2)' }],
    [/\bPDF\b|remittance advice/i, { structure: 'Unstructured', format: 'PDF documents' }],
    [/notes|memo|commentary|rationale|transcript/i, { dtype: 'Documents', structure: 'Unstructured', format: 'Free text' }],
    [/event log|events\b|event\b/i, { dtype: 'Events' }],
    [/master|accounts\b|catalog|supplier list|vendor list/i, { dtype: 'Master data' }],
    [/\bGL\b|general ledger|journal|trial balance|ledger|clearing|FI\b|posting/i, { dtype: 'Financial postings' }],
    [/policy|policies|procedure|manual|library|knowledge|playbook/i, { dtype: 'Knowledge', structure: 'Unstructured', format: 'Documents' }],
    [/contract|agreement|lease/i, { dtype: 'Contracts' }],
    [/mart|aging|score|forecast|recommend|kpi|variance|accrual|model|trend|signal/i, { dtype: 'Analytics' }],
    [/order|invoice|billing|deliver|payment|receipt|credit memo|claim|case|ticket|hold|promise|shipment|PO\b|purchase/i, { dtype: 'Transactions' }],
    [/rate|price|condition|tax|exemption/i, { dtype: 'Reference' }],
    [/payroll|employee|candidate|worker|people|timesheet/i, { pii: true }]
  ];
  const DTYPE_HINT = {
    'Master data': 'Customers, products, suppliers and other records that change rarely.',
    Transactions: 'Day-to-day business events: orders, invoices, payments, cases.',
    'Financial postings': 'Ledger entries and balances that feed the financial statements.',
    Analytics: 'Derived tables: marts, aggregates, scores, forecasts.',
    Events: 'Time-stamped event logs and streams.',
    Documents: 'Files and free text: PDFs, notes, reports.',
    Knowledge: 'Policies, manuals and indexed content agents search.',
    Communications: 'Email, chat and calendar content.',
    Contracts: 'Contract and lease records, often with the signed document.',
    Reference: 'Rates, prices, tax rules and licensed third-party data.',
    'Model output': 'Scores and predictions produced by a model.',
    Other: 'Not classified yet.'
  };
  const STRUCT_ORDER = ['Structured', 'Semi-structured', 'Unstructured', 'Unknown'];
  function classifyDataset(platform, dataset, whats, rows) {
    const P = platformInfo(platform); const text = dataset + ' ' + whats.join(' ');
    const out = { dtype: P.dtype || 'Transactions', structure: P.structure, format: P.format, iface: P.iface, pii: !!P.pii, inferred: true };
    if (!P.dtype && P.kind === 'Unclassified') out.dtype = 'Other';
    for (const [re, v] of DS_TYPES) if (re.test(text)) { Object.keys(v).forEach((k) => { if (k === 'pii') out.pii = out.pii || v.pii; else if (!out['_' + k]) { out[k] = v[k]; out['_' + k] = 1; } }); }
    // values written in the agent spec win over anything inferred
    const set = rows.find((r) => r.dtype || r.struct || r.fmt);
    if (set) { if (set.dtype) out.dtype = set.dtype; if (set.struct) out.structure = set.struct; if (set.fmt) out.format = set.fmt; out.inferred = false; }
    return out;
  }
  // every dataset that belongs to a business unit, grouped by source platform
  function dataCatalog(bpId) {
    const sys = {};
    AGENTS.filter(lifecycleOk).forEach((a) => {
      const add = (bp, full, what, mode, kind, extra) => {
        if (bp !== bpId) return;
        const plat = platformOf(full).replace(/ API$/, ''); const parts = String(full || '').split(' · ');
        const ds = parts.length > 1 ? parts.slice(1).join(' · ') : (kind === 'tool' ? 'Direct API access' : what || plat);
        const P = sys[plat] || (sys[plat] = { name: plat, info: platformInfo(plat), ds: {}, agents: new Set(), w: new Set() });
        P.agents.add(a.id); if (mode === 'w') P.w.add(a.id);
        const D = P.ds[ds] || (P.ds[ds] = { name: ds, whats: new Set(), tools: new Set(), r: new Set(), w: new Set(), rows: [] });
        if (what) D.whats.add(what); if (kind === 'tool') D.tools.add(extra);
        (mode === 'w' ? D.w : D.r).add(a.id); D.rows.push({ dtype: extra && extra.dtype, struct: extra && extra.struct, fmt: extra && extra.fmt });
      };
      a.inputs.forEach((x) => add(x.bp, x.system, x.what, x.mode, 'in', x));
      a.outputs.forEach((x) => add(x.bp, x.dest, x.what, x.mode, 'out', x));
      a.tools.forEach((x) => add(x.bp, x.system, '', x.mode, 'tool', x.name));
    });
    (SRC.raw.datasets || []).forEach((x) => {
      if (!x || x.process !== bpId || !x.platform || !x.name) return;
      const plat = String(x.platform); const P = sys[plat] || (sys[plat] = { name: plat, info: platformInfo(plat), ds: {}, agents: new Set(), w: new Set() });
      const D = P.ds[x.name] || (P.ds[x.name] = { name: String(x.name), whats: new Set(), tools: new Set(), r: new Set(), w: new Set(), rows: [] });
      if (x.holds) D.whats.add(String(x.holds)); D.rows.push({ dtype: str(x.data_type), struct: str(x.structure), fmt: str(x.format) }); D.owner = str(x.owner); D.registered = true;
    });
    return Object.values(sys).map((P) => {
      P.list = Object.values(P.ds).map((D) => { const c = classifyDataset(P.name, D.name, Array.from(D.whats), D.rows); return Object.assign(D, c); })
        .sort((x, y) => STRUCT_ORDER.indexOf(x.structure) - STRUCT_ORDER.indexOf(y.structure) || x.name.localeCompare(y.name));
      P.structs = STRUCT_ORDER.filter((s) => P.list.some((d) => d.structure === s));
      P.pii = P.list.some((d) => d.pii);
      return P;
    }).sort((x, y) => y.agents.size - x.agents.size || y.list.length - x.list.length || x.name.localeCompare(y.name));
  }
  const structTag = (s) => '<span class="st st-' + s.toLowerCase().replace(/[^a-z]/g, '') + '" title="' + esc(s) + '">' + esc(s) + '</span>';

  function dataSection(b, toggle) {
    const cat = dataCatalog(b.id);
    const q = state.dq.trim().toLowerCase(); const sf = state.dStruct;
    const match = (P) => (!q || (P.name + ' ' + P.info.kind + ' ' + P.list.map((d) => d.name + ' ' + Array.from(d.whats).join(' ') + ' ' + d.dtype + ' ' + d.format).join(' ')).toLowerCase().includes(q)) && (sf === 'all' || P.structs.includes(sf));
    const shown = cat.filter(match);
    const nds = cat.reduce((x, P) => x + P.list.length, 0);
    const counts = {}; cat.forEach((P) => P.list.forEach((d) => { counts[d.structure] = (counts[d.structure] || 0) + 1; }));
    // a just-registered system may arrive a moment after the save, so the selection is kept until it does
    let h = '<section class="sec" aria-labelledby="sec-agents"><div class="sec-h"><h2 id="sec-agents">Data in ' + esc(b.name) + ' <span class="count">' + cat.length + '</span>' + addDataBtn(b.id) + '</h2>' + toggle + '</div>' +
      '<div class="toolbar trow"><label class="search-in">' + icon('search') + '<span class="sr">Filter data</span><input id="dq" type="search" placeholder="Filter by system, dataset or format" value="' + esc(state.dq) + '"></label></div>';
    h += '<p class="sec-sub">' + cat.length + ' source ' + plural(cat.length, 'system') + ' hold ' + nds + ' ' + plural(nds, 'dataset') + ' that agents read or write in ' + esc(b.name) + '. Select a system to see its datasets. Nothing here shows the data itself; type, structure and format are inferred from the system unless the agent spec records them.</p>';
    h += '<div class="filters"><div class="seg sm" role="group" aria-label="Structure">' + [['all', 'All structures', nds]].concat(STRUCT_ORDER.filter((s) => counts[s]).map((s) => [s, s, counts[s]])).map(([k, l, n]) =>
      '<button type="button" class="seg-btn' + (sf === k ? ' on' : '') + '" data-dstruct="' + esc(k) + '" aria-pressed="' + (sf === k) + '">' + esc(l) + ' <span class="seg-n">' + n + '</span></button>').join('') + '</div></div>';
    if (!shown.length) return h + '<div class="empty">' + (cat.length ? 'No systems match these filters.' : 'No agent reads or writes data in ' + esc(b.name) + ' yet.') + '</div></section>';
    h += '<div class="grid dgrid ' + state.density + '">' + shown.map((P) => {
      const on = state.dataSys === P.name; const kinds = Array.from(new Set(P.list.map((d) => d.dtype)));
      return '<button type="button" class="tile dtile' + (on ? ' on' : '') + '" data-dsys="' + esc(P.name) + '" aria-expanded="' + on + '" aria-controls="dpanel">' +
        '<span class="tile-step">' + esc(P.info.kind) + '</span>' +
        '<div class="tile-top"><span class="dmark">' + esc(sysAbbr(P.name)) + '</span><span class="tile-id"><span class="tile-name">' + esc(P.name) + '</span><span class="tile-meta">' + P.structs.map(structTag).join('') + '</span></span></div>' +
        '<div class="tile-stats"><span class="stat"><b>' + P.list.length + '</b><small>' + plural(P.list.length, 'dataset') + '</small></span><span class="stat"><b>' + P.agents.size + '</b><small>' + plural(P.agents.size, 'agent uses', 'agents use') + ' it</small></span></div>' +
        '<div class="tile-foot"><span class="dkinds">' + kinds.slice(0, 3).map((k) => '<span class="dk">' + esc(k) + '</span>').join('') + (kinds.length > 3 ? '<span class="dk more">+' + (kinds.length - 3) + '</span>' : '') + '</span>' +
          (P.w.size ? '<span class="dw">' + icon('write', 'mini') + P.w.size + ' ' + plural(P.w.size, 'writer') + '</span>' : '') + (P.pii ? '<span class="dpii" title="Likely holds personal data">Personal data</span>' : '') + '</div></button>';
    }).join('') + '</div>';
    const P = shown.find((x) => x.name === state.dataSys);
    if (P) {
      h += '<div class="dpanel" id="dpanel" role="region" aria-label="' + esc(P.name + ' datasets') + '"><div class="dpanel-h"><div><span class="dmark lg">' + esc(sysAbbr(P.name)) + '</span></div><div class="dpanel-t"><h3>' + esc(P.name) + '</h3><p>' + (P.info.kind === 'Unclassified' ? 'System not classified yet; the console has no profile for it. ' : esc(P.info.kind) + ' system. Accessed through ' + esc(P.info.iface) + '. ') + P.list.length + ' ' + plural(P.list.length, 'dataset') + ' used by ' + P.agents.size + ' ' + plural(P.agents.size, 'agent') + (P.w.size ? ', ' + P.w.size + ' of which ' + plural(P.w.size, 'writes', 'write') + ' to it' : '') + '.</p></div>' +
        '<button type="button" class="btn" data-dsys="' + esc(P.name) + '">' + icon('close') + 'Close</button></div>' +
        '<div class="tbl-wrap"><table class="tbl dtbl"><colgroup><col style="width:24%"><col style="width:30%"><col style="width:17%"><col style="width:20%"><col style="width:9%"></colgroup><thead><tr><th>Dataset</th><th>What it holds</th><th>Type of data</th><th>Structure and format</th><th class="num">Agents</th></tr></thead><tbody>' +
        P.list.map((d) => { const users = Array.from(new Set([...d.r, ...d.w])).map((id) => AG[id]).filter(Boolean);
          return '<tr><td><b>' + esc(d.name) + '</b>' + (d.registered ? '<div class="dsub"><span class="dreg">Registered' + (d.owner ? ', owner ' + esc(d.owner) : '') + '</span></div>' : '') + (d.tools.size ? '<div class="dsub">' + Array.from(d.tools).map((t) => '<code>' + esc(t) + '</code>').join(' ') + '</div>' : '') + '</td>' +
            '<td>' + (d.whats.size ? Array.from(d.whats).map(esc).join('<br>') : '<span class="muted">Reached through tools only</span>') + '</td>' +
            '<td><span class="dk" data-tt="' + esc(DTYPE_HINT[d.dtype] || '') + '">' + esc(d.dtype) + '</span>' + (d.pii ? '<div class="dsub"><span class="dpii">Personal data</span></div>' : '') + '</td>' +
            '<td>' + structTag(d.structure) + '<div class="dfmt">' + esc(d.format) + (d.inferred ? ' <span class="muted">(inferred)</span>' : '') + '</div></td>' +
            '<td class="num"><span class="dag" data-tt="' + esc(users.map((a) => a.name + (d.w.has(a.id) ? ' (writes)' : ' (reads)')).join('\n')) + '">' + users.length + (d.w.size ? ' <span class="warn-t">' + icon('write', 'mini') + d.w.size + '</span>' : '') + '</span></td></tr>'; }).join('') +
        '</tbody></table></div><p class="dnote">Type, structure and format are inferred from the system and dataset name unless the agent spec sets <code>data_type</code>, <code>structure</code> or <code>format</code> on the row. Confirm with the data owner before relying on them.</p></div>';
    }
    return h + '</section>';
  }

  /* ---------------------------------------------------------------- add data: register a data source for a unit */
  // Saved to datasets/{dataset_id}. Describes the data (system, what it holds, type, structure, format, owner); never the data itself.
  const DFORM = { open: false, bp: null, d: null, errors: {}, saving: false, msg: '', last: null };
  const DTYPES = Object.keys(DTYPE_HINT).filter((k) => k !== 'Other');
  function addDataBtn(bpId) {
    if (writeOk()) return '<button type="button" class="btn primary add-btn" data-adddata="' + esc(bpId) + '">' + icon('plus') + 'Add data</button>';
    const why = SRC.mode === 'live' ? 'Your access to this registry is view-only.' : 'Adding data needs the live registry. This view is showing a read-only snapshot.';
    return '<button type="button" class="btn primary add-btn" disabled data-tt="' + esc(why) + '">' + icon('plus') + 'Add data</button>';
  }
  function openDataForm(bpId) {
    DFORM.open = true; DFORM.bp = bpId; DFORM.errors = {}; DFORM.saving = false; DFORM.msg = ''; DFORM.last = document.activeElement;
    DFORM.d = { platform: '', name: '', holds: '', data_type: 'Transactions', structure: 'Structured', format: '', owner: '' };
    renderDataForm(); const f = $('#dfield-platform'); if (f) f.focus();
  }
  function closeDataForm() { DFORM.open = false; $('#dform').hidden = true; $('#dform').innerHTML = ''; document.body.classList.remove('modal-open'); if (DFORM.last && document.body.contains(DFORM.last)) DFORM.last.focus(); }
  function renderDataForm() {
    const el = $('#dform'); if (!DFORM.open) { el.hidden = true; return; }
    const d = DFORM.d, E = DFORM.errors, b = BP[DFORM.bp];
    const known = Array.from(new Set(AGENTS.reduce((x, a) => x.concat(a.inputs.map((i) => platformOf(i.system)), a.outputs.map((o) => platformOf(o.dest)), a.tools.map((t) => platformOf(t.system))), []))).sort();
    const fld = (k, label, input, help, req) => '<div class="fld' + (E[k] ? ' has-err' : '') + '"><label for="dfield-' + k + '">' + esc(label) + (req ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</label>' + input + (help ? '<p class="f-help">' + esc(help) + '</p>' : '') + (E[k] ? '<p class="err" id="derr-' + k + '">' + esc(E[k]) + '</p>' : '') + '</div>';
    const inp = (k, ph, extra) => '<input id="dfield-' + k + '" data-dk="' + k + '" value="' + esc(d[k]) + '" placeholder="' + esc(ph) + '"' + (E[k] ? ' aria-invalid="true" aria-describedby="derr-' + k + '"' : '') + (extra || '') + '>';
    const sel = (k, opts) => '<select id="dfield-' + k + '" data-dk="' + k + '">' + opts.map((o) => '<option' + (d[k] === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    el.innerHTML = '<div class="m-card dcard" role="document"><header class="f-head"><div><div class="eyebrow">Adding to ' + chip(b.id, { home: true, long: true }) + '</div><h2 id="df-title">Register a data source</h2><p class="f-help">Describe the data that exists in ' + esc(b.name) + '. Nothing is connected or copied; this only records what the data is.</p></div>' +
      '<button type="button" class="btn icon-only" id="df-close" aria-label="Close">' + icon('close') + '</button></header>' +
      '<div class="df-body"><datalist id="dplat">' + known.map((k) => '<option value="' + esc(k) + '">').join('') + '</datalist>' +
      '<div class="grid2">' + fld('platform', 'Source system', inp('platform', 'SAP S/4HANA', ' list="dplat" autocomplete="off"'), 'Pick an existing system or type a new one.', true) + fld('name', 'Dataset', inp('name', 'Billing documents'), 'The table, folder, object or feed.', true) + '</div>' +
      fld('holds', 'What it holds', inp('holds', 'Billed and unbilled deliveries'), '', false) +
      '<div class="grid3">' + fld('data_type', 'Type of data', sel('data_type', DTYPES), DTYPE_HINT[d.data_type] || '', true) + fld('structure', 'Structure', sel('structure', ['Structured', 'Semi-structured', 'Unstructured']), '', true) + fld('format', 'Format', inp('format', platformInfo(d.platform).format !== 'Not recorded' ? platformInfo(d.platform).format : 'Relational tables, JSON, PDF…'), '', false) + '</div>' +
      fld('owner', 'Data owner', inp('owner', 'Full name or team'), 'Who answers questions about this data.', false) + '</div>' +
      '<footer class="f-foot"><span class="f-msg" role="status">' + esc(DFORM.msg) + '</span><div class="f-actions"><button type="button" class="btn" id="df-cancel">Cancel</button><button type="button" class="btn primary" id="df-save"' + (DFORM.saving ? ' disabled' : '') + '>' + (DFORM.saving ? 'Saving…' : 'Add data') + '</button></div></footer></div>';
    el.setAttribute('aria-labelledby', 'df-title'); el.hidden = false; document.body.classList.add('modal-open');
  }
  async function saveDataForm() {
    const d = DFORM.d; const t = (s) => String(s || '').trim(); const E = {};
    if (!t(d.platform)) E.platform = 'Name the system the data lives in.';
    if (!t(d.name)) E.name = 'Name the dataset.';
    DFORM.errors = E; if (Object.keys(E).length) { renderDataForm(); const f = $('#dfield-' + Object.keys(E)[0]); if (f) f.focus(); return; }
    if (!writeOk()) { DFORM.msg = 'This view can’t save to the live registry.'; return renderDataForm(); }
    const slug = (s) => t(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = (DFORM.bp + '-' + slug(d.platform) + '-' + slug(d.name)).slice(0, 120);
    const doc = { schema_version: 1, dataset_id: id, process: DFORM.bp, platform: t(d.platform), name: t(d.name), holds: t(d.holds), data_type: d.data_type, structure: d.structure, format: t(d.format) || platformInfo(t(d.platform)).format, owner: t(d.owner), created_at: new Date().toISOString().slice(0, 10), created_by: SRC.userId || null };
    DFORM.saving = true; renderDataForm();
    try {
      await writeWithRetry(() => SRC.db.collection('datasets').doc(id).set(doc));
      closeDataForm(); toast(doc.name + ' was added to ' + BP[doc.process].name + '.');
      state.dataSys = doc.platform; render();
    } catch (e) { DFORM.saving = false; DFORM.msg = e && e.code === 'invalid_argument' ? 'The registry refused the save. Your access may be view-only, or a field is too long.' : 'Couldn’t save. Check the connection and try again.'; renderDataForm(); }
  }

  /* ---------------------------------------------------------------- identity: Google Cloud Identity */
  // People come from the Google Cloud Identity / Workspace directory (Admin SDK Directory API: primaryEmail, name,
  // orgUnitPath, organizations[].title and department). Until the directory sync runs, these are sample records.
  const IDENTITY = { source: 'Google Cloud Identity', domain: 'meridianbrands.example', synced: false };
  const personEmail = (f) => f.name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.') + '@' + IDENTITY.domain;
  const personOu = (f) => '/' + BP[f.bp].name + '/' + f.role;

  /* ---------------------------------------------------------------- user view: who uses agents, how much */
  // The registry records user groups per agent (process, role, head count), not people. Until per-user telemetry
  // (Cloud Logging with the caller's identity) is joined in, people are generated from those groups as sample data:
  // one pool per process + role, shared by every agent that lists the group, so a person is counted once.
  // Interactions and tokens are the agent's real 30-day invocations and tokens, split across its user groups.
  const FIRST = ['Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Isla', 'Mateo', 'Priya', 'Omar', 'Lena', 'Kai', 'Sofia', 'Jonah', 'Amara', 'Lucas', 'Nina', 'Ravi', 'Elena', 'Theo', 'Hana', 'Diego', 'Maya', 'Felix', 'Ines', 'Jamal', 'Clara', 'Arjun', 'Grace', 'Tomas', 'Leila', 'Owen', 'Yuki', 'Marco', 'Anya', 'Samir', 'Rosa', 'Ben', 'Ivy', 'Kofi', 'Julia', 'Hugo', 'Nora', 'Dev', 'Alma', 'Reza', 'Lucy', 'Emil', 'Tara', 'Victor'];
  const LAST = ['Okafor', 'Lindqvist', 'Haddad', 'Moreau', 'Tanaka', 'Silva', 'Novak', 'Brennan', 'Iyer', 'Kowalski', 'Mensah', 'Fischer', 'Alvarez', 'Chen', 'Duarte', 'Patel', 'Rossi', 'Nguyen', 'Kaur', 'Schmidt', 'Abara', 'Larsen', 'Costa', 'Yilmaz', 'Walsh', 'Hoffman', 'Romero', 'Sato', 'Bakker', 'Osei', 'Petrov', 'Dubois', 'Marsh', 'Quinn', 'Varga', 'Ahmed', 'Keller', 'Ortiz', 'Byrne', 'Nakamura'];
  // share of an agent's runs that a person starts or acts on, by type (estimate until telemetry carries the caller)
  const USER_SHARE = { conversational: 1, analytical: 0.6, monitoring: 0.15, automation: 0.08 };
  let PEOPLE = null; let PEOPLE_KEY = '';
  function peopleModel() {
    const key = state.lifecycle + '|' + AGENTS.length; if (PEOPLE && PEOPLE_KEY === key) return PEOPLE;
    const pools = {};
    AGENTS.filter(lifecycleOk).forEach((a) => a.users.forEach((g) => { if (g.n > 0) { const k = g.bp + '|' + g.role; const p = pools[k] || (pools[k] = { bp: g.bp, role: g.role, n: 0, agents: [] }); p.n = Math.max(p.n, g.n); p.agents.push({ a, n: g.n }); } }));
    const people = [];
    // sample names must not collide with real names already in the registry (process and agent owners)
    const taken = new Set(BPS.map((b) => b.owner).concat(AGENTS.map((a) => a.owner)).filter(Boolean));
    Object.keys(pools).sort().forEach((k) => {
      const P = pools[k]; const r = rng(hash(k));
      const folks = Array.from({ length: P.n }, (_, i) => {
        const h = hash(k + '#' + i);
        let name = FIRST[h % FIRST.length] + ' ' + LAST[(h >>> 7) % LAST.length]; for (let j = 1; taken.has(name) && j < 9; j++) name = FIRST[h % FIRST.length] + ' ' + LAST[((h >>> 7) + j * 11) % LAST.length];
        return { id: 'u' + (h >>> 0).toString(36), name, bp: P.bp, role: P.role, w: Math.pow(0.6 + r() * 2.4, 2.2), uses: {}, inter: 0, tin: 0, tout: 0, cost: 0, last: 0 };
      });
      P.agents.forEach(({ a, n }) => {
        if (!hasTel(a)) return; const c = calc(a); const u = a.use;
        const tot = a.users.reduce((x, g) => x + g.n, 0) || 1;
        const inter = u.inv * (USER_SHARE[a.arch] || 0.1) * (n / tot);
        const who = folks.slice(0, n); const ws = who.reduce((x, f) => x + f.w, 0) || 1;
        const perInv = u.inv ? 1 / u.inv : 0;
        who.forEach((f, i) => {
          const v = inter * (f.w / ws); if (v < 0.5) return;
          const tin = c.tokIn * perInv * v, tout = c.tokOut * perInv * v;
          f.uses[a.id] = { inter: v, tin, tout, cost: c.total * perInv * v };
          f.inter += v; f.tin += tin; f.tout += tout; f.cost += c.total * perInv * v;
          f.last = Math.max(f.last, DAYS.length - 1 - (hash(f.id + a.id) % Math.max(1, Math.round(6 / (1 + v / 40)))));
        });
      });
      folks.forEach((f) => { if (f.inter >= 0.5) people.push(f); });
    });
    people.sort((x, y) => y.inter - x.inter);
    PEOPLE = people; PEOPLE_KEY = key; return people;
  }
  function personSeries(f) {
    // daily interactions: the person's share of each agent's daily requests
    return DAYS.map((_, i) => Object.keys(f.uses).reduce((x, id) => { const c = calc(AG[id]); return x + (c.req30 ? (c.series[i] || 0) / c.req30 * f.uses[id].inter : 0); }, 0));
  }

  function userSection(b, toggle) {
    const all = peopleModel();
    const scopeBu = state.uScope !== 'all';
    // in a unit: people who use at least one agent homed here, counting only those agents
    const rows = (scopeBu ? all.map((f) => { const ids = Object.keys(f.uses).filter((id) => AG[id].home === b.id); if (!ids.length) return null; const pick = (k) => ids.reduce((x, id) => x + f.uses[id][k], 0); return { f, ids, inter: pick('inter'), tin: pick('tin'), tout: pick('tout'), cost: pick('cost') }; }).filter(Boolean)
      : all.map((f) => ({ f, ids: Object.keys(f.uses), inter: f.inter, tin: f.tin, tout: f.tout, cost: f.cost }))).sort((x, y) => y.inter - x.inter);
    const q = state.uq.trim().toLowerCase();
    const shown = rows.filter((r) => !q || (r.f.name + ' ' + r.f.role + ' ' + BP[r.f.bp].name + ' ' + BP[r.f.bp].code).toLowerCase().includes(q));
    const sum = (k) => rows.reduce((x, r) => x + r[k], 0);
    const inter = sum('inter'), tok = sum('tin') + sum('tout');
    const top = rows.slice(0, Math.max(1, Math.ceil(rows.length * 0.1))).reduce((x, r) => x + r.inter, 0);
    const topShare = inter ? Math.round((top / inter) * 100) : 0;
    const byRole = {}; rows.forEach((r) => { const k = r.f.role + '|' + r.f.bp; (byRole[k] = byRole[k] || { role: r.f.role, bp: r.f.bp, n: 0, v: 0 }); byRole[k].n++; byRole[k].v += r.inter; });
    const roles = Object.values(byRole).sort((x, y) => y.v - x.v).slice(0, 8); const maxR = Math.max(1, ...roles.map((x) => x.v));
    const byBu = {}; rows.forEach((r) => { byBu[r.f.bp] = (byBu[r.f.bp] || 0) + r.inter; });
    const fromOther = scopeBu ? rows.filter((r) => r.f.bp !== b.id).length : 0;
    const lead = rows.length ? (scopeBu ? nf.format(rows.length) + ' people used ' + b.name + ' agents in the last 30 days' + (fromOther ? ', ' + nf.format(fromOther) + ' of them from other units' : '') : nf.format(rows.length) + ' people across the enterprise used an agent in the last 30 days') +
      ', about ' + nf.format(roundTo(inter)) + ' interactions and ' + compact(tok) + ' tokens. The busiest tenth of them account for ' + topShare + '% of interactions.' : 'Nobody has used these agents in the last 30 days.';

    let h = '<section class="sec" aria-labelledby="sec-agents"><div class="sec-h"><h2 id="sec-agents">' + (scopeBu ? 'People using ' + esc(b.name) + ' agents' : 'People using agents, enterprise-wide') + ' <span class="count">' + nf.format(rows.length) + '</span></h2>' + toggle + '</div>' +
      '<div class="toolbar trow"><label class="search-in">' + icon('search') + '<span class="sr">Filter people</span><input id="uq" type="search" placeholder="Filter by name, role or unit" value="' + esc(state.uq) + '"></label>' +
      '<div class="seg sm" role="group" aria-label="Scope">' + [['bu', 'This unit’s agents'], ['all', 'All agents']].map(([k, l]) => '<button type="button" class="seg-btn' + ((scopeBu ? 'bu' : 'all') === k ? ' on' : '') + '" data-uscope="' + k + '" aria-pressed="' + ((scopeBu ? 'bu' : 'all') === k) + '">' + l + '</button>').join('') + '</div></div>';
    h += '<p class="lead ulead">' + esc(lead) + '</p>';
    h += '<p class="sec-sub">People come from ' + IDENTITY.source + '. ' + (IDENTITY.synced ? '' : 'Until the directory sync runs these are sample people generated from each agent\u2019s registered user groups, with the agent\u2019s real 30-day interactions and tokens split across them. ') + 'Per-person figures become exact once Cloud Logging records who called each agent.</p>';
    if (!rows.length) return h + '</section>';
    h += '<div class="ustats">' +
      '<div><b>' + nf.format(rows.length) + '</b><span>people</span></div>' +
      '<div><b>' + compact(inter) + '</b><span>interactions, 30 days</span></div>' +
      '<div><b>' + compact(tok) + '</b><span>tokens, 30 days</span></div>' +
      '<div><b>' + nf.format(Math.round(inter / rows.length)) + '</b><span>interactions per person</span></div>' +
      '<div><b>' + topShare + '%</b><span>of interactions from the top 10%</span></div></div>';
    h += '<div class="two ucharts"><div><h3 class="h3">Most active roles</h3><ul class="ubars-r">' + roles.map((x) => '<li><span class="ur-l">' + esc(x.role) + ' <span class="muted">' + esc(BP[x.bp].code) + ', ' + x.n + '</span></span><span class="ub-t"><i style="width:' + Math.max(1, (x.v / maxR) * 100).toFixed(1) + '%"></i></span><span class="ub-v">' + compact(x.v) + '</span></li>').join('') + '</ul></div>' +
      '<div><h3 class="h3">' + (scopeBu ? 'Where these people sit' : 'Interactions by unit') + '</h3><ul class="ubars-r">' + Object.entries(byBu).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([id, v], i, arr) => '<li><span class="ur-l">' + chip(id) + ' ' + esc(BP[id].name) + '</span><span class="ub-t"><i style="width:' + Math.max(1, (v / arr[0][1]) * 100).toFixed(1) + '%"></i></span><span class="ub-v">' + compact(v) + '</span></li>').join('') + '</ul></div></div>';
    const lim = state.uLimit;
    h += '<div class="tbl-wrap"><table class="tbl utbl"><thead><tr><th class="num">#</th><th>Person</th><th>Role</th><th>Unit</th><th class="num">Agents</th><th class="num">Interactions, 30d</th><th class="num">Tokens, 30d</th><th>Last active</th></tr></thead><tbody>' +
      shown.slice(0, lim).map((r) => { const on = state.uSel === r.f.id; const rank = rows.indexOf(r) + 1;
        let row = '<tr class="click' + (on ? ' on' : '') + '" data-user="' + r.f.id + '" tabindex="0" aria-expanded="' + on + '"><td class="num muted">' + rank + '</td><td><span class="uav">' + esc(r.f.name.split(' ').map((x) => x[0]).join('')) + '</span><b>' + esc(r.f.name) + '</b><span class="uem">' + esc(personEmail(r.f)) + '</span></td><td>' + esc(r.f.role) + '</td><td>' + chip(r.f.bp) + '</td><td class="num">' + r.ids.length + '</td><td class="num">' + nf.format(Math.round(r.inter)) + '</td><td class="num">' + compact(r.tin + r.tout) + '</td><td>' + esc(DAYS[r.f.last] ? DAYS[r.f.last].toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '–') + '</td></tr>';
        if (on) row += '<tr class="udet"><td colspan="8">' + userDetail(r) + '</td></tr>';
        return row; }).join('') + '</tbody></table></div>';
    if (shown.length > lim) h += '<div class="umore"><button type="button" class="btn" data-umore>Show 50 more</button><span class="muted">Showing ' + lim + ' of ' + nf.format(shown.length) + '</span></div>';
    else if (!shown.length) h += '<div class="empty">Nobody matches that filter.</div>';
    return h + '</section>';
  }
  function userDetail(r) {
    const f = r.f; const ser = personSeries(f); const mx = Math.max(1, ...ser); const W = 320, H = 48;
    const pts = ser.map((v, i) => (i / (ser.length - 1) * W).toFixed(1) + ',' + (H - 4 - (v / mx) * (H - 10)).toFixed(1)).join(' ');
    const ids = r.ids.slice().sort((x, y) => f.uses[y].inter - f.uses[x].inter);
    return '<div class="ud"><div class="ud-h"><div><b>' + esc(f.name) + '</b><span class="muted">' + esc(f.role) + ', ' + esc(BP[f.bp].name) + '</span><span class="uid">' + esc(personEmail(f)) + ' / ' + esc(personOu(f)) + ' / ' + esc(IDENTITY.source) + (IDENTITY.synced ? '' : ' (sample)') + '</span></div>' +
      '<div class="ud-k"><span><b>' + nf.format(Math.round(r.inter)) + '</b> interactions</span><span><b>' + compact(r.tin) + '</b> tokens in</span><span><b>' + compact(r.tout) + '</b> tokens out</span><span><b>' + money(r.cost, 2) + '</b> est. cost</span></div>' +
      '<svg class="ud-sp" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-label="Daily interactions, last 30 days"><polyline points="' + pts + '"/></svg></div>' +
      '<table class="tbl ud-t"><thead><tr><th>Agent</th><th>Type</th><th class="num">Interactions</th><th class="num">Tokens in</th><th class="num">Tokens out</th><th class="num">Est. cost</th><th>Share</th></tr></thead><tbody>' +
      ids.map((id) => { const a = AG[id], u = f.uses[id]; return '<tr><td><button type="button" class="ud-a" data-agent="' + esc(id) + '">' + esc(a.name) + '</button> ' + chip(a.home) + '</td><td>' + esc(ARCH[a.arch].label) + '</td><td class="num">' + nf.format(Math.round(u.inter)) + '</td><td class="num">' + compact(u.tin) + '</td><td class="num">' + compact(u.tout) + '</td><td class="num">' + money(u.cost, 2) + '</td><td><span class="ub-t"><i style="width:' + ((u.inter / r.inter) * 100).toFixed(1) + '%"></i></span></td></tr>'; }).join('') +
      '</tbody></table><p class="dnote">Costs use illustrative list prices. Sample person; figures are this person’s estimated share of each agent’s real usage.</p></div>';
  }

  function renderBP() {
    const b = BP[state.bp];
    const homeAll = AGENTS.filter((a) => a.home === b.id && lifecycleOk(a));
    const prodHome = homeAll.filter((a) => a.status === 'production');
    const inbound = AGENTS.filter((a) => a.home !== b.id && lifecycleOk(a) && calc(a).touch[b.id]);
    const outbound = homeAll.filter((a) => calc(a).cross.length);
    const sumP = (f) => prodHome.reduce((x, a) => x + f(calc(a)), 0);
    if (state.step && !b.subs.includes(state.step)) state.step = null;
    // an agent with no step spans every step, so it shows under each one
    const inStep = (a, st) => !st || !a.sub || a.sub === st;
    const stepAll = homeAll.filter((a) => inStep(a, state.step));
    const archCounts = {}; stepAll.forEach((a) => { archCounts[a.arch] = (archCounts[a.arch] || 0) + 1; });
    let list = sortAgents(stepAll.filter((a) => (state.arch === 'all' || a.arch === state.arch) && matchesQ(a)));
    const lifeWord = state.lifecycle === 'all' ? '' : STATUS[state.lifecycle].toLowerCase() + ' ';
    const inWrites = inbound.filter((a) => calc(a).touch[b.id].write).length;

    let h = '';
    if (!b.featured) h += '<div class="notice">' + icon('info') + '<span>Sample placeholders. This process hasn\u2019t been detailed yet, so its agents use generated specs and telemetry. Order-to-Cash and Record-to-Report are the fully worked examples.</span></div>';
    const pAll = AGENTS.filter((a) => a.home === b.id && a.status === 'production');
    const pTel = pAll.filter(hasTel);
    const pIn = AGENTS.filter((a) => a.home !== b.id && a.status === 'production' && calc(a).touch[b.id]);
    const pInW = pIn.filter((a) => calc(a).touch[b.id].write).length;
    const pOut = pAll.filter((a) => calc(a).cross.length).length;
    const sumT = (f) => pTel.reduce((x, a) => x + f(calc(a)), 0);
    const rpd = sumT((c) => c.rpd), users = pAll.reduce((x, a) => x + calc(a).users, 0), spend = sumT((c) => c.total);
    let lead;
    if (!pAll.length) lead = 'No agents in production call ' + b.name + ' home yet.' + (pIn.length ? ' ' + cap(word(pIn.length)) + ' ' + plural(pIn.length, 'agent') + ' from other processes ' + plural(pIn.length, 'touches', 'touch') + ' it' + (pInW ? ', and ' + word(pInW) + ' ' + plural(pInW, 'writes', 'write') + ' into it.' : '.') : '');
    else {
      lead = cap(word(pAll.length)) + ' ' + plural(pAll.length, 'agent') + ' in production ' + plural(pAll.length, 'serves', 'serve') + ' ' + b.name + (pTel.length ? ', handling about ' + nf.format(roundTo(rpd)) + ' API requests a day for ' + nf.format(users) + ' people at an estimated ' + money(Math.round(spend)) + ' over the last 30 days.' : '.');
      lead += ' ' + (pOut === pAll.length ? (pAll.length === 1 ? 'It reaches' : 'All of them reach') : pOut ? cap(word(pOut)) + ' of them ' + plural(pOut, 'reaches', 'reach') : 'None of them reach') + ' into other processes';
      lead += pIn.length ? ', and ' + word(pIn.length) + ' ' + plural(pIn.length, 'agent') + ' from other processes ' + plural(pIn.length, 'touches', 'touch') + ' ' + b.name + (pInW ? '; ' + word(pInW) + ' of them ' + plural(pInW, 'writes', 'write') + ' into it.' : '.') : '.';
    }
    const issues = pAll.filter((a) => a.health === 'degraded' || a.health === 'incident').sort((x, y) => (x.health === 'incident' ? -1 : 1));
    // sparkline: total daily API requests across this process's agents
    let spark = '';
    if (pTel.length) {
      const days = DAYS.length; const tot = Array.from({ length: days }, (_, i) => pTel.reduce((x, a) => x + (calc(a).series[i] || 0), 0));
      const first = tot.slice(0, 7).reduce((x, y) => x + y, 0) / 7, last = tot.slice(-7).reduce((x, y) => x + y, 0) / 7;
      const chg = first ? Math.round(((last - first) / first) * 100) : 0;
      const mx = Math.max.apply(null, tot) || 1; const W = 280, H = 56;
      const pts = tot.map((v, i) => (i / (days - 1) * W).toFixed(1) + ',' + (H - 4 - (v / mx) * (H - 8)).toFixed(1));
      spark = '<div class="spark-r"><div class="spark-v">' + compact(rpd) + '</div><div class="spark-l">API requests a day, 30-day average</div>' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><line class="sb" x1="0" x2="' + W + '" y1="' + (H - 0.5) + '" y2="' + (H - 0.5) + '"/><polyline class="sl" points="' + pts.join(' ') + '"/><circle class="sd" cx="' + W + '" cy="' + pts[pts.length - 1].split(',')[1] + '" r="3"/></svg>' +
        '<div class="spark-c">' + (Math.abs(chg) < 2 ? 'Flat' : (chg > 0 ? 'Up ' : 'Down ') + Math.abs(chg) + '%') + ' from the first week to the last week</div></div>';
    }
    // agent count for this process, always shown; non-production agents only when the lifecycle filter includes them
    const pOther = homeAll.length - prodHome.length;
    spark = '<aside class="spark" aria-label="' + esc(b.name) + ' at a glance">' + spark +
      '<div class="' + (spark ? 'spark-n' : '') + '"><div class="spark-v">' + pAll.length + '</div><div class="spark-l">' + plural(pAll.length, 'agent') + ' in production, homed in ' + esc(b.code) + '</div>' +
      (pOther > 0 ? '<div class="spark-c">Plus ' + pOther + ' in review or draft</div>' : '') +
      (pIn.length ? '<div class="spark-c">' + pIn.length + ' more from other processes reach in</div>' : '') + '</div></aside>';
    h += '<header class="bp-head">' +
      '<h1>' + esc(b.name) + '</h1>' +
      '<p class="owner">' + esc(((TIERS[b.tier] && TIERS[b.tier].name) || '') + ' process') + ', owned by ' + esc(b.owner) + ', ' + esc(b.ownerTitle) + '.</p>' +
      '<p class="p-sum">' + esc(b.summary) + '</p>' +
      '<p class="lead">' + esc(lead) + '</p>' +
      (issues.length ? '<ul class="attn">' + issues.map((a) => '<li class="' + a.health + '">' + icon(a.health) + '<span><button type="button" data-agent="' + esc(a.id) + '">' + esc(a.name) + '</button> ' + (a.health === 'incident' ? 'has an incident' : 'is degraded') + '. ' + esc(a.healthNote.split('. ')[0].replace(/\.$/, '')) + '.</span></li>').join('') + '</ul>' : '') +
      '<div class="subs"><div class="seg steps" role="group" aria-label="Filter agents by step">' +
        [['', 'All steps', homeAll.length]].concat(b.subs.map((x) => [x, x, homeAll.filter((a) => inStep(a, x)).length])).map(([k, l, n]) =>
          '<button type="button" class="seg-btn' + ((state.step || '') === k ? ' on' : '') + (n ? '' : ' none') + '" data-step="' + esc(k) + '" aria-pressed="' + ((state.step || '') === k) + '">' + esc(l) + ' <span class="seg-n">' + n + '</span></button>').join('') + '</div></div>' +
      spark + '</header>';

    const viewToggle = '<div class="seg sm vtoggle" role="group" aria-label="View">' + [['agents', 'Agent view'], ['data', 'Data view'], ['users', 'User view']].map(([k, l]) => '<button type="button" class="seg-btn' + (state.bpView === k ? ' on' : '') + '" data-bpview="' + k + '" aria-pressed="' + (state.bpView === k) + '">' + icon(k === 'agents' ? 'automation' : k) + l + '</button>').join('') + '</div>';
    if (state.bpView === 'data') h += dataSection(b, viewToggle);
    else if (state.bpView === 'users') h += userSection(b, viewToggle);
    else {
    h += '<section class="sec" aria-labelledby="sec-agents"><div class="sec-h"><h2 id="sec-agents">' + (state.step ? esc(state.step) + ' agents in ' : 'Agents in ') + esc(b.name) + ' <span class="count">' + list.length + '</span>' + addBtn(b.id) + '</h2>' + viewToggle + '</div>' +
      '<div class="toolbar trow">' +
      '<label class="search-in">' + icon('search') + '<span class="sr">Filter agents</span><input id="q" type="search" placeholder="Filter by name, system or tool" value="' + esc(state.q) + '"></label>' +
      '<label class="sel"><span class="sr">Sort by</span><select id="sort">' + [['req', 'Most API requests'], ['users', 'Most users'], ['cost', 'Highest spend'], ['cross', 'Most processes reached'], ['name', 'Name']].map(([k, l]) => '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '<div class="seg sm" role="group" aria-label="Tile density"><button type="button" class="seg-btn' + (state.density === 'comfortable' ? ' on' : '') + '" data-density="comfortable">Comfortable</button><button type="button" class="seg-btn' + (state.density === 'compact' ? ' on' : '') + '" data-density="compact">Compact</button></div>' +
      '</div>';
    h += '<div class="filters">' + '<div class="seg sm" role="group" aria-label="Agent type">' + ['all', 'conversational', 'automation', 'analytical', 'monitoring'].map((k) =>
        '<button type="button" class="seg-btn' + (state.arch === k ? ' on' : '') + '" data-arch="' + k + '" aria-pressed="' + (state.arch === k) + '">' + (k === 'all' ? 'All types' : icon(k) + ARCH[k].label.replace('Process automation', 'Automation')) + ' <span class="seg-n">' + (k === 'all' ? stepAll.length : (archCounts[k] || 0)) + '</span></button>').join('') + '</div>';
    h += '<details class="legend"><summary>' + icon('info') + 'How agents are classified</summary><div class="legend-body">' +
      '<div><h4>Type: what the agent does</h4><ul>' + Object.keys(ARCH).map((k) => '<li>' + icon(k) + '<b>' + ARCH[k].label + '.</b> ' + ARCH[k].blurb + '</li>').join('') + '</ul></div>' +
      '<div><h4>Autonomy: how much power it has</h4><ul>' + [1, 2, 3].map((k) => '<li>' + autoMeter({ auto: k }, false) + '<b>' + AUTONOMY[k].label + '.</b> ' + AUTONOMY[k].blurb + '</li>').join('') + '</ul></div>' +
      '<div><h4>Process labels</h4><ul><li>' + chip('r2r', { write: true }) + '<span>The agent <b>writes</b> into that process through a tool or output. This is the label to watch.</span></li><li>' + chip('r2r', { write: false }) + '<span>It only <b>reads</b> from that process, or people there use it.</span></li></ul></div>' +
      '</div></details></div>';
    h += list.length ? '<div class="grid ' + state.density + '">' + list.map(tile).join('') + '</div>'
      : '<div class="empty">' + (homeAll.length ? (state.step && !stepAll.length ? 'No ' + lifeWord + 'agents perform ' + esc(state.step) + ' yet.' : 'No ' + lifeWord + 'agents match these filters in ' + esc(b.name) + '.') : 'No ' + lifeWord + 'agents are registered in ' + esc(b.name) + ' yet.' + (writeOk() ? '<br><button type="button" class="btn primary" data-add="' + esc(b.id) + '">' + icon('plus') + 'Add agent</button>' : '')) + '</div>';
    h += '</section>';
    }

    // cross-process agents belong to the agent view only
    if (state.bpView === 'agents') {
    const xs = state.crossTab === 'in' ? sortAgents(inbound) : sortAgents(outbound);
    h += '<section class="sec" aria-labelledby="sec-cross"><div class="sec-h"><h2 id="sec-cross">Cross-process agents</h2>' +
      '<div class="seg" role="group" aria-label="Direction"><button type="button" class="seg-btn' + (state.crossTab === 'in' ? ' on' : '') + '" data-cross="in">From other processes into ' + esc(b.code) + ' <span class="seg-n">' + inbound.length + '</span></button><button type="button" class="seg-btn' + (state.crossTab === 'out' ? ' on' : '') + '" data-cross="out">' + esc(b.code) + ' agents reaching out <span class="seg-n">' + outbound.length + '</span></button></div></div>' +
      '<p class="sec-sub">' + (state.crossTab === 'in'
        ? 'Agents homed in another process whose data inputs, tools, outputs or secondary users touch ' + esc(b.name) + '. Agents that write into ' + esc(b.code) + ' are the ones its owner should know about.'
        : 'Agents homed in ' + esc(b.name) + ' whose inputs, tools or outputs touch other processes.') + '</p>';
    h += xs.length ? '<div class="xlist">' + xs.map((a) => crossRow(a, b.id, state.crossTab)).join('') + '</div>' : '<div class="empty">None for the current lifecycle filter.</div>';
    h += '</section>';
    }
    $('#main').innerHTML = h;
    // steps row: fade the right edge while more steps are hidden, and keep the selected step in view
    const row = $('#main .bp-head .subs');
    if (row) {
      const mark = () => { row.classList.toggle('more', row.scrollWidth > row.clientWidth + 1); row.classList.toggle('end', row.scrollLeft + row.clientWidth >= row.scrollWidth - 2); };
      const on = row.querySelector('.seg-btn.on'); if (on && on.dataset.step) row.scrollLeft = Math.max(0, on.offsetLeft - row.clientWidth / 2 + on.offsetWidth / 2);
      mark(); row.addEventListener('scroll', mark, { passive: true });
    }
  }
  function kpi(v, l, tt) { return '<div class="kpi"' + (tt ? ' data-tt="' + esc(tt) + '"' : '') + '><b>' + esc(String(v)) + '</b><span>' + esc(l) + (tt ? ' ' + icon('info', 'mini') : '') + '</span></div>'; }

  /* ---------------------------------------------------------------- Home: All business processes */
  // The enterprise as three stacked layers: people on top, agents in the middle, data at the base.
  // A process keeps the same spot on every layer, so one column reads as one process from top to bottom.
  const platformOf = (s) => String(s || '').split(' · ')[0].trim() || 'Unnamed system';
  let STACK = null; // running animation; stopped whenever the view is redrawn

  function homeModel(list) {
    const per = {}; BPS.forEach((b) => { per[b.id] = { agents: [], users: 0, data: 0, dataW: 0, systems: new Set(), sys: {}, roles: {}, out: 0, outW: 0 }; });
    const links = {}; const plats = {};
    list.forEach((a) => {
      const c = calc(a); const P = per[a.home]; P.agents.push(a);
      if (c.cross.length) P.out++; if (c.crossWrite.length) P.outW++;
      a.users.forEach((u) => { per[u.bp].users += u.n; const r = per[u.bp].roles[u.role] || (per[u.bp].roles[u.role] = { n: 0, agents: new Set() }); r.n += u.n; r.agents.add(a.id); });
      const touchData = (bp, sys, m) => {
        per[bp].data++; if (m === 'w') per[bp].dataW++;
        const k = platformOf(sys); per[bp].systems.add(k);
        const sy = per[bp].sys[k] || (per[bp].sys[k] = { agents: new Set(), w: new Set() }); sy.agents.add(a.id); if (m === 'w') sy.w.add(a.id);
        const p = plats[k] || (plats[k] = { name: k, bps: new Set(), r: new Set(), w: new Set(), rows: 0 });
        p.bps.add(bp); p.rows++; (m === 'w' ? p.w : p.r).add(a.id);
      };
      a.inputs.forEach((x) => touchData(x.bp, x.system, x.mode));
      a.tools.forEach((x) => touchData(x.bp, x.system, x.mode));
      a.outputs.forEach((x) => touchData(x.bp, x.dest, x.mode));
      c.cross.forEach((t) => {
        const k = a.home + '|' + t; const l = links[k] || (links[k] = { from: a.home, to: t, n: 0, w: 0, names: [] });
        l.n++; if (c.touch[t].write) l.w++; l.names.push(a.name);
      });
    });
    return { per, links: Object.values(links), plats: Object.values(plats) };
  }

  // geometry: oblique planes, v = 0 at the back edge, v = 1 at the front edge
  const SG = { W: 800, D: 150, SK: 150, X0: 130, Y: [24, 236, 448], VW: 1090, VH: 616, T: 7 };
  const LAYERS = [{ k: 'users', label: 'Users' }, { k: 'agents', label: 'Agents' }, { k: 'data', label: 'Data' }];
  const TIER_V = { 3: 0.2, 1: 0.53, 2: 0.86 };
  const P3 = (u, v, L) => ({ x: SG.X0 + u * SG.W + (1 - v) * SG.SK, y: SG.Y[L] + v * SG.D });
  function stackPos() {
    const pos = {};
    [1, 2, 3].forEach((t) => {
      const row = BPS.filter((b) => b.tier === t);
      row.forEach((b, i) => { pos[b.id] = { u: 0.05 + ((i + 0.5) / row.length) * 0.9, v: TIER_V[t] }; });
    });
    return pos;
  }
  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const poly = (pts) => pts.map((p) => f1(p.x) + ',' + f1(p.y)).join(' ');

  function stackSvg(M) {
    const pos = stackPos(); const { per, links } = M;
    const maxU = Math.max(1, ...BPS.map((b) => per[b.id].users));
    const maxD = Math.max(1, ...BPS.map((b) => per[b.id].data));
    const topU = BPS.slice().sort((a, b) => per[b.id].users - per[a.id].users).slice(0, 4).map((b) => b.id);
    const topD = BPS.slice().sort((a, b) => per[b.id].data - per[a.id].data).slice(0, 4).map((b) => b.id);
    const at = (id, L) => P3(pos[id].u, pos[id].v, L);
    const tip = (b) => {
      const p = per[b.id]; const n = p.agents.length;
      return b.name + '\n' + n + ' ' + plural(n, 'agent') + ' homed here' + (p.outW ? ', ' + p.outW + ' ' + plural(p.outW, 'writes', 'write') + ' into other processes' : '') +
        '\n' + nf.format(p.users) + ' people use agents here\n' + p.data + ' data ' + plural(p.data, 'touchpoint') + ' across ' + p.systems.size + ' ' + plural(p.systems.size, 'system');
    };
    let s = '<svg class="stack" id="stack" data-layer="' + esc(state.homeLayer) + '" viewBox="0 0 ' + SG.VW + ' ' + SG.VH + '" role="img" aria-labelledby="stack-t stack-d">' +
      '<title id="stack-t">Agents across the enterprise, in three layers</title><desc id="stack-d">Users on top, agents in the middle, data at the base. Each business process sits in the same position on every layer. Arcs show agents reaching into other processes; tangerine arcs write into them.</desc>' +
      '<defs><marker id="chev" viewBox="0 0 8 8" refX="5" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.4"/></marker></defs>';

    // columns behind the planes: one dashed line per process, data to users
    s += '<g class="cols">' + BPS.map((b) => { const a = at(b.id, 2), c = at(b.id, 0); return '<line class="col p" data-p="' + b.id + '" x1="' + f1(a.x) + '" y1="' + f1(a.y) + '" x2="' + f1(c.x) + '" y2="' + f1(c.y) + '"/>'; }).join('') + '</g>';

    // planes, bottom first
    [2, 1, 0].forEach((L) => {
      const corners = [P3(0, 0, L), P3(1, 0, L), P3(1, 1, L), P3(0, 1, L)];
      const lab = P3(0, 0.5, L);
      const tot = L === 0 ? nf.format(BPS.reduce((x, b) => x + per[b.id].users, 0)) + ' people'
        : L === 1 ? nf.format(BPS.reduce((x, b) => x + per[b.id].agents.length, 0)) + ' agents'
        : nf.format(M.plats.length) + ' source systems';
      const dn = (p) => ({ x: p.x, y: p.y + SG.T });
      s += '<g class="L L' + L + '"><polygon class="face" points="' + poly([corners[3], corners[2], dn(corners[2]), dn(corners[3])]) + '"/>' +
        '<polygon class="face side" points="' + poly([corners[1], corners[2], dn(corners[2]), dn(corners[1])]) + '"/>' +
        '<polygon class="plane" points="' + poly(corners) + '"/>' +
        '<text class="lbl" x="' + f1(lab.x - 18) + '" y="' + f1(lab.y - 2) + '" text-anchor="end">' + LAYERS[L].label + '</text>' +
        '<text class="lbl-n" x="' + f1(lab.x - 18) + '" y="' + f1(lab.y + 16) + '" text-anchor="end">' + esc(tot) + '</text>';
      if (L === 1) {
        // the core value chain, left to right
        const core = BPS.filter((b) => b.tier === 1);
        for (let i = 0; i < core.length - 1; i++) {
          const a = at(core[i].id, 1), c = at(core[i + 1].id, 1);
          const k = 0.34; const x1 = a.x + (c.x - a.x) * k, y1 = a.y + (c.y - a.y) * k, x2 = a.x + (c.x - a.x) * (1 - k), y2 = a.y + (c.y - a.y) * (1 - k);
          s += '<line class="flow" x1="' + f1(x1) + '" y1="' + f1(y1 + 20) + '" x2="' + f1(x2) + '" y2="' + f1(y2 + 20) + '" marker-end="url(#chev)"/>';
        }
      }
      BPS.forEach((b) => {
        const { u, v } = pos[b.id]; const c = at(b.id, L); const p = per[b.id];
        if (L === 1) {
          const pad = [P3(u - 0.045, v - 0.12, 1), P3(u + 0.045, v - 0.12, 1), P3(u + 0.045, v + 0.12, 1), P3(u - 0.045, v + 0.12, 1)];
          s += '<g class="p" data-p="' + b.id + '"><polygon class="pad" points="' + poly(pad) + '"/>';
          const n = p.agents.length, cols = Math.min(4, Math.max(1, n)), sz = 7, gap = 3;
          p.agents.forEach((a, i) => {
            const r = Math.floor(i / cols), k = i % cols; const rowN = Math.min(cols, n - r * cols);
            const x = c.x - (rowN * sz + (rowN - 1) * gap) / 2 + k * (sz + gap), y = c.y - 4 - (r + 1) * (sz + gap);
            const cls = 'ag' + (a.status !== 'production' ? ' np' : '') + (a.health === 'degraded' || a.health === 'incident' ? ' ' + a.health : '');
            s += '<rect class="' + cls + '" x="' + f1(x) + '" y="' + f1(y) + '" width="' + sz + '" height="' + sz + '" rx="1.5"/>';
          });
          s += '<text class="code" x="' + f1(c.x) + '" y="' + f1(c.y + 14) + '">' + esc(b.code) + '</text></g>';
        } else if (L === 0) {
          const r = p.users ? 5 + 21 * Math.sqrt(p.users / maxU) : 0;
          s += '<g class="p" data-p="' + b.id + '">' + (r ? '<ellipse class="ppl" cx="' + f1(c.x) + '" cy="' + f1(c.y) + '" rx="' + f1(r) + '" ry="' + f1(r * 0.42) + '"/><circle class="ppl-core" cx="' + f1(c.x) + '" cy="' + f1(c.y) + '" r="2.5"/>' : '<circle class="none" cx="' + f1(c.x) + '" cy="' + f1(c.y) + '" r="2"/>') +
            (topU.includes(b.id) && p.users ? '<text class="val" x="' + f1(c.x + r + 6) + '" y="' + f1(c.y + 4) + '">' + nf.format(p.users) + '</text>' : '') + '</g>';
        } else {
          const r = p.data ? 5 + 17 * Math.sqrt(p.data / maxD) : 0;
          s += '<g class="p" data-p="' + b.id + '">' + (r ? '<ellipse class="pool-o" data-rx="' + f1(r * 1.55) + '" data-ry="' + f1(r * 1.55 * 0.42) + '" cx="' + f1(c.x) + '" cy="' + f1(c.y) + '" rx="' + f1(r * 1.55) + '" ry="' + f1(r * 1.55 * 0.42) + '"/>' +
            '<ellipse class="pool" cx="' + f1(c.x) + '" cy="' + f1(c.y) + '" rx="' + f1(r) + '" ry="' + f1(r * 0.42) + '"/><circle class="pool-core" cx="' + f1(c.x) + '" cy="' + f1(c.y) + '" r="2.5"/>' : '<circle class="none" cx="' + f1(c.x) + '" cy="' + f1(c.y) + '" r="2"/>') +
            (topD.includes(b.id) && p.data ? '<text class="val" x="' + f1(c.x + r * 1.55 + 6) + '" y="' + f1(c.y + 4) + '">' + p.data + '</text>' : '') + '</g>';
        }
      });
      s += '</g>';
    });

    // crossings on the agent layer: arcs lift off the plane; writes drawn last so they sit on top
    const arcs = links.slice().sort((a, b) => (a.w > 0) - (b.w > 0) || a.n - b.n);
    s += '<g class="L L1 arcs">' + arcs.map((l) => {
      const a = at(l.from, 1), c = at(l.to, 1); const d = Math.hypot(c.x - a.x, c.y - a.y);
      const cx = (a.x + c.x) / 2, cy = Math.min(a.y, c.y) - 18 - d * 0.16;
      return '<path class="arc p' + (l.w ? ' w' : '') + '" data-p="' + l.from + ' ' + l.to + '" data-from="' + l.from + '" data-to="' + l.to + '" data-n="' + l.n + '" data-w="' + l.w + '" style="stroke-width:' + f1(1 + 0.7 * (l.n - 1)) + '" d="M' + f1(a.x) + ' ' + f1(a.y - 8) + ' Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(c.x) + ' ' + f1(c.y - 8) + '"/>';
    }).join('') + '</g>';
    s += '<g class="pts" aria-hidden="true"></g>';

    // hit areas on top: one per process per layer
    s += '<g class="hits">' + BPS.map((b) => [0, 1, 2].map((L) => {
      const { u, v } = pos[b.id];
      const pts = [P3(u - 0.05, v - 0.16, L), P3(u + 0.05, v - 0.16, L), P3(u + 0.05, v + 0.16, L), P3(u - 0.05, v + 0.16, L)];
      if (L === 1) pts[0].y -= 34, pts[1].y -= 34;
      return '<polygon class="hit" data-p="' + b.id + '" data-go="' + b.id + '" data-tt="' + esc(tip(b)) + '" points="' + poly(pts) + '"/>';
    }).join('')).join('') + '</g>';
    return s + '</svg>';
  }

  function bindStack() {
    if (STACK) { STACK.stop(); STACK = null; }
    const svg = $('#stack'); if (!svg) return;
    const parts = Array.from(svg.querySelectorAll('.p'));
    const setFocus = (id) => {
      if (svg._focus === id) return; svg._focus = id;
      svg.classList.toggle('focus', !!id);
      parts.forEach((el) => el.classList.toggle('on', !!id && el.dataset.p.split(' ').includes(id)));
    };
    svg.addEventListener('mouseover', (e) => { const h = e.target.closest('.hit'); setFocus(h ? h.dataset.p : null); });
    svg.addEventListener('mouseleave', () => setFocus(null));

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const NS = 'http://www.w3.org/2000/svg'; const g = svg.querySelector('.pts');
    const line = (el) => ({ x1: +el.getAttribute('x1'), y1: +el.getAttribute('y1'), x2: +el.getAttribute('x2'), y2: +el.getAttribute('y2') });
    const cols = {}; svg.querySelectorAll('.col').forEach((el) => { cols[el.dataset.p] = line(el); });
    const per = STACK_MODEL.per;
    // a column runs data (y1) to users (y2); the agent plane sits in between at the same process position
    const stop = (id, L) => { const c = cols[id]; const k = (SG.Y[2] - SG.Y[L]) / (SG.Y[2] - SG.Y[0]); return { x: c.x1 + (c.x2 - c.x1) * k, y: c.y1 + (c.y2 - c.y1) * k }; };
    const src = [];
    const add = (list, budget) => { const tot = list.reduce((x, s) => x + s.wt, 0) || 1; list.forEach((s) => { s.rate = (budget * s.wt) / tot; s.acc = Math.random(); src.push(s); }); };
    add(BPS.filter((b) => per[b.id].data && per[b.id].agents.length).map((b) => ({ p: [b.id], layers: ['data', 'agents'], wt: per[b.id].data, a: stop(b.id, 2), b: stop(b.id, 1), dur: 1.7 })), 4.5);
    add(BPS.filter((b) => per[b.id].users && per[b.id].agents.length).map((b) => ({ p: [b.id], layers: ['agents', 'users'], wt: Math.sqrt(per[b.id].users), a: stop(b.id, 1), b: stop(b.id, 0), dur: 1.5 })), 3.5);
    add(Array.from(svg.querySelectorAll('.arc')).map((el) => {
      const w = +el.dataset.w > 0; const to = el.dataset.to;
      return { p: [el.dataset.from, to], layers: ['agents'], wt: +el.dataset.n * (w ? 1.6 : 1), path: el, len: el.getTotalLength(), back: !w, w, dur: 2.4,
        then: w ? { p: [to], layers: ['agents', 'data'], a: stop(to, 1), b: stop(to, 2), w: true, dur: 1.1 } : null };
    }), 6);
    const live = []; let last = performance.now(); let visible = true; let raf = 0;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; }) : null; if (io) io.observe(svg);
    const pools = Array.from(svg.querySelectorAll('.pool-o')).map((el, i) => ({ el, rx: +el.dataset.rx, ry: +el.dataset.ry, ph: i * 1.7 }));
    const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const spawn = (s, now) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', s.w ? '2.8' : '2.3'); c.setAttribute('class', 'pt' + (s.w ? ' w' : '')); g.appendChild(c); live.push({ c, s, t0: now }); };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const f = svg._focus, layer = svg.dataset.layer;
      src.forEach((s) => {
        if ((f && !s.p.includes(f)) || (layer !== 'all' && !s.layers.includes(layer))) return;
        s.acc += s.rate * dt * (f ? 4 : 1);
        while (s.acc >= 1) { s.acc -= 1; if (live.length < 140) spawn(s, now); }
      });
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]; const k = (now - p.t0) / (p.s.dur * 1000);
        if (k >= 1) { p.c.remove(); live.splice(i, 1); if (p.s.then && (!f || p.s.then.p.includes(f))) spawn(p.s.then, now); continue; }
        const e = ease(k); let x, y;
        if (p.s.path) { const pt = p.s.path.getPointAtLength((p.s.back ? 1 - e : e) * p.s.len); x = pt.x; y = pt.y; }
        else { x = p.s.a.x + (p.s.b.x - p.s.a.x) * e; y = p.s.a.y + (p.s.b.y - p.s.a.y) * e; }
        p.c.setAttribute('cx', x.toFixed(1)); p.c.setAttribute('cy', y.toFixed(1));
        p.c.setAttribute('opacity', Math.min(1, k * 6, (1 - k) * 6).toFixed(2));
      }
      const t = now / 1000;
      pools.forEach((pl) => { const m = 1 + 0.12 * Math.sin(t * 1.9 + pl.ph); pl.el.setAttribute('rx', (pl.rx * m).toFixed(1)); pl.el.setAttribute('ry', (pl.ry * m).toFixed(1)); });
    };
    raf = requestAnimationFrame(tick);
    STACK = { stop() { cancelAnimationFrame(raf); if (io) io.disconnect(); } };
  }
  let STACK_MODEL = null;

  // ---- draft 2: flat layers stacked like sheets; every business unit is a column through all three
  const sysAbbr = (name) => { const n = String(name).replace(/^SAP\s+/, '') || String(name); const r = (n.slice(1).match(/[A-Z0-9]/g) || [])[0] || (n.charAt(1) || '').toUpperCase(); return (n.charAt(0).toUpperCase() + r).slice(0, 2); };
  function layersHtml(M) {
    const { per } = M; const tiers = [1, 2, 3].filter((t) => BPS.some((b) => b.tier === t));
    const cols = ['120px']; tiers.forEach((t, i) => { if (i) cols.push('12px'); cols.push('repeat(' + BPS.filter((b) => b.tier === t).length + ', minmax(0, 1fr))'); });
    const order = []; tiers.forEach((t, i) => { if (i) order.push(null); BPS.filter((b) => b.tier === t).forEach((b) => order.push(b)); });
    const maxRole = Math.max(1, ...BPS.map((b) => Math.max(0, ...Object.values(per[b.id].roles).map((r) => r.n))));
    const cell = (b, inner, extra) => b ? '<div class="lv-cell" data-col="' + b.id + '"' + (extra || '') + '>' + inner + '</div>' : '<div class="lv-gap"></div>';
    const tot = { users: BPS.reduce((x, b) => x + per[b.id].users, 0), agents: BPS.reduce((x, b) => x + per[b.id].agents.length, 0), data: M.plats.length };

    let h = '<div class="lv" id="lv" data-layer="' + esc(state.homeLayer) + '" style="--lv-cols:' + cols.join(' ') + '">';
    // business unit header, grouped by tier
    h += '<div class="lv-row lv-tiers"><div></div>' + tiers.map((t, i) => (i ? '<div></div>' : '') + '<div class="lv-tier" style="grid-column: span ' + BPS.filter((b) => b.tier === t).length + '">' + esc((TIERS[t] && TIERS[t].name) || 'Tier ' + t) + '</div>').join('') + '</div>';
    h += '<div class="lv-row lv-bus"><div></div>' + order.map((b) => b ? '<button type="button" class="lv-bu" data-col="' + b.id + '" data-go="' + b.id + '" data-tt="' + esc(b.name) + '"><b>' + esc(b.code) + '</b><span>' + b.name.split('-to-').map(esc).join('<br>to ') + '</span></button>' : '<div class="lv-gap"></div>').join('') + '</div>';

    // users
    h += '<div class="lv-row lv-band lv-users" data-band="users"><div class="lv-lab">' + icon('users') + '<b>Users</b><span>' + nf.format(tot.users) + ' people</span></div>' + order.map((b) => {
      if (!b) return cell(null);
      const roles = Object.entries(per[b.id].roles).filter(([, r]) => r.n > 0).sort((x, y) => y[1].n - x[1].n);
      return cell(b, '<div class="lv-grps">' + roles.map(([role, r]) => { const d = Math.round(8 + 26 * Math.sqrt(r.n / maxRole)); return '<i class="lv-grp" data-k="u|' + b.id + '|' + esc(role) + '" style="width:' + d + 'px;height:' + d + 'px" data-tt="' + esc(b.name + '\n' + role + ': ' + nf.format(r.n) + ' people, using ' + r.agents.size + ' ' + plural(r.agents.size, 'agent')) + '"></i>'; }).join('') + '</div><span class="lv-n">' + nf.format(per[b.id].users) + '</span>');
    }).join('') + '</div>';

    // agents
    h += '<div class="lv-row lv-band lv-agents" data-band="agents"><div class="lv-lab">' + icon('automation') + '<b>Agents</b><span>' + nf.format(tot.agents) + ' agents</span></div>' + order.map((b) => {
      if (!b) return cell(null);
      const ags = per[b.id].agents.slice().sort((x, y) => calc(y).rpd - calc(x).rpd);
      return cell(b, '<div class="lv-ags">' + ags.map((a) => '<button type="button" class="lv-ag' + (a.health === 'degraded' || a.health === 'incident' ? ' ' + a.health : '') + (a.status !== 'production' ? ' np' : '') + (calc(a).crossWrite.length ? ' xw' : '') + '" data-agent="' + esc(a.id) + '" data-k="a|' + esc(a.id) + '" data-tt="' + esc(a.name + '\n' + ARCH[a.arch].label + ', ' + AUTONOMY[a.auto].label.toLowerCase() + (a.health === 'degraded' || a.health === 'incident' ? '\n' + HEALTH[a.health] : '') + (calc(a).crossWrite.length ? '\nWrites into ' + calc(a).crossWrite.map((x) => BP[x].code).join(', ') : '')) + '">' + spriteEl(a, 18) + '</button>').join('') + '</div><span class="lv-n">' + ags.length + '</span>');
    }).join('') + '</div>';

    // data
    h += '<div class="lv-row lv-band lv-data" data-band="data"><div class="lv-lab">' + icon('data') + '<b>Data</b><span>' + nf.format(tot.data) + ' systems</span></div>' + order.map((b) => {
      if (!b) return cell(null);
      const sys = Object.entries(per[b.id].sys).sort((x, y) => y[1].agents.size - x[1].agents.size || x[0].localeCompare(y[0]));
      return cell(b, '<div class="lv-sys">' + sys.map(([name, sy]) => { const n = sy.agents.size; return '<i class="lv-db c' + (n >= 4 ? 3 : n >= 2 ? 2 : 1) + (sy.w.size ? ' w' : '') + '" data-k="d|' + b.id + '|' + esc(name) + '" data-tt="' + esc(name + ' in ' + b.name + '\n' + n + ' ' + plural(n, 'agent') + ' ' + plural(n, 'touches', 'touch') + ' it' + (sy.w.size ? ', ' + sy.w.size + ' ' + plural(sy.w.size, 'writes', 'write') + ' to it' : ', reads only')) + '">' + esc(sysAbbr(name)) + '</i>'; }).join('') + '</div><span class="lv-n">' + sys.length + '</span>');
    }).join('') + '</div>';
    return h + '<svg class="lv-links" aria-hidden="true"><g class="lv-paths"></g><g class="lv-pts"></g></svg></div>';
  }

  function bindLayers() {
    if (STACK) { STACK.stop(); STACK = null; }
    const box = $('#lv'); if (!box) return;
    const svg = box.querySelector('.lv-links'); const gP = svg.querySelector('.lv-paths'); const gT = svg.querySelector('.lv-pts');
    const NS = 'http://www.w3.org/2000/svg';
    const el = {}; box.querySelectorAll('[data-k]').forEach((e) => { el[e.dataset.k] = e; });
    // one link per agent and endpoint; a link writes if any row behind it writes
    const L = {};
    const link = (a, k, kind, w, cols) => { if (!el[k]) return; const id = a.id + '>' + k; const l = L[id] || (L[id] = { a: a.id, k, kind, w: false, cols }); if (w) l.w = true; };
    AGENTS.filter(lifecycleOk).forEach((a) => {
      const rows = [].concat(a.inputs.map((x) => [x.bp, x.system, x.mode]), a.tools.map((x) => [x.bp, x.system, x.mode]), a.outputs.map((x) => [x.bp, x.dest, x.mode]));
      rows.forEach(([bp, sys, m]) => link(a, 'd|' + bp + '|' + platformOf(sys), 'd', m === 'w', [a.home, bp]));
      a.users.forEach((u) => { if (u.n > 0) link(a, 'u|' + u.bp + '|' + u.role, 'u', false, [a.home, u.bp]); });
    });
    const links = Object.values(L);
    let paths = [];
    const layout = () => {
      const R = box.getBoundingClientRect(); svg.setAttribute('viewBox', '0 0 ' + R.width + ' ' + R.height); svg.setAttribute('width', R.width); svg.setAttribute('height', R.height);
      const c = (e, edge) => { const r = e.getBoundingClientRect(); return { x: r.left - R.left + r.width / 2, y: edge === 'top' ? r.top - R.top : edge === 'bottom' ? r.bottom - R.top : r.top - R.top + r.height / 2 }; };
      gP.innerHTML = ''; paths = [];
      links.slice().sort((x, y) => x.w - y.w).forEach((l) => {
        const ag = el['a|' + l.a]; const tg = el[l.k]; if (!ag || !tg) return;
        const p1 = l.kind === 'd' ? c(ag, 'bottom') : c(ag, 'top'); const p2 = l.kind === 'd' ? c(tg, 'top') : c(tg, 'bottom');
        const my = (p1.y + p2.y) / 2;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', 'M' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) + ' C' + p1.x.toFixed(1) + ' ' + my.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + my.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1));
        p.setAttribute('class', 'lk ' + (l.kind === 'd' ? 'lk-d' : 'lk-u') + (l.w ? ' w' : '') + (l.cols[0] !== l.cols[1] ? ' x' : ''));
        p.dataset.a = l.a; p.dataset.cols = l.cols.join(' ');
        gP.appendChild(p); paths.push({ el: p, l, len: p.getTotalLength() });
      });
    };
    layout();
    // hover: a business unit column or a single agent
    const setFocus = (col, ag) => {
      const key = (col || '') + '|' + (ag || ''); if (box._f === key) return; box._f = key;
      box.classList.toggle('focus', !!(col || ag));
      box.querySelectorAll('[data-col]').forEach((e) => e.classList.toggle('on', !!col && e.dataset.col === col));
      paths.forEach((p) => p.el.classList.toggle('on', (!!col && p.l.cols.includes(col)) || (!!ag && p.l.a === ag)));
      box.querySelectorAll('.lv-ag').forEach((e) => e.classList.toggle('on', !!ag && e.dataset.agent === ag));
      box._focus = { col, ag };
    };
    box.addEventListener('mouseover', (e) => { const a = e.target.closest('.lv-ag'); const c = e.target.closest('[data-col]'); setFocus(a ? null : c && c.dataset.col, a && a.dataset.agent); });
    box.addEventListener('mouseleave', () => setFocus(null, null));
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { layout(); }) : null; if (ro) ro.observe(box);

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0; let io = null;
    if (!reduce) {
      const live = []; let last = performance.now(); let visible = true;
      io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; }) : null; if (io) io.observe(box);
      const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      const acc = new Map();
      const tick = (now) => {
        raf = requestAnimationFrame(tick);
        if (!visible || document.hidden) { last = now; return; }
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        const f = box._focus || {}; const layer = box.dataset.layer;
        const pool = paths.filter((p) => (!f.col || p.l.cols.includes(f.col)) && (!f.ag || p.l.a === f.ag) && (layer === 'all' || layer === 'agents' || (layer === 'data' ? p.l.kind === 'd' : p.l.kind === 'u')));
        const rate = (f.col || f.ag ? 7 : 16) / Math.max(1, pool.length);
        pool.forEach((p) => { let v = (acc.get(p) || Math.random()) + rate * dt * (p.l.w ? 1.8 : 1); while (v >= 1) { v -= 1; if (live.length < 120) { const ci = document.createElementNS(NS, 'circle'); ci.setAttribute('r', p.l.w ? 2.8 : 2.2); ci.setAttribute('class', 'pt' + (p.l.w ? ' w' : '')); gT.appendChild(ci); live.push({ ci, p, t0: now, dur: 1.4 + p.len / 420 }); } } acc.set(p, v); });
        for (let i = live.length - 1; i >= 0; i--) {
          const q = live[i]; const k = (now - q.t0) / (q.dur * 1000);
          if (k >= 1 || !q.p.el.isConnected) { q.ci.remove(); live.splice(i, 1); continue; }
          // reads and people flow toward the agent's users or from data up to the agent; writes flow down into data
          const toAgent = q.p.l.kind === 'd' && !q.p.l.w; const e = ease(k);
          const pt = q.p.el.getPointAtLength((toAgent ? 1 - e : e) * q.p.len);
          q.ci.setAttribute('cx', pt.x.toFixed(1)); q.ci.setAttribute('cy', pt.y.toFixed(1)); q.ci.setAttribute('opacity', Math.min(1, k * 6, (1 - k) * 6).toFixed(2));
        }
      };
      raf = requestAnimationFrame(tick);
    }
    STACK = { stop() { cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect(); } };
  }
  // ---- one view: each business unit is a zone holding its people (dots), its systems (tiles on a data pool) and its
  // agents (sprites circling the pool). Agents fly to the exact system they use in another unit: a write carries a
  // tangerine dot out and drops it in; a read picks up a navy dot and carries it home. Busier agents travel more often.
  const ONE = { VW: 1100, VH: 600, M: 10, G: 12, TW: 18, TH: 14, SX: 21, SY: 17, rows: [{ t: 3, y: 8, h: 140 }, { t: 1, y: 172, h: 200 }, { t: 2, y: 396, h: 196 }] };
  const bpRpd = (M, id) => M.per[id].agents.reduce((x, a) => x + (hasTel(a) ? calc(a).rpd : 0), 0);
  function oneZones(M) {
    const Z = {};
    ONE.rows.forEach((r) => {
      const row = BPS.filter((b) => b.tier === r.t); const n = row.length || 1;
      const avail = ONE.VW - 2 * ONE.M - ONE.G * (n - 1);
      const minW = Math.min(avail / n, r.t === 3 ? 170 : 104);
      // busier units get wider zones
      const wt = row.map((b) => Math.sqrt(bpRpd(M, b.id)) + 1); const tot = wt.reduce((x, y) => x + y, 0) || 1;
      let x = ONE.M;
      row.forEach((b, i) => { const w = minW + ((avail - n * minW) * wt[i]) / tot; Z[b.id] = { x, y: r.y, w, h: r.h, cx: x + w / 2, cy: r.y + r.h * 0.62 }; x += w + ONE.G; });
    });
    // systems as tiles on the pool, and the orbit the unit's agents circle on
    BPS.forEach((b) => {
      const z = Z[b.id]; const sys = Object.entries(M.per[b.id].sys).sort((x, y) => y[1].agents.size - x[1].agents.size || x[0].localeCompare(y[0]));
      const n = sys.length; const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * 1.8)), Math.floor((z.w - 40) / ONE.SX))); const rows = Math.ceil(n / cols) || 0;
      z.tiles = sys.map(([name, sy], i) => { const r = Math.floor(i / cols), c = i % cols; const inRow = Math.min(cols, n - r * cols);
        return { name, sy, x: z.cx + (c - (inRow - 1) / 2) * ONE.SX, y: z.cy + (r - (rows - 1) / 2) * ONE.SY }; });
      z.prx = n ? (cols * ONE.SX) / 2 + 14 : 10; z.pry = n ? (rows * ONE.SY) / 2 + 9 : 4;
      z.orx = Math.min(z.w / 2 - 14, z.prx + 16); z.ory = Math.max(14, Math.min(z.pry + 15, z.cy - (z.y + 62), z.y + z.h - 14 - z.cy));
    });
    return Z;
  }
  function spriteUrl(a) {
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; cv.dataset.sprite = a.id;
    try { drawSprite(cv); return cv.toDataURL(); } catch (e) { return ''; }
  }
  function oneHtml(M) {
    const Z = oneZones(M); const { per } = M;
    const r1 = (n) => Math.round(n * 10) / 10;
    const fit = (t, w) => { const k = Math.floor((w - 20) / 6.3); return t.length > k ? t.slice(0, Math.max(3, k - 1)) + '…' : t; };
    let s = '<svg class="one" id="one" data-layer="' + esc(state.homeLayer) + '" viewBox="0 0 ' + ONE.VW + ' ' + ONE.VH + '" role="img" aria-labelledby="one-t">' +
      '<title id="one-t">Every business unit with its people, systems and agents. Agents travel to the systems they use in other units; tangerine trips write.</title>' +
      '<defs><linearGradient id="og-z1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".075"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".02"/></linearGradient>' +
      '<linearGradient id="og-z2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".06"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".015"/></linearGradient>' +
      '<linearGradient id="og-z3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".06"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".01"/></linearGradient>' +
      '<radialGradient id="og-pool" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#C6F24E" stop-opacity=".22"/><stop offset=".7" stop-color="#C6F24E" stop-opacity=".06"/><stop offset="1" stop-color="#C6F24E" stop-opacity="0"/></radialGradient>' +
      '<filter id="of-zone" x="-15%" y="-15%" width="130%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#000000" flood-opacity=".55"/></filter>' +
      '<filter id="of-tok" x="-60%" y="-60%" width="220%" height="240%"><feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#000000" flood-opacity=".6"/></filter>' +
      '<filter id="of-lift" x="-80%" y="-80%" width="260%" height="300%"><feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#C6F24E" flood-opacity=".55"/></filter>' +
      '<filter id="of-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<pattern id="og-grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#FFFFFF" stroke-opacity=".035"/></pattern></defs>' +
      '<rect class="o-floor" x="-200" y="-200" width="' + (ONE.VW + 400) + '" height="' + (ONE.VH + 400) + '" fill="url(#og-grid)"/>';
    const core = ONE.rows[1]; const coreB = BPS.filter((b) => b.tier === 1);
    s += '<g class="o-flow"><rect x="' + ONE.M + '" y="' + (core.y + core.h / 2 - 22) + '" width="' + (ONE.VW - 2 * ONE.M) + '" height="44" rx="22"/>';
    for (let i = 0; i < coreB.length - 1; i++) { const z = Z[coreB[i].id]; const x = z.x + z.w + ONE.G / 2; const y = core.y + core.h / 2; s += '<path d="M' + r1(x - 3) + ' ' + (y - 5) + 'l5 5-5 5"/>'; }
    s += '</g>';
    BPS.forEach((b) => {
      const z = Z[b.id]; const p = per[b.id]; const rpd = bpRpd(M, b.id);
      const tip = b.name + '\n' + nf.format(p.users) + ' people, ' + p.agents.length + ' ' + plural(p.agents.length, 'agent') + ', ' + z.tiles.length + ' ' + plural(z.tiles.length, 'system') +
        (rpd ? '\nAbout ' + nf.format(roundTo(rpd)) + ' API requests a day' : '') + (p.outW ? '\n' + p.outW + ' of its agents write into other units' : '');
      s += '<g class="o-zone t' + b.tier + '" data-p="' + b.id + '">' +
        '<rect class="o-box" x="' + r1(z.x) + '" y="' + z.y + '" width="' + r1(z.w) + '" height="' + z.h + '" rx="10" fill="url(#og-z' + b.tier + ')" filter="url(#of-zone)" data-go="' + b.id + '" data-tt="' + esc(tip) + '"/>' +
        '<text class="o-code" x="' + r1(z.x + 10) + '" y="' + (z.y + 19) + '">' + esc(b.code) + '</text><text class="o-name" x="' + r1(z.x + 10) + '" y="' + (z.y + 34) + '">' + esc(fit(b.name, z.w)) + '</text>' +
        '<text class="o-pn" x="' + r1(z.x + z.w - 10) + '" y="' + (z.y + 19) + '" text-anchor="end">' + nf.format(p.users) + '</text>';
      const cols = Math.max(4, Math.floor((z.w - 20) / 6)); const dots = Math.min(cols * 2, Math.max(p.users ? 1 : 0, Math.ceil(p.users / 8)));
      s += '<g class="o-ppl">'; for (let i = 0; i < dots; i++) s += '<circle cx="' + r1(z.x + 12 + (i % cols) * 6) + '" cy="' + (z.y + 45 + Math.floor(i / cols) * 6) + '" r="2"/>'; s += '</g>';
      s += '<g class="o-data"><ellipse class="o-pool-o" data-rx="' + r1(z.prx * 1.16) + '" data-ry="' + r1(z.pry * 1.22) + '" cx="' + r1(z.cx) + '" cy="' + r1(z.cy) + '" rx="' + r1(z.prx * 1.16) + '" ry="' + r1(z.pry * 1.22) + '"/>' +
        '<ellipse class="o-pool" fill="url(#og-pool)" cx="' + r1(z.cx) + '" cy="' + r1(z.cy) + '" rx="' + r1(z.prx) + '" ry="' + r1(z.pry) + '"/>' +
        z.tiles.map((t) => { const n = t.sy.agents.size; return '<g class="o-tile c' + (n >= 4 ? 3 : n >= 2 ? 2 : 1) + (t.sy.w.size ? ' w' : '') + '" data-k="' + esc(b.id + '|' + t.name) + '" data-tt="' + esc(t.name + ' in ' + b.name + '\n' + n + ' ' + plural(n, 'agent') + ' ' + plural(n, 'touches', 'touch') + ' it' + (t.sy.w.size ? ', ' + t.sy.w.size + ' ' + plural(t.sy.w.size, 'writes', 'write') + ' to it' : ', reads only')) + '">' +
          '<rect x="' + r1(t.x - ONE.TW / 2) + '" y="' + r1(t.y - ONE.TH / 2) + '" width="' + ONE.TW + '" height="' + ONE.TH + '" rx="2.5"/><text x="' + r1(t.x) + '" y="' + r1(t.y + 3.2) + '">' + esc(sysAbbr(t.name)) + '</text></g>'; }).join('') + '</g></g>';
    });
    s += '<g class="o-trails"></g><g class="o-rips"></g><g class="o-toks">';
    BPS.forEach((b) => per[b.id].agents.forEach((a) => {
      const c = calc(a);
      s += '<g class="o-tok' + (a.health === 'degraded' || a.health === 'incident' ? ' ' + a.health : '') + (a.status !== 'production' ? ' np' : '') + '" data-a="' + esc(a.id) + '" data-agent="' + esc(a.id) + '" data-tt="' + esc(a.name + '\n' + ARCH[a.arch].label + ', ' + AUTONOMY[a.auto].label.toLowerCase() + (hasTel(a) ? '\nAbout ' + nf.format(roundTo(c.rpd)) + ' API requests a day' : '') + (c.crossWrite.length ? '\nWrites into ' + c.crossWrite.map((x) => BP[x].code).join(', ') : '') + (c.cross.length > c.crossWrite.length ? '\nReads from ' + c.cross.filter((x) => !c.crossWrite.includes(x)).map((x) => BP[x].code).join(', ') : '')) + '">' +
        '<rect x="-10" y="-10" width="20" height="20" rx="4"/><image x="-8" y="-8" width="16" height="16" data-sprite-img="' + esc(a.id) + '"/><circle class="o-carry" cx="9" cy="-9" r="3.6"/></g>';
    }));
    s += '</g></svg>';
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return s + '<div class="o-feed-w"><span class="hx-mono dim">last trips</span><ol class="o-feed" id="one-feed" aria-live="off">' + (reduce ? '<li>motion is off because your device asks for reduced motion; every crossing is drawn as a faint arc</li>' : '<li class="muted">agents are starting their rounds</li>') + '</ol></div>';
  }

  function bindOne() {
    if (STACK) { STACK.stop(); STACK = null; }
    const svg = $('#one'); if (!svg) return;
    const NS = 'http://www.w3.org/2000/svg'; const M = STACK_MODEL; const Z = oneZones(M);
    svg.querySelectorAll('[data-sprite-img]').forEach((im) => { const a = AG[im.dataset.spriteImg]; if (a) im.setAttribute('href', spriteUrl(a)); });
    const tileEl = {}; svg.querySelectorAll('.o-tile').forEach((g) => { tileEl[g.dataset.k] = g; });
    const tileAt = {}; BPS.forEach((b) => Z[b.id].tiles.forEach((t) => { tileAt[b.id + '|' + t.name] = t; }));
    // every row that reaches a system in another unit is a possible trip; tools are weighted by their share of calls
    const toks = Array.from(svg.querySelectorAll('.o-tok')).map((el) => {
      const a = AG[el.dataset.a]; const z = Z[a.home];
      const rows = [].concat(a.inputs.map((x) => ({ bp: x.bp, sys: platformOf(x.system), w: x.mode === 'w', wt: 1 })), a.tools.map((x) => ({ bp: x.bp, sys: platformOf(x.system), w: x.mode === 'w', wt: Math.max(0.3, x.w) })), a.outputs.map((x) => ({ bp: x.bp, sys: platformOf(x.dest), w: x.mode === 'w', wt: 1 })))
        .filter((r) => r.bp !== a.home && tileAt[r.bp + '|' + r.sys]);
      return { el, a, z, rows, wt: Math.sqrt(hasTel(a) ? calc(a).rpd : 0) + 2, carry: el.querySelector('.o-carry'), trip: null };
    });
    BPS.forEach((b) => { const zt = toks.filter((k) => k.a.home === b.id); zt.forEach((k, i) => { k.ph = (i / Math.max(1, zt.length)) * Math.PI * 2; }); });
    const pools = Array.from(svg.querySelectorAll('.o-pool-o')).map((el, i) => ({ el, rx: +el.dataset.rx, ry: +el.dataset.ry, ph: i * 1.3 }));
    const orbit = (k, t) => { const th = k.ph + t * 0.22; return { x: k.z.cx + k.z.orx * Math.cos(th), y: k.z.cy + k.z.ory * Math.sin(th) }; };
    const place = (k, x, y) => k.el.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' + (k.trip ? ' scale(1.25)' : ''));
    const setCarry = (k, mode) => { k.carry.setAttribute('class', 'o-carry' + (mode ? ' on ' + mode : '')); };
    const gTr = svg.querySelector('.o-trails'); const gRip = svg.querySelector('.o-rips');
    const arcPath = (a, b) => { const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 36 - Math.abs(b.x - a.x) * 0.12; return 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1); };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      toks.forEach((k) => { const p = orbit(k, 0); place(k, p.x, p.y); const seen = {}; k.rows.forEach((r) => { const key = r.bp + '|' + r.sys; if (seen[key] && !r.w) return; seen[key] = 1; const t = tileAt[key]; const d = document.createElementNS(NS, 'path'); d.setAttribute('d', arcPath(p, t)); d.setAttribute('class', 'o-trail still' + (r.w ? ' w' : '')); gTr.appendChild(d); }); });
      return;
    }
    const feed = $('#one-feed'); const btn = $('#one-act');
    const say = (k, r) => {
      if (!feed) return; const first = feed.querySelector('.muted'); if (first) first.remove();
      const li = document.createElement('li'); li.dataset.agent = k.a.id; if (r.w) li.className = 'w';
      li.innerHTML = '<span class="ts">' + new Date().toTimeString().slice(0, 8) + '</span><b>' + esc(k.a.name.toLowerCase()) + '</b>' + (r.w ? '<span class="vw">' + icon('write', 'mini') + 'wrote to</span>' : '<span class="vr">read from</span>') + '<span>' + esc(r.sys.toLowerCase()) + ' in ' + esc(BP[r.bp].code.toLowerCase()) + '</span>';
      feed.insertBefore(li, feed.firstChild); while (feed.children.length > 4) feed.lastChild.remove();
    };
    let raf = 0; let visible = true; let lastNow = performance.now(); let clock = 0; let nextTrip = 0.3; let paused = false; const rips = [];
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; }) : null; if (io) io.observe(svg);
    const OUT = 1.7, STAY = 1.1, BACK = 1.6;
    const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const pickW = (arr, f) => { const tot = arr.reduce((x, o) => x + f(o), 0); let r = Math.random() * tot; for (const o of arr) { r -= f(o); if (r <= 0) return o; } return arr[arr.length - 1]; };
    const startTrip = (k, t) => {
      const r = pickW(k.rows, (x) => x.wt * (x.w ? 1.4 : 1)); const tile = tileAt[r.bp + '|' + r.sys];
      const a = orbit(k, t); const b = { x: tile.x, y: tile.y - 13 };
      const d = document.createElementNS(NS, 'path'); d.setAttribute('d', arcPath(a, b)); d.setAttribute('class', 'o-trail' + (r.w ? ' w' : '')); gTr.appendChild(d);
      k.trip = { t0: t, r, tile, el: tileEl[r.bp + '|' + r.sys], path: d, len: d.getTotalLength(), hit: false };
      k.el.classList.add('away'); setCarry(k, r.w ? 'w' : '');
    };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
      if (!visible || document.hidden || paused) return;
      clock += dt; const t = clock; const f = svg._focus;
      if (t > nextTrip) {
        nextTrip = t + 0.4 + Math.random() * 0.5;
        const away = toks.filter((k) => k.trip).length;
        const cand = toks.filter((k) => !k.trip && k.rows.length && (!f || k.a.home === f || k.rows.some((r) => r.bp === f)));
        if (away < 8 && cand.length) startTrip(pickW(cand, (k) => k.wt), t);
      }
      toks.forEach((k) => {
        if (!k.trip) { const p = orbit(k, t); place(k, p.x, p.y); return; }
        const tr = k.trip; const el = t - tr.t0;
        if (el < OUT) { const pt = tr.path.getPointAtLength(ease(el / OUT) * tr.len); place(k, pt.x, pt.y); }
        else if (el < OUT + STAY) {
          if (!tr.hit) {
            tr.hit = true; say(k, tr.r); setCarry(k, tr.r.w ? '' : 'r');
            if (tr.el) tr.el.classList.add(tr.r.w ? 'hit-w' : 'hit');
            const e = document.createElementNS(NS, 'ellipse'); e.setAttribute('cx', tr.tile.x); e.setAttribute('cy', tr.tile.y); e.setAttribute('class', 'o-rip' + (tr.r.w ? ' w' : '')); gRip.appendChild(e); rips.push({ e, t0: t });
          }
          const th = (el - OUT) * 3; place(k, tr.tile.x + 12 * Math.cos(th), tr.tile.y - 13 + 4 * Math.sin(th));
        } else if (el < OUT + STAY + BACK) {
          if (tr.el) tr.el.classList.remove('hit', 'hit-w');
          const pt = tr.path.getPointAtLength((1 - ease((el - OUT - STAY) / BACK)) * tr.len); place(k, pt.x, pt.y); tr.path.style.opacity = Math.max(0.1, 1 - (el - OUT - STAY) / BACK);
        } else { tr.path.remove(); k.trip = null; k.el.classList.remove('away'); setCarry(k, ''); const p = orbit(k, t); place(k, p.x, p.y); }
      });
      for (let i = rips.length - 1; i >= 0; i--) { const q = rips[i]; const k = (t - q.t0) / 1.1; if (k >= 1) { q.e.remove(); rips.splice(i, 1); continue; } q.e.setAttribute('rx', (9 + 26 * k).toFixed(1)); q.e.setAttribute('ry', (7 + 12 * k).toFixed(1)); q.e.style.opacity = (1 - k).toFixed(2); }
      pools.forEach((pl) => { const m = 1 + 0.06 * Math.sin(t * 1.8 + pl.ph); pl.el.setAttribute('rx', (pl.rx * m).toFixed(1)); pl.el.setAttribute('ry', (pl.ry * m).toFixed(1)); });
    };
    raf = requestAnimationFrame(tick);
    const zones = Array.from(svg.querySelectorAll('.o-zone'));
    svg.addEventListener('mouseover', (e) => { const g = e.target.closest('.o-zone'); const id = g ? g.dataset.p : null; if (svg._focus === id) return; svg._focus = id; svg.classList.toggle('focus', !!id); zones.forEach((z) => z.classList.toggle('on', z.dataset.p === id)); });
    svg.addEventListener('mouseleave', () => { svg._focus = null; svg.classList.remove('focus'); zones.forEach((z) => z.classList.remove('on')); });
    const stageEl = $('#o-3d');
    if (stageEl) {
      stageEl.addEventListener('mousemove', (e) => { const r = stageEl.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; svg.style.setProperty('--ry', (x * 4).toFixed(2) + 'deg'); svg.style.setProperty('--rx', (9 + y * 4).toFixed(2) + 'deg'); });
      stageEl.addEventListener('mouseleave', () => { svg.style.removeProperty('--ry'); svg.style.removeProperty('--rx'); });
    }
    const setPaused = (v) => { paused = v; svg.classList.toggle('paused', v); if (btn) { btn.setAttribute('aria-pressed', String(!v)); btn.classList.toggle('off', v); btn.lastChild.textContent = v ? 'Paused' : 'Live'; btn.title = v ? 'Resume the motion' : 'Pause the motion'; } };
    setPaused(false);
    STACK = { stop() { cancelAnimationFrame(raf); if (io) io.disconnect(); }, toggle() { setPaused(!paused); } };
  }

  // the "i" legend at the top of the home visual, written for whichever draft is showing
  function homeLegend(d) {
    const sw = (inner, w) => '<svg class="lg-sw" viewBox="0 0 ' + (w || 28) + ' 20" width="' + (w || 28) + '" height="20" aria-hidden="true">' + inner + '</svg>';
    const item = (svg, title, text) => '<li>' + svg + '<span><b>' + title + '</b> ' + text + '</span></li>';
    const tile = (cls, t) => sw('<rect class="lg-tile ' + cls + '" x="5" y="3" width="18" height="14" rx="2.5"/><text class="lg-tt ' + cls + '" x="14" y="13.3">' + t + '</text>');
    if (d === 3) {
      return '<h3>How to read this view</h3><p class="hinfo-lead">Every business unit is a zone holding its people, its systems and its agents. Agents travel to the systems they use in other units, so the motion is the data moving.</p><div class="lg-cols"><div>' +
        '<h4>Business units</h4><ul>' +
        item(sw('<rect class="lg-zone" x="2" y="2" width="24" height="16" rx="4"/>'), 'Zone.', 'One business unit. Wider zones handle more API requests a day.') +
        item(sw('<path class="lg-chev" d="M8 5l5 5-5 5M15 5l5 5-5 5"/>'), 'Flow.', 'The middle row is the core value chain, left to right. Governance sits above it, enabling functions below.') +
        item(sw('<circle class="lg-ppl" cx="7" cy="10" r="2"/><circle class="lg-ppl" cx="13" cy="10" r="2"/><circle class="lg-ppl" cx="19" cy="10" r="2"/>'), 'People.', 'About one dot per eight people who use agents there. The number is the total.') +
        '</ul><h4>Data</h4><ul>' +
        item(tile('c1', 'S4'), 'System.', 'Two-letter code for a source system, such as S4 for SAP S/4HANA. Hover for the full name.') +
        item(tile('c2', 'BQ'), 'Shared.', 'Two or three agents use it.') +
        item(tile('c3', 'S4'), 'Hot spot.', 'Four or more agents use it.') +
        item(tile('c1 w', 'SN'), 'Written to.', 'Tangerine edge: at least one agent writes to it.') +
        '</ul></div><div><h4>Agents</h4><ul>' +
        item(sw('<rect class="lg-tok" x="6" y="2" width="16" height="16" rx="3.5"/>'), 'Agent.', 'Its own sprite, circling its home systems. Select one to open it.') +
        item(sw('<rect class="lg-tok deg" x="6" y="2" width="16" height="16" rx="3.5"/>'), 'Degraded.', 'Tangerine ring. A crimson ring means an incident.') +
        '</ul><h4>Movement</h4><ul>' +
        item(sw('<path class="lg-trail" d="M2 16 Q14 0 26 16"/><circle class="lg-dot r" cx="20" cy="9" r="3"/>'), 'Read.', 'Dashed trip to a system in another unit; the agent carries a navy dot of data home.') +
        item(sw('<path class="lg-trail w" d="M2 16 Q14 0 26 16"/><circle class="lg-dot w" cx="20" cy="9" r="3"/>'), 'Write.', 'Tangerine trip; the agent drops data into the system, which flashes and ripples.') +
        item(sw('<rect class="lg-act" x="1" y="3" width="26" height="14" rx="3"/><circle class="lg-beat" cx="8" cy="10" r="2.5"/>'), 'Active.', 'Busier agents travel more often. Select Active to pause, again to resume. The feed below lists the latest trips.') +
        '</ul><h4>Interact</h4><p class="hinfo-p">Hover a zone to see only its traffic. Use the layer buttons to fade people, agents or data. Sample data, not live telemetry.</p></div></div>';
    }
    if (d === 2) {
      return '<h3>How to read the deep dive</h3><p class="hinfo-lead">Three bands, one column per business unit: people on top, agents in the middle, systems at the base. Curves join each agent to the systems it uses and the people it serves.</p><div class="lg-cols"><div><ul>' +
        item(sw('<circle class="lg-grp" cx="14" cy="10" r="6"/>'), 'User group.', 'Sized by people.') +
        item(tile('c1', 'BQ'), 'System.', 'Darker when more agents touch it; tangerine edge when one writes to it.') +
        '</ul></div><div><ul>' +
        item(sw('<path class="lg-trail solid" d="M2 16 Q14 0 26 16"/>'), 'Reads.', 'Navy curve.') +
        item(sw('<path class="lg-trail w solid" d="M2 16 Q14 0 26 16"/>'), 'Writes.', 'Tangerine curve. Hover a unit or an agent to trace its curves.') +
        '</ul></div></div>';
    }
    return '<h3>How to read draft 1</h3><p class="hinfo-lead">Three stacked planes, people on top, agents in the middle, data at the base. A process keeps the same spot on every plane.</p><ul>' +
      item(sw('<rect class="lg-tok" x="9" y="5" width="10" height="10" rx="2"/>'), 'Agent.', 'One square per agent.') +
      item(sw('<ellipse class="lg-pool" cx="14" cy="10" rx="11" ry="5"/>'), 'Data.', 'Larger where more agents touch it.') +
      item(sw('<path class="lg-trail w solid" d="M2 16 Q14 0 26 16"/>'), 'Writes.', 'Tangerine arcs write into another process; navy arcs read.') + '</ul>';
  }
  function bindHome() { if (state.homeDraft === 1) bindStack(); else if (state.homeDraft === 2) bindLayers(); else bindOne(); }

  // ---- home page: a dark executive briefing. Hero and live map first, then one section per question a CXO asks.
  const hxNum = (v, fmt) => {
    const f = (x) => hxFmt(x, fmt);
    return '<span class="hx-num" data-count="' + v + '" data-fmt="' + fmt + '">' + f(v) + '</span>';
  };
  const hxFmt = (x, fmt) => fmt === 'money' ? '$' + nf.format(Math.round(x)) : fmt === 'cmoney' ? '$' + compact(x) : fmt === 'pct' ? Math.round(x) + '%' : fmt === 'k' ? compact(x) : nf.format(Math.round(x));
  const hxPill = (t, cls) => '<span class="hx-pill' + (cls ? ' ' + cls : '') + '"><i></i>' + esc(t) + '</span>';
  const hxH2 = (a, em, b) => '<h2 class="hx-h2">' + esc(a) + '<em>' + esc(em) + '</em>' + esc(b || '') + '</h2>';
  const hxHead = (kick, a, em, b, side) => '<div class="hx-head rv">' + '<div>' + hxPill(kick) + hxH2(a, em, b) + '</div>' + (side ? '<p class="hx-side">' + esc(side) + '</p>' : '') + '</div>';
  const dayLbl = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toLowerCase();

  function hxMark() {
    const rows = ['......aa......', '.......a......', '...aaaaaaaa...', '...a.aaaa.a...', '...aaaaaaaa...', '...aa....aa...', '...aaaaaaaa...', '.....aaaa.....', '....aaaaaa....'];
    let r = ''; rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === 'a') r += '<rect x="' + (i + 1) + '" y="' + (y + 3) + '" width="1" height="1"/>'; });
    return '<svg viewBox="0 0 16 16" width="28" height="28" shape-rendering="crispEdges">' + r + '</svg>';
  }
  function isoBars(items, fmt) {
    // isometric prisms, tallest one lit; heights animate in when the section is revealed
    const W = 360, H = 236, base = 204, bw = 34, dx = 12, dy = 7; const max = Math.max(1, ...items.map((x) => x.v));
    const gap = (W - 40 - items.length * bw) / Math.max(1, items.length - 1);
    let s = '<svg class="hx-iso" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(items.map((x) => x.label + ' ' + hxFmt(x.v, fmt)).join(', ')) + '">';
    items.forEach((x, i) => {
      const h = Math.max(6, (x.v / max) * 156); const x0 = 20 + i * (bw + gap); const top = base - h; const hot = x.v === max;
      s += '<g class="iso' + (hot ? ' hot' : '') + '" style="--d:' + (i * 70) + 'ms">' +
        '<polygon class="f" points="' + [x0, top + dy, x0 + bw - dx, top + dy, x0 + bw - dx, base, x0, base].join(' ') + '"/>' +
        '<polygon class="s" points="' + [x0 + bw - dx, top + dy, x0 + bw, top, x0 + bw, base - dy, x0 + bw - dx, base].join(' ') + '"/>' +
        '<polygon class="t" points="' + [x0, top + dy, x0 + dx, top, x0 + bw, top, x0 + bw - dx, top + dy].join(' ') + '"/>' +
        '<text class="v" x="' + (x0 + bw / 2) + '" y="' + (top - 8) + '">' + esc(hxFmt(x.v, fmt)) + '</text>' +
        '<text class="l" x="' + (x0 + (bw - dx) / 2) + '" y="' + (base + 20) + '">' + esc(x.label) + '</text></g>';
    });
    return s + '</svg>';
  }
  function sparkSvg(vals, cls) {
    const W = 320, H = 64; const mx = Math.max(1, ...vals), mn = Math.min(...vals);
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 6 - ((v - mn) / ((mx - mn) || 1)) * (H - 14)]);
    const last = pts[pts.length - 1];
    return '<svg class="hx-spark ' + (cls || '') + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.5"/></svg>';
  }

  function renderAll() {
    const list = AGENTS.filter(lifecycleOk);
    const M = homeModel(list); STACK_MODEL = M;
    const n = list.length; const tel = list.filter(hasTel);
    const lifeWord = state.lifecycle === 'all' ? '' : STATUS[state.lifecycle].toLowerCase() + ' ';
    const issues = list.filter((a) => a.health === 'incident' || a.health === 'degraded').sort((x, y) => (x.health === 'incident' ? -1 : 1));
    const inc = issues.filter((a) => a.health === 'incident').length, deg = issues.length - inc;
    const statusTxt = issues.length ? [inc ? inc + ' ' + plural(inc, 'incident') : '', deg ? deg + ' degraded' : ''].filter(Boolean).join(', ') : 'all agents healthy';
    const rpd = tel.reduce((x, a) => x + calc(a).rpd, 0);
    const people = BPS.reduce((x, b) => x + M.per[b.id].users, 0);
    const asOf = DAYS.length ? DAYS[DAYS.length - 1] : new Date();

    // ---- hero + live map
    let h = '<div class="hx">' +
      '<h1 class="sr">All business processes</h1>' +
      '<section class="hx-hero"><div class="hx-hero-top rv">' + hxPill(n + ' ' + lifeWord + plural(n, 'agent') + ' / ' + BPS.length + ' business units / ' + M.plats.length + ' systems') +
      '<span class="hx-status' + (inc ? ' bad' : deg ? ' warn' : '') + '"><i></i>' + esc(statusTxt) + '</span></div>' +
      '<div class="hx-hero-main"><div class="rv"><h2 class="hx-h1">Every agent,<br><em>accounted for.</em></h2>' +
      '<p class="hx-lead">Where each agent works, what it reaches into, what it can change and what it costs, across ' + esc(TENANT.name || 'the enterprise') + '.</p>' +
      '<div class="hx-ctas"><a class="hx-btn lime" href="#hx-exposure" data-hscroll="hx-exposure">See what agents can change</a><button type="button" class="hx-btn ghost" data-hdraft="2">' + icon('chev', 'mini') + 'Open the deep dive</button></div>' +
      '<p class="hx-mono">telemetry to ' + esc(dayLbl(asOf)) + ' / illustrative list prices / sample data</p></div>' +
      '<div class="hx-kpis rv">' +
        '<div><span class="hx-k">' + hxNum(rpd, 'k') + '</span><span class="hx-kl">API requests a day</span></div>' +
        '<div><span class="hx-k">' + hxNum(people, 'int') + '</span><span class="hx-kl">people use them</span></div>' +
        '<div><span class="hx-k">' + hxNum(list.filter((a) => calc(a).crossWrite.length).length, 'int') + '</span><span class="hx-kl">write into another unit</span></div></div></div>' +
      '<div class="hx-map rv" id="hx-map"><div class="hx-map-h"><span class="hx-mono">' + (state.homeDraft === 2 ? 'deep dive' : 'live map') + ' / ' + BPS.length + ' units / ' + n + ' agents</span>' +
        '<div class="hx-map-ctl"><div class="seg sm" role="group" aria-label="Visual">' + [[3, 'Live map'], [2, 'Deep dive']].map(([k, l]) => '<button type="button" class="seg-btn' + (state.homeDraft === k ? ' on' : '') + '" data-hdraft="' + k + '" aria-pressed="' + (state.homeDraft === k) + '">' + l + '</button>').join('') + '</div>' +
        '<div class="seg sm" role="group" aria-label="Focus a layer">' + [['all', 'All'], ['users', 'People'], ['agents', 'Agents'], ['data', 'Data']].map(([k, l]) => '<button type="button" class="seg-btn' + (state.homeLayer === k ? ' on' : '') + '" data-hlayer="' + k + '" aria-pressed="' + (state.homeLayer === k) + '">' + l + '</button>').join('') + '</div>' +
        (state.homeDraft === 2 ? '' : '<button type="button" class="hx-live" id="one-act" data-hlive aria-pressed="true"><i></i><span>Live</span></button>') +
        '<details class="hinfo"><summary aria-label="What this visual shows" title="What this visual shows">' + icon('info') + '</summary><div class="hinfo-pop" role="dialog" aria-label="Legend">' + homeLegend(state.homeDraft === 2 ? 2 : 3) + '</div></details></div></div>' +
        (state.homeDraft === 2 ? '<div class="lv-sheet">' + layersHtml(M) + '</div>' : '<div class="o-3d" id="o-3d">' + oneHtml(M) + '</div>') + '</div></section>';

    // ---- exposure: who can change what another team owns
    const writers = list.filter((a) => calc(a).crossWrite.length);
    const autoN = list.filter((a) => a.auto === 3).length;
    const wTools = list.reduce((x, a) => x.concat(a.tools.filter((t) => t.mode === 'w')), []); const wAppr = wTools.filter((t) => t.approval).length;
    const apprPct = wTools.length ? (wAppr / wTools.length) * 100 : 0;
    const inW = BPS.map((b) => ({ b, v: list.filter((a) => a.home !== b.id && calc(a).touch[b.id] && calc(a).touch[b.id].write).length }));
    const maxIn = Math.max(1, ...inW.map((x) => x.v));
    const riskRows = writers.slice().sort((x, y) => y.auto - x.auto || calc(y).crossWrite.length - calc(x).crossWrite.length || calc(y).rpd - calc(x).rpd).slice(0, 6);
    h += '<section class="hx-sec" id="hx-exposure">' + hxHead('exposure', 'Where agents can ', 'change the books', '.', 'Agents that write outside their home unit can move money, stock or records another team owns. These are the ones a CXO should know by name.') +
      '<div class="hx-stats rv">' +
        '<div class="hx-stat"><span class="hx-ml">writers</span><span class="hx-big">' + hxNum(writers.length, 'int') + '</span><span class="hx-ml">agents write into another unit</span>' +
          '<div class="hx-minis">' + inW.map((x) => '<i style="--h:' + Math.round((x.v / maxIn) * 100) + '%" data-tt="' + esc(x.b.name + ': ' + x.v + ' ' + plural(x.v, 'agent') + ' from other units ' + plural(x.v, 'writes', 'write') + ' into it') + '"></i>').join('') + '</div><span class="hx-tag">writes received, by unit</span></div>' +
        '<div class="hx-stat"><span class="hx-ml">autonomy</span><span class="hx-big">' + hxNum(autoN, 'int') + '</span><span class="hx-ml">act without a person in the loop</span>' +
          '<div class="hx-blocks">' + list.slice().sort((x, y) => y.auto - x.auto).map((a) => '<i class="a' + a.auto + '" data-tt="' + esc(a.name + ': ' + AUTONOMY[a.auto].label) + '"></i>').join('') + '</div><span class="hx-tag">one block per agent; lit is autonomous</span></div>' +
        '<div class="hx-stat"><span class="hx-ml">approvals</span><span class="hx-big">' + hxNum(apprPct, 'pct') + '</span><span class="hx-ml">of write tools wait for a named approver</span>' +
          '<div class="hx-track"><i style="--w:' + apprPct.toFixed(1) + '%"></i></div><span class="hx-tag">' + wAppr + ' of ' + wTools.length + ' write tools</span></div></div>' +
      '<div class="hx-card hx-rows rv"><div class="hx-card-h"><span class="hx-mono">writers to know by name</span><span class="hx-mono dim">sorted by autonomy, then reach</span></div>' +
        riskRows.map((a) => { const c = calc(a); const sys = Array.from(new Set(a.tools.filter((t) => t.mode === 'w' && t.bp !== a.home).map((t) => platformOf(t.system)).concat(a.outputs.filter((o) => o.mode === 'w' && o.bp !== a.home).map((o) => platformOf(o.dest))))).slice(0, 3);
          return '<button type="button" class="hx-row" data-agent="' + esc(a.id) + '"><span class="pix sm">' + spriteEl(a, 26) + '</span><span class="hx-row-n"><b>' + esc(a.name) + '</b><span>' + esc(AUTONOMY[a.auto].label) + ', ' + esc(a.owner) + '</span></span>' +
            '<span class="hx-row-x">' + chip(a.home) + '<span class="hx-into">into</span>' + c.crossWrite.map((x) => chip(x, { write: true })).join('') + '</span><span class="hx-row-s">' + esc(sys.join(' / ').toLowerCase()) + '</span></button>'; }).join('') + '</div></section>';

    // ---- attention: incidents, degraded agents and recent changes
    const recent = list.filter((a) => a.updated && (asOf - Date.parse(a.updated + 'T00:00:00Z')) / 864e5 <= 14).sort((x, y) => y.updated.localeCompare(x.updated)).slice(0, 5);
    h += '<section class="hx-sec" id="hx-attn">' + hxHead('needs a look', 'What needs ', 'attention', ' today.', 'Incidents and degraded agents, with who owns them and what they touch. The console reports; the owning team fixes.') +
      '<div class="hx-attn"><div class="hx-alerts">' + (issues.length ? issues.map((a) => { const c = calc(a);
        return '<div class="hx-card hx-alert ' + a.health + ' rv"><div class="hx-card-h"><span class="hx-mono">#' + esc(BP[a.home].code.toLowerCase()) + '</span><span class="hx-mono dim">' + esc(HEALTH[a.health].toLowerCase()) + '</span></div>' +
          '<div class="hx-alert-b"><span class="pix sm">' + spriteEl(a, 26) + '</span><div><b>' + esc(a.name) + '</b><p>' + esc(a.healthNote || HEALTH[a.health]) + '</p>' +
          '<dl><dt>owner</dt><dd>' + esc(a.owner + (a.ownerTitle ? ', ' + a.ownerTitle : '')) + '</dd><dt>autonomy</dt><dd>' + esc(AUTONOMY[a.auto].label) + '</dd><dt>writes into</dt><dd>' + (c.crossWrite.length ? c.crossWrite.map((x) => esc(BP[x].name)).join(', ') : 'its own unit only') + '</dd><dt>people</dt><dd>' + nf.format(c.users) + '</dd></dl>' +
          '<button type="button" class="hx-btn lime sm" data-agent="' + esc(a.id) + '">Open agent</button></div></div></div>'; }).join('')
        : '<div class="hx-card hx-alert ok rv"><div class="hx-alert-b"><div><b>All agents healthy</b><p>No incidents or degraded agents in this view.</p></div></div></div>') + '</div>' +
      '<div class="hx-card hx-changes rv"><div class="hx-card-h"><span class="hx-mono">changed in the last 14 days</span><span class="hx-mono dim">' + recent.length + '</span></div>' +
        (recent.length ? recent.map((a) => '<button type="button" class="hx-chg" data-agent="' + esc(a.id) + '"><span class="hx-mono dim">' + esc(dayLbl(new Date(a.updated + 'T00:00:00Z'))) + '</span><b>' + esc(a.name) + '</b><span class="hx-mono">v' + esc(a.version) + '</span></button>').join('') : '<p class="hx-empty">No changes in the last two weeks.</p>') +
        '<p class="hx-foot">A change to an agent that writes into another unit is the moment to check its approvals.</p></div></div></section>';

    // ---- spend
    const spendDaily = DAYS.map((_, i) => tel.reduce((x, a) => { const c = calc(a); return x + (c.req30 ? (c.series[i] || 0) / c.req30 * c.total : 0); }, 0));
    const spend = tel.reduce((x, a) => x + calc(a).total, 0);
    const req30 = tel.reduce((x, a) => x + calc(a).req30, 0);
    const wk = (arr, from) => arr.slice(from, from + 7).reduce((x, y) => x + y, 0);
    const chg = spendDaily.length >= 14 && wk(spendDaily, 0) ? Math.round(((wk(spendDaily, spendDaily.length - 7) - wk(spendDaily, 0)) / wk(spendDaily, 0)) * 100) : 0;
    const byBp = BPS.map((b) => ({ b, v: M.per[b.id].agents.filter(hasTel).reduce((x, a) => x + calc(a).total, 0) })).sort((x, y) => y.v - x.v);
    const top = byBp.slice(0, 7);
    h += '<section class="hx-sec" id="hx-spend">' + hxHead('spend', 'What agents ', 'cost', ', and where.', 'Thirty days at illustrative list prices: model tokens, runtime and fees. Real invoices come from the BigQuery billing export.') +
      '<div class="hx-stats rv">' +
        '<div class="hx-stat"><span class="hx-ml">30 days</span><span class="hx-big">' + hxNum(spend, 'money') + '</span><span class="hx-ml">estimated spend, illustrative prices</span>' + sparkSvg(spendDaily.length > 1 ? spendDaily : [0, 0]) + '<span class="hx-tag">' + (Math.abs(chg) < 2 ? 'flat' : (chg > 0 ? 'up ' : 'down ') + Math.abs(chg) + '%') + ' first week to last</span></div>' +
        '<div class="hx-stat"><span class="hx-ml">unit cost</span><span class="hx-big">' + (req30 ? '$' + (spend / req30 * 1000).toFixed(2) : '–') + '</span><span class="hx-ml">per 1,000 API requests</span><div class="hx-track"><i style="--w:' + (spend ? Math.min(100, (byBp[0].v / spend) * 100).toFixed(1) : 0) + '%"></i></div><span class="hx-tag">' + (byBp[0] && spend ? esc(byBp[0].b.name.toLowerCase()) + ' is ' + Math.round((byBp[0].v / spend) * 100) + '% of spend' : '') + '</span></div>' +
        '<div class="hx-stat hx-iso-wrap"><span class="hx-ml">by unit, top seven</span>' + isoBars(top.map((x) => ({ label: x.b.code, v: x.v })), 'cmoney') + '</div></div></section>';

    // ---- activity heatmap + hands-off ring
    const grid = BPS.map((b) => ({ b, d: DAYS.map((_, i) => M.per[b.id].agents.filter(hasTel).reduce((x, a) => x + (calc(a).series[i] || 0), 0)) }));
    const gmax = Math.max(1, ...grid.map((r) => Math.max(...r.d)));
    const handsOff = rpd ? (tel.filter((a) => a.auto === 3).reduce((x, a) => x + calc(a).rpd, 0) / rpd) * 100 : 0;
    const R = 46, C = 2 * Math.PI * R;
    h += '<section class="hx-sec" id="hx-activity">' + hxHead('daily view', 'A month, ', 'seen from', ' the console.', 'Every row is a business unit, every cell a day. Brighter cells carry more API requests.') +
      '<div class="hx-act"><div class="hx-card hx-heat rv"><div class="hx-card-h"><span class="hx-mono">last ' + DAYS.length + ' days, unit by unit</span><span class="hx-pill sm"><i></i>' + esc('telemetry to ' + dayLbl(asOf)) + '</span></div>' +
        '<div class="hx-heat-g" style="--cols:' + DAYS.length + '">' + grid.map((r) => '<button type="button" class="hx-heat-l" data-go="' + r.b.id + '">' + esc(r.b.code) + '</button>' + r.d.map((v, i) => '<i style="--a:' + Math.sqrt(v / gmax).toFixed(3) + '" data-tt="' + esc(r.b.name + ', ' + dayLbl(DAYS[i]) + '\n' + nf.format(Math.round(v)) + ' API requests') + '"></i>').join('')).join('') +
        '<span></span>' + DAYS.map((d, i) => '<span class="hx-heat-x">' + (i % 7 === 0 ? esc(dayLbl(d)) : '') + '</span>').join('') + '</div></div>' +
      '<div class="hx-card hx-ring rv"><div class="hx-card-h"><span class="hx-mono">hands off</span></div><svg viewBox="0 0 120 120" class="hx-ring-s" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="' + R + '"/><circle class="fg" cx="60" cy="60" r="' + R + '" style="--c:' + C.toFixed(1) + ';--off:' + (C * (1 - handsOff / 100)).toFixed(1) + '"/></svg>' +
        '<span class="hx-ring-v">' + hxNum(handsOff, 'pct') + '</span><p>of API requests ran with no person in the loop: autonomous agents only.</p>' +
        '<div class="hx-ring-f"><span class="hx-mono dim">people served</span><b>' + nf.format(people) + '</b></div></div></div></section>';

    // ---- concentration
    const plats = M.plats.map((p) => ({ ...p, agents: new Set([...p.r, ...p.w]).size })).sort((a, b) => b.agents - a.agents || b.rows - a.rows).slice(0, 8);
    const models = {}; list.forEach((a) => { models[a.model] = (models[a.model] || 0) + 1; });
    const plat = {}; list.forEach((a) => { const k = a.platform || 'Unknown'; plat[k] = (plat[k] || 0) + 1; });
    const split = (obj, lab) => { const tot = Object.values(obj).reduce((x, y) => x + y, 0) || 1; return '<div class="hx-split">' + Object.entries(obj).sort((x, y) => y[1] - x[1]).map(([k, v], i) => '<i class="s' + Math.min(i, 3) + '" style="--w:' + ((v / tot) * 100).toFixed(1) + '%" data-tt="' + esc((lab(k)) + ': ' + v + ' ' + plural(v, 'agent')) + '"></i>').join('') + '</div><div class="hx-split-l">' + Object.entries(obj).sort((x, y) => y[1] - x[1]).map(([k, v], i) => '<span><i class="s' + Math.min(i, 3) + '"></i>' + esc(lab(k)) + ' ' + v + '</span>').join('') + '</div>'; };
    h += '<section class="hx-sec" id="hx-conc">' + hxHead('concentration', 'Where one outage ', 'hits many', '.', 'Shared systems, models and platforms. If one of these goes down or changes its terms, every agent on it feels it.') +
      '<div class="hx-tiles rv">' + plats.map((p) => '<div class="hx-tile' + (p.agents >= 10 ? ' hot' : '') + '" data-tt="' + esc(p.name + '\n' + p.agents + ' agents, ' + p.w.size + ' write to it') + '"><span class="hx-tile-c">' + esc(sysAbbr(p.name)) + '</span><span class="hx-tile-n">' + esc(p.name.toLowerCase()) + '</span><span class="hx-tile-v">' + p.agents + ' agents</span></div>').join('') + '</div>' +
      '<div class="hx-two rv"><div class="hx-card"><div class="hx-card-h"><span class="hx-mono">models</span></div>' + split(models, (k) => (PRICES[k] && PRICES[k].label) || k) + '</div>' +
      '<div class="hx-card"><div class="hx-card-h"><span class="hx-mono">runtime platforms</span></div>' + split(plat, (k) => k) + '</div></div></section>';

    // ---- pipeline and governance coverage
    const lanes = ['production', 'review', 'draft'].map((st) => {
      const as = AGENTS.filter((a) => a.status === st); const wt = as.reduce((x, a) => x.concat(a.tools.filter((t) => t.mode === 'w')), []);
      return { st, as, checks: [['owner named', as.filter((a) => a.owner).length, as.length], ['guardrails written', as.filter((a) => a.guard.length).length, as.length], ['telemetry wired', as.filter((a) => a.use).length, as.length], ['write tools with an approver', wt.filter((t) => t.approval).length, wt.length]] };
    });
    h += '<section class="hx-sec" id="hx-pipe">' + hxHead('pipeline', "What's coming, and ", 'how governed', ' it is.', 'Agents move from first draft to review to production. The checks below are what a governance board looks for before go-live.') +
      '<div class="hx-lanes">' + lanes.map((l, i) => '<div class="hx-card hx-lane' + (i === 0 ? ' lit' : '') + ' rv"><span class="hx-mono">' + esc(STATUS[l.st].toLowerCase()) + '</span><span class="hx-big">' + hxNum(l.as.length, 'int') + '</span><span class="hx-mono dim">' + plural(l.as.length, 'agent') + '</span>' +
        '<ul>' + l.checks.map(([t, v, of]) => '<li class="' + (of && v === of ? 'ok' : 'gap') + '">' + icon(of && v === of ? 'check' : 'info', 'mini') + '<span>' + esc(t) + '</span><b>' + v + ' / ' + of + '</b></li>').join('') + '</ul>' +
        '<button type="button" class="hx-btn ' + (i === 0 ? 'lime' : 'ghost') + ' wide" data-life="' + l.st + '">Show ' + esc(STATUS[l.st].toLowerCase()) + ' agents</button></div>').join('') + '</div></section>';

    // ---- people: who uses AI the most (opens the user view for detail)
    const ppl = peopleModel(); const pInter = ppl.reduce((x, f) => x + f.inter, 0);
    if (ppl.length) {
      const topN = ppl.slice(0, 8); const pmax = topN[0].inter;
      const tenth = ppl.slice(0, Math.max(1, Math.ceil(ppl.length * 0.1))).reduce((x, f) => x + f.inter, 0);
      const roleAgg = {}; ppl.forEach((f) => { const k = f.role + '|' + f.bp; roleAgg[k] = roleAgg[k] || { role: f.role, bp: f.bp, n: 0, v: 0 }; roleAgg[k].n++; roleAgg[k].v += f.inter; });
      const topRole = Object.values(roleAgg).sort((x, y) => y.v - x.v)[0];
      const multi = ppl.filter((f) => Object.keys(f.uses).length > 1).length;
      h += '<section class="hx-sec" id="hx-people">' + hxHead('people', 'Who uses AI ', 'the most', '.', 'People ranked by interactions with agents over 30 days, from ' + IDENTITY.source + (IDENTITY.synced ? '' : ' (sample people until the directory sync runs)') + '. Select a person to see their agents, interactions and tokens.') +
        '<div class="hx-stats rv">' +
          '<div class="hx-stat"><span class="hx-ml">people</span><span class="hx-big">' + hxNum(ppl.length, 'int') + '</span><span class="hx-ml">used an agent in 30 days</span><span class="hx-tag">' + nf.format(multi) + ' use more than one</span></div>' +
          '<div class="hx-stat"><span class="hx-ml">concentration</span><span class="hx-big">' + hxNum(pInter ? (tenth / pInter) * 100 : 0, 'pct') + '</span><span class="hx-ml">of interactions come from the busiest 10%</span><div class="hx-track"><i style="--w:' + (pInter ? (tenth / pInter) * 100 : 0).toFixed(1) + '%"></i></div></div>' +
          '<div class="hx-stat"><span class="hx-ml">most active role</span><span class="hx-big hx-big-s">' + esc(topRole.role) + '</span><span class="hx-ml">' + esc(BP[topRole.bp].name.toLowerCase()) + ', ' + topRole.n + ' people, ' + compact(topRole.v) + ' interactions</span></div></div>' +
        '<div class="hx-card hx-rows rv"><div class="hx-card-h"><span class="hx-mono">top ' + topN.length + ' by interactions, 30 days</span><button type="button" class="hx-btn ghost sm" data-huser="|' + esc(topN[0].bp) + '">See everyone</button></div>' +
        topN.map((f, i) => '<button type="button" class="hx-prow" data-huser="' + esc(f.id) + '|' + esc(f.bp) + '"><span class="hx-prk">' + (i + 1) + '</span><span class="uav">' + esc(f.name.split(' ').map((x) => x[0]).join('')) + '</span><span class="hx-row-n"><b>' + esc(f.name) + '</b><span>' + esc(f.role) + '</span></span>' + chip(f.bp) +
          '<span class="hx-pbar"><i style="width:' + ((f.inter / pmax) * 100).toFixed(1) + '%"></i></span><span class="hx-pv"><b>' + nf.format(Math.round(f.inter)) + '</b> interactions</span><span class="hx-pv">' + compact(f.tin + f.tout) + ' tokens</span></button>').join('') + '</div></section>';
    }

    // ---- close: where next + status strip
    const worry = BPS.map((b) => ({ b, v: list.filter((a) => a.home !== b.id && calc(a).touch[b.id] && calc(a).touch[b.id].write).length + M.per[b.id].agents.filter((a) => a.health !== 'healthy' && a.health !== 'unknown').length * 3 })).sort((x, y) => y.v - x.v).slice(0, 6);
    h += '<section class="hx-sec hx-close"><div class="hx-closing"><div class="hx-card hx-brand rv"><span class="brand-mark big" aria-hidden="true">' + hxMark() + '</span><p>Agent governance for ' + esc(TENANT.name || 'the enterprise') + '. Visibility only: the console runs nothing and approves nothing.</p><span class="hx-mono dim">gcp first / vertex ai agent engine / adk</span></div>' +
      '<div class="hx-cta rv"><span class="hx-mono">where next</span><h2 class="hx-h2">Start with the unit <em>you worry about most.</em></h2><p>These units receive the most writes from other units or have an agent that needs attention.</p>' +
      '<div class="hx-cta-go">' + worry.map((x) => '<button type="button" data-go="' + x.b.id + '"><b>' + esc(x.b.code) + '</b>' + esc(x.b.name) + '</button>').join('') + '</div></div></div>' +
      '<div class="hx-strip"><span><i class="' + (inc ? 'bad' : deg ? 'warn' : '') + '"></i>' + esc(statusTxt) + '</span><span><i></i>' + n + ' ' + lifeWord + plural(n, 'agent') + ' across ' + BPS.length + ' units</span><span><i></i>sample data, illustrative prices</span></div></section></div>';

    $('#main').innerHTML = h;
  }

  // home page scroll reveals and counters
  let HX = null;
  function bindHx() {
    if (HX) { HX.stop(); HX = null; }
    const root = $('#main .hx'); if (!root) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const main = $('#main');
    // reveal on scroll
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); countUp(e.target); } }), { root: main, threshold: 0.12 }) : null;
    const countUp = (el) => {
      el.querySelectorAll('.hx-num[data-count]').forEach((n) => {
        const v = +n.dataset.count, fmt = n.dataset.fmt; if (reduce || !v) return;
        const t0 = performance.now(); const dur = 1100;
        const step = (t) => { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); n.textContent = hxFmt(v * e, fmt); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    };
    root.querySelectorAll('.rv').forEach((el) => { if (io && !reduce) io.observe(el); else el.classList.add('in'); });
    HX = { stop() { if (io) io.disconnect(); } };
  }

  /* ---------------------------------------------------------------- Agent modal */
  function renderModal() {
    const dlg = $('#modal');
    if (!state.agent) { if (!dlg.hidden) { dlg.hidden = true; if (!FORM.open) document.body.classList.remove('modal-open'); } return; }
    const a = AG[state.agent]; if (!a) { state.agent = null; dlg.hidden = true; return; } const c = calc(a); const b = BP[a.home];
    const wasHidden = dlg.hidden;
    const tabs = [['overview', 'Overview'], ['data', 'Data sources'], ['spec', 'Agent spec'], ['usage', 'Consumption'], ['value', 'Value']];
    let h = '<div class="m-card" role="document">' +
      '<header class="m-head"><span class="pix lg">' + spriteEl(a, 64) + '</span><div class="m-id">' +
      '<h2 id="m-title">' + esc(a.name) + '</h2>' +
      '<div class="m-home"><span class="m-home-l">Home</span>' + chip(a.home, { home: true, long: true }) + '<span class="m-sub">' + esc(subLabel(a)) + '</span>' + statusPill(a) + healthPill(a) + '</div>' +
      '<div class="m-meta">' + archTag(a) + autoMeter(a, true) + '<span class="meta-i">v' + esc(a.version) + '</span><span class="meta-i">Owner: ' + esc(a.owner) + ', ' + esc(a.ownerTitle) + '</span></div></div>' +
      '<div class="m-actions">' + (canWriteUI() ? '<button type="button" class="btn" data-edit="' + esc(a.id) + '">' + icon('edit') + 'Edit spec</button>' : '') +
      '<button type="button" class="icon-btn" id="m-close" aria-label="Close agent details">' + icon('close') + '</button></div></header>' +
      (a.healthNote ? '<div class="m-alert ' + a.health + '">' + icon(a.health) + '<span>' + esc(a.healthNote) + '</span></div>' : '') +
      '<div class="m-cross">' + (c.cross.length
        ? '<span class="m-cross-l">Crosses into</span><span class="chips">' + crossChips(a) + '</span>' + (c.crossWrite.length ? '<span class="m-cross-w">' + icon('write') + 'Writes into ' + c.crossWrite.length + ' other process' + (c.crossWrite.length > 1 ? 'es' : '') + '</span>' : '<span class="m-cross-r">Reads only outside ' + esc(b.code) + '</span>')
        : '<span class="m-cross-l">Stays inside ' + esc(b.name) + '</span>') + '</div>' +
      '<nav class="tabs" role="tablist" aria-label="Agent details">' + tabs.map(([k, l]) => '<button type="button" role="tab" id="tab-' + k + '" class="tab' + (state.tab === k ? ' on' : '') + '" data-tab="' + k + '" aria-selected="' + (state.tab === k) + '" aria-controls="m-panel">' + l + '</button>').join('') + '</nav>' +
      '<div class="m-body" id="m-panel" role="tabpanel" aria-labelledby="tab-' + state.tab + '">' + (a.sample ? '<div class="notice sm">' + icon('info') + '<span>Generated sample. Specs and telemetry for this agent are placeholders until its process is detailed.</span></div>' : '') + panel(a, c) + '</div></div>';
    dlg.innerHTML = h; dlg.hidden = false; document.body.classList.add('modal-open');
    paintSprites(); bindChart();
    if (wasHidden) { hideTT(); state._lastFocus = document.activeElement; $('#m-close').focus(); }
  }

  function panel(a, c) {
    switch (state.tab) {
      case 'data': return panelData(a, c);
      case 'spec': return panelSpec(a, c);
      case 'usage': return panelUsage(a, c);
      case 'value': return '<div class="value-empty"><div class="ve-mark" aria-hidden="true"></div><h3>Value</h3><p>Not defined yet. How value is measured and shown for each agent is still being worked out.</p></div>';
      default: return panelOverview(a, c);
    }
  }

  function panelOverview(a, c) {
    const approvals = a.tools.filter((t) => t.approval);
    let h = '<div class="home-why"><div class="hw-r"><small>Why ' + esc(BP[a.home].name) + ' is its home</small><span>' + esc(homeReason(a)) + (a.basisNote ? ' <span class="hw-note">' + esc(a.basisNote) + '</span>' : '') + '</span></div></div>';
    h += '<div class="ov-grid"><div class="ov-desc"><h3>What it does</h3><p>' + esc(a.desc) + '</p>' +
      '<dl class="kv"><dt>Trigger</dt><dd>' + esc(a.trigger) + '</dd><dt>Platform</dt><dd>' + esc(a.platform) + '</dd><dt>Framework</dt><dd>' + esc(a.framework) + '</dd><dt>Model</dt><dd>' + esc(PRICES[a.model].label) + ' <span class="mono muted">' + esc(a.model) + '</span></dd>' +
      '<dt>GCP project</dt><dd class="mono">' + esc(a.project || '–') + (a.region ? ', ' + esc(a.region) : '') + '</dd><dt>In production since</dt><dd>' + fmtDate(a.deployed) + '</dd><dt>Last changed</dt><dd>' + fmtDate(a.updated) + '</dd>' +
      '<dt>Registered</dt><dd>' + (a.source === 'console' ? 'In this console' + (a.createdBy ? ' by <span class="who" data-uid="' + esc(a.createdBy) + '">a colleague</span>' : '') + ', ' + fmtDate(a.createdAt) : 'Imported with the sample dataset') + '</dd></dl></div>' +
      '<aside class="ov-gov"><h3>Governance at a glance</h3><ul class="gov">' +
      '<li><span>Autonomy</span><b>' + autoMeter(a, true) + '</b></li>' +
      '<li><span>Processes touched</span><b>' + (c.cross.length + 1) + '</b></li>' +
      '<li><span>Writes outside ' + esc(BP[a.home].code) + '</span><b class="' + (c.crossWrite.length ? 'warn-t' : '') + '">' + (c.crossWrite.length ? c.crossWrite.map((x) => BP[x].code).join(', ') : 'None') + '</b></li>' +
      '<li><span>Tools with write access</span><b>' + a.tools.filter((t) => t.mode === 'w').length + ' of ' + a.tools.length + '</b></li>' +
      '<li><span>Human approval points</span><b>' + (approvals.length ? approvals.length : 'None') + '</b></li>' +
      '<li><span>Guardrails</span><b>' + a.guard.length + '</b></li>' +
      '</ul>' + (approvals.length ? '<p class="gov-note">Approvals: ' + approvals.map((t) => '<span class="mono">' + esc(t.name) + '</span> by ' + esc(t.approval)).join('; ') + '.</p>' : '') + '</aside></div>';

    // footprint matrix
    const rows = Object.keys(c.touch).sort((x, y) => (x === a.home ? -1 : y === a.home ? 1 : BP[x].tier - BP[y].tier || BPS.indexOf(BP[x]) - BPS.indexOf(BP[y])));
    h += '<h3 class="mt">Process footprint</h3><p class="sec-sub">Each row is a business process this agent touches. A process counts as crossed if any data input, tool or output belongs to it. Users in another process count as secondary users.</p>';
    h += '<div class="fp-wrap"><table class="fp"><thead><tr><th>Process</th>' + STAGES.map((s) => '<th>' + s + '</th>').join('') + '</tr></thead><tbody>';
    rows.forEach((id) => {
      const t = c.touch[id]; const home = id === a.home;
      h += '<tr class="' + (home ? 'fp-home' : t.write ? 'fp-w' : 'fp-r') + '"><th scope="row">' + chip(id, { write: home ? null : t.write, home }) + '<span class="fp-name">' + esc(BP[id].name) + '</span><span class="fp-tag">' + (home ? 'Home' : t.write ? icon('write') + 'Writes' : 'Reads') + '</span></th>';
      STAGES.forEach((s) => {
        const items = t.stages[s] || [];
        h += '<td>' + (items.length ? items.map((i) => '<span class="fp-i' + (i.mode === 'w' ? ' w' : '') + '">' + (s === 'Tools' ? '<span class="mono">' + esc(i.item) + '</span>' : esc(i.item)) + (s !== 'Users' ? '<span class="rw">' + (i.mode === 'w' ? 'W' : 'R') + '</span>' : '') + '</span>').join('') : '<span class="muted">–</span>') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function systemRoot(s) { return s.split(' · ')[0]; }
  function panelData(a, c) {
    const rows = [];
    a.inputs.forEach((x) => rows.push({ sys: x.system, what: x.what, stage: 'Input', bp: x.bp, mode: x.mode }));
    a.tools.forEach((x) => rows.push({ sys: x.system, what: x.name, stage: 'Tool', bp: x.bp, mode: x.mode, mono: true }));
    a.outputs.forEach((x) => rows.push({ sys: x.dest, what: x.what, stage: 'Output', bp: x.bp, mode: x.mode }));
    const roots = {}; rows.forEach((r) => { const k = systemRoot(r.sys); (roots[k] = roots[k] || { bps: new Set(), w: false }); roots[k].bps.add(r.bp); if (r.mode === 'w') roots[k].w = true; });
    let h = '<h3>Source systems</h3><p class="sec-sub">' + Object.keys(roots).length + ' systems across ' + (c.cross.length + 1) + ' processes. Marked at the system level for now.</p>';
    h += '<div class="sys-grid">' + Object.keys(roots).map((k) => '<div class="sys"><b>' + esc(k) + '</b><span class="chips">' + Array.from(roots[k].bps).map((bp) => chip(bp, { write: rows.some((r) => systemRoot(r.sys) === k && r.bp === bp && r.mode === 'w') })).join('') + '</span><small>' + (roots[k].w ? 'Read & write' : 'Read only') + '</small></div>').join('') + '</div>';
    h += '<h3 class="mt">Where each piece comes from and goes</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Stage</th><th>System</th><th>What</th><th>Process</th><th>Access</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td><span class="stage s-' + r.stage.toLowerCase() + '">' + r.stage + '</span></td><td>' + esc(r.sys) + '</td><td>' + (r.mono ? '<span class="mono">' + esc(r.what) + '</span>' : esc(r.what)) + '</td><td>' + chip(r.bp, { write: r.bp === a.home ? null : r.mode === 'w' }) + (r.bp !== a.home ? '<span class="xflag">crosses</span>' : '') + '</td><td>' + (r.mode === 'w' ? '<span class="acc w">' + icon('write') + 'Write</span>' : '<span class="acc">Read</span>') + '</td></tr>').join('') +
      '</tbody></table></div>';
    h += '<div class="todo-note">' + icon('info') + '<span>Next: detailed lineage per source (tables, fields, freshness, data owner). On the backend to-do list.</span></div>';
    return h;
  }

  function agentMd(a, c) {
    const yaml = [
      '---',
      'agent_id: ' + a.id,
      'name: ' + a.name,
      'version: ' + a.version,
      'lifecycle: ' + a.status,
      'owner: ' + a.owner + '  # ' + a.ownerTitle,
      'home_process: ' + BP[a.home].code + '  # follows from home_subprocess',
      'home_subprocess: ' + (a.sub || 'all') ,
      'home_basis: ' + a.basis + '  # ' + homeReason(a),
      'processes_touched: [' + [a.home].concat(c.cross).map((x) => BP[x].code).join(', ') + ']',
      'archetype: ' + a.arch,
      'autonomy: ' + ['', 'advise', 'act_with_approval', 'autonomous'][a.auto],
      'platform: ' + a.platform,
      'framework: ' + a.framework,
      'gcp_project: ' + a.project,
      'region: ' + a.region,
      'model:',
      '  primary: ' + a.model,
      '  temperature: ' + a.temp,
      'trigger: "' + a.trigger.replace(/"/g, '\'') + '"',
      '---', ''
    ];
    const md = ['## Purpose', a.desc, '', '## Instructions', a.instr, '',
      '## Data inputs', '| Source | What | Process | Access |', '|---|---|---|---|'].concat(
      a.inputs.map((x) => '| ' + x.system + ' | ' + x.what + ' | ' + BP[x.bp].code + ' | ' + (x.mode === 'w' ? 'write' : 'read') + ' |'),
      ['', '## Tools', '| Tool | System | Process | Access | Approval |', '|---|---|---|---|---|'],
      a.tools.map((t) => '| ' + t.name + ' | ' + t.system + ' | ' + BP[t.bp].code + ' | ' + (t.mode === 'w' ? 'write' : 'read') + ' | ' + (t.approval || '-') + ' |'),
      ['', '## Outputs', '| Destination | What | Process |', '|---|---|---|'],
      a.outputs.map((o) => '| ' + o.dest + ' | ' + o.what + ' | ' + BP[o.bp].code + ' |'),
      ['', '## Users', '| Process | Role | People |', '|---|---|---|'],
      a.users.map((u) => '| ' + BP[u.bp].code + ' | ' + u.role + ' | ' + u.n + ' |'),
      ['', '## Guardrails'], a.guard.map((g) => '- ' + g),
      ['', '## Telemetry'], a.telemetry.map((t) => '- ' + t));
    return yaml.concat(md).join('\n');
  }

  function panelSpec(a, c) {
    let h = '<div class="spec-top"><div><h3>Instructions (system prompt)</h3><pre class="code">' + esc(a.instr) + '</pre></div>' +
      '<aside><h3>Configuration</h3><dl class="kv"><dt>Model</dt><dd class="mono">' + esc(a.model) + '</dd><dt>Temperature</dt><dd class="mono">' + a.temp + '</dd><dt>Archetype</dt><dd>' + esc(ARCH[a.arch].label) + '</dd><dt>Autonomy</dt><dd>' + esc(AUTONOMY[a.auto].label) + '</dd><dt>Trigger</dt><dd>' + esc(a.trigger) + '</dd><dt>Runtime</dt><dd>' + esc(a.platform) + '</dd></dl></aside></div>';
    h += '<h3 class="mt">Tools <span class="count">' + a.tools.length + '</span></h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tool</th><th>What it does</th><th>System</th><th>Process</th><th>Access</th><th>Approval</th><th class="num">Calls, 30d</th></tr></thead><tbody>' +
      a.tools.map((t, i) => '<tr><td class="mono">' + esc(t.name) + '</td><td>' + esc(t.desc) + '</td><td>' + esc(t.system) + '</td><td>' + chip(t.bp, { write: t.bp === a.home ? null : t.mode === 'w' }) + '</td><td>' + (t.mode === 'w' ? '<span class="acc w">' + icon('write') + 'Write</span>' : '<span class="acc">Read</span>') + '</td><td>' + (t.approval ? esc(t.approval) : '<span class="muted">None</span>') + '</td><td class="num">' + (hasTel(a) ? nf.format(c.toolCallsBy[i].calls) : '–') + '</td></tr>').join('') +
      '</tbody></table></div>';
    h += '<h3 class="mt">Guardrails</h3><ul class="guard">' + a.guard.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul>';
    h += '<details class="md"><summary>View Agent.md</summary><div class="md-bar"><span class="mono muted">' + esc(a.id) + '/Agent.md</span><button type="button" class="btn sm" id="copy-md">' + icon('copy') + 'Copy</button></div><pre class="code" id="md-src">' + esc(agentMd(a, c)) + '</pre></details>';
    return h;
  }

  function panelUsage(a, c) {
    if (a.status !== 'production') return '<div class="value-empty"><h3>No production telemetry yet</h3><p>This agent is ' + STATUS[a.status].toLowerCase() + '. Consumption appears here once it is deployed to production and tagged with its agent_id.</p></div>';
    if (!a.use) return '<div class="value-empty"><h3>Awaiting telemetry</h3><p>This agent is registered as in production, but no usage has arrived yet. The ingestion job fills this tab once its GCP resources carry the label <span class="mono">agent_id=' + esc(a.id) + '</span> and traces reach Cloud Trace.</p></div>';
    const p = PRICES[a.model];
    const share = Math.round(a.use.ms * 100);
    let h = '<p class="use-lead">' + esc(compact(c.rpd)) + ' API requests a day from ' + nf.format(c.users) + ' ' + plural(c.users, 'person', 'people') + '. An estimated ' + money(Math.round(c.total)) + ' over the last 30 days, about ' + money(c.perInv, c.perInv < 0.1 ? 3 : 2) + ' a run.</p>' +
      '<dl class="figs"><div><dt>' + (a.arch === 'conversational' ? 'Chat sessions' : 'Runs') + ', 30 days</dt><dd>' + nf.format(a.use.inv) + '</dd></div>' +
      '<div><dt>Input tokens, 30 days</dt><dd>' + compact(c.tokIn) + '<small>' + compact(a.use.tin) + ' per model call</small></dd></div>' +
      '<div><dt>Output tokens, 30 days</dt><dd>' + compact(c.tokOut) + '<small>' + compact(a.use.tout) + ' per model call</small></dd></div>' +
      '<div><dt>Model calls</dt><dd>' + share + '%<small>' + (100 - share) + '% of requests are tool calls</small></dd></div></dl>';
    h += '<div class="chart-card"><div class="chart-h"><h3>API requests per day</h3><span class="muted">Oct 20 to Nov 18, 2026</span></div><div class="chart" id="chart" data-agent="' + a.id + '"></div></div>';
    const maxU = Math.max.apply(null, a.users.map((u) => u.n));
    const users = a.users.slice().sort((x, y) => y.n - x.n);
    const maxT = Math.max.apply(null, c.toolCallsBy.map((t) => t.calls)) || 1;
    h += '<div class="two"><div class="card"><h3>Users by process</h3><p class="sec-sub s">The home process is marked Primary; the others are secondary users.</p>' +
      users.map((u) => '<div class="hbar" data-tt="' + esc(BP[u.bp].name + '\n' + u.role + ': ' + u.n + ' people') + '"><span class="hb-l">' + chip(u.bp, {}) + '<span class="hb-role">' + esc(u.role) + '</span>' + (u.bp === a.home ? '<span class="tag">Primary</span>' : '') + '</span><span class="hb-track"><i class="' + (u.bp === a.home ? 'home' : '') + '" style="width:' + ((u.n / maxU) * 100).toFixed(1) + '%"></i></span><span class="hb-v">' + nf.format(u.n) + '</span></div>').join('') + '</div>' +
      '<div class="card"><h3>Tool calls, 30 days</h3><p class="sec-sub s">' + nf.format(c.toolCalls) + ' tool calls and ' + nf.format(c.modelCalls) + ' model calls.</p>' +
      c.toolCallsBy.slice().sort((x, y) => y.calls - x.calls).map((t) => '<div class="hbar" data-tt="' + esc(t.name + '\n' + nf.format(t.calls) + ' calls, ' + (t.mode === 'w' ? 'writes' : 'reads') + ' in ' + BP[t.bp].name) + '"><span class="hb-l"><span class="mono hb-role">' + esc(t.name) + '</span>' + (t.mode === 'w' ? '<span class="rw w">' + icon('write', 'mini') + 'write</span>' : '') + '</span><span class="hb-track"><i class="neutral" style="width:' + ((t.calls / maxT) * 100).toFixed(1) + '%"></i></span><span class="hb-v">' + compact(t.calls) + '</span></div>').join('') + '</div></div>';
    h += '<div class="two"><div class="card"><h3>Cost breakdown, 30 days</h3><table class="tbl cost"><thead><tr><th>Line</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Cost</th></tr></thead><tbody>' +
      '<tr><td>' + esc(p.label) + ' input tokens</td><td class="num">' + compact(c.tokIn) + '</td><td class="num">' + money(p.in, 2) + ' / 1M</td><td class="num">' + money(c.costIn, 2) + '</td></tr>' +
      '<tr><td>' + esc(p.label) + ' output tokens</td><td class="num">' + compact(c.tokOut) + '</td><td class="num">' + money(p.out, 2) + ' / 1M</td><td class="num">' + money(c.costOut, 2) + '</td></tr>' +
      '<tr><td>Agent Engine runtime</td><td class="num">' + nf.format(a.use.inv) + ' runs</td><td class="num">' + money(RUNTIME[a.arch], 4) + ' / run</td><td class="num">' + money(c.runtime, 2) + '</td></tr>' +
      c.fees.map((f) => '<tr><td>' + esc(f.label) + '</td><td class="num">' + nf.format(f.qty) + ' × ' + esc(f.unit) + '</td><td class="num">' + money(f.rate, 2) + '</td><td class="num">' + money(f.cost, 2) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td>Total</td><td></td><td></td><td class="num">' + money(c.total, 2) + '</td></tr></tfoot></table><p class="fine">Illustrative list prices. In production these come from the BigQuery billing export, filtered by the agent_id label.</p></div>' +
      '<div class="card"><h3>Reliability, 30 days</h3><ul class="gov"><li><span>Error rate</span><b class="' + (a.use.err > 2 ? 'crit-t' : a.use.err > 1 ? 'warn-t' : '') + '">' + a.use.err + '%</b></li><li><span>p95 latency per invocation</span><b>' + (a.use.p95 / 1000).toFixed(1) + ' s</b></li><li><span>Health</span><b>' + healthPill(a) + '</b></li></ul>' +
      '<h3 class="mt">Telemetry sources</h3><ul class="plain">' + a.telemetry.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div></div>';
    return h;
  }
  function utile(v, l, s) { return '<div class="utile"><b>' + esc(v) + '</b><span>' + esc(l) + '</span><small>' + esc(s) + '</small></div>'; }

  /* ---------------------------------------------------------------- chart */
  function niceMax(v) { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function bindChart() {
    const el = $('#chart'); if (!el) return;
    const a = AG[el.dataset.agent]; const sr = calc(a).series;
    const W = Math.max(320, Math.round(el.clientWidth || 720)), H = 220, pl = 8, pr = 64, pt = 28, pb = 28; const iw = W - pl - pr, ih = H - pt - pb;
    const ymax = niceMax(Math.max.apply(null, sr) * 1.08);
    const x = (i) => pl + (i / (sr.length - 1)) * iw; const y = (v) => pt + ih - (v / ymax) * ih;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daily API requests for ' + esc(a.name) + ', last 30 days. Average ' + compact(calc(a).rpd) + ' per day." width="' + W + '" height="' + H + '">';
    if (a.use.pat === 'close') s += '<rect x="' + x(CLOSE_BAND[0] - 0.5) + '" y="' + pt + '" width="' + (x(CLOSE_BAND[1] + 0.5) - x(CLOSE_BAND[0] - 0.5)) + '" height="' + ih + '" class="band"/><text x="' + (x(CLOSE_BAND[0] - 0.5) + 6) + '" y="' + (y(0) - 8) + '" class="band-l">Month-end close</text>';
    s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="base"/>';
    [0, 7, 14, 21, 29].forEach((i) => { s += '<text x="' + x(i) + '" y="' + (H - 8) + '" class="ax" text-anchor="' + (i === 0 ? 'start' : i === 29 ? 'end' : 'middle') + '">' + DAYS[i].toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + '</text>'; });
    const pts = sr.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1));
    const pk = sr.indexOf(Math.max.apply(null, sr));
    s += '<path class="line" d="M' + pts.join(' L') + '"/>';
    if (pk < sr.length - 4) s += '<text class="dl" x="' + x(pk) + '" y="' + (y(sr[pk]) - 10) + '" text-anchor="' + (pk < 3 ? 'start' : pk > sr.length - 4 ? 'end' : 'middle') + '">Peak ' + nf.format(sr[pk]) + '</text>';
    s += '<text class="dl" x="' + (x(sr.length - 1) + 10) + '" y="' + (y(sr[sr.length - 1]) + 4) + '">' + compact(sr[sr.length - 1]) + '</text>';
    const li = sr.length - 1;
    s += '<circle class="end" cx="' + x(li) + '" cy="' + y(sr[li]) + '" r="4"/>';
    s += '<line class="xh" id="xh" x1="0" x2="0" y1="' + pt + '" y2="' + (pt + ih) + '" style="display:none"/><circle class="hov" id="hov" r="4" style="display:none"/>';
    s += '<rect class="hit" x="' + pl + '" y="' + pt + '" width="' + iw + '" height="' + ih + '"/></svg>';
    el.innerHTML = s;
    const svg = $('svg', el), hit = $('.hit', el), xh = $('#xh', el), hov = $('#hov', el);
    function move(ev) {
      const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(li, Math.round(((px - pl) / iw) * li)));
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.style.display = '';
      hov.setAttribute('cx', x(i)); hov.setAttribute('cy', y(sr[i])); hov.style.display = '';
      const d = DAYS[i].toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
      showTT(d + '\n' + nf.format(sr[i]) + ' API requests', ev.clientX, ev.clientY);
    }
    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', () => { xh.style.display = 'none'; hov.style.display = 'none'; hideTT(); });
  }

  /* ---------------------------------------------------------------- tooltip */
  const tt = () => $('#tt');
  function showTT(text, cx, cy, anchor) {
    const el = tt(); el.innerHTML = esc(text).replace(/\n/g, '<br>'); el.hidden = false;
    const w = el.offsetWidth, hgt = el.offsetHeight; const vw = window.innerWidth, vh = window.innerHeight;
    let left, top;
    if (anchor) { left = anchor.left; top = anchor.bottom + 8; if (top + hgt > vh - 8) top = anchor.top - hgt - 8; }
    else { left = cx + 14; top = cy + 14; if (left + w > vw - 8) left = cx - w - 14; if (top + hgt > vh - 8) top = cy - hgt - 14; }
    el.style.left = Math.max(8, Math.min(left, vw - w - 8)) + 'px'; el.style.top = Math.max(8, top) + 'px';
  }
  function hideTT() { tt().hidden = true; }

  /* ---------------------------------------------------------------- global search */
  function renderSearch(q) {
    const box = $('#gs-results');
    if (!q) { box.hidden = true; return; }
    const ql = q.toLowerCase();
    const hits = AGENTS.filter((a) => (a.name + ' ' + a.short + ' ' + BP[a.home].code + ' ' + BP[a.home].name + ' ' + a.inputs.map((x) => x.system).join(' ')).toLowerCase().includes(ql)).slice(0, 8);
    box.innerHTML = hits.length ? hits.map((a) => '<button type="button" class="gs-hit" data-agent="' + a.id + '">' + '<span class="pix sm">' + spriteEl(a, 24) + '</span><span class="gs-n">' + esc(a.name) + '</span>' + chip(a.home, {}) + (a.status !== 'production' ? statusPill(a) : '') + '</button>').join('') : '<div class="gs-none">No agents match “' + esc(q) + '”</div>';
    box.hidden = false; paintSprites();
  }

  /* ---------------------------------------------------------------- connection state + chrome */
  const writeOk = () => SRC.mode === 'live' && SRC.canWrite !== false && !SRC.writeRefused;
  function canWriteUI() { return writeOk(); }
  function addBtn(bpId) {
    if (writeOk()) return '<button type="button" class="btn primary add-btn" data-add="' + esc(bpId) + '">' + icon('plus') + 'Add agent</button>';
    const why = SRC.mode === 'live' ? 'Your access to this registry is view-only.' : 'Adding agents needs the live registry. This view is showing a read-only snapshot.';
    return '<button type="button" class="btn primary add-btn" disabled data-tt="' + esc(why) + '">' + icon('plus') + 'Add agent</button>';
  }
  function srcPill() {
    if (SRC.mode === 'loading') return '<span class="src-pill loading"><i></i>Connecting…</span>';
    if (SRC.mode === 'snapshot') return '<span class="src-pill snap" data-tt="The live registry could not be reached in this view, so a read-only snapshot is shown."><i></i>Offline snapshot</span>';
    if (SRC.error) return '<span class="src-pill err" data-tt="The connection to the registry dropped. What you see may be out of date."><i></i>Connection lost</span>';
    return '<span class="src-pill live" data-tt="Reading from the registry database. Changes from other people appear live."><i></i>Live registry</span>';
  }
  function bannerHtml() {
    if (SRC.mode === 'snapshot') return '<div class="notice">' + icon('info') + '<span><b>Read-only snapshot.</b> This view can’t reach the live registry (you may be signed out of claude.ai), so it shows the bundled copy. Adding and editing agents is turned off here.</span></div>';
    if (SRC.error) return '<div class="notice warn">' + icon('degraded') + '<span><b>Connection to the registry was lost.</b> What you see may be out of date. Reload the page to reconnect.</span></div>';
    return '';
  }
  function loadingView() {
    return '<div class="state-view">' + (SRC.slow ? '<h2>The registry is taking longer than usual</h2><p>It may be unreachable right now. This page keeps trying and will fill in as soon as the data arrives.</p>' : '<h2>Loading the agent registry</h2><p>Reading processes, agent specs and telemetry.</p>') + '</div>';
  }
  function emptyView() {
    return '<div class="state-view"><h2>The registry is empty</h2><p>No business processes or agents are stored yet. Once the processes and agent specs are loaded into the database, they will appear here automatically.</p></div>';
  }
  async function resolveNames() {
    const els = $$('.who[data-uid]'); if (!els.length || !SRC.user || typeof SRC.user.profiles !== 'function') return;
    const ids = Array.from(new Set(els.map((e) => e.dataset.uid)));
    try { const ps = await SRC.user.profiles(ids); els.forEach((e) => { const p = ps[e.dataset.uid]; e.textContent = (p && p.name) || 'a colleague'; }); } catch (e) { /* names are optional */ }
  }
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200); }

  /* ---------------------------------------------------------------- render */
  function render() {
    const ae = document.activeElement; const keepId = ae && (ae.id === 'q' || ae.id === 'dq' || ae.id === 'uq') ? ae.id : null; const keepQ = keepId ? ae.selectionStart : null;
    renderTop();
    if (!SRC.ready) { $('#nav').innerHTML = ''; $('#main').innerHTML = loadingView(); return; }
    if (SRC.empty) { $('#nav').innerHTML = ''; $('#main').innerHTML = bannerHtml() + emptyView(); return; }
    renderNav();
    if (state.view === 'all') renderAll(); else { if (STACK) { STACK.stop(); STACK = null; } renderBP(); }
    const pageKey = state.view === 'all' ? 'all' : state.bp; if (state._page !== pageKey) { state._page = pageKey; $('#main').scrollTop = 0; }
    if (state._scrollUser && state.view === 'bp') { const k = state._scrollUser; state._scrollUser = null; const el = k === 'top' ? $('#sec-agents') : document.querySelector('tr[data-user="' + k + '"]'); if (el) { el.scrollIntoView({ block: k === 'top' ? 'start' : 'center' }); if (k !== 'top') el.focus({ preventScroll: true }); } }
    $('#main').insertAdjacentHTML('afterbegin', bannerHtml());
    renderModal(); paintSprites(); resolveNames();
    $('.app').classList.toggle('home', state.view === 'all');
    if (state.view === 'all') { bindHome(); bindHx(); } else if (HX) { HX.stop(); HX = null; }
    if (keepQ != null) { const q = $('#' + keepId); if (q) { q.focus(); try { q.setSelectionRange(keepQ, keepQ); } catch (e) { /* ignore */ } } }
    document.title = (state.agent && AG[state.agent] ? AG[state.agent].name + ' – ' : state.view === 'all' ? 'All processes – ' : (BP[state.bp] ? BP[state.bp].name + ' – ' : '')) + 'Agent Governance Console';
  }

  /* ---------------------------------------------------------------- add / edit agent form */
  const FORM = { open: false, mode: 'add', editId: null, d: null, idTouched: false, projTouched: false, platTouched: false, errors: {}, saving: false, msg: '', dirty: false, confirm: false, showMd: false };
  const PLATFORMS = ['Vertex AI Agent Engine', 'Gemini Enterprise · Agent Engine', 'Cloud Run', 'GKE', 'Other'];
  const REGIONS = ['us-east4', 'us-east1', 'us-central1', 'us-west1', 'europe-west4', 'asia-southeast1'];
  const ROWS = {
    inputs: { title: 'Data inputs', sub: 'Where the agent reads data from. Tag each source with the process that owns it.', add: 'Add data input',
      cols: [['system', 'Source system', 'SAP S/4HANA · FI-AR'], ['what', 'What it reads', 'Open invoices'], ['process', 'Process'], ['access', 'Access']], req: ['system'], blank: (bp) => ({ system: '', what: '', process: bp, access: 'read' }) },
    tools: { title: 'Tools', sub: 'Every tool the agent can call. Write access to another process is what makes an agent cross-functional.', add: 'Add tool',
      cols: [['name', 'Tool name', 'create_sales_order'], ['description', 'What it does', 'Creates the SD sales order'], ['system', 'System', 'SAP S/4HANA · SD'], ['process', 'Process'], ['access', 'Access'], ['approval_by', 'Approval by', 'None']], req: ['name'], blank: (bp) => ({ name: '', description: '', system: '', process: bp, access: 'read', approval_by: '' }) },
    outputs: { title: 'Outputs', sub: 'Where results land.', add: 'Add output',
      cols: [['destination', 'Destination', 'BigQuery · finance_revenue.booked_orders'], ['what', 'What it writes', 'Booked-order events'], ['process', 'Process'], ['access', 'Access']], req: ['destination'], blank: (bp) => ({ destination: '', what: '', process: bp, access: 'write' }) },
    users: { title: 'Users', sub: 'Who uses or works with the agent. People outside the home process count as secondary users.', add: 'Add user group',
      cols: [['process', 'Process'], ['role', 'Role', 'Order management specialists'], ['people', 'People', '12']], req: ['role', 'people'], blank: (bp) => ({ process: bp, role: '', people: '' }) }
  };
  const LISTS = { guardrails: { title: 'Guardrails', add: 'Add guardrail', ph: 'Orders above $250,000 always go to a person.' }, telemetry_sources: { title: 'Telemetry sources', add: 'Add source', ph: 'Cloud Trace · ADK OpenTelemetry spans' } };
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  const defaultPlatform = (arch) => (arch === 'conversational' ? 'Gemini Enterprise · Agent Engine' : 'Vertex AI Agent Engine');
  const defaultProject = (bp, life) => 'mrd-' + bp + '-agents-' + (life === 'production' ? 'prod' : life === 'review' ? 'stg' : 'dev');

  function blankDraft(bp) {
    return { name: '', agent_id: '', version: '0.1.0', lifecycle: 'draft', owner_name: '', owner_title: '',
      home_process: bp, home_subprocess: '', archetype: 'automation', autonomy: '2', basis_mode: 'rule', basis_note: '',
      summary: '', description: '', trigger: '', platform: defaultPlatform('automation'), framework: 'Google ADK (Python) 1.18',
      gcp_project: defaultProject(bp, 'draft'), region: 'us-east4', model: Object.keys(PRICES)[1] || Object.keys(PRICES)[0] || '', temperature: '0.2', deployed_at: '',
      instructions: '', inputs: [ROWS.inputs.blank(bp)], tools: [ROWS.tools.blank(bp)], outputs: [ROWS.outputs.blank(bp)], users: [ROWS.users.blank(bp)],
      guardrails: [''], telemetry_sources: [] };
  }
  function draftFromDoc(d) {
    const s = (v) => (v == null ? '' : String(v));
    const rows = (list, k, map) => { const r = arr(list).map(map); return r.length ? r : [ROWS[k].blank(d.home_process)]; };
    return { name: s(d.name), agent_id: s(d.agent_id), version: s(d.version), lifecycle: STATUS[d.lifecycle] ? d.lifecycle : 'draft', owner_name: s(d.owner && d.owner.name), owner_title: s(d.owner && d.owner.title),
      home_process: d.home_process, home_subprocess: d.home_subprocess ? s(d.home_subprocess) : '*', archetype: ARCH[d.archetype] ? d.archetype : 'automation', autonomy: s(d.autonomy || 1),
      basis_mode: d.home_basis === 'owner' ? 'owner' : 'rule', basis_note: s(d.home_basis_note), summary: s(d.summary), description: s(d.description), trigger: s(d.trigger),
      platform: s(d.platform), framework: s(d.framework), gcp_project: s(d.gcp_project), region: s(d.region), model: s(d.model && d.model.primary), temperature: s(d.model && d.model.temperature != null ? d.model.temperature : 0.2), deployed_at: s(d.deployed_at),
      instructions: s(d.instructions),
      inputs: rows(d.inputs, 'inputs', (x) => ({ system: s(x.system), what: s(x.what), process: x.process, access: x.access === 'write' ? 'write' : 'read' })),
      tools: rows(d.tools, 'tools', (x) => ({ name: s(x.name), description: s(x.description), system: s(x.system), process: x.process, access: x.access === 'write' ? 'write' : 'read', approval_by: s(x.approval_by) })),
      outputs: rows(d.outputs, 'outputs', (x) => ({ destination: s(x.destination), what: s(x.what), process: x.process, access: x.access === 'read' ? 'read' : 'write' })),
      users: rows(d.users, 'users', (x) => ({ process: x.process, role: s(x.role), people: s(x.people) })),
      guardrails: arr(d.guardrails).length ? arr(d.guardrails).map(s) : [''], telemetry_sources: arr(d.telemetry_sources).map(s) };
  }
  const filled = (row) => Object.keys(row).some((k) => k !== 'process' && k !== 'access' && String(row[k] == null ? '' : row[k]).trim());
  function docFromDraft(d, prev) {
    const now = new Date(); const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const t = (v) => String(v == null ? '' : v).trim();
    const id = t(d.agent_id);
    const tel = d.telemetry_sources.map(t).filter(Boolean);
    return {
      schema_version: 1, agent_id: id, name: t(d.name), version: t(d.version) || '0.1.0', lifecycle: d.lifecycle,
      owner: { name: t(d.owner_name), title: t(d.owner_title) },
      home_process: d.home_process, home_subprocess: !d.home_subprocess || d.home_subprocess === '*' ? null : d.home_subprocess,
      home_basis: d.basis_mode === 'owner' ? 'owner' : BASIS_BY_ARCH[d.archetype], home_basis_note: t(d.basis_note),
      archetype: d.archetype, autonomy: Number(d.autonomy) || 1,
      platform: d.platform, framework: t(d.framework), gcp_project: t(d.gcp_project), region: d.region,
      model: { primary: d.model, temperature: Math.max(0, Math.min(2, Number(d.temperature) || 0)) },
      trigger: t(d.trigger), summary: t(d.summary), description: t(d.description), instructions: String(d.instructions || '').trim(),
      inputs: d.inputs.filter(filled).map((r) => ({ system: t(r.system), what: t(r.what), process: r.process, access: r.access })),
      tools: d.tools.filter(filled).map((r) => ({ name: t(r.name), description: t(r.description), system: t(r.system), process: r.process, access: r.access, approval_by: t(r.approval_by) })),
      outputs: d.outputs.filter(filled).map((r) => ({ destination: t(r.destination), what: t(r.what), process: r.process, access: r.access })),
      users: d.users.filter(filled).map((r) => ({ process: r.process, role: t(r.role), people: Math.max(0, parseInt(r.people, 10) || 0) })),
      guardrails: d.guardrails.map(t).filter(Boolean),
      telemetry_sources: tel.length ? tel : ['Cloud Trace · ADK OpenTelemetry spans', 'BigQuery billing export · label agent_id=' + id],
      deployed_at: d.lifecycle === 'production' ? (t(d.deployed_at) || (prev && prev.deployed_at) || today) : '',
      updated_at: today, created_at: (prev && prev.created_at) || today,
      created_by: prev ? (prev.created_by || null) : (SRC.userId || null), updated_by: SRC.userId || null,
      source: (prev && prev.source) || 'console', sample_generated: prev ? !!prev.sample_generated : false
    };
  }
  function validate(d) {
    const e = {}; const t = (v) => String(v == null ? '' : v).trim();
    if (!t(d.name)) e.name = 'Give the agent a name.';
    const id = t(d.agent_id);
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) e.agent_id = 'Use 2 to 63 lowercase letters, digits or hyphens.';
    else if (FORM.mode === 'add' && AG[id]) e.agent_id = 'Already used by “' + AG[id].name + '”. Pick another ID.';
    if (!/^\d+\.\d+\.\d+$/.test(t(d.version))) e.version = 'Use a version like 1.0.0.';
    if (!t(d.owner_name)) e.owner_name = 'Name the accountable owner.';
    if (!BP[d.home_process]) e.home_process = 'Pick the home process.';
    if (!d.home_subprocess) e.home_subprocess = 'Pick the step this agent performs.';
    if (!t(d.summary)) e.summary = 'Add a one-line description. It shows when people hover the tile.';
    else if (t(d.summary).length > 220) e.summary = 'Keep it under 220 characters (now ' + t(d.summary).length + ').';
    if (!t(d.trigger)) e.trigger = 'Say what starts the agent.';
    if (!t(d.instructions)) e.instructions = 'Paste the system prompt.';
    const temp = Number(d.temperature); if (t(d.temperature) === '' || isNaN(temp) || temp < 0 || temp > 2) e.temperature = 'Use a number from 0 to 2.';
    if (d.lifecycle === 'production' && t(d.deployed_at) && !/^\d{4}-\d{2}-\d{2}$/.test(t(d.deployed_at))) e.deployed_at = 'Use a date.';
    Object.keys(ROWS).forEach((k) => d[k].forEach((r, i) => { if (!filled(r)) return; ROWS[k].req.forEach((c) => { if (!t(r[c])) e[k + '.' + i + '.' + c] = 'Required'; }); }));
    d.users.forEach((r, i) => { if (filled(r) && t(r.people) && !(parseInt(r.people, 10) >= 1)) e['users.' + i + '.people'] = 'Whole number'; });
    if (!d.users.some(filled)) e.users = 'Add at least one user group.';
    const names = d.tools.filter(filled).map((r) => t(r.name)); const dup = names.find((n, i) => n && names.indexOf(n) !== i); if (dup) e.tools = 'Tool “' + dup + '” is listed twice.';
    return e;
  }
  function previewAgent() {
    const d = FORM.d; let a = null;
    try { const doc = docFromDraft(d, FORM.mode === 'edit' && AG[FORM.editId] ? AG[FORM.editId].doc : null); doc.agent_id = doc.agent_id || '__preview'; a = agentFromDoc(doc, null); } catch (e) { a = null; }
    if (a) { a.id = '__preview'; PREVIEW.__preview = a; }
    return a;
  }
  function warnings(a) {
    const w = []; if (!a) return w;
    if (a.basis === 'users') {
      const by = {}; a.users.forEach((u) => { by[u.bp] = (by[u.bp] || 0) + u.n; });
      const top = Object.keys(by).sort((x, y) => by[y] - by[x])[0];
      if (top && top !== a.home && by[top] > (by[a.home] || 0)) w.push('Most of its users are in ' + BP[top].name + '. A conversational agent’s home is where most of its users are, so either move it or pick “Owner’s process” as the basis.');
    }
    if (a.auto === 1 && a.tools.some((t) => t.mode === 'w' && !t.approval)) w.push('It’s marked Advise but has write tools with no approver. Add the approver or raise its autonomy.');
    if (a.auto === 3 && !a.guard.length) w.push('Autonomous agents should list their guardrails.');
    return w;
  }

  const fv = (k) => esc(FORM.d[k] == null ? '' : FORM.d[k]);
  function errAttr(key) { return FORM.errors[key] ? ' aria-invalid="true" aria-describedby="e-' + key.replace(/\./g, '-') + '"' : ''; }
  function errMsg(key) { return FORM.errors[key] ? '<small class="err" id="e-' + key.replace(/\./g, '-') + '">' + esc(FORM.errors[key]) + '</small>' : ''; }
  function fld(key, label, control, o) {
    o = o || {};
    return '<div class="fld' + (o.wide ? ' wide' : '') + (o.full ? ' full' : '') + (FORM.errors[key] ? ' has-err' : '') + '"><label for="f-' + key + '">' + esc(label) + (o.req ? ' <span class="req" aria-hidden="true">*</span><span class="sr"> (required)</span>' : '') + '</label>' + control + (o.hint ? '<small class="hint">' + o.hint + '</small>' : '') + errMsg(key) + '</div>';
  }
  const tIn = (k, ph, extra) => '<input id="f-' + k + '" data-f="' + k + '" type="text" value="' + fv(k) + '" placeholder="' + esc(ph || '') + '"' + errAttr(k) + (extra || '') + '>';
  const tArea = (k, ph, rows, cls) => '<textarea id="f-' + k + '" data-f="' + k + '" rows="' + (rows || 3) + '" class="' + (cls || '') + '" placeholder="' + esc(ph || '') + '"' + errAttr(k) + '>' + fv(k) + '</textarea>';
  const sel = (k, opts, extra) => '<select id="f-' + k + '" data-f="' + k + '"' + errAttr(k) + (extra || '') + '>' + opts.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(FORM.d[k]) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
  function bpOptions(val) {
    return [1, 2, 3].map((t) => '<optgroup label="' + esc((TIERS[t] && TIERS[t].name) || 'Tier ' + t) + '">' + BPS.filter((b) => b.tier === t).map((b) => '<option value="' + b.id + '"' + (b.id === val ? ' selected' : '') + '>' + esc(b.name + ' (' + b.code + ')') + '</option>').join('') + '</optgroup>').join('');
  }
  function rowsBlock(k) {
    const R = ROWS[k]; const d = FORM.d;
    let h = '<fieldset class="f-sec" id="sec-' + k + '"><legend>' + esc(R.title) + (k === 'users' ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</legend><p class="f-help">' + esc(R.sub) + '</p>' + (FORM.errors[k] ? '<p class="err blk" id="e-' + k + '">' + esc(FORM.errors[k]) + '</p>' : '');
    h += '<div class="rows rows-' + k + '"><div class="row-h" aria-hidden="true">' + R.cols.map((c) => '<span>' + esc(c[1]) + (R.req.includes(c[0]) ? ' *' : '') + '</span>').join('') + '<span></span></div>';
    d[k].forEach((r, i) => {
      h += '<div class="row" role="group" aria-label="' + esc(R.title + ' ' + (i + 1)) + '">' + R.cols.map(([c, label, ph]) => {
        const key = k + '.' + i + '.' + c; const ea = errAttr(key); const aria = ' aria-label="' + esc(label + ' ' + (i + 1)) + '"';
        let ctl;
        if (c === 'process') ctl = '<select data-r="' + k + '" data-i="' + i + '" data-k="process"' + aria + '>' + bpOptions(r.process) + '</select>';
        else if (c === 'access') ctl = '<select data-r="' + k + '" data-i="' + i + '" data-k="access"' + aria + '><option value="read"' + (r.access === 'read' ? ' selected' : '') + '>Read</option><option value="write"' + (r.access === 'write' ? ' selected' : '') + '>Write</option></select>';
        else ctl = '<input type="' + (c === 'people' ? 'number' : 'text') + '"' + (c === 'people' ? ' min="1" step="1"' : '') + ' data-r="' + k + '" data-i="' + i + '" data-k="' + c + '" value="' + esc(r[c]) + '" placeholder="' + esc(ph || '') + '"' + aria + ea + (c === 'name' ? ' class="mono"' : '') + '>';
        return '<span class="cell' + (FORM.errors[key] ? ' has-err' : '') + '">' + ctl + errMsg(key) + '</span>';
      }).join('') + '<button type="button" class="icon-btn sm" data-fx="rm" data-r="' + k + '" data-i="' + i + '" aria-label="Remove ' + esc(R.title.toLowerCase() + ' ' + (i + 1)) + '"' + (d[k].length === 1 ? ' disabled' : '') + '>' + icon('trash') + '</button></div>';
    });
    return h + '</div><button type="button" class="btn sm ghost" data-fx="add" data-r="' + k + '">' + icon('plus') + esc(R.add) + '</button></fieldset>';
  }
  function listBlock(k, help) {
    const L = LISTS[k]; const d = FORM.d; const list = d[k].length ? d[k] : [''];
    let h = '<fieldset class="f-sec" id="sec-' + k + '"><legend>' + esc(L.title) + '</legend>' + (help ? '<p class="f-help">' + help + '</p>' : '') + '<div class="list">';
    list.forEach((v, i) => { h += '<div class="lrow"><input type="text" data-l="' + k + '" data-i="' + i + '" value="' + esc(v) + '" placeholder="' + esc(L.ph) + '" aria-label="' + esc(L.title + ' ' + (i + 1)) + '"><button type="button" class="icon-btn sm" data-fx="lrm" data-r="' + k + '" data-i="' + i + '" aria-label="Remove ' + esc(L.title.toLowerCase() + ' ' + (i + 1)) + '">' + icon('trash') + '</button></div>'; });
    return h + '</div><button type="button" class="btn sm ghost" data-fx="ladd" data-r="' + k + '">' + icon('plus') + esc(L.add) + '</button></fieldset>';
  }
  function renderForm(focusSel) {
    const el = $('#form'); const d = FORM.d; const b = BP[d.home_process];
    const scroll = $('.f-main', el) ? $('.f-main', el).scrollTop : 0;
    const subOpts = [['', 'Pick a step…']].concat((b ? b.subs : []).map((s) => [s, s])).concat([['*', 'All steps (spans the whole process)']]);
    let h = '<div class="f-card" role="document"><header class="f-head"><div><div class="eyebrow">' + (FORM.mode === 'add' ? (b ? 'Adding to ' + chip(b.id, { home: true, long: true }) : 'Adding an agent') : 'Editing ' + esc(d.agent_id)) + '</div>' +
      '<h2 id="f-title">' + (FORM.mode === 'add' ? 'Register a new agent' : 'Edit ' + esc(AG[FORM.editId] ? AG[FORM.editId].name : d.name)) + '</h2>' +
      '<p class="f-sub">Each field maps to the agent’s Agent.md. Fields marked <span class="req">*</span> are required.</p></div>' +
      '<button type="button" class="icon-btn" data-fx="close" aria-label="Close the form">' + icon('close') + '</button></header>';
    h += '<div class="f-body"><form class="f-main" id="f-form" novalidate>';
    h += '<fieldset class="f-sec"><legend>Identity</legend><div class="grid2">' +
      fld('name', 'Agent name', tIn('name', 'Order Intake Agent'), { req: true }) +
      fld('agent_id', 'Agent ID', tIn('agent_id', 'o2c-order-intake', FORM.mode === 'edit' ? ' readonly' : '') , { req: true, hint: FORM.mode === 'edit' ? 'The ID is the record key and can’t change.' : 'Becomes the <span class="mono">agent_id</span> label on its GCP resources, which is how telemetry finds it.' }) +
      fld('version', 'Version', tIn('version', '0.1.0'), { req: true }) +
      fld('lifecycle', 'Lifecycle', sel('lifecycle', [['draft', 'First draft'], ['review', 'In review'], ['production', 'Production']]), { req: true }) +
      fld('owner_name', 'Accountable owner', tIn('owner_name', 'Full name'), { req: true }) +
      fld('owner_title', 'Owner’s title', tIn('owner_title', 'Director, Order Management')) +
      '</div></fieldset>';
    h += '<fieldset class="f-sec"><legend>Home and type</legend><p class="f-help">Home is the process that owns the work the agent does. Pick the step it performs and the home follows.</p><div class="grid2">' +
      fld('home_process', 'Home process', '<select id="f-home_process" data-f="home_process"' + errAttr('home_process') + '>' + bpOptions(d.home_process) + '</select>', { req: true }) +
      fld('home_subprocess', 'Step it performs', sel('home_subprocess', subOpts), { req: true }) +
      fld('archetype', 'Type', sel('archetype', Object.keys(ARCH).map((k) => [k, ARCH[k].label])), { req: true, hint: esc(ARCH[d.archetype].blurb) }) +
      fld('autonomy', 'Autonomy', sel('autonomy', [1, 2, 3].map((k) => [String(k), AUTONOMY[k].label])), { req: true, hint: esc(AUTONOMY[d.autonomy].blurb) }) +
      fld('basis_mode', 'Why it lives here', sel('basis_mode', [['rule', 'Rule for its type: ' + BASIS_LABEL[BASIS_BY_ARCH[d.archetype]].toLowerCase()], ['owner', 'Owner’s process (the rule is unclear)']])) +
      fld('basis_note', 'Note on a close call', tIn('basis_note', 'Optional')) +
      '</div></fieldset>';
    h += '<fieldset class="f-sec"><legend>Description</legend><div class="grid2">' +
      fld('summary', 'One-line description', tArea('summary', 'Shown when people hover the agent’s tile.', 2), { req: true, full: true, hint: '<span id="sum-count">' + String(d.summary || '').trim().length + '</span> / 220' }) +
      fld('description', 'Full description', tArea('description', 'What it does, step by step, and why other processes depend on it.', 3), { full: true }) +
      fld('trigger', 'Trigger', tIn('trigger', 'Event: each new order on Pub/Sub topic orders-inbound'), { req: true, full: true }) +
      '</div></fieldset>';
    h += '<fieldset class="f-sec"><legend>Runtime</legend><div class="grid3">' +
      fld('platform', 'Platform', sel('platform', PLATFORMS.concat(PLATFORMS.includes(d.platform) || !d.platform ? [] : [d.platform]).map((p) => [p, p]))) +
      fld('framework', 'Framework', tIn('framework', 'Google ADK (Python) 1.18')) +
      fld('model', 'Model', sel('model', Object.keys(PRICES).map((m) => [m, (PRICES[m].label || m) + ' (' + m + ')'])), { req: true }) +
      fld('gcp_project', 'GCP project', tIn('gcp_project', 'mrd-o2c-agents-prod', ' class="mono"')) +
      fld('region', 'Region', sel('region', REGIONS.concat(REGIONS.includes(d.region) || !d.region ? [] : [d.region]).map((r) => [r, r]))) +
      fld('temperature', 'Temperature', '<input id="f-temperature" data-f="temperature" type="number" min="0" max="2" step="0.1" value="' + fv('temperature') + '"' + errAttr('temperature') + '>', { req: true }) +
      (d.lifecycle === 'production' ? fld('deployed_at', 'In production since', '<input id="f-deployed_at" data-f="deployed_at" type="date" value="' + fv('deployed_at') + '"' + errAttr('deployed_at') + '>', { hint: 'Leave blank to use today.' }) : '') +
      '</div></fieldset>';
    h += '<fieldset class="f-sec"><legend>Instructions (system prompt) <span class="req" aria-hidden="true">*</span></legend><div class="fld full' + (FORM.errors.instructions ? ' has-err' : '') + '"><label class="sr" for="f-instructions">Instructions</label>' + tArea('instructions', 'You are the … agent for Meridian Consumer Brands. You …', 8, 'mono') + errMsg('instructions') + '</div></fieldset>';
    h += rowsBlock('inputs') + rowsBlock('tools') + rowsBlock('outputs') + rowsBlock('users');
    h += listBlock('guardrails') + listBlock('telemetry_sources', 'Leave empty to use Cloud Trace and the BigQuery billing export filtered by this agent’s ID.');
    h += '<button type="submit" hidden></button></form><aside class="f-side" id="f-side" aria-label="Preview"></aside></div>';
    h += '<footer class="f-foot" id="f-foot"></footer></div>';
    el.innerHTML = h; el.hidden = false; document.body.classList.add('modal-open');
    $('.f-main', el).scrollTop = scroll;
    renderSide(); renderFoot();
    if (focusSel) { const f = $(focusSel, el); if (f) f.focus(); }
  }
  function renderSide() {
    const side = $('#f-side'); if (!side) return;
    const a = previewAgent(); const d = FORM.d;
    if (!a) { side.innerHTML = '<p class="muted">Pick a home process to see the preview.</p>'; return; }
    const fp = footprint(a); const cross = Object.keys(fp).filter((k) => k !== a.home).sort((x, y) => BP[x].tier - BP[y].tier || BPS.indexOf(BP[x]) - BPS.indexOf(BP[y]));
    const writes = cross.filter((k) => fp[k].write);
    const t = (v) => String(v == null ? '' : v).trim();
    const checks = [
      ['Identity', t(d.name) && t(d.agent_id) && t(d.owner_name)], ['Home and type', BP[d.home_process] && d.home_subprocess], ['Description and trigger', t(d.summary) && t(d.trigger)],
      ['Instructions', t(d.instructions)], ['Users', d.users.some(filled)],
      ['Inputs, tools and outputs', d.inputs.some(filled) || d.tools.some(filled) || d.outputs.some(filled)]
    ];
    const w = warnings(a);
    let h = '<div class="pv-card"><div class="pv-top"><span class="pix">' + spriteEl(a, 52) + '</span><div><b class="pv-name">' + esc(t(d.name) || 'Unnamed agent') + '</b><span class="mono muted pv-id">' + esc(t(d.agent_id) || 'agent-id') + '</span></div></div>' +
      '<div class="pv-home">' + chip(a.home, { home: true }) + '<span class="hw-arrow">›</span><span>' + esc(d.home_subprocess === '*' ? 'All steps' : d.home_subprocess || 'Step not picked') + '</span></div>' +
      '<p class="pv-why">' + esc(d.home_subprocess ? homeReason(a) : 'Pick the step it performs and its home follows.') + '</p>' +
      '<div class="pv-meta">' + archTag(a) + autoMeter(a, true) + '</div></div>';
    h += '<div class="pv-sec"><h4>Process footprint</h4>' + (cross.length ? '<p>Reaches <span class="chips">' + cross.map((k) => chip(k, { write: fp[k].write })).join('') + '</span></p>' + (writes.length ? '<p class="pv-w">' + icon('write') + 'Writes into ' + writes.map((k) => BP[k].code).join(', ') + '. Those processes will see it in their cross-process section.</p>' : '<p class="muted">Reads only outside ' + esc(BP[a.home].code) + '.</p>') : '<p class="muted">Stays inside ' + esc(BP[a.home].name) + ' so far.</p>') + '</div>';
    h += '<div class="pv-sec"><h4>Checklist</h4><ul class="pv-check">' + checks.map(([l, ok]) => '<li class="' + (ok ? 'ok' : '') + '">' + icon(ok ? 'healthy' : 'unknown') + esc(l) + '</li>').join('') + '</ul></div>';
    if (w.length) h += '<div class="pv-sec"><h4>Worth a look</h4><ul class="pv-warn">' + w.map((x) => '<li>' + icon('degraded') + '<span>' + esc(x) + '</span></li>').join('') + '</ul></div>';
    h += '<div class="pv-sec"><button type="button" class="btn sm ghost" data-fx="md" aria-expanded="' + FORM.showMd + '">' + (FORM.showMd ? 'Hide' : 'Preview') + ' Agent.md</button>' + (FORM.showMd ? '<pre class="code pv-md">' + esc(agentMd(a, { cross })) + '</pre>' : '') + '</div>';
    side.innerHTML = h; paintSprites();
  }
  function renderFoot() {
    const f = $('#f-foot'); if (!f) return;
    if (FORM.confirm) { f.innerHTML = '<span class="f-msg">Discard this draft? Nothing has been saved.</span><div class="f-btns"><button type="button" class="btn" data-fx="keep">Keep editing</button><button type="button" class="btn danger" data-fx="discard">Discard</button></div>'; return; }
    const nErr = Object.keys(FORM.errors).length;
    f.innerHTML = '<span class="f-msg' + (FORM.msg && !FORM.saving ? ' bad' : '') + '" role="status">' + esc(FORM.saving ? 'Saving to the registry…' : FORM.msg || (nErr ? nErr + ' field' + (nErr > 1 ? 's need' : ' needs') + ' attention.' : (SRC.mode === 'live' ? 'Saves to the live registry. Everyone with access sees it right away.' : 'Not connected to the live registry, so this can’t be saved.'))) + '</span>' +
      '<div class="f-btns"><button type="button" class="btn" data-fx="cancel">Cancel</button><button type="button" class="btn primary" data-fx="save"' + (FORM.saving || !writeOk() ? ' disabled' : '') + '>' + (FORM.mode === 'add' ? 'Add agent' : 'Save changes') + '</button></div>';
  }
  function openForm(modeArg, arg) {
    if (!SRC.ready || SRC.empty) return;
    FORM.mode = modeArg; FORM.errors = {}; FORM.msg = ''; FORM.saving = false; FORM.dirty = false; FORM.confirm = false; FORM.showMd = false; FORM.submitted = false;
    if (modeArg === 'edit') { const a = AG[arg]; if (!a) return; FORM.editId = a.id; FORM.d = draftFromDoc(a.doc); FORM.idTouched = FORM.projTouched = FORM.platTouched = true; }
    else { const bp = BP[arg] ? arg : (state.view === 'bp' && BP[state.bp] ? state.bp : BPS[0].id); FORM.editId = null; FORM.d = blankDraft(bp); FORM.idTouched = FORM.projTouched = FORM.platTouched = false; }
    FORM.open = true; FORM.returnFocus = document.activeElement; hideTT();
    renderForm('#f-name');
  }
  function closeForm(force) {
    if (!force && FORM.dirty && !FORM.saving) { FORM.confirm = true; renderFoot(); const k = $('[data-fx="keep"]'); if (k) k.focus(); return; }
    FORM.open = false; FORM.confirm = false; delete PREVIEW.__preview;
    const el = $('#form'); el.hidden = true; el.innerHTML = '';
    if (!state.agent) document.body.classList.remove('modal-open');
    const f = FORM.returnFocus; if (f && document.body.contains(f)) f.focus();
  }
  function focusFirstError() {
    const first = $('#form [aria-invalid="true"]') || $('#form .err.blk');
    if (first) { first.scrollIntoView({ block: 'center' }); if (first.focus) first.focus(); }
  }
  async function writeWithRetry(fn) {
    try { return await fn(); } catch (e) { if (e && e.code === 'unavailable') { await new Promise((r) => setTimeout(r, 400 + Math.random() * 600)); return fn(); } throw e; }
  }
  async function saveForm() {
    if (FORM.saving) return;
    FORM.errors = validate(FORM.d); FORM.submitted = true;
    if (Object.keys(FORM.errors).length) { FORM.msg = ''; renderForm(); focusFirstError(); return; }
    if (!writeOk()) { FORM.msg = 'This view can’t save to the live registry.'; renderFoot(); return; }
    const prev = FORM.mode === 'edit' && AG[FORM.editId] ? AG[FORM.editId].doc : null;
    const doc = docFromDraft(FORM.d, prev);
    FORM.saving = true; FORM.msg = ''; renderFoot();
    try {
      const ref = SRC.db.collection('agents').doc(doc.agent_id);
      if (FORM.mode === 'add') {
        const ex = await ref.get();
        if (ex.exists) { FORM.saving = false; FORM.errors = { agent_id: 'Another agent was just registered with this ID. Pick another.' }; renderForm(); focusFirstError(); return; }
      }
      await writeWithRetry(() => ref.set(doc));
      const id = doc.agent_id; const wasAdd = FORM.mode === 'add';
      closeForm(true);
      toast(wasAdd ? doc.name + ' was added to ' + BP[doc.home_process].name + '.' : 'Saved changes to ' + doc.name + '.');
      if (wasAdd) { state.view = 'bp'; state.bp = doc.home_process; state.lifecycle = state.lifecycle === 'all' || state.lifecycle === doc.lifecycle ? state.lifecycle : doc.lifecycle; }
      state.tab = 'overview';
      if (AG[id] && wasAdd) go('agent-' + id); else if (wasAdd) state.pendingAgent = id;
    } catch (e) {
      FORM.saving = false;
      const code = e && e.code;
      if (code === 'invalid_argument') { SRC.writeRefused = true; FORM.msg = 'The registry refused the save. Your access may be view-only, or a field is too long.'; render(); }
      else if (code === 'quota_exceeded') FORM.msg = 'The registry is full. Remove agents that are no longer used, then try again.';
      else if (code === 'revoked') FORM.msg = 'Your access to this registry changed. Reload the page to continue.';
      else if (code === 'resource_exhausted') FORM.msg = 'Too many changes at once. Wait a few seconds and save again.';
      else FORM.msg = 'Couldn’t reach the registry. Your draft is still here; try saving again.';
      renderFoot();
    }
  }
  function onFormInput(e) {
    const el = e.target; const d = FORM.d; if (!d) return;
    let rerender = null;
    if (el.dataset.f) {
      const k = el.dataset.f; const prevArch = d.archetype; d[k] = el.value;
      if (k === 'name' && FORM.mode === 'add' && !FORM.idTouched) { d.agent_id = (BP[d.home_process] ? d.home_process + '-' : '') + slug(el.value).replace(/-agent$/, ''); const idEl = $('#f-agent_id'); if (idEl) idEl.value = d.agent_id; }
      if (k === 'agent_id') FORM.idTouched = true;
      if (k === 'gcp_project') FORM.projTouched = true;
      if (k === 'platform') FORM.platTouched = true;
      if (k === 'summary') { const c = $('#sum-count'); if (c) c.textContent = el.value.trim().length; }
      if (e.type === 'change' && (k === 'home_process' || k === 'lifecycle')) {
        if (k === 'home_process') {
          const b = BP[d.home_process]; if (d.home_subprocess && d.home_subprocess !== '*' && !(b && b.subs.includes(d.home_subprocess))) d.home_subprocess = '';
          if (FORM.mode === 'add' && !FORM.idTouched && d.name) d.agent_id = d.home_process + '-' + slug(d.name).replace(/-agent$/, '');
          if (FORM.mode === 'add') { ['inputs', 'tools', 'outputs', 'users'].forEach((r) => d[r].forEach((row) => { if (!filled(row)) row.process = d.home_process; })); }
        }
        if (!FORM.projTouched) d.gcp_project = defaultProject(d.home_process, d.lifecycle);
        rerender = '#f-' + k;
      }
      if (e.type === 'change' && (k === 'archetype' || k === 'autonomy')) {
        if (k === 'archetype' && !FORM.platTouched && prevArch !== undefined) d.platform = defaultPlatform(d.archetype);
        rerender = '#f-' + k;
      }
    } else if (el.dataset.r) {
      const row = d[el.dataset.r][+el.dataset.i]; if (!row) return; row[el.dataset.k] = el.value;
    } else if (el.dataset.l) {
      const list = d[el.dataset.l]; const i = +el.dataset.i; if (!list.length) list.push(''); list[i] = el.value;
    } else return;
    FORM.dirty = true;
    // once someone has tried to save, errors clear as soon as they are fixed
    if (FORM.submitted && Object.keys(FORM.errors).length) {
      const fresh = validate(d); let changedErr = false;
      Object.keys(FORM.errors).forEach((k) => {
        if (fresh[k]) return; delete FORM.errors[k]; changedErr = true;
        const m = document.getElementById('e-' + k.replace(/\./g, '-')); if (!m) return;
        const box = m.closest('.has-err'); if (box) { box.classList.remove('has-err'); box.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid')); }
        m.remove();
      });
      if (changedErr) renderFoot();
    }
    if (rerender) renderForm(rerender); else renderSide();
  }
  function onFormClick(e) {
    const b = e.target.closest('[data-fx]'); if (!b) { if (e.target.id === 'form') closeForm(); return; }
    const fx = b.dataset.fx; const d = FORM.d;
    if (fx === 'close' || fx === 'cancel') return closeForm();
    if (fx === 'keep') { FORM.confirm = false; return renderFoot(); }
    if (fx === 'discard') return closeForm(true);
    if (fx === 'save') return saveForm();
    if (fx === 'md') { FORM.showMd = !FORM.showMd; return renderSide(); }
    const k = b.dataset.r; const i = +b.dataset.i;
    if (fx === 'add') { d[k].push(ROWS[k].blank(d.home_process)); FORM.dirty = true; return renderForm('[data-r="' + k + '"][data-i="' + (d[k].length - 1) + '"]:not(select)'); }
    if (fx === 'rm') { if (d[k].length > 1) d[k].splice(i, 1); Object.keys(FORM.errors).forEach((x) => { if (x.startsWith(k + '.')) delete FORM.errors[x]; }); FORM.dirty = true; return renderForm('#sec-' + k + ' [data-fx="add"]'); }
    if (fx === 'ladd') { if (!d[k].length) d[k].push(''); d[k].push(''); FORM.dirty = true; return renderForm('[data-l="' + k + '"][data-i="' + (d[k].length - 1) + '"]'); }
    if (fx === 'lrm') { d[k].splice(i, 1); FORM.dirty = true; return renderForm('#sec-' + k + ' [data-fx="ladd"]'); }
  }
  $('#form').addEventListener('input', onFormInput);
  $('#form').addEventListener('change', onFormInput);
  $('#form').addEventListener('click', onFormClick);
  $('#form').addEventListener('submit', (e) => { e.preventDefault(); saveForm(); });

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.hinfo[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
    if (e.target.closest('#form')) return;
    const t = e.target.closest('[data-go],[data-agent],[data-life],[data-arch],[data-step],[data-hlayer],[data-hdraft],[data-hlive],[data-theme-set],[data-bpview],[data-dsys],[data-dstruct],[data-uscope],[data-user],[data-umore],[data-huser],[data-adddata],#df-close,#df-cancel,#df-save,[data-hscroll],[data-density],[data-cross],[data-tab],[data-collapse],[data-add],[data-edit],#m-close,#copy-md');
    if (!t) { if (!e.target.closest('.gs')) $('#gs-results').hidden = true; if (e.target.id === 'modal') closeModal(); return; }
    if (t.disabled) return;
    if (t.id === 'm-close') return closeModal();
    if (t.id === 'copy-md') {
      const txt = $('#md-src').textContent;
      try { navigator.clipboard.writeText(txt).then(() => { t.lastChild.textContent = 'Copied'; }, () => { t.lastChild.textContent = 'Copy blocked'; }); } catch (err) { t.lastChild.textContent = 'Copy blocked'; }
      return;
    }
    if (t.dataset.add !== undefined) return openForm('add', t.dataset.add);
    if (t.dataset.edit) return openForm('edit', t.dataset.edit);
    if (t.dataset.agent) { $('#gs-results').hidden = true; $('#gs').value = ''; hideTT(); return go('agent-' + t.dataset.agent); }
    if (t.dataset.go) { if (state.agent) state.agent = null; return go(t.dataset.go); }
    if (t.dataset.life) { state.lifecycle = t.dataset.life; return render(); }
    if (t.dataset.arch) { state.arch = t.dataset.arch; return render(); }
    if (t.dataset.hscroll) { e.preventDefault(); const tg = document.getElementById(t.dataset.hscroll); if (tg) tg.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); return; }
    if (t.dataset.bpview) { state.bpView = t.dataset.bpview; savePrefs(); return render(); }
    if (t.id === 'df-close' || t.id === 'df-cancel') return closeDataForm();
    if (t.id === 'df-save') return saveDataForm();
    if (t.dataset.adddata !== undefined) return openDataForm(t.dataset.adddata);
    if (t.dataset.huser) {
      // from the home page: open the user view, enterprise-wide, with this person expanded (or just the list)
      const [id, bp] = t.dataset.huser.split('|'); const rank = id ? peopleModel().findIndex((f) => f.id === id) + 1 : 0;
      Object.assign(state, { view: 'bp', bpView: 'users', uScope: 'all', uSel: id || null, uq: '', uLimit: Math.max(50, Math.ceil(rank / 50) * 50), _keepUser: true, _scrollUser: id || 'top' });
      savePrefs(); return go(bp);
    }
    if (t.dataset.uscope) { state.uScope = t.dataset.uscope; state.uSel = null; state.uLimit = 50; return render(); }
    if (t.dataset.umore !== undefined) { state.uLimit += 50; return render(); }
    if (t.dataset.user) { const k = t.dataset.user; state.uSel = state.uSel === k ? null : k; render(); const r = document.querySelector('tr[data-user="' + k + '"]'); if (r) r.focus(); return; }
    if (t.dataset.dstruct) { state.dStruct = t.dataset.dstruct; return render(); }
    if (t.dataset.dsys) {
      const k = t.dataset.dsys; state.dataSys = state.dataSys === k ? null : k; render();
      const el = state.dataSys ? $('#dpanel') : document.querySelector('[data-dsys="' + CSS.escape(k) + '"]');
      if (el) { if (state.dataSys) el.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); else el.focus(); }
      return;
    }
    if (t.dataset.themeSet) { state.theme = t.dataset.themeSet; savePrefs(); return render(); }
    if (t.dataset.hlive !== undefined) { if (STACK && STACK.toggle) STACK.toggle(); return; }
    if (t.dataset.hdraft) { state.homeDraft = +t.dataset.hdraft; savePrefs(); return render(); }
    if (t.dataset.hlayer) {
      // focus one layer without redrawing, so the animation keeps running
      state.homeLayer = t.dataset.hlayer; ['#stack', '#lv', '#one'].forEach((sel) => { const v = $(sel); if (v) v.dataset.layer = state.homeLayer; });
      document.querySelectorAll('[data-hlayer]').forEach((b) => { const on = b.dataset.hlayer === state.homeLayer; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      return;
    }
    if (t.dataset.step !== undefined) {
      const k = t.dataset.step; state.step = !k || state.step === k ? null : k; render();
      const nb = document.querySelector('[data-step="' + CSS.escape(state.step || '') + '"]'); if (nb) nb.focus();
      return;
    }
    if (t.dataset.density) { state.density = t.dataset.density; savePrefs(); return render(); }
    if (t.dataset.cross) { state.crossTab = t.dataset.cross; return render(); }
    if (t.dataset.collapse) { const k = t.dataset.collapse; state.collapsed[k] = !state.collapsed[k]; savePrefs(); return renderNav(); }
    if (t.dataset.tab) { state.tab = t.dataset.tab; renderModal(); const tb = $('#tab-' + state.tab); if (tb) tb.focus(); }
  });
  function closeModal() { state.agent = null; hideTT(); const f = state._lastFocus; go(state.view === 'all' ? 'all' : state.bp); if (f && document.body.contains(f)) f.focus(); }
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-user]')) { e.preventDefault(); e.target.click(); return; }
    if (e.key === 'Escape') {
      const hi = document.querySelector('details.hinfo[open]'); if (hi) { hi.open = false; hi.querySelector('summary').focus(); return; }
      if (DFORM.open) { closeDataForm(); return; }
      if (FORM.open) { if (FORM.confirm) { FORM.confirm = false; renderFoot(); } else closeForm(); return; }
      if (!$('#gs-results').hidden) { $('#gs-results').hidden = true; return; }
      if (state.agent) closeModal();
    }
    if (e.key === 'Tab') {
      // keep keyboard focus inside the open dialog (form first, then the agent detail)
      const dlg = DFORM.open ? $('#dform') : FORM.open ? $('#form') : state.agent ? $('#modal') : null;
      if (dlg && !dlg.hidden) {
        const f = [...dlg.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
        if (f.length) {
          const first = f[0], last = f[f.length - 1];
          if (!dlg.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
          else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    }
    if (!FORM.open && state.agent && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.classList && e.target.classList.contains('tab')) {
      const keys = ['overview', 'data', 'spec', 'usage', 'value']; let i = keys.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : -1); i = (i + keys.length) % keys.length;
      state.tab = keys[i]; renderModal(); $('#tab-' + state.tab).focus();
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.closest('#form')) return;
    if (e.target.id === 'q') { state.q = e.target.value; render(); }
    if (e.target.id === 'dq') { state.dq = e.target.value; render(); }
    if (e.target.dataset && e.target.dataset.dk && DFORM.open) { const dk = e.target.dataset.dk; DFORM.d[dk] = e.target.value;
      if (DFORM.errors[dk] && String(e.target.value).trim()) { delete DFORM.errors[dk]; const w = e.target.closest('.fld'); if (w) { w.classList.remove('has-err'); const er = w.querySelector('.err'); if (er) er.remove(); } e.target.removeAttribute('aria-invalid'); } if (e.target.dataset.dk === 'data_type') { renderDataForm(); const n = $('#dfield-data_type'); if (n) n.focus(); } return; }
    if (e.target.id === 'uq') { state.uq = e.target.value; state.uLimit = 50; render(); }
    if (e.target.id === 'gs') renderSearch(e.target.value.trim());
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'sort') { state.sort = e.target.value; render(); } });
  document.addEventListener('mouseover', (e) => {
    const tip = e.target.closest('[data-tt]');
    if (tip) { showTT(tip.dataset.tt, 0, 0, tip.getBoundingClientRect()); return; }
    const card = e.target.closest('[data-tip]');
    if (card) showTT(card.dataset.tip, 0, 0, card.getBoundingClientRect());
  });
  document.addEventListener('mouseout', (e) => { const from = e.target.closest('[data-tt],[data-tip]'); if (from && !from.contains(e.relatedTarget)) hideTT(); });
  document.addEventListener('focusin', (e) => { const card = e.target.closest('.tile[data-tip]'); if (card && !state.agent) { const r = card.getBoundingClientRect(); showTT(card.dataset.tip, 0, 0, r); } });
  document.addEventListener('focusout', (e) => { if (e.target.closest('.tile[data-tip]')) hideTT(); });
  $('#main').addEventListener('scroll', hideTT, { passive: true });
  let rsz; window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(bindChart, 120); });
  window.addEventListener('hashchange', () => { if (!SRC.ready) return; parseHash(); render(); });
  if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', paintSprites); }
  new MutationObserver(paintSprites).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------------------------------------------------------------- connect to the registry */
  function afterData() {
    if (state.pendingAgent && AG[state.pendingAgent]) { const id = state.pendingAgent; state.pendingAgent = null; if (location.hash !== '#agent-' + id) { location.hash = 'agent-' + id; return; } }
    if (state.agent && !AG[state.agent]) state.agent = null;
    parseHash(); render();
    if (FORM.open) renderSide();
  }
  async function useSnapshot(reason) {
    SRC.mode = 'snapshot'; SRC.reason = reason; render();
    let S = null;
    try { const r = await fetch('registry-snapshot.json', { cache: 'no-store' }); if (r.ok) S = await r.json(); } catch (e) { S = null; }
    S = S || window.SEED || {};
    SRC.raw = { config: S.config || null, processes: arr(S.processes), agents: arr(S.agents), usage: arr(S.usage) };
    SRC.fresh = { config: true, processes: true };
    SRC.ready = buildModel(); afterData();
  }
  async function connect() {
    render();
    const C = window.claude;
    if (!C || typeof C.use !== 'function') return useSnapshot('no-runtime');
    let db = null, user = null;
    try { [db, user] = await Promise.all([C.use('db'), C.use('user')]); } catch (e) { db = null; }
    if (!db) return useSnapshot('no-db');
    SRC.db = db; SRC.user = user; SRC.mode = 'live';
    if (user) {
      try { SRC.canWrite = await user.can('data.write'); } catch (e) { SRC.canWrite = null; }
      try { SRC.userId = await user.id(); } catch (e) { SRC.userId = null; }
    }
    SRC.fresh = { config: false, processes: false };
    const timer = setTimeout(() => { if (!SRC.ready) { SRC.slow = true; render(); } }, 10000);
    let queued = false;
    const changed = () => {
      if (queued) return; queued = true;
      setTimeout(() => {
        queued = false;
        const r = SRC.raw;
        // Don't call the registry empty from a cached copy: wait for the store to confirm.
        if ((!r.config || !(r.processes || []).length) && !(SRC.fresh.config && SRC.fresh.processes)) return;
        if (buildModel()) { SRC.ready = true; SRC.slow = false; clearTimeout(timer); afterData(); }
      }, 30);
    };
    const fail = (e) => { SRC.error = (e && e.code) || 'unavailable'; clearTimeout(timer); if (!SRC.ready) { SRC.slow = true; } render(); };
    const rows = (q) => q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    try {
      db.doc('config/tenant').onSnapshot((d) => { SRC.raw.config = d.exists ? d.data() : null; if (!d.metadata.fromCache) SRC.fresh.config = true; changed(); }, fail);
      db.collection('processes').onSnapshot((q) => { SRC.raw.processes = rows(q); if (!q.metadata.fromCache) SRC.fresh.processes = true; changed(); }, fail);
      db.collection('agents').onSnapshot((q) => { SRC.raw.agents = rows(q).map((d) => Object.assign({}, d, { agent_id: d.agent_id || d.id })); changed(); }, fail);
      db.collection('usage').onSnapshot((q) => { SRC.raw.usage = rows(q).map((d) => Object.assign({}, d, { agent_id: d.agent_id || d.id })); changed(); }, fail);
      db.collection('datasets').onSnapshot((q) => { SRC.raw.datasets = rows(q); if (SRC.ready) render(); }, () => { SRC.raw.datasets = []; });
    } catch (e) { clearTimeout(timer); useSnapshot('subscribe-failed'); }
  }

  if (!location.hash) { try { history.replaceState(null, '', '#o2c'); } catch (e) { /* sandboxed */ } }
  connect();

  window.__AGC = { get AGENTS() { return AGENTS; }, get BP() { return BP; }, calc, homeReason, SRC, FORM }; // for inspection in the console
})();
