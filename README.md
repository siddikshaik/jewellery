# Jewellery Billing App

Several jewellery stores, one app: sign-in with roles, customers, GST invoices, payments, today's rates, inventory with HUID and QR tags, purchases from suppliers, analytics and PDF invoices. Plain web page and a small Node server. Data in JSON files. No database to install.

## Run it

Needs Node 18 or newer. No packages to install.

```
npm start
```

Open http://localhost:3000. The first time, the page asks you to create the **super admin**. Then:

1. As super admin, open **Stores → Add store**. Give the store a name and its first store admin.
2. The store admin signs in, fills in **Settings** (store details, logo, today's rates) and adds their people under **Users**.
3. For each person choose what they may do with **Invoices**, **Customers**, **Inventory** and **Purchases**: no access, view only, or view and edit.

### Tags, HUID and QR codes

Each stock piece has a tag, an optional **HUID** (the 6-character BIS hallmark code) and a QR code that holds the tag number, HUID, gross and net weight and purity as a link. Scanning it with any phone camera opens the item page.

1. In **Settings → Store details** set the **app address for QR codes** to an address your phones can reach, for example `http://192.168.1.20:3000` (run with `HOST=0.0.0.0`) or your `https://` domain. `localhost` only works on the computer itself.
2. In **Inventory**, tick pieces and choose **Print tags** (A4 sheet or 60 × 30 mm label roll).
3. Anyone signed in who scans a tag lands on the piece; someone signed out sees the facts on the tag and is asked to sign in.

Purchases: **Purchases → New purchase**, tick *Add to Inventory* on pieces to create stock with their HUID in one step.

The super admin can open any store from **Stores** to watch its settings, invoices, customers, stock and analytics. That view is read-only.

The page loads the PDF library (jsPDF) from a CDN, so PDFs need internet the first time.

To use it from other devices on your network: `HOST=0.0.0.0 npm start`. Sign-in protects the data, but passwords travel in clear text over plain HTTP, so put it behind HTTPS (a reverse proxy such as Caddy or nginx) before using it outside a trusted network.

## Where the data is

```
data/platform/users.json, stores.json, secret.key
data/stores/<id>/settings.json, rates.json, customers.json, invoices.json, inventory.json, suppliers.json, purchases.json
```

If you used an earlier version, your old files are moved into a first store the first time you start the server (originals kept in `data/legacy/`). The previous copy of every file is kept in a `backup` folder beside it. Use another folder with `DATA_DIR=/path npm start`.

## Back up

Copy the whole `data` folder. A store admin can also download one store's backup in Settings → Data & backup.

## Forgotten password

A store admin can set a new password for their users (Users → Edit), and the super admin can do that for anyone. If the super admin is locked out, run this on the computer that hosts the server:

```
node scripts/reset-password.js <username> <new password>
```

It also turns the account back on. Nothing else is touched.

## Develop

Edit files in `src/` and `server/`, run `npm test`, then `npm start` (it rebuilds `public/index.html`). Read `CLAUDE.md` first. `SKILLS.md` lists the playbooks in `.claude/skills/`.
