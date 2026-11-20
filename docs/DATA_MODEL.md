# Data model

Everything is JSON files under `data/` (override the folder with `DATA_DIR`). Two kinds:

**Platform** (shared, super admin level), in `data/platform/`:

| File | Holds |
| --- | --- |
| `users.json` | Everyone who can sign in |
| `stores.json` | The stores |
| `secret.key` | Random key that signs session cookies. Keep it private; deleting it signs everyone out |

**Store** (one folder per store, `data/stores/<storeId>/`), each a separate file:

| Collection | File | Type | Saved | Holds |
| --- | --- | --- | --- | --- |
| `settings` | `settings.json` | object | whole | Store identity, invoice defaults, preferences |
| `rates` | `rates.json` | object | whole | Today's gold and silver rates |
| `customers` | `customers.json` | array | per record | One record per customer |
| `invoices` | `invoices.json` | array | per record | Invoices with items, charges and payments |
| `inventory` | `inventory.json` | array | per record | Gold and silver pieces in stock |
| `suppliers` | `suppliers.json` | array | per record | People and firms you buy from |
| `purchases` | `purchases.json` | array | per record | Purchase bills with items, charges and payments to the supplier |

Why split: rates change daily, invoices on every sale, settings almost never. Lists are saved one record at a time (`PUT /api/data/<name>/<id>`), so two people editing different invoices cannot overwrite each other. Items, charges and payments stay inside their invoice because an invoice is a snapshot read and written as a unit. The previous copy of every file is kept in `backup/` beside it. In the browser all seven collections form one object `S`.

## users.json

```jsonc
[ { "id": "9f2c1a7b", "username": "alice",            // lowercase, unique across all stores
    "name": "Alice Admin",
    "email": "alice@example.com",                      // lowercase, unique across all accounts. Required for new accounts; accounts made before this existed may have ""
    "phone": "9876543210",                             // 10 digits (+91, spaces, dashes and a leading 0 are removed), unique across all accounts
    "role": "admin",                                   // superadmin | admin (shown as "Store owner") | user
    "storeId": "3b8e51d0",                             // null for superadmin
    "perms": { "invoices": "edit", "customers": "view", "inventory": "none", "purchases": "none" },   // only for role "user": none | view | edit
    "active": true, "createdAt": "2026-11-15T10:00:00.000Z",
    "passwordHash": "scrypt$<salt>$<hash>" } ]         // never sent to the browser
```

## stores.json

```jsonc
[ { "id": "3b8e51d0", "name": "Alpha Jewels", "active": true, "createdAt": "2026-11-15T10:00:00.000Z",
    "license": { "plan": "trial",                      // trial | licensed (a label; the dates and limits do the work)
                 "expiresAt": "2026-12-20",            // valid through the end of this day; "" = no expiry
                 "maxUsers": 2,                        // people who are turned on, owner included
                 "note": "Free trial from sign-up" } } ]  // free text, only the super admin sees it
```
A store that is turned off (`active: false`) signs out and blocks all of its people. Nothing is ever deleted by the app.

**Licence rules** (computed by the server, `licenseOf()`; `expired`, `daysLeft` and `usedUsers` are not stored):
- Sign-up creates a store with `plan: "trial"`, `expiresAt` one month from that day, `maxUsers: 2`. A store the super admin creates defaults to the same unless they choose otherwise.
- After `expiresAt` the store is **read-only**: people can sign in, read everything and download a backup, but every write to store data and every new or re-enabled user is refused (`license_expired`). The super admin is never affected.
- `usedUsers` counts people who are turned on. A new or re-enabled person beyond `maxUsers` is refused (`user_limit`). Turning someone off frees a place.
- Only the super admin changes a licence (`PATCH /api/stores/<id>` with `license`: `plan`, `expiresAt`, `monthsFromToday`, `extendMonths`, `maxUsers`, `note`). `extendMonths` adds to the later of today and the current end date.

## settings.json

```jsonc
{
  "store":   { "name": "Store name", "address": "line1\nline2", "phone": "", "gstin": "",
               "logo": "",                           // PNG data URL, "" = none
               "appUrl": "" },                       // address phones can reach, used inside QR codes; "" = the address the app is opened at
  "invoice": { "prefix": "INV-", "next": 1,          // numbering starts from here; the real next number is one past the highest used
               "cgst": 1.5, "sgst": 1.5,             // default GST %, copied into each new invoice
               "template": "classic",                // classic | modern | elegant
               "requireHuid": false,                 // true = a gold item cannot be billed without a HUID
               "terms": "Printed at the bottom of every invoice" },
  "purchase": { "prefix": "PUR-", "next": 1, "cgst": 1.5, "sgst": 1.5 },   // same idea as "invoice", for bills from suppliers
  "app":     { "paymentModes": ["Cash", "UPI", "Card", "Bank transfer", "Cheque"],
               "quickCharges": ["Hallmark charges", "Courier charges", "Packing charges", "Insurance"] }
}
```

## rates.json

```jsonc
{
  "gold": { "24K": 7500, "22K": 6875, "18K": "", "14K": "", "9K": "" },   // "" = not set; 24K and 22K required
  "silver": 95,                                                           // number or ""
  "date": "2026-11-15"                                                    // when last saved
}
```

## customers.json

```jsonc
[ { "id": "ab12cd34", "name": "", "phone": "", "email": "", "instagram": "handle-without-@", "gstin": "", "address": "" } ]
```

## invoices.json

```jsonc
[
  {
    "id": "ef56gh78", "no": "INV-0001", "date": "2026-11-15", "customerId": "ab12cd34",
    "goldRates": { "22K": 6875 },                  // only purities used on this invoice (snapshot)
    "silverRate": "",                              // only if a silver item exists (snapshot)
    "cgst": 1.5, "sgst": 1.5, "notes": "", "template": "modern",   // template optional
    "items": [
      { "id": "", "stockId": "a1b2c3d4",              // optional: the inventory piece this line sold
        "name": "Chain", "metal": "Gold", "purity": "22K",
        "huid": "AB12CD",                              // 6 capital letters or digits, "" if none; copied from the piece (snapshot)
        "gross": "12", "stoneWt": "1", "beadsWt": "0.5",
        "makingPct": "8", "stone": "200", "beads": "" }
    ],
    "charges":  [ { "id": "", "label": "Hallmark charges", "amount": "45" } ],
    "payments": [ { "id": "", "date": "2026-11-15", "amount": 1000, "mode": "UPI", "note": "" } ]
  }
]
```

`customerId` points at a customer. Rates, GST percentages and the template are copied into the invoice when it is made, so later changes to `rates.json` or `settings.json` never alter it.

## inventory.json

```jsonc
[ { "id": "a1b2c3d4", "tag": "G-0001",                // unique; G- for gold, S- for silver
    "name": "Gold chain 22K", "category": "Chain",     // Chain Necklace Ring Bangle Bracelet Earrings Pendant Anklet Coin Bar Other
    "metal": "Gold", "purity": "22K",
    "huid": "AB12CD",                                  // BIS Hallmark Unique ID, unique within the store, "" until hallmarked
    "gross": "12", "stoneWt": "1", "beadsWt": "0.5",   // grams, strings like invoice items
    "makingPct": "8", "stone": "200", "beads": "",     // defaults copied to an invoice when the piece is picked
    "notes": "", "addedOn": "2026-11-15",
    "purchaseId": "…", "purchaseItemId": "…" } ]       // optional: the bill line this piece was bought on
```
Not stored: net weight, metal value, hallmark purity mark (`22K` → `22K916`), cost (read from the bill line), and **sold**. A piece is sold when an invoice item has its `stockId`; deleting that invoice puts it back in stock.

## suppliers.json

```jsonc
[ { "id": "…", "name": "Mehta Bullion", "type": "Wholesaler",   // Wholesaler | Manufacturer / karigar | Bullion dealer | Old gold from customer | Other
    "phone": "", "email": "", "gstin": "", "address": "" } ]
```

## purchases.json

```jsonc
[ { "id": "…", "no": "PUR-0001",                       // our number, unique in the store
    "billNo": "MB/2231", "date": "2026-11-15", "supplierId": "…",   // billNo = the supplier's own bill number
    "cgst": 1.5, "sgst": 1.5, "notes": "",             // GST the supplier charged (input tax), percentages like an invoice
    "items": [
      { "id": "…", "kind": "Piece",                    // Piece (finished jewellery) | Metal (bullion, raw metal, old gold)
        "name": "Gold necklace 22K", "category": "Chain", "metal": "Gold", "purity": "22K", "huid": "AB12CD",
        "gross": "20", "stoneWt": "1", "beadsWt": "", "rate": "6600",       // rate = buying price per gram
        "makingPct": "8", "stone": "", "beads": "",
        "stockId": "…" } ],                            // set once the piece was added to Inventory; not stored for Metal lines
    "charges":  [ { "id": "", "label": "Hallmarking charges", "amount": "45" } ],
    "payments": [ { "id": "", "date": "2026-11-15", "amount": 10000, "mode": "UPI", "note": "" } ] } ]
```
Totals, GST, paid, to-pay and status are computed by `pcalc` / `pmoney` / `pstatusOf`, with the same rules as an invoice.

## Notes

- Numbers typed in forms are kept as strings on items and charges and parsed with `num()` when used. Payments store numbers.
- Gold purity is one of `24K 22K 18K 14K 9K`. Silver purity is free text from `999 Fine`, `925 Sterling`, `800`.
- Not stored, always computed: net weight, making weight and amount, totals, GST, paid, balance, status.
- Dates are `YYYY-MM-DD`. Ids are 8-character random strings.
- Sample data: records added by "Load sample data" carry `"sample": true` (customers, suppliers, purchases, inventory, invoices). The flag is the only thing that tells them apart; removing the sample deletes exactly those records, except any that other records need, which lose the flag instead. Nothing else in the shape changes and no migration is needed.
- UI-only state (drafts, filters, the open payment form, who is signed in) is never stored. The light/dark choice is a per-browser setting.
- The next invoice number, purchase number and stock tag are computed from existing records, never stored.
- A HUID is `^[A-Z0-9]{6}$`. The server rejects anything else and refuses a second piece with the same HUID in a store.

## Migrations

- `normalize()` in `src/js/data.js` accepts the current shape and the old v1 shape (one object whose `settings` held everything flat). It also drops the old `settings.app.theme`.
- `server/db.js` moves an older single-store install into a first store on start: files straight under `data/` (or one `db.json`) go to `data/stores/<id>/`, the originals are kept in `data/legacy/`. The first sign-in screen then creates the super admin, who adds a store admin for that store.
- Old invoice items and stock pieces without a `huid` read as `""` (`migrateInvoice`, `migrateStock`). Old settings gain `purchase`, `store.appUrl` and `invoice.requireHuid` from the defaults. Old users without `perms.purchases` read as `none`.
- `server/db.js` gives every store without a `license` one: no expiry, `maxUsers` = the larger of 2 and the people it already has, so nothing is locked by the upgrade. Users made before email and phone existed keep `""` until edited; a value once set cannot be blanked.
- `migrateInvoice()` upgrades older invoices (per-item making amount to `makingPct`, `other` to a charge, `status` to a payment).
