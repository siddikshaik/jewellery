// JSON API. Every route checks who is asking and what that role may do; the browser UI is only a convenience.
//   /api/auth/status|setup|login|logout|password      /api/data (GET)   /api/data/<settings|rates> (PUT)
//   /api/data/<customers|invoices|inventory>/<id> (PUT, DELETE)         /api/stores   /api/users
const { hashPassword, verifyPassword, createAuth } = require('./auth');
const LISTS = ['customers', 'invoices', 'inventory', 'suppliers', 'purchases'], OBJS = ['settings', 'rates'], COLS = [...OBJS, ...LISTS];
const AREAS = ['invoices', 'customers', 'inventory', 'purchases'], LEVELS = ['none', 'view', 'edit'];
/* which permission area guards each collection */
const AREA_OF = { settings: 'settings', rates: 'settings', customers: 'customers', invoices: 'invoices', inventory: 'inventory', suppliers: 'purchases', purchases: 'purchases' };
const HUID = /^[A-Z0-9]{6}$/;   /* BIS Hallmark Unique Identification: 6 letters or digits */
const MAX = 10 * 1024 * 1024;

function createApi(db, { dataDir }) {
  const auth = createAuth(dataDir);
  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, code, error) => send(res, code, { ok: false, error });
  const readBody = req => new Promise((ok, bad) => {
    let n = 0; const c = [];
    req.on('data', d => { n += d.length; if (n > MAX) { bad(new Error('too_large')); req.destroy(); } else c.push(d); });
    req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c).toString('utf8')) : {}); } catch (e) { bad(new Error('bad_json')); } });
    req.on('error', bad);
  });
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

  /* ----- who is asking ----- */
  function currentUser(req) {
    const t = auth.readToken(req); if (!t) return null;
    const u = db.users().find(x => x.id === t.u);
    if (!u || !u.active) return null;
    if (u.role !== 'superadmin') { const s = db.store(u.storeId); if (!s || !s.active) return null; }
    return u;
  }
  const normPerms = p => Object.fromEntries(AREAS.map(a => [a, LEVELS.includes(p && p[a]) ? p[a] : 'none']));
  const pub = u => {
    const s = u.storeId ? db.store(u.storeId) : null;
    return { id: u.id, username: u.username, name: u.name, role: u.role, storeId: u.storeId || null, storeName: s ? s.name : null,
      perms: u.role === 'user' ? normPerms(u.perms) : null, active: u.active, createdAt: u.createdAt };
  };
  /* level 0 none, 1 view, 2 edit */
  const lv = v => v === 'edit' ? 2 : v === 'view' ? 1 : 0;
  function level(u, area) {
    if (u.role === 'superadmin') return area === 'users' || area === 'stores' ? 2 : 1;   // monitors stores read-only
    if (u.role === 'admin') return area === 'stores' ? 0 : 2;
    return AREAS.includes(area) ? lv(u.perms && u.perms[area]) : 0;
  }
  const canRead = (u, col) => col === 'settings' ? true
    : col === 'rates' ? level(u, 'invoices') > 0 || level(u, 'inventory') > 0 || level(u, 'purchases') > 0
    : col === 'customers' ? level(u, 'customers') > 0 || level(u, 'invoices') > 0
    : level(u, AREA_OF[col]) > 0;
  const canWrite = (u, col) => level(u, AREA_OF[col]) === 2 && u.role !== 'superadmin';
  function targetStore(u, url) {
    const q = url.searchParams.get('store');
    if (u.role === 'superadmin') return q && db.store(q) ? q : null;
    return q && q !== u.storeId ? null : u.storeId;
  }

  const userNameOk = s => /^[a-z0-9._-]{3,32}$/.test(s);
  const cleanName = s => String(s || '').trim().slice(0, 80);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    const parts = url.pathname.slice(5).split('/').filter(Boolean).map(decodeURIComponent), m = req.method;
    /* a browser sending a cross-site write is refused */
    if (m !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return fail(res, 403, 'Cross-site request refused'), true;
    let body = {};
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
      try { body = await readBody(req); } catch (e) { return fail(res, e.message === 'too_large' ? 413 : 400, 'Invalid request'), true; }
    }
    const [a, b, c] = parts;

    /* ----- auth ----- */
    if (a === 'auth') {
      if (b === 'status' && m === 'GET') {
        const u = currentUser(req);
        return send(res, 200, { setupNeeded: db.users().length === 0, user: u ? pub(u) : null }), true;
      }
      if (b === 'setup' && m === 'POST') {
        if (db.users().length) return fail(res, 403, 'Already set up'), true;
        const username = String(body.username || '').trim().toLowerCase(), name = cleanName(body.name);
        if (!userNameOk(username)) return fail(res, 400, 'Username must be 3 to 32 letters, numbers, dot, dash or underscore'), true;
        if (!name) return fail(res, 400, 'Enter a name'), true;
        if (String(body.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true;
        const u = { id: db.newId(), username, name, role: 'superadmin', storeId: null, active: true, passwordHash: hashPassword(body.password), createdAt: new Date().toISOString() };
        db.saveUsers([u]);
        return send(res, 200, { ok: true, user: pub(u) }, { 'set-cookie': auth.cookie(auth.issue(u.id), req) }), true;
      }
      if (b === 'login' && m === 'POST') {
        const username = String(body.username || '').trim().toLowerCase(), key = req.socket.remoteAddress + '|' + username;
        if (auth.throttle.blocked(key)) return fail(res, 429, 'Too many attempts. Try again in a few minutes.'), true;
        const u = db.users().find(x => x.username === username);
        const good = verifyPassword(body.password, u && u.passwordHash);
        if (!u || !good) { auth.throttle.fail(key); return fail(res, 401, 'Wrong username or password'), true; }
        if (!u.active) return fail(res, 403, 'This account is turned off'), true;
        if (u.role !== 'superadmin') { const s = db.store(u.storeId); if (!s || !s.active) return fail(res, 403, 'This store is turned off'), true; }
        auth.throttle.ok(key);
        return send(res, 200, { ok: true, user: pub(u) }, { 'set-cookie': auth.cookie(auth.issue(u.id), req) }), true;
      }
      if (b === 'logout' && m === 'POST') return send(res, 200, { ok: true }, { 'set-cookie': auth.cookie('', req) }), true;
      if (b === 'password' && m === 'POST') {
        const me = currentUser(req); if (!me) return fail(res, 401, 'Sign in first'), true;
        const all = db.users(), u = all.find(x => x.id === me.id);
        if (!verifyPassword(body.current, u.passwordHash)) return fail(res, 400, 'Current password is wrong'), true;
        if (String(body.next || '').length < 8) return fail(res, 400, 'New password must be at least 8 characters'), true;
        u.passwordHash = hashPassword(body.next); db.saveUsers(all);
        return send(res, 200, { ok: true }), true;
      }
      return fail(res, 404, 'Not found'), true;
    }

    const me = currentUser(req);
    if (!me) return fail(res, 401, 'Sign in first'), true;

    /* ----- store data ----- */
    if (a === 'data') {
      const sid = targetStore(me, url);
      if (!sid) return fail(res, me.role === 'superadmin' ? 400 : 403, me.role === 'superadmin' ? 'Choose a store' : 'Not allowed'), true;
      if (!b && m === 'GET') {
        const out = {}; COLS.forEach(n => { out[n] = canRead(me, n) ? db.readCol(sid, n) : null; });
        if (canRead(me, 'inventory') || level(me, 'inventory') > 0) {
          const inv = db.readCol(sid, 'invoices') || [];
          out.soldStock = [...new Set(inv.flatMap(i => (i.items || []).map(x => x.stockId).filter(Boolean)))];
        }
        return send(res, 200, { ok: true, storeId: sid, data: out }), true;
      }
      if (!COLS.includes(b)) return fail(res, 404, 'Not found'), true;
      if (!canWrite(me, b)) return fail(res, 403, 'You do not have permission to change this'), true;
      if (OBJS.includes(b) && !c && m === 'PUT') {
        if (!isObj(body)) return fail(res, 400, 'Invalid data'), true;
        db.writeCol(sid, b, body); return send(res, 200, { ok: true }), true;
      }
      if (LISTS.includes(b) && c && (m === 'PUT' || m === 'DELETE')) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(c)) return fail(res, 400, 'Bad id'), true;
        const list = db.readCol(sid, b) || [], i = list.findIndex(x => x.id === c);
        if (m === 'DELETE') { if (i >= 0) { list.splice(i, 1); db.writeCol(sid, b, list); } return send(res, 200, { ok: true }), true; }
        if (!isObj(body) || body.id !== c) return fail(res, 400, 'Invalid data'), true;
        if (b === 'invoices' && (typeof body.no !== 'string' || !body.no.trim() || !Array.isArray(body.items))) return fail(res, 400, 'Invalid invoice'), true;
        if (b === 'customers' && typeof body.name !== 'string') return fail(res, 400, 'Invalid customer'), true;
        if (b === 'inventory' && (typeof body.tag !== 'string' || !body.tag.trim())) return fail(res, 400, 'Invalid stock item'), true;
        if (b === 'inventory' && body.huid && !HUID.test(body.huid)) return fail(res, 400, 'HUID must be 6 letters or digits'), true;
        if (b === 'suppliers' && typeof body.name !== 'string') return fail(res, 400, 'Invalid supplier'), true;
        if (b === 'purchases' && (typeof body.no !== 'string' || !body.no.trim() || !Array.isArray(body.items))) return fail(res, 400, 'Invalid purchase'), true;
        if (b === 'invoices' && list.some(x => x.no === body.no && x.id !== c)) return fail(res, 409, 'duplicate_no'), true;
        if (b === 'purchases' && list.some(x => x.no === body.no && x.id !== c)) return fail(res, 409, 'duplicate_no'), true;
        if (b === 'inventory' && list.some(x => x.tag === body.tag && x.id !== c)) return fail(res, 409, 'duplicate_tag'), true;
        if (b === 'inventory' && body.huid && list.some(x => x.huid === body.huid && x.id !== c)) return fail(res, 409, 'duplicate_huid'), true;
        if (i >= 0) list[i] = body; else list.push(body);
        db.writeCol(sid, b, list); return send(res, 200, { ok: true }), true;
      }
      return fail(res, 404, 'Not found'), true;
    }

    /* ----- stores (super admin) ----- */
    if (a === 'stores') {
      if (me.role !== 'superadmin') return fail(res, 403, 'Not allowed'), true;
      if (!b && m === 'GET') {
        const users = db.users();
        return send(res, 200, { ok: true, stores: db.stores().map(s => ({ ...s, userCount: users.filter(u => u.storeId === s.id).length })) }), true;
      }
      if (!b && m === 'POST') {
        const name = cleanName(body.name), ad = body.admin || {};
        const username = String(ad.username || '').trim().toLowerCase();
        if (!name) return fail(res, 400, 'Enter the store name'), true;
        if (!userNameOk(username)) return fail(res, 400, 'Admin username must be 3 to 32 letters, numbers, dot, dash or underscore'), true;
        if (db.users().some(u => u.username === username)) return fail(res, 409, 'That username is taken'), true;
        if (!cleanName(ad.name)) return fail(res, 400, 'Enter the admin name'), true;
        if (String(ad.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true;
        const s = db.createStore(name);
        db.saveUsers([...db.users(), { id: db.newId(), username, name: cleanName(ad.name), role: 'admin', storeId: s.id, active: true, passwordHash: hashPassword(ad.password), createdAt: new Date().toISOString() }]);
        return send(res, 200, { ok: true, store: s }), true;
      }
      if (b && m === 'PATCH') {
        const all = db.stores(), s = all.find(x => x.id === b);
        if (!s) return fail(res, 404, 'Not found'), true;
        if (body.name !== undefined) { const n = cleanName(body.name); if (!n) return fail(res, 400, 'Enter the store name'), true; s.name = n; }
        if (body.active !== undefined) s.active = !!body.active;
        db.saveStores(all); return send(res, 200, { ok: true, store: s }), true;
      }
      return fail(res, 404, 'Not found'), true;
    }

    /* ----- users ----- */
    if (a === 'users') {
      if (me.role === 'user') return fail(res, 403, 'Not allowed'), true;
      const manageable = t => me.role === 'superadmin' || (t.role === 'user' && t.storeId === me.storeId);
      if (!b && m === 'GET') {
        const list = db.users().filter(u => me.role === 'superadmin' || u.storeId === me.storeId);
        return send(res, 200, { ok: true, users: list.map(pub) }), true;
      }
      if (!b && m === 'POST') {
        const username = String(body.username || '').trim().toLowerCase(), name = cleanName(body.name);
        const role = me.role === 'admin' ? 'user' : body.role;
        if (!['superadmin', 'admin', 'user'].includes(role)) return fail(res, 400, 'Choose a role'), true;
        const storeId = role === 'superadmin' ? null : me.role === 'admin' ? me.storeId : body.storeId;
        if (role !== 'superadmin' && !db.store(storeId)) return fail(res, 400, 'Choose a store'), true;
        if (!userNameOk(username)) return fail(res, 400, 'Username must be 3 to 32 letters, numbers, dot, dash or underscore'), true;
        if (!name) return fail(res, 400, 'Enter a name'), true;
        if (String(body.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true;
        if (db.users().some(u => u.username === username)) return fail(res, 409, 'That username is taken'), true;
        const u = { id: db.newId(), username, name, role, storeId, active: true, passwordHash: hashPassword(body.password), createdAt: new Date().toISOString() };
        if (role === 'user') u.perms = normPerms(body.perms);
        db.saveUsers([...db.users(), u]);
        return send(res, 200, { ok: true, user: pub(u) }), true;
      }
      if (b && m === 'PATCH') {
        const all = db.users(), t = all.find(x => x.id === b);
        if (!t || !manageable(t)) return fail(res, 404, 'Not found'), true;
        if (body.name !== undefined) { const n = cleanName(body.name); if (!n) return fail(res, 400, 'Enter a name'), true; t.name = n; }
        if (body.active !== undefined) { if (t.id === me.id && !body.active) return fail(res, 400, 'You cannot turn off your own account'), true; t.active = !!body.active; }
        if (body.perms !== undefined && t.role === 'user') t.perms = normPerms(body.perms);
        if (body.password) { if (String(body.password).length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true; t.passwordHash = hashPassword(body.password); }
        db.saveUsers(all); return send(res, 200, { ok: true, user: pub(t) }), true;
      }
      return fail(res, 404, 'Not found'), true;
    }
    return fail(res, 404, 'Not found'), true;
  }
  return handle;
}
module.exports = { createApi };
