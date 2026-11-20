// Server tests: sign-in, roles, store isolation, per-record saving, legacy data move. Runs against a real server on a temp folder.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { createApp } = require('../server');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-'));
// an old single-store install: files straight under data/
fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify({ name: 'Old Shop', prefix: 'OS-' }));
fs.writeFileSync(path.join(tmp, 'customers.json'), JSON.stringify([{ id: 'c0', name: 'Legacy Customer' }]));
fs.writeFileSync(path.join(tmp, 'invoices.json'), JSON.stringify([]));

const server = createApp({ dataDir: tmp });
let phoneN = 9000000100; const nextPhone = () => String(phoneN++);
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const plusMonths = (iso, n) => { const [y, m, d] = iso.split('-').map(Number), t = new Date(y, m - 1 + n, 1), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); t.setDate(Math.min(d, last)); return ymd(t); };
const TODAY = ymd(new Date());
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
  assert.strictEqual((await root('POST', 'auth/setup', { username: 'root', name: 'Root', password: 'short', email: 'root@example.com', phone: '9000000001' })).s, 400);
  assert.strictEqual((await root('POST', 'auth/setup', { username: 'root', name: 'Root', password: 'rootpass123', email: 'root@example.com', phone: '9000000001' })).s, 200);
  assert.strictEqual((await anon('POST', 'auth/setup', { username: 'x1x', name: 'X', password: 'password123', email: 'x1x@example.com', phone: '9000000002' })).s, 403, 'setup only once');

  // 2. old data became the first store
  let stores = (await root('GET', 'stores')).j.stores;
  assert.strictEqual(stores.length, 1); assert.strictEqual(stores[0].name, 'Old Shop');
  const oldId = stores[0].id;
  assert.deepStrictEqual((await root('GET', 'data?store=' + oldId)).j.data.customers, [{ id: 'c0', name: 'Legacy Customer' }]);

  // 3. super admin creates stores and their admins
  const mk = async (name, user) => (await root('POST', 'stores', { name, admin: { username: user, name: user, password: 'adminpass1', email: user + '@example.com', phone: nextPhone() } }));
  assert.strictEqual((await mk('Alpha', 'alpha')).s, 200);
  assert.strictEqual((await mk('Beta', 'beta')).s, 200);
  assert.strictEqual((await mk('Gamma', 'alpha')).s, 409, 'username unique');
  stores = (await root('GET', 'stores')).j.stores;
  const alpha = stores.find(s => s.name === 'Alpha').id, beta = stores.find(s => s.name === 'Beta').id;
  assert.strictEqual((await root('PATCH', 'stores/' + alpha, { license: { maxUsers: 50 } })).s, 200, 'the test store needs room for many people');

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
  const mkUser = (u, perms, who = admin) => who('POST', 'users', { username: u, name: u, password: 'userpass12', role: 'user', perms, email: u + '@example.com', phone: nextPhone() });
  assert.strictEqual((await mkUser('bill', { invoices: 'edit', customers: 'view', inventory: 'none' })).s, 200);
  assert.strictEqual((await mkUser('look', { invoices: 'none', customers: 'none', inventory: 'view' })).s, 200);
  assert.strictEqual((await admin('POST', 'users', { username: 'sneaky', name: 's', password: 'userpass12', role: 'admin', email: 'sneaky@example.com', phone: nextPhone() })).j.user.role, 'user', 'a store admin can only make users');
  assert.strictEqual((await admin('POST', 'users', { username: 'x2x', name: 'x', password: 'userpass12', role: 'user', storeId: beta, email: 'x2x@example.com', phone: nextPhone() })).j.user.storeId, alpha, 'always their own store');
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

  // 14. contact details: required for new accounts, unique across the platform, any common format
  const dupUser = extra => root('POST', 'users', { username: 'dupe1', name: 'D', password: 'userpass12', role: 'user', storeId: alpha, perms: {}, ...extra });
  assert.strictEqual((await dupUser({ email: 'not-an-email', phone: nextPhone() })).s, 400, 'email must look like an email');
  assert.strictEqual((await dupUser({ email: 'dupe1@example.com', phone: '12345' })).s, 400, 'phone must have 10 digits');
  assert.strictEqual((await dupUser({ email: 'dupe1@example.com' })).s, 400, 'phone is required for a new account');
  assert.strictEqual((await dupUser({ phone: nextPhone() })).s, 400, 'email is required for a new account');
  assert.strictEqual((await dupUser({ email: 'BILL@Example.com', phone: nextPhone() })).s, 409, 'email is unique, ignoring capitals');
  assert.strictEqual((await dupUser({ email: 'dupe1@example.com', phone: '9000000001' })).s, 409, 'phone is unique across all stores');
  assert.strictEqual((await dupUser({ email: 'dupe1@example.com', phone: '+91 90000-00001' })).s, 409, 'phone formats with +91, spaces and dashes count as the same number');
  assert.strictEqual((await dupUser({ email: 'dupe1@example.com', phone: '09000000001' })).s, 409, 'a leading 0 too');
  assert.strictEqual((await dupUser({ email: 'dupe1@example.com', phone: nextPhone() })).s, 200);
  const meNow = (await admin('GET', 'users')).j.users.find(u => u.username === 'bill');
  assert.ok(/^\d{10}$/.test(meNow.phone) && meNow.email === 'bill@example.com', 'stored normalised');
  assert.strictEqual((await admin('PATCH', 'users/' + meNow.id, { phone: '9000000001' })).s, 409, 'cannot take someone else\'s number when editing');
  assert.strictEqual((await admin('PATCH', 'users/' + meNow.id, { email: '' })).s, 400, 'a value cannot be blanked');
  assert.strictEqual((await admin('PATCH', 'users/' + meNow.id, { email: 'bill.new@example.com' })).s, 200);
  assert.strictEqual((await admin('PATCH', 'users/' + meNow.id, { email: 'bill.new@example.com' })).s, 200, 'saving your own email again is fine');
  assert.strictEqual((await biller('PATCH', 'auth/me', { phone: '9000000001' })).s, 409, 'people editing themselves are held to the same rule');
  assert.strictEqual((await biller('PATCH', 'auth/me', { name: 'Bill B', phone: '98 7654 3210' })).j.user.phone, '9876543210');
  // sign in with the username, email or phone
  assert.strictEqual((await admin('POST', 'users', { username: 'lena', name: 'Lena', password: 'userpass12', email: 'lena@example.com', phone: '9876500001', perms: {} })).s, 200);
  for (const id of ['lena', 'LENA@Example.com', '98765 00001', '+91 9876500001', '098765-00001']) assert.strictEqual((await client()('POST', 'auth/login', { username: id, password: 'userpass12' })).s, 200, 'login with ' + id);

  // 15. sign-up: anyone can open a store and becomes its owner with a one-month trial and two users
  const su = { storeName: 'Gamma Gems', name: 'Gita Owner', username: 'gita', email: 'gita@example.com', phone: nextPhone(), password: 'gitapass12' };
  const gita = client();
  const sres = await gita('POST', 'auth/signup', su);
  assert.strictEqual(sres.s, 200); assert.strictEqual(sres.j.user.role, 'admin'); assert.strictEqual(sres.j.user.storeName, 'Gamma Gems');
  const lic = sres.j.user.license;
  assert.strictEqual(lic.plan, 'trial'); assert.strictEqual(lic.maxUsers, 2); assert.strictEqual(lic.expiresAt, plusMonths(TODAY, 1), 'a month from today'); assert.strictEqual(lic.expired, false); assert.strictEqual(lic.usedUsers, 1);
  assert.ok(sres.j.user.support && sres.j.user.support.email === 'root@example.com', 'store people can see how to reach the super admin');
  assert.strictEqual((await gita('PUT', 'data/customers/g1', { id: 'g1', name: 'First customer' })).s, 200, 'the new owner can work straight away');
  assert.strictEqual((await anon('POST', 'auth/signup', { ...su, storeName: 'Another' })).s, 409, 'username taken');
  assert.strictEqual((await anon('POST', 'auth/signup', { ...su, username: 'gita2', storeName: 'Another', phone: nextPhone() })).s, 409, 'email taken');
  assert.strictEqual((await anon('POST', 'auth/signup', { ...su, username: 'gita2', storeName: 'Another', email: 'gita2@example.com' })).s, 409, 'phone taken');
  assert.strictEqual((await anon('POST', 'auth/signup', { ...su, username: 'gita3', email: 'g3@example.com', phone: nextPhone(), storeName: '' })).s, 400, 'store name required');
  assert.strictEqual((await anon('POST', 'auth/signup', { ...su, username: 'gita3', email: 'g3@example.com', phone: nextPhone(), password: 'short' })).s, 400);
  assert.strictEqual((await anon('GET', 'auth/status')).j.signupOpen, true);
  const gammaId = sres.j.user.storeId;
  assert.strictEqual((await gita('GET', 'stores')).s, 403, 'an owner cannot see other stores');
  assert.strictEqual((await gita('PATCH', 'stores/' + gammaId, { license: { maxUsers: 99 } })).s, 403, 'only the super admin edits a licence');

  // 16. two users by default; more needs the super admin
  const bob = await gita('POST', 'users', { username: 'bob', name: 'Bob', password: 'userpass12', email: 'bob@example.com', phone: nextPhone(), perms: { invoices: 'edit' } });
  assert.strictEqual(bob.s, 200, 'owner plus one more fits');
  const third = await gita('POST', 'users', { username: 'cara', name: 'Cara', password: 'userpass12', email: 'cara@example.com', phone: nextPhone() });
  assert.strictEqual(third.s, 403); assert.strictEqual(third.j.code, 'user_limit'); assert.ok(/limit of 2 users/.test(third.j.error) && /super admin/i.test(third.j.error));
  assert.strictEqual((await gita('PATCH', 'users/' + bob.j.user.id, { active: false })).s, 200, 'turning someone off frees a seat');
  const cara = await gita('POST', 'users', { username: 'cara', name: 'Cara', password: 'userpass12', email: 'cara@example.com', phone: nextPhone() });
  assert.strictEqual(cara.s, 200);
  const back = await gita('PATCH', 'users/' + bob.j.user.id, { active: true });
  assert.strictEqual(back.s, 403, 'turning them back on would break the limit'); assert.strictEqual(back.j.code, 'user_limit');
  assert.strictEqual((await root('POST', 'users', { username: 'dina', name: 'Dina', password: 'userpass12', role: 'user', storeId: gammaId, email: 'dina@example.com', phone: nextPhone() })).s, 403, 'the limit holds for the super admin too, until it is raised');
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { maxUsers: 5 } })).s, 200);
  assert.strictEqual((await gita('PATCH', 'users/' + bob.j.user.id, { active: true })).s, 200, 'after the super admin raises it');
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { maxUsers: 0 } })).s, 400); assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { maxUsers: 'lots' } })).s, 400);

  // 17. when the licence ends the store can look but not change; the super admin renews it
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { expiresAt: '2020-01-31' } })).s, 200);
  const exp = (await gita('GET', 'auth/status')).j.user.license;
  assert.strictEqual(exp.expired, true); assert.ok(exp.daysLeft < 0);
  assert.strictEqual((await gita('GET', 'data')).s, 200, 'still readable');
  assert.strictEqual((await gita('GET', 'data')).j.data.customers.length, 1);
  const blocked = await gita('PUT', 'data/customers/g2', { id: 'g2', name: 'Late' });
  assert.strictEqual(blocked.s, 403); assert.strictEqual(blocked.j.code, 'license_expired'); assert.ok(/contact the super admin/i.test(blocked.j.error));
  assert.strictEqual((await gita('PUT', 'data/settings', { store: { name: 'x' } })).s, 403, 'settings too');
  assert.strictEqual((await gita('DELETE', 'data/customers/g1')).s, 403, 'and deletes');
  assert.strictEqual((await gita('POST', 'users', { username: 'eve', name: 'Eve', password: 'userpass12', email: 'eve@example.com', phone: nextPhone() })).j.code, 'license_expired', 'no new people either');
  assert.strictEqual((await client()('POST', 'auth/login', { username: 'gita', password: 'gitapass12' })).s, 200, 'they can still sign in');
  assert.strictEqual((await gita('POST', 'auth/password', { current: 'gitapass12', next: 'gitapass34' })).s, 200, 'and change their own password');
  assert.strictEqual((await root('GET', 'data?store=' + gammaId)).s, 200, 'the super admin sees it as before');
  const renewed = await root('PATCH', 'stores/' + gammaId, { license: { extendMonths: 2, plan: 'licensed', note: 'Paid till March' } });
  assert.strictEqual(renewed.j.store.license.expiresAt, plusMonths(TODAY, 2), 'extending an expired licence counts from today, not from the old date');
  assert.strictEqual(renewed.j.store.license.expired, false); assert.strictEqual(renewed.j.store.license.plan, 'licensed');
  assert.strictEqual((await gita('PUT', 'data/customers/g2', { id: 'g2', name: 'Late' })).s, 200, 'writing works again at once');
  const ext = await root('PATCH', 'stores/' + gammaId, { license: { extendMonths: 1 } });
  assert.strictEqual(ext.j.store.license.expiresAt, plusMonths(plusMonths(TODAY, 2), 1), 'extending a live licence counts from its end');
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { expiresAt: TODAY } })).j.store.license.expired, false, 'valid through the day it names');
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { expiresAt: 'tomorrow' } })).s, 400);
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { extendMonths: 0 } })).s, 400);
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { plan: 'free' } })).s, 400);
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { expiresAt: '' } })).j.store.license.expiresAt, '', 'no expiry');
  assert.ok((await root('GET', 'stores')).j.stores.every(s => s.license && typeof s.license.expired === 'boolean' && s.license.maxUsers >= 1), 'every store lists its licence');
  assert.strictEqual(plusMonths('2026-01-31', 1), '2026-02-28', 'month ends are clamped');
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { monthsFromToday: 3 } })).j.store.license.expiresAt, plusMonths(TODAY, 3), 'a fresh term counts from today');
  assert.strictEqual((await root('PATCH', 'stores/' + gammaId, { license: { monthsFromToday: 0 } })).s, 400);
  const withTerm = await root('POST', 'stores', { name: 'Epsilon', license: { plan: 'licensed', monthsFromToday: 6, maxUsers: 4 }, admin: { username: 'eps', name: 'Eps', password: 'adminpass1', email: 'eps@example.com', phone: nextPhone() } });
  assert.strictEqual(withTerm.s, 200); assert.strictEqual(withTerm.j.store.license.expiresAt, plusMonths(TODAY, 6)); assert.strictEqual(withTerm.j.store.license.maxUsers, 4);
  const dflt = await root('POST', 'stores', { name: 'Zeta', admin: { username: 'zeta', name: 'Z', password: 'adminpass1', email: 'zeta@example.com', phone: nextPhone() } });
  assert.strictEqual(dflt.j.store.license.expiresAt, plusMonths(TODAY, 1), 'a store made by the super admin defaults to a month and two users'); assert.strictEqual(dflt.j.store.license.maxUsers, 2);

  // 18. stores that existed before licences keep working, with no expiry
  const oldStore = (await root('GET', 'stores')).j.stores.find(s => s.name === 'Old Shop');
  assert.strictEqual(oldStore.license.expiresAt, ''); assert.strictEqual(oldStore.license.expired, false);

  // 19. sign-up is rate limited per address, and can be switched off
  let lastSignup = 0;
  for (let i = 0; i < 6; i++) lastSignup = (await anon('POST', 'auth/signup', { storeName: 'Spam ' + i, name: 'S', username: 'spam' + i, email: `spam${i}@example.com`, phone: nextPhone(), password: 'spampass12' })).s;
  assert.strictEqual(lastSignup, 429, 'too many sign-ups from one address');
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2-')), server2 = createApp({ dataDir: tmp2, signupOpen: false });
  await new Promise(r => server2.listen(0, '127.0.0.1', r));
  const base2 = 'http://127.0.0.1:' + server2.address().port;
  const call2 = async (p, b) => { const r = await fetch(base2 + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
  assert.strictEqual((await call2('auth/signup', su)).s, 403, 'no sign-up before the platform is set up');
  await call2('auth/setup', { username: 'root2', name: 'R', password: 'rootpass123', email: 'r2@example.com', phone: '9111111111' });
  const off = await call2('auth/signup', { ...su, username: 'gita9', email: 'g9@example.com', phone: '9222222222' });
  assert.strictEqual(off.s, 403); assert.ok(/turned off/.test(off.j.error));
  assert.strictEqual((await (await fetch(base2 + '/api/auth/status')).json()).signupOpen, false);
  server2.close();

  // passwords are never stored in clear
  const raw = fs.readFileSync(path.join(tmp, 'platform', 'users.json'), 'utf8');
  assert.ok(!raw.includes('userpass12') && !raw.includes('rootpass123') && raw.includes('scrypt$'));
  assert.ok(fs.existsSync(path.join(tmp, 'legacy', 'settings.json')), 'old files kept in data/legacy');

  server.close();
  console.log('API checks passed');
})().catch(e => { console.error(e); process.exit(1); });
