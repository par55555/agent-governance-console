/* Agent Governance Console: local development backend.
 *
 * Inside the claude.ai artifact, app.js talks to the artifact database through window.claude.use('db')
 * and window.claude.use('user'). Those don't exist on your PC, so this file provides the same interface,
 * backed by localStorage and seeded from registry-snapshot.json.
 *
 * Load it by opening index.html?dev (index.html injects this script only when window.claude is missing).
 *
 * Interface implemented (the subset app.js uses):
 *   db.doc(path).get() / .set(data) / .onSnapshot(next, error)
 *   db.collection(path).doc(id) / .onSnapshot(next, error)
 *   snapshot: { id, exists, data(), metadata: { fromCache, hasPendingWrites } }
 *   collection snapshot: { docs, size, empty, docChanges(), metadata }
 *   user.can(capability), user.id(), user.profiles(ids)
 *
 * Helpers in the browser console:
 *   agcDev.reset()        drop local edits and reseed from registry-snapshot.json
 *   agcDev.readOnly(true) simulate a view-only user (add/edit disabled)
 *   agcDev.failNext(code) make the next write fail with a db error code, e.g. 'invalid_argument'
 *   agcDev.dump()         the whole store as an object
 *
 * When you move to a real backend (Firestore, or a FastAPI service over BigQuery/Firestore), replace this file
 * with an adapter that exposes the same calls. app.js does not need to change.
 */
(function () {
  'use strict';
  const KEY = 'agc-dev-store-v1';
  const RO_KEY = 'agc-dev-readonly';
  const listeners = [];
  let store = null;
  let failNext = null;

  const clone = (v) => JSON.parse(JSON.stringify(v));
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify([...store.entries()])); } catch (e) { console.warn('[dev backend] could not persist', e); }
  }
  async function seed() {
    const res = await fetch('registry-snapshot.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('registry-snapshot.json: HTTP ' + res.status);
    const S = await res.json();
    const m = new Map();
    m.set('config/tenant', S.config);
    (S.processes || []).forEach((p) => m.set('processes/' + p.id, p));
    (S.agents || []).forEach((a) => m.set('agents/' + a.agent_id, a));
    (S.usage || []).forEach((u) => m.set('usage/' + u.agent_id, u));
    return m;
  }
  let loading = null;
  function ensure() {
    if (store) return Promise.resolve();
    if (!loading) {
      loading = (async () => {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
        store = saved ? new Map(saved) : await seed();
        if (!saved) persist();
      })();
    }
    return loading;
  }

  const meta = () => ({ fromCache: false, hasPendingWrites: false });
  const isDocPath = (p) => p.split('/').length % 2 === 0;
  const docSnap = (p) => {
    const d = store.get(p);
    return { id: p.split('/').pop(), ref: { path: p }, exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), metadata: meta() };
  };
  const colSnap = (c) => {
    const depth = c.split('/').length + 1;
    const docs = [...store.keys()].filter((k) => k.startsWith(c + '/') && k.split('/').length === depth).sort().map(docSnap);
    return { docs, size: docs.length, empty: docs.length === 0, docChanges: () => [], metadata: meta() };
  };
  function notify(changed) {
    listeners.forEach((l) => {
      const hit = l.kind === 'doc' ? l.path === changed : changed.startsWith(l.path + '/');
      if (hit) setTimeout(() => l.next(l.kind === 'doc' ? docSnap(l.path) : colSnap(l.path)), 0);
    });
  }
  function dbError(code, message) { const e = new Error(message || code); e.code = code; return e; }

  const db = {
    doc(path) {
      if (!isDocPath(path)) throw dbError('invalid_argument', 'Not a document path: ' + path);
      return {
        id: path.split('/').pop(),
        path,
        async get() { await ensure(); return docSnap(path); },
        async set(data) {
          await ensure();
          if (localStorage.getItem(RO_KEY) === '1') throw dbError('invalid_argument', 'View-only user (agcDev.readOnly)');
          if (failNext) { const c = failNext; failNext = null; throw dbError(c, 'Simulated failure (agcDev.failNext)'); }
          if (data === null || typeof data !== 'object') throw dbError('invalid_argument', 'Document data must be an object');
          store.set(path, clone(data)); persist(); notify(path);
        },
        onSnapshot(next, error) {
          const l = { kind: 'doc', path, next };
          listeners.push(l);
          ensure().then(() => next(docSnap(path)), (e) => error && error(dbError('unavailable', String(e))));
          return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
        }
      };
    },
    collection(path) {
      return {
        path,
        doc: (id) => db.doc(path + '/' + id),
        onSnapshot(next, error) {
          const l = { kind: 'col', path, next };
          listeners.push(l);
          ensure().then(() => next(colSnap(path)), (e) => error && error(dbError('unavailable', String(e))));
          return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
        }
      };
    }
  };

  const DEV_USER = 'u_dev';
  const user = {
    async can(cap) { return cap === 'data.write' ? localStorage.getItem(RO_KEY) !== '1' : true; },
    async id() { return DEV_USER; },
    async canEdit() { return localStorage.getItem(RO_KEY) !== '1'; },
    async isOwner() { return true; },
    async profiles(ids) { return Object.fromEntries([].concat(ids || []).map((i) => [i, { id: i, name: i === DEV_USER ? 'Local developer' : '' }])); }
  };

  window.claude = { use: async (name) => (name === 'db' ? db : name === 'user' ? user : null) };
  window.agcDev = {
    async reset() { localStorage.removeItem(KEY); store = null; loading = null; await ensure(); location.reload(); },
    readOnly(on) { localStorage.setItem(RO_KEY, on ? '1' : '0'); location.reload(); },
    failNext(code) { failNext = code || 'unavailable'; },
    async dump() { await ensure(); return Object.fromEntries(clone([...store.entries()])); }
  };
  console.info('[dev backend] Using localStorage-backed mock of the artifact database. agcDev.reset() reseeds.');
})();
