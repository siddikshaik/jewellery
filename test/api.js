// Server tests: sign-in, roles, store isolation, per-record saving, legacy data move. Runs against a real server on a temp folder.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { createApp } = require('../server');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-'));
// an old single-store install: files straight under data/
fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify({ name: 'Old Shop', prefix: 'OS-' }));
fs.writeFileSync(path.join(tmp, 'customers.json'), JSON.stringify([{ id: 'c0', name: 'Legacy Customer' }]));
fs.writeFileSync(path.join(tmp, 'invoices.json'), JSON.stringify([]));

const server = createApp({ dataDir: tmp });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const client = () => {
    let cookie = '';
    return async (method, p, body) => {
      const r = await fetch(base + '/api/' + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
      return { s: r.status, j: await r.json() };
    };
  };
  const anon = client(), root = client(), admin = client(), biller = client(), viewer = client(), other = client();

  // 1. nothing works before sign-in; first run asks for a super admin
  assert.strictEqual((await anon('GET', 'auth/status')).j.setupNeeded, true);
  assert.strictEqual((await anon('GET', 'data')).s, 401);
  assert.strictEqual((await root('POST', 'auth/setup', { username: 'root', name: 'Root', password: 'short' })).s, 400);
  assert.strictEqual((await root('POST', 'auth/setup', { username: 'root', name: 'Root', password: 'rootpass123' })).s, 200);
  assert.strictEqual((await anon('POST', 'auth/setup', { username: 'x1x', name: 'X', password: 'password123' })).s, 403, 'setup only once');

  // 2. old data became the first store
  let stores = (await root('GET', 'stores')).j.stores;
  assert.strictEqual(stores.length, 1); assert.strictEqual(stores[0].name, 'Old Shop');
  const oldId = stores[0].id;
  assert.deepStrictEqual((await root('GET', 'data?store=' + oldId)).j.data.customers, [{ id: 'c0', name: 'Legacy Customer' }]);

  // 3. super admin creates stores and their admins
  const mk = async (name, user) => (await root('POST', 'stores', { name, admin: { username: user, name: user, password: 'adminpass1' } }));
  assert.strictEqual((await mk('Alpha', 'alpha')).s, 200);
  assert.strictEqual((await mk('Beta', 'beta')).s, 200);
  assert.strictEqual((await mk('Gamma', 'alpha')).s, 409, 'username unique');
  stores = (await root('GET', 'stores')).j.stores;
  const alpha = stores.find(s => s.name === 'Alpha').id, beta = stores.find(s => s.name === 'Beta').id;

  // 4. sign-in
  assert.strictEqual((await anon('POST', 'auth/login', { username: 'alpha', password: 'wrong' })).s, 401);
  assert.strictEqual((await admin('POST', 'auth/login', { username: 'ALPHA', password: 'adminpass1' })).s, 200);
  assert.strictEqual((await other('POST', 'auth/login', { username: 'beta', password: 'adminpass1' })).s, 200);
  const me = (await admin('GET', 'auth/status')).j.user;
  assert.strictEqual(me.role, 'admin'); assert.strictEqual(me.storeId, alpha); assert.ok(!JSON.stringify(me).includes('passwordHash'));

  // 5. store admin saves records; invoice numbers and stock tags stay unique
  const inv = (id, no, stockId) => ({ id, no, date: '2026-11-15', customerId: 'c1', items: [{ id: 'i', stockId }], payments: [] });
  assert.strictEqual((await admin('PUT', 'data/customers/c1', { id: 'c1', name: 'Asha' })).s, 200);
  assert.strictEqual((await admin('PUT', 'data/invoices/a1', inv('a1', 'INV-0001', 's1'))).s, 200);
  assert.strictEqual((await admin('PUT', 'data/invoices/a2', inv('a2', 'INV-0001'))).s, 409);
  assert.strictEqual((await admin('PUT', 'data/invoices/a1', { ...inv('a1', 'INV-0001', 's1'), notes: 'edit' })).s, 200, 'same invoice may be re-saved');
  assert.strictEqual((await admin('PUT', 'data/inventory/s1', { id: 's1', tag: 'G-0001', name: 'Chain' })).s, 200);
  assert.strictEqual((await admin('PUT', 'data/inventory/s2', { id: 's2', tag: 'G-0001', name: 'Ring' })).s, 409);
  assert.strictEqual((await admin('PUT', 'data/inventory/s3', { id: 'WRONG', tag: 'G-3' })).s, 400);
  assert.strictEqual((await admin('PUT', 'data/settings', { store: { name: 'Alpha Jewels' } })).s, 200);
  assert.strictEqual((await admin('PUT', 'data/rates', { gold: { '24K': 7500, '22K': 6875 }, silver: 95, date: '2026-11-15' })).s, 200);
  assert.deepStrictEqual((await admin('GET', 'data')).j.data.soldStock, ['s1']);

  // 6. stores cannot see each other
  const betaData = (await other('GET', 'data')).j;
  assert.strictEqual(betaData.storeId, beta); assert.strictEqual(betaData.data.invoices, null);
  assert.strictEqual((await other('GET', 'data?store=' + alpha)).s, 403, 'store admin cannot name another store');

  // 7. store admin makes users with per-area roles
  const mkUser = (u, perms, who = admin) => who('POST', 'users', { username: u, name: u, password: 'userpass12', role: 'user', perms });
  assert.strictEqual((await mkUser('bill', { invoices: 'edit', customers: 'view', inventory: 'none' })).s, 200);
  assert.strictEqual((await mkUser('look', { invoices: 'none', customers: 'none', inventory: 'view' })).s, 200);
  assert.strictEqual((await admin('POST', 'users', { username: 'sneaky', name: 's', password: 'userpass12', role: 'admin' })).j.user.role, 'user', 'a store admin can only make users');
  assert.strictEqual((await admin('POST', 'users', { username: 'x2x', name: 'x', password: 'userpass12', role: 'user', storeId: beta })).j.user.storeId, alpha, 'always their own store');
  await biller('POST', 'auth/login', { username: 'bill', password: 'userpass12' });
  await viewer('POST', 'auth/login', { username: 'look', password: 'userpass12' });

  const b = (await biller('GET', 'data')).j.data;
  assert.ok(b.invoices && b.customers && b.rates && b.settings); assert.strictEqual(b.inventory, null, 'no inventory role, no inventory data');
  assert.strictEqual((await biller('PUT', 'data/invoices/a3', inv('a3', 'INV-0002'))).s, 200);
  assert.strictEqual((await biller('PUT', 'data/customers/c9', { id: 'c9', name: 'Nope' })).s, 403, 'customers is view only');
  assert.strictEqual((await biller('PUT', 'data/inventory/s9', { id: 's9', tag: 'T9' })).s, 403);
  assert.strictEqual((await biller('PUT', 'data/settings', { x: 1 })).s, 403);
  assert.strictEqual((await biller('PUT', 'data/rates', { gold: {} })).s, 403);
  assert.strictEqual((await biller('GET', 'users')).s, 403);
  assert.strictEqual((await biller('GET', 'stores')).s, 403);

  const v = (await viewer('GET', 'data')).j.data;
  assert.ok(v.inventory && v.rates); assert.strictEqual(v.invoices, null); assert.strictEqual(v.customers, null);
  assert.deepStrictEqual(v.soldStock, ['s1'], 'stock viewers still learn which items are sold');
  assert.strictEqual((await viewer('PUT', 'data/inventory/s5', { id: 's5', tag: 'G-5' })).s, 403, 'view only');
  assert.strictEqual((await viewer('DELETE', 'data/inventory/s1')).s, 403);

  // 7b. purchases: their own role; stock pieces carry a HUID that must be well formed and unique
  assert.strictEqual((await admin('PUT', 'data/inventory/s6', { id: 's6', tag: 'G-0006', name: 'Ring', huid: 'AB12CD' })).s, 200);
  assert.strictEqual((await admin('PUT', 'data/inventory/s7', { id: 's7', tag: 'G-0007', name: 'Ring 2', huid: 'AB12CD' })).s, 409, 'HUID is unique');
  assert.strictEqual((await admin('PUT', 'data/inventory/s7', { id: 's7', tag: 'G-0007', name: 'Ring 2', huid: 'ab12' })).s, 400, 'HUID format');
  assert.strictEqual((await admin('PUT', 'data/inventory/s6', { id: 's6', tag: 'G-0006', name: 'Ring', huid: 'AB12CD', notes: 'x' })).s, 200, 'same piece may be re-saved');
  assert.strictEqual((await admin('PUT', 'data/suppliers/p1', { id: 'p1', name: 'Mehta Bullion' })).s, 200);
  assert.strictEqual((await admin('PUT', 'data/purchases/b1', { id: 'b1', no: 'PUR-0001', items: [] })).s, 200);
  assert.strictEqual((await admin('PUT', 'data/purchases/b2', { id: 'b2', no: 'PUR-0001', items: [] })).s, 409, 'purchase numbers are unique');
  assert.strictEqual((await mkUser('buyer', { invoices: 'none', customers: 'none', inventory: 'none', purchases: 'edit' })).s, 200);
  assert.strictEqual((await mkUser('auditor', { invoices: 'none', customers: 'none', inventory: 'none', purchases: 'view' })).s, 200);
  const buyer = client(), auditor = client();
  await buyer('POST', 'auth/login', { username: 'buyer', password: 'userpass12' });
  await auditor('POST', 'auth/login', { username: 'auditor', password: 'userpass12' });
  const bd = (await buyer('GET', 'data')).j.data;
  assert.ok(bd.purchases && bd.suppliers && bd.rates); assert.strictEqual(bd.invoices, null); assert.strictEqual(bd.inventory, null); assert.strictEqual(bd.customers, null);
  assert.strictEqual((await buyer('PUT', 'data/purchases/b3', { id: 'b3', no: 'PUR-0002', items: [] })).s, 200);
  assert.strictEqual((await buyer('PUT', 'data/inventory/s8', { id: 's8', tag: 'G-0008' })).s, 403, 'a buyer cannot write stock');
  assert.strictEqual((await auditor('GET', 'data')).j.data.purchases.length, 2);
  assert.strictEqual((await auditor('PUT', 'data/purchases/b4', { id: 'b4', no: 'PUR-0003', items: [] })).s, 403);
  assert.strictEqual((await auditor('DELETE', 'data/purchases/b3')).s, 403);
  assert.strictEqual((await biller('GET', 'data')).j.data.purchases, null, 'invoice-only users get no purchases');
  assert.strictEqual((await biller('PUT', 'data/suppliers/p2', { id: 'p2', name: 'x' })).s, 403);

  // 8. changing a user's role takes effect on the next request
  const userId = (await admin('GET', 'users')).j.users.find(u => u.username === 'look').id;
  assert.strictEqual((await admin('PATCH', 'users/' + userId, { perms: { invoices: 'none', customers: 'none', inventory: 'edit' } })).s, 200);
  assert.strictEqual((await viewer('PUT', 'data/inventory/s5', { id: 's5', tag: 'G-5', name: 'Coin' })).s, 200);
  assert.strictEqual((await admin('PATCH', 'users/' + userId, { active: false })).s, 200);
  assert.strictEqual((await viewer('GET', 'data')).s, 401, 'turned-off user is signed out');
  const betaUsers = (await root('GET', 'users')).j.users, betaAdmin = betaUsers.find(u => u.username === 'beta');
  assert.strictEqual((await admin('PATCH', 'users/' + betaAdmin.id, { active: false })).s, 404, 'cannot touch another store');
  assert.strictEqual((await admin('GET', 'users')).j.users.every(u => u.storeId === alpha), true);

  // 9. super admin monitors every store but cannot change store data
  const mon = (await root('GET', 'data?store=' + alpha)).j.data;
  assert.strictEqual(mon.invoices.length, 2); assert.strictEqual(mon.purchases.length, 2); assert.strictEqual(mon.settings.store.name, 'Alpha Jewels');
  assert.strictEqual((await root('GET', 'data')).s, 400, 'must choose a store');
  assert.strictEqual((await root('PUT', 'data/invoices/zz?store=' + alpha, inv('zz', 'Z-1'))).s, 403, 'monitoring is read-only');
  assert.strictEqual((await root('PUT', 'data/settings?store=' + alpha, { store: { name: 'x' } })).s, 403);

  // 10. store switched off locks its people out
  assert.strictEqual((await root('PATCH', 'stores/' + beta, { active: false })).s, 200);
  assert.strictEqual((await other('GET', 'data')).s, 401);
  assert.strictEqual((await anon('POST', 'auth/login', { username: 'beta', password: 'adminpass1' })).s, 403);

  // 11. password change
  assert.strictEqual((await admin('POST', 'auth/password', { current: 'nope', next: 'brandnewpass' })).s, 400);
  assert.strictEqual((await admin('POST', 'auth/password', { current: 'adminpass1', next: 'brandnewpass' })).s, 200);
  assert.strictEqual((await anon('POST', 'auth/login', { username: 'alpha', password: 'adminpass1' })).s, 401);
  assert.strictEqual((await anon('POST', 'auth/login', { username: 'alpha', password: 'brandnewpass' })).s, 200);

  // 12. repeated wrong passwords lock the account for a while
  const brute = client(); let last = 0;
  for (let i = 0; i < 7; i++) last = (await brute('POST', 'auth/login', { username: 'bill', password: 'x' + i })).s;
  assert.strictEqual(last, 429);
  assert.strictEqual((await brute('POST', 'auth/login', { username: 'bill', password: 'userpass12' })).s, 429, 'even the right password waits');

  // 13. tampered session cookie is refused
  const r = await fetch(base + '/api/data', { headers: { cookie: 'jb=eyJ1IjoieCIsImV4cCI6OTk5OTk5OTk5OTk5OX0.AAAA' } });
  assert.strictEqual(r.status, 401);

  // passwords are never stored in clear
  const raw = fs.readFileSync(path.join(tmp, 'platform', 'users.json'), 'utf8');
  assert.ok(!raw.includes('userpass12') && !raw.includes('rootpass123') && raw.includes('scrypt$'));
  assert.ok(fs.existsSync(path.join(tmp, 'legacy', 'settings.json')), 'old files kept in data/legacy');

  server.close();
  console.log('API checks passed');
})().catch(e => { console.error(e); process.exit(1); });
