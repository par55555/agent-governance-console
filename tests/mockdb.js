window.__writes = [];
(function () {
  const listeners = []; let store = null;
  async function ensure() {
    if (store) return;
    const S = await (await fetch('registry-snapshot.json')).json();
    store = new Map(); store.set('config/tenant', S.config);
    S.processes.forEach((p) => store.set('processes/' + p.id, p));
    S.agents.forEach((a) => store.set('agents/' + a.agent_id, a));
    S.usage.forEach((u) => store.set('usage/' + u.agent_id, u));
    window.__store = store;
  }
  const meta = { fromCache: false, hasPendingWrites: false };
  const docSnap = (p) => { const d = store.get(p); return { id: p.split('/').pop(), exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), metadata: meta }; };
  const colSnap = (c) => { const docs = [...store.keys()].filter((k) => k.split('/').length === 2 && k.startsWith(c + '/')).sort().map(docSnap); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta }; };
  const notify = () => listeners.forEach((l) => setTimeout(() => l.next(l.kind === 'doc' ? docSnap(l.path) : colSnap(l.path)), 5));
  const db = {
    doc(path) {
      return { id: path.split('/').pop(), path,
        get: async () => { await ensure(); return docSnap(path); },
        set: async (data) => { await ensure(); if (window.__failNext) { const c = window.__failNext; window.__failNext = null; throw { code: c, message: 'mock' }; } store.set(path, JSON.parse(JSON.stringify(data))); window.__writes.push(path); notify(); },
        onSnapshot(next) { listeners.push({ kind: 'doc', path, next }); ensure().then(() => next(docSnap(path))); return () => {}; } };
    },
    collection(path) { return { path, doc: (id) => db.doc(path + '/' + id), onSnapshot(next) { listeners.push({ kind: 'col', path, next }); ensure().then(() => next(colSnap(path))); return () => {}; } }; }
  };
  const user = { can: async () => true, id: async () => 'u_test', canEdit: async () => true, isOwner: async () => true, profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: i === 'u_test' ? 'Param' : '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? user : null) };
})();
