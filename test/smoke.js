// Renders every route with a stub DOM and checks the money rules and data migration. Run: npm test
const vm = require('vm'), assert = require('assert');
const built = require('../scripts/build').bundle();
// the script inside the final page must be exactly the bundled JS (guards against String.replace mangling "$$")
assert.ok(built.html.includes(built.js), 'built page does not contain the bundled script verbatim');
let js = built.js;
js = js.replace('boot();\n})();', "window.__t={normalize,S:()=>S,set:(k,v)=>{eval(k+'=v')},render,calc,money,statusOf,usedRates,analyticsHTML,listHTML,sheetHTML,detailHTML,editorHTML,customersHTML,customerFormHTML,settingsHTML,SECTIONS,newInvoice,newCustomer,newStock,nextInvoiceNo,nextTag,isSold,stockNet,inventoryHTML,stockFormHTML,usersHTML,userFormHTML,storesHTML,can,navList,defaultRoute,docStatus,COLLECTIONS,LISTS,pcalc,pmoney,pstatusOf,newPurchase,newSupplier,nextPurchaseNo,pieceCost,hallmarkMark,cleanHuid,huidOk,tagPayload,parseScan,qrMatrix,qrSVG,purchasesHTML,purchaseDetailHTML,purchaseEditorHTML,supplierFormHTML,pieceHTML,analyticsHTML};\n})();");
const el = () => new Proxy(function () {}, {
  get: (t, p) => p === 'querySelectorAll' ? () => [] : p === 'querySelector' ? () => el() : p === 'addEventListener' ? () => {} : p in t ? t[p] : (typeof p === 'string' ? el() : undefined),
  set: (t, p, v) => { t[p] = v; return true }, apply: () => el()
});
const ctx = { TextEncoder, URLSearchParams, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document: { querySelector: () => el(), querySelectorAll: () => [], documentElement: el(), body: el() }, location: { hash: '' }, addEventListener() {}, localStorage: { getItem: () => null, setItem() {} }, navigator: {}, setTimeout, clearTimeout, setInterval, clearInterval, fetch: () => Promise.reject(1), console, URL };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(js, ctx);
const T = ctx.__t, S = T.S();

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
console.log('All checks passed');
