# CLAUDE.md — Jewellery Billing App

Multi-store gold and silver jewellery web app: sign-in with roles, customers, GST invoices, payments, rates, inventory with HUID and QR tags, purchases from suppliers, analytics, PDF invoices, settings.
Plain HTML/CSS/JS in small files, no framework, a tiny build step that joins them, a zero-dependency Node server, JSON files instead of a database.

Read this file first. Deeper detail lives in `docs/` and `.claude/skills/`.

## Layout

```
src/index.html          Page shell: sidebar, #view, toast. Scripts are injected at build.
src/styles/             base.css (tokens, type) · layout.css (shell, sign-in) · components.css · invoice-sheet.css
src/js/                 util · qr · calc · data · storage · router · auth · sample · pdf · main
src/js/routes/          invoices · customers · inventory · purchases (+ suppliers) · item (details, scan, tags) · analytics · settings · users · stores
scripts/build.js        Joins src/ into one standalone page: public/index.html (order is listed in build.js).
server.js               Entry point: serves the page and the API.
server/                 db.js (files, legacy move) · auth.js (scrypt, signed cookie, throttle) · api.js (every route + permission check)
data/                   platform/ (users.json, stores.json, secret.key) and stores/<id>/ (settings, rates, customers, invoices, inventory .json). Gitignored. Back up this folder.
test/smoke.js           Renders every route for each role, checks money math, migrations, derived values.
test/api.js             Real server on a temp folder: sign-in, roles, store isolation, saving, legacy move.
docs/                   SPEC.md (what it must do) · DATA_MODEL.md (JSON shapes) · CHANGELOG.md
.claude/skills/         Skills Claude Code loads for this project (see SKILLS.md).
```

## Commands

```
npm run build   # src/ -> public/index.html
npm start       # build + serve on http://localhost:3000 (PORT, HOST, DATA_DIR env vars)
npm test        # smoke test + API test, no browser needed
```

First start: the page asks for a super admin account (name, email, phone, username, password). Anyone can then open a store from the sign-in screen (`SIGNUP=off` disables that). An older single-store install in `data/` is moved into a first store automatically.

## Roles (enforced in `server/api.js`, mirrored in `can()` in `src/js/auth.js`)

| Role | Can |
| --- | --- |
| Super admin | Add stores, add and edit users in every store, turn stores off, set each store's **license** (valid-until, users allowed, plan). Opens any store **read-only** (settings, invoices, customers, inventory, analytics). Never edits store data. |
| Store owner (role `admin`) | Everything in their own store, including settings, rates and their store's users (store users only). Made by public sign-up (one-month trial, 2 users) or by the super admin. |
| Store user | Per area **None / View / Edit** for Invoices, Customers, Inventory, Purchases (suppliers included). Analytics shows the tabs whose data the person can see. No settings, no users. Invoice users always get customer names, rates and settings to read. |

## Hard rules

1. **Edit `src/` and `server/` only.** Never hand-edit `public/index.html`. A new JS or CSS file must be added to the lists in `scripts/build.js`. All browser JS shares one scope (one IIFE), so no `import`/`export`.
2. **All store data lives in one object `S`** = `{settings, rates, customers[], invoices[], inventory[], suppliers[], purchases[]}`. Save with `persist()` after every change. UI-only state (drafts, filters, `ME`, `monitor`) is plain variables and is never saved.
3. **Derived values are never stored.** Net weight, making amount, totals, GST, paid, balance, status, **next invoice number, next stock tag, and whether a stock piece is sold** are computed (`calc()`, `pcalc()`, `money()`, `pmoney()`, `statusOf()`, `nextInvoiceNo()`, `nextPurchaseNo()`, `nextTag()`, `isSold()`, `pieceCost()`, `hallmarkMark()`).
4. **Money math has one home: `src/js/calc.js`** (`sheetMath` serves invoices and purchases). The screen, the PDF, the WhatsApp text, analytics and the Stores overview all call it.
5. **Saved invoices are snapshots.** An invoice stores the rates it was made with and its own GST percentages. Changing rates or settings never changes an old invoice.
6. **An invoice stores only the rates of the purities its items use** (`usedRates(inv)`); they are not printed on it. The printed invoice says only Paid or Unpaid (`docStatus()`).
7. **Migrations live in `migrateInvoice()` / `normalize()`** (`src/js/data.js`) and `server/db.js` for file moves. Any change to the stored shape needs a migration, a test and a line in `docs/CHANGELOG.md`.
8. **Escape everything** put into HTML with `esc()`.
9. **Rupee sign in PDFs is "Rs."**. On screen use ₹ via `inr()`.
10. **Routes are hash URLs** handled by `src/js/router.js`. Move with `go(...)`. A route file registers `ROUTES.name = {html, bind}`; add the area to `ROUTE_AREA` and `navList()` so the menu and the access check know it.
11. **The server decides, the UI only hides.** Every new endpoint or collection needs a permission check in `server/api.js` and a case in `test/api.js`. Never trust a role or store id from the request body; use the signed-in user.
12. **Customers, invoices and inventory are saved one record at a time** (`PUT/DELETE api/data/<name>/<id>`); settings and rates whole. Two people can work at once. Invoice `no` and stock `tag` are unique (server returns 409).
13. **No data in the browser.** There is no localStorage cache of store data (it would leak between people on one computer). Only the theme choice is kept there.
14. **HUID is `^[A-Z0-9]{6}$`, unique per store.** It lives on the stock piece and is copied onto the invoice line. Use `cleanHuid()` on input and `huidOk()` to validate; the server checks the same. Never invent legal dates or rules in the UI; the setting `requireHuid` is the store's choice.
15. **A QR code carries a link, not a key.** `tagPayload()` builds it (`<app address>/#/item/<tag>?s=&h=&g=&n=&p=`); the page it opens shows the live record and must still require sign-in. Nothing secret goes inside a QR.
16. **A piece's cost and margin are derived** from its purchase line (`pieceCost`). Do not store cost on the piece.
17. **Passwords are scrypt hashes; sessions are signed HttpOnly cookies.** Never log, return or store a password or hash outside `data/platform/users.json`.
18. **A store's licence is enforced on the server.** Expired = read-only: `server/api.js` refuses store-data writes and new or re-enabled users (`license_expired`), and `can()` in `auth.js` caps every area at view (`licenseLocked()`). Seats: `seatProblem()` (`user_limit`). Never check the licence only in the UI. The super admin is exempt from expiry. `expired`, `daysLeft`, `usedUsers` are computed, not stored.
19. **Email and phone are unique per account, platform-wide.** Use `checkContact()` / `applyContact()` in `server/api.js` for any path that sets them (normalised: email lowercase, phone 10 digits); a value once set cannot be blanked.
20. **Sample data is the owner's playground, never mixed with real data.** Every sample record has `sample:true` (`src/js/sample.js`). Its only screen is Settings → Sample data (owner only): do not add banners, cards or buttons for it on other pages. Removal deletes only flagged records and unflags any that real records depend on. Anything new that refers to another record (a customer, piece, bill, supplier) must be added to the keep rules in `removeSample()`. The 22K and 18K rates in the sample form are 92% and 18K 75% of 24K.

## Business rules (short form)

- Net weight = gross − stones weight − beads weight. Metal value = net × rate for that item's purity.
- Making charges are a percentage of net weight. Making weight = net × %. Making amount = making weight × rate. Stone and beads charges are flat amounts.
- Other charges are free-form lines (name + amount). Each prints on its own line.
- Subtotal = metal + making + stone + beads + other charges. Central and State GST are percentages of the subtotal. Total is rounded to the nearest rupee; the round-off is shown.
- Gold rates per purity: 24K, 22K, 18K, 14K, 9K. 24K and 22K required, the rest optional. One optional silver rate.
- Payments: many per invoice (date, amount, mode, note). Status is derived: Paid / Partial / Unpaid. A payment cannot exceed the balance.
- Inventory: one record per piece with a tag (G-0001, S-0001), metal, purity, HUID, weights and default charges. Picking a piece on an invoice copies its details and marks it sold; deleting that invoice puts it back. A sold piece cannot be deleted.
- Purchases: a bill from a supplier has Piece lines (can be added to Inventory) and Metal lines. Spend, paid and to-pay follow the invoice rules. Buying a piece through a bill records its cost.
- Three invoice templates: classic, modern, elegant. Screen and PDF must match.

## Conventions

- Plain ES2020. Functions named `xxxHTML()` return strings, `bindXxx()` attach events after `render()`.
- Colours are CSS tokens on `:root` (`base.css`) with a dark-mode override. Invoice "paper" colours are fixed per template.
- Look: Apple style. System font stack, grey canvas, white rounded cards, grouped lists, segmented controls, pill buttons. Sidebar on desktop, floating tab bar under 820px.
- UI copy: short, plain, say what a button does. No confirm()/alert(); destructive buttons use a two-click "Confirm".

## Before you finish any change

1. `npm test` passes.
2. Run the app (`npm start` with `DATA_DIR` pointing at a scratch folder), create the super admin, a store, a store user with limited roles. Check each role sees and can do only what it should. Make an invoice from a stock piece, record a partial payment, download the PDF in all three templates. Check light, dark and a phone-width screen.
3. Update `docs/CHANGELOG.md`, and `docs/DATA_MODEL.md` if the stored shape changed.
