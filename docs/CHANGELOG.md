# Changelog

## 10 - Sample data
- Store owners can load a sample set (customers, suppliers, purchases, stock with HUIDs, invoices over several months) and remove it, from one place: **Settings → Sample data** (owner only; no banner or card on any other page). It asks for the 24K gold rate and the silver rate only; 22K (92%) and 18K (75%) are calculated and can be overridden later in Settings → Rates.
- Sample records carry `sample: true` and show a "Sample" tag. "Remove sample data" deletes only those, and keeps (unflags) any sample customer, supplier, piece or bill that the owner's own records use. New file `src/js/sample.js`. No server change, no migration.
- The "remove sample data" confirmation is forgotten when you leave the page.
- Tests: `test/smoke.js` checks the rate rule, the shape and variety of the data, that every analytics tab is clean on it, and removal with and without dependent real records.

## 9 - Sign-up, licences, user limits, email and phone
- **Store sign-up** (`POST /api/auth/signup`): anyone can create a store and becomes its owner. Free trial of one month and 2 users. Rate-limited (5 per hour per address), `SIGNUP=off` turns it off.
- **Email and phone** on every user: required for new accounts, unique platform-wide (email case-insensitive, phone normalised to 10 digits). Sign in with username, email or phone. People edit their own details (`PATCH /api/auth/me`); older accounts may stay without until edited.
- **Licences** on stores (`stores.json`): plan, valid-until, users allowed, note. After expiry the store is read-only (server refuses writes with `license_expired`; the app locks forms and shows a banner with the super admin's contact). Banners a week before. The app re-checks every 20 seconds.
- **User limit**: default 2 turned-on people per store, owner included; refused with `user_limit`. Super admin changes it, extends or sets dates per store (Stores → License).
- Role `admin` is now labelled **Store owner**.
- Stores created before this get no expiry and room for their current people (`server/db.js`). New `monthsFromToday` and `extendMonths` license options.
- Tests: `test/api.js` covers sign-up, uniqueness, limits, expiry and renewal; `test/smoke.js` covers the locked mode, banners and the three sign-in screens.

## 8 - Purchases, HUID, QR tags, analytics tabs
- **Purchases module**: suppliers and purchase bills (Piece and Metal lines, supplier GST, other charges, payments to supplier). Bills can add pieces to Inventory in one step. New collections `suppliers` and `purchases`, new permission area `purchases` for store users. Purchase math shares `sheetMath()` with invoices, so there is still one set of rules.
- **HUID**: `huid` on stock pieces and invoice items (6 capital letters or digits, unique per store, checked on the server). Copied from the piece onto the invoice line; printed on the sheet, PDF and WhatsApp text. Gold without a HUID is flagged; an optional setting blocks billing it. Hallmark purity marks (22K916 and so on) are derived.
- **QR tags**: each piece has a QR code holding a link with tag, HUID, gross, net and purity. The item page (`#/item/<tag>`) is what it opens; signed-out scans show the facts in the code and ask to sign in; stale tags are flagged. In-app scanner (`#/scan`) with camera where the browser supports it. Print tags (`#/tags`) on A4 or a 60 × 30 mm roll. QR encoder written for this app (`src/js/qr.js`, no library).
- **Analytics** is now four tabs: Sales (as before), Purchases, Inventory, Profit & GST. Each shows only to people who may see its data.
- Pieces bought through a bill remember it (`purchaseId`, `purchaseItemId`); cost and margin are derived.
- Settings: app address for QR codes, "require HUID for gold", purchase prefix/start/GST defaults.
- Migration: old invoice items and pieces read `huid` as `""`; old settings and users get the new defaults. No file move needed.
- Server: `purchases` area in `server/api.js`; HUID format and uniqueness; purchase numbers unique. Tests: `test/api.js`, `test/smoke.js` extended.

## 7 - Sign-in, stores, roles, inventory
- Sign-in with usernames and passwords (scrypt), signed HttpOnly session cookies, login throttling. First start creates the super admin.
- Three roles: super admin (all stores, read-only monitoring, manages stores and users), store admin (one store, manages its users), store user (None / View / Edit on Invoices, Customers, Inventory). Enforced on the server for every request.
- Multi-store: data moved to `data/stores/<id>/`, platform files in `data/platform/`. An older single-store install is moved into a first store on start (originals in `data/legacy/`).
- Inventory for gold and silver pieces: tags, categories, weights, default charges, stock value at today's rates, in stock / sold filters. Pick a piece on an invoice to fill the item and mark it sold. `invoice.items[].stockId` links them; sold is derived, not stored.
- Next invoice number and stock tag are derived from existing records (settings "Start numbering from" is only the floor), so billing staff never need to write settings. Duplicate numbers or tags are refused by the server and renumbered by the app.
- Saving is per record for customers, invoices and inventory so two people can work at once; the app refreshes other people's changes in the background.
- Stores page for the super admin with sales, collected, outstanding, stock per store; Open a store read-only with the normal Analytics, Invoices, Customers, Inventory and Settings pages.
- Removed: browser-only and Claude-artifact storage (sign-in needs the server) and the localStorage copy of data. Theme is now a per-device choice.
- New `test/api.js` runs the real server against a temporary folder.

## 6 - Store logo, richer templates, simpler invoice header
- Store logo: upload in Settings → Store details. Stored as a small PNG data URL in `settings.store.logo` (`""` = none; shrunk to fit 480x240 on upload). Shown on the invoice sheet and in the PDF. No migration needed: `normalize()` fills the default.
- Classic, Modern and Elegant redesigned (screen and PDF): gradient mastheads and total cards, rounded table headers, tinted panels, keylines. Same layout and columns.
- Invoice Details no longer prints "Rate per gram". The rates are still stored on the invoice (`usedRates()` is unchanged).
- The printed invoice (sheet and PDF) shows only Paid or Unpaid, via `docStatus()`. A part-paid invoice reads Unpaid with Paid and Balance due beneath. App screens (list, filters, payments panel) still use Paid / Partial / Unpaid.

## 5 - Routes, Settings, split data, Apple-style UI
- `src/app.html` split into `src/index.html`, `src/styles/*.css` and `src/js/**` (one file per area). `scripts/build.js` joins them into one standalone `public/index.html`. This replaces the "one file for the UI" rule.
- Hash routes: `#/invoices`, `#/customers`, `#/analytics`, `#/settings/...`. Invoice and customer pages have their own URLs, so refresh and the back button work.
- Analytics is its own page (was a sub-tab of Invoices).
- New Settings area with tabs: Store details, Today's rates, Invoicing (GST, numbering, terms, template), Preferences (theme, payment modes, quick-add charges), Data & backup (download and restore).
- Data split into `settings`, `rates`, `customers`, `invoices`. `server.js` stores one file each in `data/` and splits an old `db.json` automatically. Only changed collections are saved. API: `GET /api/data`, `PUT /api/data/<name>`.
- Migration: `normalize()` reads the old single-object shape (flat settings, rates inside settings).
- Skills moved from `skills/` to `.claude/skills/`.
- New look: system font, translucent sidebar (floating tab bar on phones), grouped lists, segmented controls, light and dark themes.

## 4 — Payments, optional rates, analytics
- Rates used on an invoice are limited to the purities of its items. Invoice stores only those.
- Today's rates: only 24K and 22K required. Item purity list shows purities that have a rate.
- Customers: email and Instagram handle.
- Payments: record several payments per invoice, mark paid, partial status, outstanding balance. Available in the list and on the invoice page. Status is derived, old `status` field migrated into a payment.
- Invoices tab: outstanding tiles, status filter, Analytics sub-tab.
- Added project files: CLAUDE.md, skills, docs, JSON-file server, smoke test.

## 3 — Per-purity gold rates, making as percentage
- Gold rate per purity (24K 22K 18K 14K 9K), one silver rate, rates can be changed per invoice.
- Making charges are a percentage of net weight. Old making amounts converted to the equal percentage.

## 2 — Weights, other charges, templates
- Gross, stones and beads weight with net weight. Free-form other charges. Every charge on its own line.
- Three invoice templates (classic, modern, elegant) on screen and in the PDF. Rates moved to their own tab.

## 1 — First version
- Customers, invoices, store details, PDF, WhatsApp text.
