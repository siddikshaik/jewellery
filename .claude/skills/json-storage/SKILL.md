---
name: json-storage
description: How the jewellery billing app stores data (JSON files per store and collection, per-record saving, no database server). Use when changing persistence, the API, migrating the stored shape, adding a collection, backups, or moving to SQLite later.
---

# JSON storage

Store data is seven collections, `S = {settings, rates, customers[], invoices[], inventory[], suppliers[], purchases[]}`, each its own file under `data/stores/<storeId>/`. People and stores are in `data/platform/`. Shapes: `docs/DATA_MODEL.md`.

## Browser side (`src/js/storage.js`)

- There is one adapter: the REST API in `server.js`. No localStorage copy of data (rule 13).
- `persist()` is debounced (400 ms). `flush()` walks the collections the signed-in person may write (`writable(n)`): settings and rates are sent whole when their JSON changed; lists are diffed against `saved[n]` (a map id → JSON) and only changed records are sent (`PUT data/<name>/<id>`) or removed (`DELETE`). Two people editing different records never overwrite each other.
- `adopt(remote)` replaces `S` with what the server sent (`normalize()` fills defaults and migrates), records it as `saved`, and re-saves if migration changed the shape (only for people who may write).
- `poll()` runs every 20 s and on window focus. If nothing is being typed or saved it reloads and re-renders when someone else changed something.
- A 409 `duplicate_no` / `duplicate_tag` means another person just used that invoice or purchase number or stock tag: the app pulls in their records, renumbers its own, and saves again (`saveFailed`). A 409 `duplicate_huid` cannot be fixed automatically: the change is dropped and the data reloaded. A 403 reloads the data and tells the person.
- Super admin monitoring: `monitor` is set, `persist()` does nothing and `writable()` is false everywhere.

## Server side (`server/`)

| Request | Who | Notes |
| --- | --- | --- |
| `GET api/data` (`?store=<id>` for super admin) | any signed-in | Returns only collections the role may read; `null` for the rest. Adds `soldStock` (ids of sold pieces) when inventory is readable. |
| `PUT api/data/settings`, `rates` | store admin | Whole object. |
| `PUT api/data/<customers\|invoices\|inventory\|suppliers\|purchases>/<id>` | needs Edit on that area (`AREA_OF` in `server/api.js`; suppliers and purchases are the `purchases` area) | Body is the record, `body.id` must equal `<id>`. Invoice `no`, purchase `no`, stock `tag` and stock `huid` must be unique (409 `duplicate_no` / `duplicate_tag` / `duplicate_huid`); a HUID must match `^[A-Z0-9]{6}$` (400). |
| `DELETE` the same path | needs Edit | |
| `api/stores`, `api/users` | super admin / store admin | See `access-control` skill. |
| `api/auth/*` | public or signed-in | status, setup, login, logout, password. |

- Writes are atomic: `<file>.tmp`, copy the old file to `backup/<file>`, rename. Node is single-threaded and the file calls are synchronous, so a record upsert cannot interleave with another.
- Store ids are checked against `/^[a-z0-9]{1,32}$/` and record ids against `/^[A-Za-z0-9_-]{1,40}$/` before they touch a path.
- Body limit 10 MB (the logo is inside `settings.json`).

## Changing the stored shape

1. Add the default in `defaults()` or the constructor (`newInvoice`, `newItem`, `newCustomer`, `newStock`).
2. Add a migration in `migrateInvoice()` (per invoice) or `normalize()`. It must be safe on already-migrated data.
3. Never delete a stored field without converting its meaning first.
4. Test it in `test/smoke.js`. Document it in `docs/DATA_MODEL.md` and `docs/CHANGELOG.md`.

## Adding a collection

Add its name to `COLLECTIONS` (and `LISTS` if it is an array of records) in `data.js`, a default in `defaults()`, `normalize()` handling, `COLS`/`LISTS`/read and write rules in `server/api.js`, a case in `test/api.js`, and the backup and docs.

## Backups

Copy the whole `data` folder. Settings → Data & backup downloads one store as a single JSON file and restores it (restore replaces the store's records through the normal per-record save).

## Moving to a real database later

Keep the REST surface and replace `server/db.js`. For SQLite, one row per record keyed by (store, collection, id) fits the per-record API exactly.
