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
      inputs: arr(d.inputs).filter((x) => okBp(x.process)).map((x) => ({ system: str(x.system), what: str(x.what), bp: x.process, mode: mode(x.access) })),
      tools: arr(d.tools).filter((x) => okBp(x.process)).map((t) => ({ name: str(t.name), desc: str(t.description), system: str(t.system), bp: t.process, mode: mode(t.access), approval: str(t.approval_by), w: num(weights[t.name], 1) })),
      outputs: arr(d.outputs).filter((x) => okBp(x.process)).map((x) => ({ dest: str(x.destination), what: str(x.what), bp: x.process, mode: mode(x.access || 'write') })),
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
  const state = { bp: 'o2c', view: 'bp', lifecycle: 'production', arch: 'all', step: null, sort: 'req', q: '', density: 'comfortable', crossTab: 'in', agent: null, tab: 'overview', collapsed: {} };
  try { const saved = JSON.parse(localStorage.getItem('agc-prefs') || '{}'); if (saved.density) state.density = saved.density; if (saved.collapsed) state.collapsed = saved.collapsed; } catch (e) { /* storage unavailable */ }
  function savePrefs() { try { localStorage.setItem('agc-prefs', JSON.stringify({ density: state.density, collapsed: state.collapsed })); } catch (e) { /* ignore */ } }

  function parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (h.startsWith('agent-') && AG[h.slice(6)]) {
      const a = AG[h.slice(6)];
      if (!state._booted) { state.bp = a.home; state.view = 'bp'; }
      if (state.agent !== a.id) state.tab = 'overview';
      state.agent = a.id;
    } else if (h === 'all') { state.view = 'all'; state.agent = null; }
    else if (BP[h]) { if (state.bp !== h) state.step = null; state.view = 'bp'; state.bp = h; state.agent = null; }
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
    chev: '<path d="M5 6.5l3 3 3-3"/>'
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

    h += '<section class="sec" aria-labelledby="sec-agents"><div class="sec-h"><h2 id="sec-agents">' + (state.step ? esc(state.step) + ' agents in ' : 'Agents in ') + esc(b.name) + ' <span class="count">' + list.length + '</span>' + addBtn(b.id) + '</h2>' +
      '<div class="toolbar">' +
      '<label class="search-in">' + icon('search') + '<span class="sr">Filter agents</span><input id="q" type="search" placeholder="Filter by name, system or tool" value="' + esc(state.q) + '"></label>' +
      '<label class="sel"><span class="sr">Sort by</span><select id="sort">' + [['req', 'Most API requests'], ['users', 'Most users'], ['cost', 'Highest spend'], ['cross', 'Most processes reached'], ['name', 'Name']].map(([k, l]) => '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '<div class="seg sm" role="group" aria-label="Tile density"><button type="button" class="seg-btn' + (state.density === 'comfortable' ? ' on' : '') + '" data-density="comfortable">Comfortable</button><button type="button" class="seg-btn' + (state.density === 'compact' ? ' on' : '') + '" data-density="compact">Compact</button></div>' +
      '</div></div>';
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

    const xs = state.crossTab === 'in' ? sortAgents(inbound) : sortAgents(outbound);
    h += '<section class="sec" aria-labelledby="sec-cross"><div class="sec-h"><h2 id="sec-cross">Cross-process agents</h2>' +
      '<div class="seg" role="group" aria-label="Direction"><button type="button" class="seg-btn' + (state.crossTab === 'in' ? ' on' : '') + '" data-cross="in">From other processes into ' + esc(b.code) + ' <span class="seg-n">' + inbound.length + '</span></button><button type="button" class="seg-btn' + (state.crossTab === 'out' ? ' on' : '') + '" data-cross="out">' + esc(b.code) + ' agents reaching out <span class="seg-n">' + outbound.length + '</span></button></div></div>' +
      '<p class="sec-sub">' + (state.crossTab === 'in'
        ? 'Agents homed in another process whose data inputs, tools, outputs or secondary users touch ' + esc(b.name) + '. Agents that write into ' + esc(b.code) + ' are the ones its owner should know about.'
        : 'Agents homed in ' + esc(b.name) + ' whose inputs, tools or outputs touch other processes.') + '</p>';
    h += xs.length ? '<div class="xlist">' + xs.map((a) => crossRow(a, b.id, state.crossTab)).join('') + '</div>' : '<div class="empty">None for the current lifecycle filter.</div>';
    h += '</section>';
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

  /* ---------------------------------------------------------------- All view */
  function renderAll() {
    const list = AGENTS.filter(lifecycleOk);
    const prod = list.filter((a) => a.status === 'production');
    const sum = (arr, f) => arr.reduce((x, a) => x + f(calc(a)), 0);
    const crossCount = list.filter((a) => calc(a).cross.length).length;
    const writeCount = list.filter((a) => calc(a).crossWrite.length).length;
    const prodCross = prod.filter((a) => calc(a).cross.length).length, prodWrite = prod.filter((a) => calc(a).crossWrite.length).length;
    const lead = cap(word(prod.length)) + ' ' + plural(prod.length, 'agent') + ' ' + plural(prod.length, 'is', 'are') + ' in production across ' + BPS.length + ' business processes, handling about ' + nf.format(roundTo(sum(prod.filter(hasTel), (c) => c.rpd))) + ' API requests a day at an estimated ' + money(Math.round(sum(prod.filter(hasTel), (c) => c.total))) + ' over the last 30 days. ' + nf.format(prodCross) + ' of them reach beyond their home process, and ' + nf.format(prodWrite) + ' write into another one.';
    let h = '<header class="bp-head solo"><div class="h1-row"><h1>All business processes</h1>' + addBtn('') + '</div>' +
      '<p class="owner">' + esc(TENANT.name) + '. ' + esc(String(TENANT.note || '').replace(/\s*·\s*/g, ', ')) + '.</p>' +
      '<p class="lead">' + esc(lead) + '</p></header>';

    // cross-process map: dot size = number of agents, tangerine = at least one of them writes
    const m = {}; let max = 1;
    list.forEach((a) => { const c = calc(a); Object.keys(c.touch).forEach((t) => { const k = a.home + '|' + t; (m[k] = m[k] || { n: 0, w: 0, names: [] }); m[k].n++; if (c.touch[t].write && t !== a.home) m[k].w++; m[k].names.push(a.name); if (t !== a.home) max = Math.max(max, m[k].n); }); });
    const dotPx = (n) => Math.round(8 + 18 * Math.sqrt(n / max));
    h += '<section class="sec"><div class="sec-h"><h2>Where agents cross process lines</h2></div>' +
      '<p class="sec-sub">Each row is the process an agent calls home; each column is a process it touches. Select a dot to open that process.</p>' +
      '<div class="map-legend"><span><i style="width:10px;height:10px"></i><i style="width:20px;height:20px"></i>More agents, larger dot</span><span><i class="w" style="width:14px;height:14px"></i>' + icon('write') + 'At least one writes into the column process</span><span><b style="font-weight:600;color:var(--color-ink)">n</b> on the diagonal: agents homed in that process</span></div>';
    h += '<div class="hm-wrap"><table class="hm"><thead><tr><th class="hm-corner"><span>Home process</span></th>' + BPS.map((b) => '<th scope="col"><span class="hm-col" data-tt="' + esc(b.name) + '">' + esc(b.code) + '</span></th>').join('') + '</tr></thead><tbody>';
    BPS.forEach((r) => {
      h += '<tr><th scope="row"><button type="button" class="hm-row" data-go="' + r.id + '"><b>' + esc(r.code) + '</b><span class="hm-rn">' + esc(r.name) + '</span></button></th>';
      BPS.forEach((c) => {
        const cell = m[r.id + '|' + c.id];
        if (r.id === c.id) { h += '<td class="hm-diag" data-tt="' + esc(r.name + ': ' + (cell ? cell.n : 0) + ' agents homed here') + '">' + (cell ? '<span>' + cell.n + '</span>' : '') + '</td>'; return; }
        if (!cell) { h += '<td></td>'; return; }
        const px = dotPx(cell.n);
        h += '<td class="hm-c" data-go="' + c.id + '" data-tt="' + esc(cell.n + ' ' + plural(cell.n, 'agent') + ' homed in ' + r.name + ' ' + plural(cell.n, 'touches', 'touch') + ' ' + c.name + (cell.w ? '; ' + cell.w + ' ' + plural(cell.w, 'writes', 'write') + ' into it' : '') + ':\n' + cell.names.join('\n')) + '"><span class="hm-dot' + (cell.w ? ' w' : '') + '" style="width:' + px + 'px;height:' + px + 'px"></span><span class="sr">' + cell.n + '</span></td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div></section>';

    // table
    h += '<section class="sec"><div class="sec-h"><h2>By process</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Process</th><th class="num">Agents</th><th class="num">Requests a day</th><th class="num">Users, 30 days</th><th class="num">Spend, 30 days</th><th class="num" data-tt="Agents homed here that touch another process">Reach out</th><th class="num" data-tt="Agents from other processes that touch this one">Reach in</th></tr></thead><tbody>';
    BPS.forEach((b) => {
      const home = list.filter((a) => a.home === b.id); const hp = home.filter((a) => a.status === 'production');
      const inn = list.filter((a) => a.home !== b.id && calc(a).touch[b.id]).length;
      h += '<tr class="click" data-go="' + b.id + '"><td><b class="pc">' + esc(b.code) + '</b> <span class="pn">' + esc(b.name) + '</span>' + (b.featured ? ' <span class="tag">Detailed</span>' : '') + '</td><td class="num">' + home.length + '</td><td class="num">' + compact(sum(hp, (c) => c.rpd)) + '</td><td class="num">' + nf.format(sum(hp, (c) => c.users)) + '</td><td class="num">' + money(Math.round(sum(hp, (c) => c.total))) + '</td><td class="num">' + home.filter((a) => calc(a).cross.length).length + '</td><td class="num">' + inn + '</td></tr>';
    });
    h += '</tbody></table></div></section>';
    $('#main').innerHTML = h;
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
    const ae = document.activeElement; const keepQ = ae && ae.id === 'q' ? ae.selectionStart : null;
    renderTop();
    if (!SRC.ready) { $('#nav').innerHTML = ''; $('#main').innerHTML = loadingView(); return; }
    if (SRC.empty) { $('#nav').innerHTML = ''; $('#main').innerHTML = bannerHtml() + emptyView(); return; }
    renderNav();
    if (state.view === 'all') renderAll(); else renderBP();
    $('#main').insertAdjacentHTML('afterbegin', bannerHtml());
    renderModal(); paintSprites(); resolveNames();
    if (keepQ != null) { const q = $('#q'); if (q) { q.focus(); try { q.setSelectionRange(keepQ, keepQ); } catch (e) { /* ignore */ } } }
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
    if (e.target.closest('#form')) return;
    const t = e.target.closest('[data-go],[data-agent],[data-life],[data-arch],[data-step],[data-density],[data-cross],[data-tab],[data-collapse],[data-add],[data-edit],#m-close,#copy-md');
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
    if (e.key === 'Escape') {
      if (FORM.open) { if (FORM.confirm) { FORM.confirm = false; renderFoot(); } else closeForm(); return; }
      if (!$('#gs-results').hidden) { $('#gs-results').hidden = true; return; }
      if (state.agent) closeModal();
    }
    if (e.key === 'Tab') {
      // keep keyboard focus inside the open dialog (form first, then the agent detail)
      const dlg = FORM.open ? $('#form') : state.agent ? $('#modal') : null;
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
    } catch (e) { clearTimeout(timer); useSnapshot('subscribe-failed'); }
  }

  if (!location.hash) { try { history.replaceState(null, '', '#o2c'); } catch (e) { /* sandboxed */ } }
  connect();

  window.__AGC = { get AGENTS() { return AGENTS; }, get BP() { return BP; }, calc, homeReason, SRC, FORM }; // for inspection in the console
})();
