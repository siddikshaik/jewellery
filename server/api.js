// JSON API. Every route checks who is asking and what that role may do; the browser UI is only a convenience.
//   /api/auth/status|setup|signup|login|logout|password|me     /api/data (GET)   /api/data/<settings|rates> (PUT)
//   /api/data/<customers|invoices|inventory|suppliers|purchases>/<id> (PUT, DELETE)         /api/stores   /api/users
const { hashPassword, verifyPassword, createAuth } = require('./auth');
const LISTS = ['customers', 'invoices', 'inventory', 'suppliers', 'purchases'], OBJS = ['settings', 'rates'], COLS = [...OBJS, ...LISTS];
const AREAS = ['invoices', 'customers', 'inventory', 'purchases'], LEVELS = ['none', 'view', 'edit'];
/* which permission area guards each collection */
const AREA_OF = { settings: 'settings', rates: 'settings', customers: 'customers', invoices: 'invoices', inventory: 'inventory', suppliers: 'purchases', purchases: 'purchases' };
const HUID = /^[A-Z0-9]{6}$/;   /* BIS Hallmark Unique Identification: 6 letters or digits */
const PLANS = ['trial', 'licensed'], DEFAULT_MAX_USERS = 2, TRIAL_MONTHS = 1;
const MAX = 10 * 1024 * 1024;

/* ----- dates (the licence is by calendar day, valid through the day it names) ----- */
const pad = n => String(n).padStart(2, '0');
const localDate = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number), t = new Date(y, m - 1 + n, 1), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, last)); return localDate(t);
}
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));
/* ----- contact details ----- */
const normEmail = s => String(s || '').trim().toLowerCase();
const emailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 120;
function normPhone(s) {   /* digits only; drop a leading 91 or 0 so +91 98765 43210, 098765 43210 and 9876543210 are the same number */
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2); else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
const EXPIRED_MSG = 'Your license has expired. You can still look at your data but not change it. Contact the super admin to renew.';

function createApi(db, { dataDir, signupOpen = process.env.SIGNUP !== 'off' }) {
  const auth = createAuth(dataDir);
  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, code, error, errCode) => send(res, code, { ok: false, error, ...(errCode ? { code: errCode } : {}) });
  const readBody = req => new Promise((ok, bad) => {
    let n = 0; const c = [];
    req.on('data', d => { n += d.length; if (n > MAX) { bad(new Error('too_large')); req.destroy(); } else c.push(d); });
    req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c).toString('utf8')) : {}); } catch (e) { bad(new Error('bad_json')); } });
    req.on('error', bad);
  });
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

  /* ----- licence of a store: plan, expiry, how many people it may have ----- */
  function licenseOf(store) {
    const l = store.license || {}, today = localDate(), exp = l.expiresAt || '';
    return { plan: l.plan || 'licensed', expiresAt: exp, maxUsers: l.maxUsers || DEFAULT_MAX_USERS, note: l.note || '',
      expired: !!exp && exp < today, daysLeft: exp ? Math.round((new Date(exp + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5) : null,
      usedUsers: db.users().filter(u => u.storeId === store.id && u.active).length, today };
  }
  /* what the super admin may set. input: plan, expiresAt ("" = no expiry), monthsFromToday, extendMonths, maxUsers, note */
  function applyLicense(base, input) {
    const l = { plan: base.plan || 'licensed', expiresAt: base.expiresAt || '', maxUsers: base.maxUsers || DEFAULT_MAX_USERS, note: base.note || '' };
    if (!input) return { license: l };
    if (input.plan !== undefined) { if (!PLANS.includes(input.plan)) return { error: 'Choose trial or licensed' }; l.plan = input.plan; }
    if (input.maxUsers !== undefined) { const n = Number(input.maxUsers); if (!Number.isInteger(n) || n < 1 || n > 1000) return { error: 'Users allowed must be a whole number from 1 to 1000' }; l.maxUsers = n; }
    if (input.note !== undefined) l.note = String(input.note).slice(0, 200);
    if (input.expiresAt !== undefined) {
      if (input.expiresAt === '' || input.expiresAt === null) l.expiresAt = '';
      else if (isDate(input.expiresAt)) l.expiresAt = input.expiresAt; else return { error: 'Enter the expiry as a valid date' };
    }
    if (input.monthsFromToday !== undefined) {   // a fresh term: this many months from today
      const n = Number(input.monthsFromToday); if (!Number.isInteger(n) || n < 1 || n > 120) return { error: 'Choose 1 to 120 months' };
      l.expiresAt = addMonths(localDate(), n);
    }
    if (input.extendMonths !== undefined) {
      const n = Number(input.extendMonths); if (!Number.isInteger(n) || n < 1 || n > 120) return { error: 'Extend by 1 to 120 months' };
      l.expiresAt = addMonths(l.expiresAt && l.expiresAt > localDate() ? l.expiresAt : localDate(), n);   // from the later of today and the current expiry
    }
    return { license: l };
  }
  /* may this store add (or turn back on) a person right now? */
  function seatProblem(store, forSuper) {
    const lic = licenseOf(store);
    if (lic.expired && !forSuper) return { code: 'license_expired', msg: EXPIRED_MSG };
    if (lic.usedUsers >= lic.maxUsers) return { code: 'user_limit', msg: `This store has reached its limit of ${lic.maxUsers} user${lic.maxUsers === 1 ? '' : 's'}. Contact the super admin to allow more.` };
    return null;
  }
  /* how a store's people reach the super admin */
  function support() {
    const s = db.users().find(u => u.role === 'superadmin' && u.active && (u.email || u.phone));
    return s ? { name: s.name, email: s.email || '', phone: s.phone || '' } : null;
  }

  /* ----- who is asking ----- */
  function currentUser(req) {
    const t = auth.readToken(req); if (!t) return null;
    const u = db.users().find(x => x.id === t.u);
    if (!u || !u.active) return null;
    if (u.role !== 'superadmin') { const s = db.store(u.storeId); if (!s || !s.active) return null; }
    return u;
  }
  const normPerms = p => Object.fromEntries(AREAS.map(a => [a, LEVELS.includes(p && p[a]) ? p[a] : 'none']));
  const pub = (u, mine) => {
    const s = u.storeId ? db.store(u.storeId) : null;
    const o = { id: u.id, username: u.username, name: u.name, email: u.email || '', phone: u.phone || '', role: u.role, storeId: u.storeId || null, storeName: s ? s.name : null,
      perms: u.role === 'user' ? normPerms(u.perms) : null, active: u.active, createdAt: u.createdAt };
    if (mine && s) { o.license = licenseOf(s); o.support = support(); }
    return o;
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
  const USERNAME_MSG = 'Username must be 3 to 32 letters, numbers, dot, dash or underscore';
  /* email and phone: valid, and not used by any other account. required = a new account. Returns {email, phone} (normalised) or {error, status}. */
  function checkContact(input, exceptId, required) {
    const email = normEmail(input.email), phone = normPhone(input.phone);
    if ((required || email) && !emailOk(email)) return { error: 'Enter a valid email address', status: 400 };
    if ((required || phone) && !/^\d{10}$/.test(phone)) return { error: 'Enter a 10-digit phone number', status: 400 };
    const us = db.users();
    if (email && us.some(u => u.id !== exceptId && normEmail(u.email) === email)) return { error: 'That email is already used by another account', status: 409 };
    if (phone && us.some(u => u.id !== exceptId && normPhone(u.phone) === phone)) return { error: 'That phone number is already used by another account', status: 409 };
    return { email, phone };
  }
  /* editing an existing person: send only what changes; a value they already have cannot be blanked (old accounts without one may stay without) */
  function applyContact(t, body) {
    const want = {};
    for (const k of ['email', 'phone']) {
      if (body[k] === undefined) continue;
      if (!String(body[k]).trim()) { if (t[k]) return { error: (k === 'email' ? 'Email' : 'Phone number') + ' cannot be removed', status: 400 }; continue; }
      want[k] = body[k];
    }
    const r = checkContact(want, t.id, false);
    if (r.error) return r;
    if (want.email !== undefined) t.email = r.email;
    if (want.phone !== undefined) t.phone = r.phone;
    return {};
  }
  const signups = new Map();   /* address -> times of recent sign-ups, to stop someone filling the platform with stores */
  const signupBlocked = ip => { const now = Date.now(), l = (signups.get(ip) || []).filter(t => now - t < 3600000); signups.set(ip, l); return l.length >= 5; };

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
        return send(res, 200, { setupNeeded: db.users().length === 0, signupOpen, user: u ? pub(u, true) : null }), true;
      }
      if (b === 'setup' && m === 'POST') {
        if (db.users().length) return fail(res, 403, 'Already set up'), true;
        const username = String(body.username || '').trim().toLowerCase(), name = cleanName(body.name);
        if (!userNameOk(username)) return fail(res, 400, USERNAME_MSG), true;
        if (!name) return fail(res, 400, 'Enter a name'), true;
        if (String(body.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true;
        const ct = checkContact(body, null, true); if (ct.error) return fail(res, ct.status, ct.error), true;
        const u = { id: db.newId(), username, name, email: ct.email, phone: ct.phone, role: 'superadmin', storeId: null, active: true, passwordHash: hashPassword(body.password), createdAt: new Date().toISOString() };
        db.saveUsers([u]);
        return send(res, 200, { ok: true, user: pub(u, true) }, { 'set-cookie': auth.cookie(auth.issue(u.id), req) }), true;
      }
      /* anyone can open a store account: they become its owner and get a one-month trial with two users */
      if (b === 'signup' && m === 'POST') {
        if (!signupOpen) return fail(res, 403, 'Sign-up is turned off. Ask the super admin to create your store.'), true;
        if (!db.users().length) return fail(res, 403, 'The platform has not been set up yet'), true;
        const ip = req.socket.remoteAddress;
        if (signupBlocked(ip)) return fail(res, 429, 'Too many sign-ups from this address. Try again later.'), true;
        const storeName = cleanName(body.storeName), name = cleanName(body.name), username = String(body.username || '').trim().toLowerCase();
        if (!storeName) return fail(res, 400, 'Enter your store name'), true;
        if (!name) return fail(res, 400, 'Enter your name'), true;
        if (!userNameOk(username)) return fail(res, 400, USERNAME_MSG), true;
        if (String(body.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true;
        const ct = checkContact(body, null, true); if (ct.error) return fail(res, ct.status, ct.error), true;
        if (db.users().some(u => u.username === username)) return fail(res, 409, 'That username is taken'), true;
        const store = db.createStore(storeName, { plan: 'trial', expiresAt: addMonths(localDate(), TRIAL_MONTHS), maxUsers: DEFAULT_MAX_USERS, note: 'Free trial from sign-up' });
        const u = { id: db.newId(), username, name, email: ct.email, phone: ct.phone, role: 'admin', storeId: store.id, active: true, passwordHash: hashPassword(body.password), createdAt: new Date().toISOString() };
        db.saveUsers([...db.users(), u]);
        signups.get(ip).push(Date.now());
        return send(res, 200, { ok: true, user: pub(u, true) }, { 'set-cookie': auth.cookie(auth.issue(u.id), req) }), true;
      }
      if (b === 'login' && m === 'POST') {
        const typed = String(body.username || '').trim(), id = typed.toLowerCase(), ph = normPhone(typed), key = req.socket.remoteAddress + '|' + id;
        if (auth.throttle.blocked(key)) return fail(res, 429, 'Too many attempts. Try again in a few minutes.'), true;
        /* the username, the email or the phone number all work */
        const u = db.users().find(x => x.username === id || (x.email && normEmail(x.email) === id) || (ph.length === 10 && x.phone && normPhone(x.phone) === ph));
        const good = verifyPassword(body.password, u && u.passwordHash);
        if (!u || !good) { auth.throttle.fail(key); return fail(res, 401, 'Wrong username or password'), true; }
        if (!u.active) return fail(res, 403, 'This account is turned off'), true;
        if (u.role !== 'superadmin') { const s = db.store(u.storeId); if (!s || !s.active) return fail(res, 403, 'This store is turned off'), true; }
        auth.throttle.ok(key);
        return send(res, 200, { ok: true, user: pub(u, true) }, { 'set-cookie': auth.cookie(auth.issue(u.id), req) }), true;
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
      /* people update their own name, email and phone */
      if (b === 'me' && m === 'PATCH') {
        const me = currentUser(req); if (!me) return fail(res, 401, 'Sign in first'), true;
        const all = db.users(), u = all.find(x => x.id === me.id);
        if (body.name !== undefined) { const n = cleanName(body.name); if (!n) return fail(res, 400, 'Enter a name'), true; u.name = n; }
        const r = applyContact(u, body); if (r.error) return fail(res, r.status, r.error), true;
        db.saveUsers(all); return send(res, 200, { ok: true, user: pub(u, true) }), true;
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
      /* an expired licence leaves the store readable but not changeable */
      if (licenseOf(db.store(sid)).expired) return fail(res, 403, EXPIRED_MSG, 'license_expired'), true;
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
        return send(res, 200, { ok: true, stores: db.stores().map(s => ({ ...s, license: licenseOf(s), userCount: users.filter(u => u.storeId === s.id).length })) }), true;
      }
      if (!b && m === 'POST') {
        const name = cleanName(body.name), ad = body.admin || {};
        const username = String(ad.username || '').trim().toLowerCase();
        if (!name) return fail(res, 400, 'Enter the store name'), true;
        if (!userNameOk(username)) return fail(res, 400, 'Owner ' + USERNAME_MSG.charAt(0).toLowerCase() + USERNAME_MSG.slice(1)), true;
        if (db.users().some(u => u.username === username)) return fail(res, 409, 'That username is taken'), true;
        if (!cleanName(ad.name)) return fail(res, 400, 'Enter the owner name'), true;
        if (String(ad.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true;
        const ct = checkContact(ad, null, true); if (ct.error) return fail(res, ct.status, ct.error), true;
        const lic = applyLicense({ plan: 'licensed', expiresAt: addMonths(localDate(), TRIAL_MONTHS), maxUsers: DEFAULT_MAX_USERS }, body.license);
        if (lic.error) return fail(res, 400, lic.error), true;
        const s = db.createStore(name, lic.license);
        db.saveUsers([...db.users(), { id: db.newId(), username, name: cleanName(ad.name), email: ct.email, phone: ct.phone, role: 'admin', storeId: s.id, active: true, passwordHash: hashPassword(ad.password), createdAt: new Date().toISOString() }]);
        return send(res, 200, { ok: true, store: { ...s, license: licenseOf(s) } }), true;
      }
      if (b && m === 'PATCH') {
        const all = db.stores(), s = all.find(x => x.id === b);
        if (!s) return fail(res, 404, 'Not found'), true;
        if (body.name !== undefined) { const n = cleanName(body.name); if (!n) return fail(res, 400, 'Enter the store name'), true; s.name = n; }
        if (body.active !== undefined) s.active = !!body.active;
        if (body.license !== undefined) { const r = applyLicense(s.license || {}, body.license); if (r.error) return fail(res, 400, r.error), true; s.license = r.license; }
        db.saveStores(all); return send(res, 200, { ok: true, store: { ...s, license: licenseOf(s) } }), true;
      }
      return fail(res, 404, 'Not found'), true;
    }

    /* ----- users ----- */
    if (a === 'users') {
      if (me.role === 'user') return fail(res, 403, 'Not allowed'), true;
      const manageable = t => me.role === 'superadmin' || (t.role === 'user' && t.storeId === me.storeId);
      if (!b && m === 'GET') {
        const list = db.users().filter(u => me.role === 'superadmin' || u.storeId === me.storeId);
        return send(res, 200, { ok: true, users: list.map(u => pub(u)) }), true;
      }
      if (!b && m === 'POST') {
        const username = String(body.username || '').trim().toLowerCase(), name = cleanName(body.name);
        const role = me.role === 'admin' ? 'user' : body.role;
        if (!['superadmin', 'admin', 'user'].includes(role)) return fail(res, 400, 'Choose a role'), true;
        const storeId = role === 'superadmin' ? null : me.role === 'admin' ? me.storeId : body.storeId;
        if (role !== 'superadmin' && !db.store(storeId)) return fail(res, 400, 'Choose a store'), true;
        if (!userNameOk(username)) return fail(res, 400, USERNAME_MSG), true;
        if (!name) return fail(res, 400, 'Enter a name'), true;
        if (String(body.password || '').length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true;
        const ct = checkContact(body, null, true); if (ct.error) return fail(res, ct.status, ct.error), true;
        if (db.users().some(u => u.username === username)) return fail(res, 409, 'That username is taken'), true;
        if (role !== 'superadmin') { const p = seatProblem(db.store(storeId), me.role === 'superadmin'); if (p) return fail(res, 403, p.msg, p.code), true; }
        const u = { id: db.newId(), username, name, email: ct.email, phone: ct.phone, role, storeId, active: true, passwordHash: hashPassword(body.password), createdAt: new Date().toISOString() };
        if (role === 'user') u.perms = normPerms(body.perms);
        db.saveUsers([...db.users(), u]);
        return send(res, 200, { ok: true, user: pub(u) }), true;
      }
      if (b && m === 'PATCH') {
        const all = db.users(), t = all.find(x => x.id === b);
        if (!t || !manageable(t)) return fail(res, 404, 'Not found'), true;
        if (body.name !== undefined) { const n = cleanName(body.name); if (!n) return fail(res, 400, 'Enter a name'), true; t.name = n; }
        if (body.active !== undefined) {
          if (t.id === me.id && !body.active) return fail(res, 400, 'You cannot turn off your own account'), true;
          if (body.active && !t.active && t.role !== 'superadmin') { const p = seatProblem(db.store(t.storeId), me.role === 'superadmin'); if (p) return fail(res, 403, p.msg, p.code), true; }
          t.active = !!body.active;
        }
        if (body.perms !== undefined && t.role === 'user') t.perms = normPerms(body.perms);
        if (body.password) { if (String(body.password).length < 8) return fail(res, 400, 'Password must be at least 8 characters'), true; t.passwordHash = hashPassword(body.password); }
        const r = applyContact(t, body); if (r.error) return fail(res, r.status, r.error), true;
        db.saveUsers(all); return send(res, 200, { ok: true, user: pub(t) }), true;
      }
      return fail(res, 404, 'Not found'), true;
    }
    return fail(res, 404, 'Not found'), true;
  }
  return handle;
}
module.exports = { createApi };
