// File storage. Layout:
//   <data>/platform/users.json, stores.json, secret.key
//   <data>/stores/<storeId>/settings.json rates.json customers.json invoices.json inventory.json   (+ backup/ with the previous copy)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const LEGACY = ['settings', 'rates', 'customers', 'invoices'];

function createDb(dataDir) {
  const platform = path.join(dataDir, 'platform'), storesDir = path.join(dataDir, 'stores');
  fs.mkdirSync(platform, { recursive: true }); fs.mkdirSync(storesDir, { recursive: true });
  const readJson = (f, fb = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } };
  function writeJson(f, obj) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    if (fs.existsSync(f)) {
      const b = path.join(path.dirname(f), 'backup'); fs.mkdirSync(b, { recursive: true });
      fs.copyFileSync(f, path.join(b, path.basename(f)));
    }
    fs.renameSync(tmp, f);
  }
  const usersFile = path.join(platform, 'users.json'), storesFile = path.join(platform, 'stores.json');
  const newId = () => crypto.randomBytes(4).toString('hex');
  const okId = s => typeof s === 'string' && /^[a-z0-9]{1,32}$/.test(s);
  const colFile = (sid, name) => path.join(storesDir, sid, name + '.json');

  const db = {
    users: () => readJson(usersFile, []), saveUsers: v => writeJson(usersFile, v),
    stores: () => readJson(storesFile, []), saveStores: v => writeJson(storesFile, v),
    store: id => okId(id) ? db.stores().find(s => s.id === id) || null : null,
    newId,
    readCol: (sid, name) => readJson(colFile(sid, name), null),
    writeCol: (sid, name, v) => writeJson(colFile(sid, name), v),
    createStore(name, license) {
      const s = { id: newId(), name, active: true, createdAt: new Date().toISOString(), license: license || { plan: 'licensed', expiresAt: '', maxUsers: 2, note: '' } };
      db.saveStores([...db.stores(), s]);
      db.writeCol(s.id, 'settings', { store: { name } });
      return s;
    }
  };

  /* An older single-store install keeps its files straight under data/ (or in one db.json). Move them into a first store. */
  function migrateLegacy() {
    if (fs.existsSync(storesFile)) return;
    const parts = {}, moved = [];
    const one = path.join(dataDir, 'db.json'), oneData = readJson(one);
    if (oneData) { LEGACY.forEach(n => { if (oneData[n] != null) parts[n] = oneData[n]; }); moved.push(one); }
    LEGACY.forEach(n => { const f = path.join(dataDir, n + '.json'); const v = readJson(f); if (v != null) { parts[n] = v; moved.push(f); } });
    if (!Object.keys(parts).length) return;
    const nm = (parts.settings && ((parts.settings.store && parts.settings.store.name) || parts.settings.name)) || 'Main store';
    const s = { id: newId(), name: nm, active: true, createdAt: new Date().toISOString(), license: { plan: 'licensed', expiresAt: '', maxUsers: 2, note: 'Existing store, no expiry set' } };
    db.saveStores([s]);
    Object.entries(parts).forEach(([n, v]) => db.writeCol(s.id, n, v));
    const keep = path.join(dataDir, 'legacy'); fs.mkdirSync(keep, { recursive: true });
    moved.forEach(f => { try { fs.renameSync(f, path.join(keep, path.basename(f))); } catch (e) {} });
    console.log(`Moved existing data into store "${nm}" (originals kept in data/legacy/)`);
  }
  migrateLegacy();
  /* stores made before licences existed keep working: no expiry, and room for the people they already have */
  const stores = db.stores();
  if (stores.some(s => !s.license)) {
    const users = db.users();
    stores.forEach(s => { if (!s.license) s.license = { plan: 'licensed', expiresAt: '', maxUsers: Math.max(2, users.filter(u => u.storeId === s.id && u.active).length), note: 'Existing store, no expiry set' }; });
    db.saveStores(stores);
  }
  return db;
}
module.exports = { createDb };
