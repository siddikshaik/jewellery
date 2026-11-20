// Renders every route with a stub DOM and checks the money rules and data migration. Run: npm test
const vm = require('vm'), assert = require('assert');
const built = require('../scripts/build').bundle();
// the script inside the final page must be exactly the bundled JS (guards against String.replace mangling "$$")
assert.ok(built.html.includes(built.js), 'built page does not contain the bundled script verbatim');
let js = built.js;
js = js.replace('boot();\n})();', "window.__t={normalize,S:()=>S,set:(k,v)=>{eval(k+'=v')},render,calc,money,statusOf,usedRates,analyticsHTML,listHTML,sheetHTML,detailHTML,editorHTML,customersHTML,customerFormHTML,settingsHTML,SECTIONS,newInvoice,newCustomer,newStock,nextInvoiceNo,nextTag,isSold,stockNet,inventoryHTML,stockFormHTML,usersHTML,userFormHTML,storesHTML,can,navList,defaultRoute,docStatus,COLLECTIONS,LISTS,pcalc,pmoney,pstatusOf,newPurchase,newSupplier,nextPurchaseNo,pieceCost,hallmarkMark,cleanHuid,huidOk,tagPayload,parseScan,qrMatrix,qrSVG,purchasesHTML,purchaseDetailHTML,purchaseEditorHTML,supplierFormHTML,pieceHTML,analyticsHTML,seatInfo,licenseBannerHTML,gateHTML,licenseLine,licenseFormHTML,licensePanelHTML,storesHTML,supportText,ROLE_LABEL,loadSample,removeSample,hasSample,sampleRates,sampleSectionHTML,sampleAllowed,storeIsEmpty,sampleCounts,pieceCost,isSold,statusOf,money};\n})();");
const el = () => new Proxy(function () {}, {
  get: (t, p) => p === 'querySelectorAll' ? () => [] : p === 'querySelector' ? () => el() : p === 'addEventListener' ? () => {} : p in t ? t[p] : (typeof p === 'string' ? el() : undefined),
  set: (t, p, v) => { t[p] = v; return true }, apply: () => el()
});
const ctx = { TextEncoder, URLSearchParams, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { querySelector: () => el(), querySelectorAll: () => [], documentElement: el(), body: el() }, location: { hash: '' }, addEventListener() {}, localStorage: { getItem: () => null, setItem() {} }, navigator: {}, setTimeout, clearTimeout, setInterval, clearInterval, fetch: () => Promise.reject(1), console, URL };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(js, ctx);
const T = ctx.__t, S = T.S();
const TODAY_ISO = new Date().toISOString().slice(0, 10);

// 1. money rules
S.customers.push({ id: 'c1', name: 'Asha', phone: '9876543210', email: 'a@b.co', instagram: 'asha', address: '', gstin: '' });
const inv = T.newInvoice(); inv.isNew = false; inv.customerId = 'c1';
inv.goldRates = { '22K': 6875 }; inv.silverRate = '';
inv.items = [{ id: 'i1', name: 'Chain', metal: 'Gold', purity: '22K', gross: '12', stoneWt: '1', beadsWt: '0.5', makingPct: '8', stone: '200', beads: '' }];
inv.charges = [{ id: 'x', label: 'Hallmark', amount: '45' }];
S.invoices.push(inv);
const c = T.calc(inv), r = c.rows[0];
assert.strictEqual(r.net, 10.5);
assert.strictEqual(+r.mwt.toFixed(3), 0.84);
assert.strictEqual(Math.round(r.making), 5775);
assert.strictEqual(c.total, Math.round((10.5 * 6875 + 5775 + 200 + 45) * 1.03));
assert.strictEqual(JSON.stringify(T.usedRates(inv)), JSON.stringify([['22K', 6875]]));

// 2. payments and status
assert.strictEqual(T.statusOf(inv), 'Unpaid');
inv.payments.push({ id: 'p1', date: '2026-11-15', amount: 1000, mode: 'UPI', note: '' });
assert.strictEqual(T.statusOf(inv), 'Partial');
inv.payments.push({ id: 'p2', date: '2026-11-16', amount: c.total - 1000, mode: 'Cash', note: '' });
assert.strictEqual(T.statusOf(inv), 'Paid');
assert.strictEqual(T.money(inv).bal, 0);

// 3. every route renders (render() reads location.hash). Sign in as a store admin first.
const admin = { id: 'u1', username: 'a', name: 'Admin', role: 'admin', storeId: 's1', storeName: 'S', perms: null };
T.set('ME', admin); T.set('ready', true);
const sheet = T.sheetHTML(inv);
for (const h of ['', 'invoices', 'invoices/new', 'invoices/' + inv.id, 'invoices/' + inv.id + '/edit', 'invoices/nope', 'customers', 'customers/new', 'customers/c1', 'analytics',
  'inventory', 'inventory/new', 'inventory/nope', 'purchases', 'purchases/new', 'purchases/nope', 'suppliers', 'suppliers/new', 'scan', 'tags', 'item/G-0001', 'item/NOPE',
  'analytics/sales', 'analytics/purchases', 'analytics/inventory', 'analytics/profit', 'analytics/bogus', 'users', 'users/new', 'account', 'stores',
  'settings', 'settings/store', 'settings/rates', 'settings/invoicing', 'settings/preferences', 'settings/data', 'nowhere']) { ctx.location.hash = '#/' + h; T.render(); }
['classic', 'modern', 'elegant'].forEach(t => { inv.template = t; assert.ok(T.sheetHTML(inv).includes('t-' + t)); });
T.analyticsHTML(); T.listHTML(); T.detailHTML(inv); T.editorHTML(inv); T.customersHTML(); T.customerFormHTML(T.newCustomer());
Object.keys(T.SECTIONS).forEach(k => assert.ok(T.settingsHTML(k).length > 100));
assert.ok(sheet.includes('Your Jewellery Store'));
// printed invoice: no per-gram rate line, no 'Partial' wording, logo appears when set
assert.ok(!sheet.includes('Rate per gram') && !sheet.includes('Partial'));
T.S().settings.store.logo = 'data:image/png;base64,AAAA';
assert.ok(T.sheetHTML(inv).includes('logo-tile') && T.sheetHTML(inv).includes('data:image/png;base64,AAAA'));
T.S().settings.store.logo = '';
assert.ok(!T.sheetHTML(inv).includes('logo-tile'));
const part = T.newInvoice(); part.items = [{ id: 'z', name: 'Ring', metal: 'Gold', purity: '22K', gross: '5', stoneWt: '', beadsWt: '', makingPct: '', stone: '', beads: '' }];
part.goldRates = { '22K': 1000 }; part.payments = [{ id: 'q', date: '2026-11-15', amount: 100, mode: 'Cash', note: '' }];
assert.strictEqual(T.statusOf(part), 'Partial');          // the app screens still track Partial
assert.ok(T.sheetHTML(part).includes('Unpaid') && !T.sheetHTML(part).includes('Partial'));   // the invoice says Unpaid

// 4. data is split: seven collections, lists saved record by record
assert.deepStrictEqual([...T.COLLECTIONS], ['settings', 'rates', 'customers', 'invoices', 'inventory', 'suppliers', 'purchases']);
assert.deepStrictEqual([...T.LISTS], ['customers', 'invoices', 'inventory', 'suppliers', 'purchases']);

// 5. old data migrates (v1 single object with flat settings and one rate pair)
const v1 = T.normalize({ settings: { name: 'Shree', prefix: 'SJ-', next: 7, cgst: 1.5, sgst: 1.5, terms: 'T', template: 'modern', goldRate: 7000, silverRate: 90, ratesDate: '2026-11-01' }, customers: [], invoices: [{ id: 'o', no: 'INV-9', date: '2026-01-01', customerId: '', goldRate: 7000, silverRate: 90, cgst: 1.5, sgst: 1.5, status: 'Paid', notes: '', items: [{ id: 'a', name: 'r', metal: 'Gold', purity: '22K (916)', weight: '10', making: '700', stone: '', beads: '', other: '50' }] }] });
const o = v1.invoices[0];
assert.strictEqual(v1.settings.store.name, 'Shree');
assert.strictEqual(v1.settings.invoice.prefix, 'SJ-');
assert.strictEqual(v1.settings.invoice.next, 7);
assert.strictEqual(v1.settings.invoice.template, 'modern');
assert.strictEqual(v1.rates.gold['22K'], 7000);
assert.strictEqual(v1.rates.silver, 90);
assert.strictEqual(v1.rates.date, '2026-11-01');
assert.strictEqual(o.items[0].purity, '22K');
assert.strictEqual(T.calc(o).total, Math.round((70000 + 700 + 50) * 1.03));
assert.strictEqual(T.statusOf(o), 'Paid');
assert.strictEqual(T.normalize(null), null);
assert.strictEqual(T.normalize({}), null);
// current shape round-trips unchanged
const again = T.normalize(JSON.parse(JSON.stringify(v1)));
assert.deepStrictEqual(JSON.parse(JSON.stringify(again.settings)), JSON.parse(JSON.stringify(v1.settings)));
assert.deepStrictEqual(JSON.parse(JSON.stringify(again.rates)), JSON.parse(JSON.stringify(v1.rates)));

// 6. invoice numbers and stock tags are derived from what exists
const fresh = T.S(); fresh.invoices.length = 0;
assert.strictEqual(T.nextInvoiceNo(), 'INV-0001');
fresh.invoices.push({ id: 'n1', no: 'INV-0007', date: '2026-11-01', items: [], payments: [] }, { id: 'n2', no: 'OTHER-0099', date: '2026-11-01', items: [], payments: [] });
assert.strictEqual(T.nextInvoiceNo(), 'INV-0008');
fresh.settings.invoice.next = 100;
assert.strictEqual(T.nextInvoiceNo(), 'INV-0100', 'Start numbering from is the floor');
fresh.settings.invoice.next = 1;
assert.strictEqual(T.nextTag('Gold'), 'G-0001'); assert.strictEqual(T.nextTag('Silver'), 'S-0001');

// 7. inventory: net weight and sold status are derived from invoices
const piece = T.newStock('Gold'); piece.name = 'Chain'; piece.gross = '12'; piece.stoneWt = '1'; piece.beadsWt = '0.5';
delete piece.isNew; fresh.inventory.push(piece);
assert.strictEqual(T.stockNet(piece), 10.5);
assert.strictEqual(T.isSold(piece.id), false);
assert.strictEqual(T.nextTag('Gold'), 'G-0002');
const sale = T.newInvoice(); sale.items[0].stockId = piece.id; fresh.invoices.push(sale);
assert.strictEqual(T.isSold(piece.id), true, 'an invoice item pointing at the piece sells it');
fresh.invoices.pop();
assert.strictEqual(T.isSold(piece.id), false, 'deleting the invoice puts it back in stock');
assert.ok(T.inventoryHTML().includes('G-0001') && T.stockFormHTML(piece).includes('Save item'));

// 8. roles decide what is visible
const asUser = perms => { T.set('ME', { id: 'u2', username: 'b', name: 'B', role: 'user', storeId: 's1', storeName: 'S', perms }); };
asUser({ invoices: 'view', customers: 'none', inventory: 'edit' });
assert.ok(T.can('invoices') && !T.can('invoices', 'edit') && !T.can('customers') && T.can('inventory', 'edit'));
assert.ok(!T.can('settings') && !T.can('users') && !T.can('stores'));
assert.deepStrictEqual([...T.navList()], ['invoices', 'inventory', 'analytics']);
assert.strictEqual(T.defaultRoute(), 'invoices');
asUser({ invoices: 'none', customers: 'none', inventory: 'none', purchases: 'view' });
assert.deepStrictEqual([...T.navList()], ['purchases', 'analytics'], 'a purchases-only user sees purchases and its analytics');
assert.ok(T.can('purchases') && !T.can('purchases', 'edit') && !T.can('invoices'));
asUser({ invoices: 'none', customers: 'none', inventory: 'none' });
assert.strictEqual(T.defaultRoute(), 'account', 'a user with no access still gets the account page');
for (const h of ['invoices', 'customers', 'inventory', 'settings', 'users', 'stores']) { ctx.location.hash = '#/' + h; T.render(); }
T.set('ME', admin);
assert.deepStrictEqual([...T.navList()], ['invoices', 'customers', 'inventory', 'purchases', 'analytics', 'users', 'settings']);
assert.ok(T.can('invoices', 'edit') && T.can('settings', 'edit') && !T.can('stores'));
// super admin: stores and users always; store data only while monitoring, and never editable
T.set('ME', { id: 'u3', username: 'root', name: 'Root', role: 'superadmin', storeId: null, storeName: null, perms: null });
assert.deepStrictEqual([...T.navList()], ['stores', 'users']);
assert.ok(!T.can('invoices') && T.can('stores', 'edit') && T.can('users', 'edit'));
T.set('monitor', { id: 's1', name: 'S' });
assert.ok(T.can('invoices') && T.can('settings') && T.can('inventory') && !T.can('invoices', 'edit') && !T.can('settings', 'edit'));
assert.deepStrictEqual([...T.navList()], ['stores', 'users', '|S', 'analytics', 'invoices', 'customers', 'inventory', 'purchases', 'settings']);
for (const h of ['analytics', 'invoices', 'inventory', 'settings/store', 'customers']) { ctx.location.hash = '#/' + h; T.render(); }
T.set('monitor', null);

// 10. HUID and hallmark marks
assert.strictEqual(T.hallmarkMark('Gold', '22K'), '22K916'); assert.strictEqual(T.hallmarkMark('Gold', '18K'), '18K750');
assert.strictEqual(T.hallmarkMark('Silver', '925 Sterling'), '925'); assert.strictEqual(T.hallmarkMark('Gold', '9K'), '9K375');
assert.strictEqual(T.cleanHuid(' ab-12 cd9 '), 'AB12CD');
assert.ok(T.huidOk('AB12CD') && T.huidOk('123456') && !T.huidOk('AB12C') && !T.huidOk('ab12cd') && !T.huidOk('AB12CD7'));
assert.ok(T.newInvoice().items[0].huid === '' && T.newStock('Gold').huid === '');
const ni = T.normalize({ settings: {}, invoices: [{ id: 'h', no: 'X-1', date: '2026-01-01', goldRates: { '22K': 1 }, cgst: 0, sgst: 0, payments: [], items: [{ id: 'a', metal: 'Gold', purity: '22K', gross: '1', makingPct: '0' }] }], inventory: [{ id: 's', tag: 'G-0001', metal: 'Gold', purity: '22K', gross: '1', addedOn: '2026-01-01' }] });
assert.strictEqual(ni.invoices[0].items[0].huid, '', 'old invoice items get an empty HUID'); assert.strictEqual(ni.inventory[0].huid, '', 'old stock gets an empty HUID');
assert.ok(ni.settings.purchase && ni.settings.purchase.prefix === 'PUR-' && ni.settings.store.appUrl === '' && ni.settings.invoice.requireHuid === false, 'new settings get defaults');
{ const it = { id: 'h1', name: 'Ring', metal: 'Gold', purity: '22K', huid: 'AB12CD', gross: '5', stoneWt: '', beadsWt: '', makingPct: '', stone: '', beads: '' };
  const hv = T.newInvoice(); hv.items = [it]; hv.goldRates = { '22K': 1000 };
  assert.ok(T.sheetHTML(hv).includes('HUID AB12CD'), 'the invoice prints the HUID'); }

// 11. purchase maths follows the same rules as an invoice
const pur = T.newPurchase(); pur.id = 'pur1'; pur.no = 'PUR-0001'; pur.supplierId = 'sup1';
pur.items = [{ id: 'pl1', kind: 'Piece', name: 'Chain', category: 'Chain', metal: 'Gold', purity: '22K', gross: '12', stoneWt: '1', beadsWt: '0.5', rate: '6500', makingPct: '8', stone: '200', beads: '' }];
pur.charges = [{ id: 'c', label: 'Hallmarking', amount: '45' }];
const pcx = T.pcalc(pur);
assert.strictEqual(pcx.rows[0].net, 10.5); assert.strictEqual(Math.round(pcx.rows[0].value), 68250); assert.strictEqual(Math.round(pcx.rows[0].making), 5460);
assert.strictEqual(pcx.total, Math.round((68250 + 5460 + 200 + 45) * 1.03));
const asInvoice = T.calc({ items: [{ ...pur.items[0] }], goldRates: { '22K': 6500 }, charges: pur.charges, cgst: 1.5, sgst: 1.5 });
assert.strictEqual(asInvoice.total, pcx.total, 'the same line costs the same on a bill and on an invoice');
assert.strictEqual(T.pstatusOf(pur), 'Unpaid');
pur.payments.push({ id: 'pp', date: '2026-11-15', amount: 1000, mode: 'Cash', note: '' }); assert.strictEqual(T.pstatusOf(pur), 'Partial');
pur.payments.push({ id: 'pq', date: '2026-11-16', amount: pcx.total - 1000, mode: 'Cash', note: '' }); assert.strictEqual(T.pstatusOf(pur), 'Paid'); assert.strictEqual(T.pmoney(pur).bal, 0);
fresh.purchases.push(pur);
assert.strictEqual(T.nextPurchaseNo(), 'PUR-0002');
// a piece remembers the bill line it came from; its cost is derived from that line (before GST, without other charges)
const bought = { id: 'bp', tag: 'G-0099', metal: 'Gold', purity: '22K', gross: '12', stoneWt: '1', beadsWt: '0.5', purchaseId: 'pur1', purchaseItemId: 'pl1' };
assert.strictEqual(Math.round(T.pieceCost(bought)), 68250 + 5460 + 200);
assert.strictEqual(T.pieceCost({ id: 'np', purchaseId: 'nope', purchaseItemId: 'x' }), null);
assert.ok(T.purchasesHTML().includes('PUR-0001') && T.purchaseDetailHTML(pur).includes('Chain') && T.purchaseEditorHTML(pur).includes('Save purchase'));
for (const tab of ['sales', 'purchases', 'inventory', 'profit']) assert.ok(T.analyticsHTML(tab).length > 200, 'analytics ' + tab);

// 12. QR payload: tag number, HUID, gross, net and purity travel inside the code, and the code is a valid symbol
T.set('ME', admin);
const tagged = { id: 'z', tag: 'G-0042', huid: 'AB12CD', metal: 'Gold', purity: '22K', gross: '12', stoneWt: '1', beadsWt: '0.5', name: 'Chain', category: 'Chain', addedOn: '2026-11-01' };
const payload = T.tagPayload(tagged);
assert.ok(payload.includes('#/item/G-0042?') && payload.includes('h=AB12CD') && payload.includes('g=12.000') && payload.includes('n=10.500') && payload.includes('p=22K916') && payload.includes('s=s1'), payload);
const back = T.parseScan(payload);
assert.deepStrictEqual({ ...back }, { tag: 'G-0042', store: 's1', huid: 'AB12CD', gross: '12.000', net: '10.500', purity: '22K916' });
fresh.inventory.push(tagged);
assert.strictEqual(T.parseScan('g-0042').tag, 'G-0042'); assert.strictEqual(T.parseScan('ab12cd').huid, 'AB12CD'); assert.strictEqual(T.parseScan('hello world'), null);
const qm = T.qrMatrix(payload);
assert.ok(qm.length >= 21 && (qm.length - 17) % 4 === 0 && qm.every(r => r.length === qm.length));
const rowBits = r => qm[r].slice(0, 7).map(v => +v).join('');
assert.deepStrictEqual([rowBits(0), rowBits(1), rowBits(3), rowBits(6)], ['1111111', '1000001', '1011101', '1111111'], 'finder pattern in the corner');
assert.ok(T.qrSVG(payload).startsWith('<svg') && T.qrSVG(payload).includes('viewBox'));
assert.throws(() => T.qrMatrix('x'.repeat(300)), /too long/);
assert.ok(T.pieceHTML(tagged, new URLSearchParams(back ? 'n=10.400&h=AB12CD' : '')).includes('different details'), 'a tag printed with other weights is flagged');
assert.ok(!T.pieceHTML(tagged, new URLSearchParams('n=10.500&g=12.000&h=AB12CD&p=22K916')).includes('different details'));

// 9. the printed invoice says Paid or Unpaid only
assert.strictEqual(T.docStatus(part), 'Unpaid');

// 13. licence: expired stores can look but not change; seats; banners; sign-in screens
const lic = over => ({ plan: 'trial', expiresAt: '2026-12-20', maxUsers: 2, usedUsers: 1, expired: false, daysLeft: 30, today: '2026-11-20', ...over });
const owner = l => ({ id: 'o1', username: 'own', name: 'Owner', email: 'o@x.co', phone: '9000000009', role: 'admin', storeId: 's1', storeName: 'S', perms: null, license: l, support: { name: 'Root', email: 'root@x.co', phone: '9000000001' } });
T.set('ME', owner(lic({})));
assert.ok(T.can('invoices', 'edit') && T.can('settings', 'edit') && T.can('users', 'edit'), 'a live licence changes nothing');
assert.strictEqual(T.licenseBannerHTML(), '', 'no banner with a month to go');
T.set('ME', owner(lic({ daysLeft: 3, expiresAt: '2026-11-23' })));
assert.ok(T.licenseBannerHTML().includes('ends in 3 days') && T.licenseBannerHTML().includes('Root') && T.licenseBannerHTML().includes('9000000001'), 'warning with the super admin contact');
T.set('ME', owner(lic({ daysLeft: 0 }))); assert.ok(T.licenseBannerHTML().includes('ends today'));
T.set('ME', owner(lic({ plan: 'licensed', expired: true, daysLeft: -4, expiresAt: '2026-11-16' })));
assert.ok(T.can('invoices') && T.can('settings') && T.can('inventory') && T.can('purchases') && T.can('users'), 'expired: still readable');
assert.ok(!T.can('invoices', 'edit') && !T.can('customers', 'edit') && !T.can('inventory', 'edit') && !T.can('purchases', 'edit') && !T.can('settings', 'edit') && !T.can('users', 'edit'), 'expired: nothing can be changed');
assert.ok(T.licenseBannerHTML().includes('ended on 16-11-2026') && T.licenseBannerHTML().includes('root@x.co') && T.licenseBannerHTML().includes('not make changes'));
for (const h of ['invoices', 'invoices/new', 'customers', 'inventory', 'inventory/new', 'purchases', 'purchases/new', 'settings/store', 'users', 'account']) { ctx.location.hash = '#/' + h; T.render(); }
assert.ok(T.seatInfo().expired && T.seatInfo().used === 1 && T.seatInfo().max === 2);
T.set('ME', owner(lic({ usedUsers: 2 }))); assert.ok(T.seatInfo().full && !T.seatInfo().expired, 'two of two: full');
T.set('ME', owner(lic({ usedUsers: 1 }))); assert.ok(!T.seatInfo().full);
assert.ok(T.licensePanelHTML().includes('Free trial') && T.licensePanelHTML().includes('1 of 2'));
const user = { id: 'u9', username: 'u', name: 'U', role: 'user', storeId: 's1', storeName: 'S', perms: { invoices: 'edit', customers: 'none', inventory: 'none', purchases: 'none' }, license: lic({ expired: true }), support: null };
T.set('ME', user); assert.ok(T.can('invoices') && !T.can('invoices', 'edit'), 'an expired store locks its users too');
assert.ok(T.supportText().includes('super admin'), 'no contact on file: generic wording');
T.set('ME', { id: 'r', username: 'root', name: 'Root', role: 'superadmin', storeId: null, storeName: null, perms: null });
assert.ok(T.can('stores', 'edit') && T.can('users', 'edit') && T.licenseBannerHTML() === '' && T.seatInfo() === null, 'the super admin is not subject to any licence');
T.set('monitor', { id: 's1', name: 'S' }); assert.ok(!T.can('invoices', 'edit'), 'monitoring stays read-only'); T.set('monitor', null);
assert.strictEqual(T.ROLE_LABEL.admin, 'Store owner');
// the super admin's licence screens
T.set('platformCache', { stores: [{ id: 's1', name: 'Shop', active: true, license: lic({ expired: true, daysLeft: -2, expiresAt: '2026-11-18', usedUsers: 2 }) }], users: [{ id: 'o', storeId: 's1', role: 'admin', name: 'Owner', username: 'own', phone: '9000000009' }], data: {}, at: Date.now() });
assert.ok(T.licenseLine({ license: lic({ expired: true, daysLeft: -2, expiresAt: '2026-11-18', usedUsers: 2 }) }).includes('Ended 18-11-2026') && T.licenseLine({ license: lic({ usedUsers: 2 }) }).includes('(full)'));
assert.ok(T.licenseLine({ license: lic({ expiresAt: '', daysLeft: null, plan: 'licensed' }) }).includes('No expiry'));
assert.ok(T.licenseFormHTML({ id: 's1', name: 'Shop', license: lic({}) }).includes('+3 months'));
for (const h of ['stores', 'stores/new', 'stores/s1/license', 'stores/zzz/license']) { ctx.location.hash = '#/' + h; T.render(); }
T.set('platformCache', null);
// sign-in, store sign-up and first-run screens
const g = k => T.gateHTML(k, '');
assert.ok(g('login').includes('Username, email or phone') && !g('login').includes('Store name'));
T.set('signupOpen', true); assert.ok(g('login').includes('Create an account')); T.set('signupOpen', false); assert.ok(!g('login').includes('Create an account'), 'sign-up link hidden when sign-up is off');
const su = g('signup'); for (const id of ['g_store', 'g_name', 'g_email', 'g_phone', 'g_user', 'g_pass']) assert.ok(su.includes('id="' + id + '"'), 'sign-up field ' + id);
assert.ok(su.includes('one month') && su.includes('2 users') && su.includes('store owner'));
const st = g('setup'); for (const id of ['g_name', 'g_email', 'g_phone', 'g_user', 'g_pass']) assert.ok(st.includes('id="' + id + '"')); assert.ok(!st.includes('g_store'));

// 14. sample data: rates from 24K, a full believable set, safe removal
{
  const fresh = () => { T.set('S', T.normalize({ settings: {} })); T.set('ME', null); T.set('monitor', null); return T.S(); };
  const rr = T.sampleRates(7500);
  assert.deepStrictEqual({ ...rr }, { '24K': 7500, '22K': 6900, '18K': 5625 }, '22K is 92% and 18K is 75% of 24K');
  assert.strictEqual(T.sampleRates(7523)['22K'], 6921.16); assert.strictEqual(T.sampleRates(7523)['18K'], 5642.25);
  let SS = fresh();
  assert.ok(T.storeIsEmpty() && !T.hasSample());
  SS.rates.gold['14K'] = 4100;   // the owner's own 14K rate survives
  const added = T.loadSample(7500, 95);
  assert.deepStrictEqual({ ...added }, { customers: 6, suppliers: 3, purchases: 6, inventory: 18, invoices: 14 });
  assert.deepStrictEqual({ ...SS.rates.gold }, { '24K': 7500, '22K': 6900, '18K': 5625, '14K': 4100, '9K': '' }); assert.strictEqual(SS.rates.silver, 95); assert.ok(SS.rates.date);
  const all = ['customers', 'suppliers', 'purchases', 'inventory', 'invoices'];
  all.forEach(n => assert.ok(SS[n].length && SS[n].every(x => x.sample === true), n + ' are all marked sample'));
  assert.ok(T.hasSample() && !T.storeIsEmpty());
  // identifiers: unique, well formed
  const uniq = (arr, what) => assert.strictEqual(new Set(arr).size, arr.length, what + ' are unique');
  uniq(SS.inventory.map(s => s.tag), 'tags'); uniq(SS.inventory.map(s => s.huid).filter(Boolean), 'HUIDs'); uniq(SS.invoices.map(i => i.no), 'invoice numbers'); uniq(SS.purchases.map(p => p.no), 'purchase numbers');
  assert.ok(SS.inventory.every(s => /^[GS]-\d{4}$/.test(s.tag)) && SS.inventory.filter(s => s.huid).every(s => T.huidOk(s.huid)));
  assert.strictEqual(SS.invoices[0].no, 'INV-0001'); assert.strictEqual(SS.purchases[5].no, 'PUR-0006');
  // a spread of states so every screen has something to show
  assert.strictEqual(JSON.stringify([...new Set(SS.invoices.map(T.statusOf))].sort()), JSON.stringify(['Paid', 'Partial', 'Unpaid']));
  assert.strictEqual(JSON.stringify([...new Set(SS.purchases.map(T.pstatusOf))].sort()), JSON.stringify(['Paid', 'Partial', 'Unpaid']));
  SS.invoices.forEach(i => assert.ok(T.money(i).paid <= T.money(i).total + 0.005, 'no overpayment on ' + i.no));
  SS.purchases.forEach(p => assert.ok(T.pmoney(p).paid <= T.pmoney(p).total + 0.005));
  assert.ok(SS.invoices.every(i => i.date <= TODAY_ISO) && SS.purchases.every(p => p.date <= TODAY_ISO) && SS.invoices.flatMap(i => i.payments).every(x => x.date <= TODAY_ISO), 'nothing is dated in the future');
  const sold = SS.inventory.filter(s => T.isSold(s.id)), instock = SS.inventory.filter(s => !T.isSold(s.id));
  assert.strictEqual(sold.length, 9); assert.strictEqual(instock.length, 9);
  const stockLines = SS.invoices.flatMap(i => i.items.filter(x => x.stockId)); uniq(stockLines.map(x => x.stockId), 'sold pieces (no piece sold twice)');
  assert.ok(stockLines.every(x => SS.inventory.some(s => s.id === x.stockId)));
  assert.strictEqual(SS.inventory.filter(s => T.pieceCost(s) != null).length, 15, 'bought pieces have a cost'); assert.strictEqual(SS.inventory.filter(s => T.pieceCost(s) == null).length, 3, 'loose pieces have none');
  const margins = SS.invoices.flatMap(i => T.calc(i).rows.filter(r => r.stockId).map(r => r.amount - T.pieceCost(SS.inventory.find(s => s.id === r.stockId))));
  assert.ok(margins.length === 9 && margins.every(m => m > 0), 'every matched sale shows a profit');
  assert.ok(instock.some(s => s.metal === 'Gold' && !s.huid), 'some gold in stock lacks a HUID, so that analytic has something to show');
  const ageDays = s => Math.floor((Date.now() - new Date(s.addedOn + 'T00:00:00').getTime()) / 864e5);
  assert.ok(instock.some(s => ageDays(s) > 180) && instock.some(s => ageDays(s) < 15), 'stock of different ages');
  assert.ok(SS.invoices.some(i => i.date < new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10)), 'sales reach back several months');
  // it survives a save and reload (the server stores exactly this)
  const again = T.normalize(JSON.parse(JSON.stringify(SS)));
  assert.strictEqual(JSON.stringify(again.invoices.map(i => T.calc(i).total)), JSON.stringify(SS.invoices.map(i => T.calc(i).total))); assert.ok(again.inventory.every(s => s.sample));
  // every analytics tab and list works on it, with no broken numbers
  T.set('ME', { id: 'o', username: 'o', name: 'O', role: 'admin', storeId: 's1', storeName: 'S', perms: null, license: lic({}), support: null });
  for (const tab of ['sales', 'purchases', 'inventory', 'profit']) { const h = T.analyticsHTML(tab); assert.ok(h.length > 500 && !/NaN|undefined|Infinity/.test(h), 'analytics ' + tab + ' is clean'); }
  for (const f of [T.listHTML, T.customersHTML, T.inventoryHTML, T.purchasesHTML]) { const h = f(); assert.ok(h.includes('Sample') && !/NaN|undefined/.test(h)); }
  T.set('ME', null);
  // removal when nothing of the owner's depends on it
  assert.deepStrictEqual({ ...T.removeSample() }, { removed: 47, kept: 0 });
  all.forEach(n => assert.strictEqual(SS[n].length, 0, n + ' emptied')); assert.ok(!T.hasSample() && T.storeIsEmpty()); assert.strictEqual(SS.rates.gold['22K'], 6900, 'rates are the owner\'s and stay');
  // removal when the owner's own records use sample ones: those are kept, never left dangling
  SS = fresh(); T.loadSample(7500, 95);
  SS.customers.push({ id: 'realc', name: 'Real Customer', phone: '', email: '', instagram: '', gstin: '', address: '' });
  const target = SS.inventory.find(s => s.name === 'Bridal necklace set'), sampleCust = SS.customers[0];
  const realInv = T.newInvoice(); realInv.isNew = false; realInv.customerId = sampleCust.id; realInv.goldRates = { '22K': 6900 };
  realInv.items = [{ id: 'ri', name: target.name, metal: 'Gold', purity: '22K', huid: target.huid, stockId: target.id, gross: target.gross, stoneWt: target.stoneWt, beadsWt: target.beadsWt, makingPct: target.makingPct, stone: target.stone, beads: '' }];
  SS.invoices.push(realInv); const total0 = T.calc(realInv).total;
  const out = T.removeSample();
  assert.ok(!T.hasSample() && out.kept === 5 && out.removed === 42, JSON.stringify(out));
  assert.strictEqual(JSON.stringify(SS.invoices.map(i => i.id)), JSON.stringify([realInv.id]), 'only the owner\'s invoice is left');
  assert.strictEqual(JSON.stringify(SS.customers.map(c => c.name).sort()), JSON.stringify(['Asha Rao', 'Real Customer']), 'the customer the real invoice names is kept');
  assert.ok(SS.customers.some(c => c.id === realInv.customerId), 'no dangling customer');
  assert.strictEqual(JSON.stringify(SS.inventory.map(s => s.name).sort()), JSON.stringify(['Bridal necklace set', 'Jhumka earrings']), 'the sold piece and the other piece from its bill are kept');
  assert.ok(SS.inventory.every(s => !T.isSold(s.id) || s.id === target.id) && T.isSold(target.id), 'the real invoice still sells it');
  assert.strictEqual(SS.purchases.length, 1); assert.strictEqual(SS.suppliers.length, 1, 'the bill and its supplier are kept so cost still works');
  assert.ok(T.pieceCost(target) != null, 'cost of the kept piece still resolves');
  assert.strictEqual(T.calc(realInv).total, total0, 'the real invoice is untouched');
  assert.ok(!T.storeIsEmpty());
  // the screen: one place, Settings -> Sample data, for the store owner only
  const owner = { id: 'o', username: 'o', name: 'O', role: 'admin', storeId: 's1', storeName: 'S', perms: null, license: lic({}), support: null };
  SS = fresh(); T.set('ME', owner);
  const offer = T.sampleSectionHTML();
  assert.ok(offer.includes('id="sm_gold"') && offer.includes('id="sm_silver"') && offer.includes('id="sm_go"') && offer.includes('24K'), 'asks for the 24K gold rate and the silver rate');
  assert.ok(!/id="sm_(22|18)/.test(offer), 'no 22K or 18K field: they are calculated');
  assert.strictEqual((offer.match(/<input /g) || []).length, 2, 'two fields only');
  assert.ok(offer.includes('92%') && offer.includes('75%'), 'the rule is explained');
  assert.ok(!offer.includes('replaces your saved') && !offer.includes('already has records'), 'no warnings on a fresh store');
  SS.rates.date = '2026-11-01'; assert.ok(T.sampleSectionHTML().includes('replaces your saved'), 'warns when real rates exist'); SS.rates.date = '';
  SS.customers.push({ id: 'c', name: 'Real' }); assert.ok(T.sampleSectionHTML().includes('already has records') && T.sampleSectionHTML().includes('id="sm_go"'), 'can still be added next to real data, with a note'); SS.customers.length = 0;
  assert.ok(T.settingsHTML('sample').includes('Sample data') && T.settingsHTML('sample').includes('href="#/settings/sample"'), 'a Settings tab');
  assert.ok(!T.settingsHTML('store').includes('Where your data lives') && !T.settingsHTML('data').includes('sm_go') && !T.settingsHTML('data').includes('Sample data</h2>'), 'not on the Data & backup tab any more');
  T.loadSample(7500, 95);
  const loaded = T.sampleSectionHTML();
  assert.ok(loaded.includes('Sample data is loaded') && loaded.includes('14 invoices') && loaded.includes('id="sm_remove"') && loaded.includes('is kept') && !loaded.includes('id="sm_go"'), 'once loaded the tab offers removal');
  // nothing about it on any other page
  for (const h of ['invoices', 'customers', 'inventory', 'purchases', 'suppliers', 'analytics/sales', 'analytics/inventory', 'analytics/profit', 'settings/store', 'settings/data', 'settings/rates', 'account']) {
    ctx.location.hash = '#/' + h; T.render();
  }
  const pages = [T.listHTML(), T.customersHTML(), T.inventoryHTML(), T.purchasesHTML(), T.analyticsHTML('sales'), T.analyticsHTML('profit'), T.settingsHTML('data'), T.settingsHTML('store')];
  pages.forEach(h => assert.ok(!/Sample data is loaded|Load sample data|Remove sample data|New here\?|sm_open|sm_remove|sm_go/.test(h), 'no sample-data banner, card or button on other pages'));
  assert.ok(T.listHTML().includes('Sample'), 'the small Sample tag stays on rows');
  ctx.location.hash = '#/settings/sample'; T.render();
  T.set('ME', { ...owner, role: 'user', perms: { invoices: 'edit', customers: 'edit', inventory: 'edit', purchases: 'edit' } });
  assert.ok(!T.sampleAllowed() && !T.settingsHTML('store').includes('settings/sample'), 'team members do not get the tab');
  ctx.location.hash = '#/settings/sample'; T.render();
  T.set('ME', { ...owner, license: lic({ expired: true, daysLeft: -1 }) });
  assert.ok(!T.sampleAllowed() && !T.settingsHTML('store').includes('settings/sample'), 'no tab after the licence ends');
  T.set('ME', { id: 'r', username: 'r', name: 'R', role: 'superadmin', storeId: null, perms: null }); T.set('monitor', { id: 's1', name: 'S' });
  assert.ok(!T.sampleAllowed() && !T.settingsHTML('store').includes('settings/sample'), 'the super admin only watches'); T.set('monitor', null);
  T.set('ME', null);
}
console.log('All checks passed');
