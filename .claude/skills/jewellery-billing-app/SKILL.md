---
name: jewellery-billing-app
description: Build or extend the gold and silver jewellery billing web app (sign-in and roles, stores, customers, GST invoices, payments, rates, inventory, analytics, settings, PDF). Use when adding a feature, field, route, setting or report, or when recreating the app from scratch.
---

# Jewellery billing app

Read `CLAUDE.md` and `docs/SPEC.md` first. Work in `src/` and `server/`. Never edit `public/index.html` (it is built).

## How the code is organised

`scripts/build.js` joins the files below, in this order, into one script (one shared scope, no modules) and one stylesheet.

| File | What is in it |
| --- | --- |
| `js/qr.js` | QR encoder: `qrMatrix(text)`, `qrSVG(text)` (byte mode, level M, versions 1 to 10) |
| `js/util.js` | `$`, `$$`, `esc`, `num`, `fmt`, `inr`, `wt`, `uid`, `today`, `dmy`, `clone`, purity and template constants, icons, `toast`, `saveBlob` |
| `js/calc.js` | **Money math**: `calc`, `lines`, `money`, `statusOf`, `usedRates`, `rateFor`, `words` |
| `js/data.js` | `S`, `defaults()`, `normalize()`, `migrateInvoice()`, `newInvoice()`, `newItem()`, `newCustomer()`, `newStock()`, `nextInvoiceNo()`, `nextTag()`, `isSold()` |
| `js/storage.js` | `persist()`, `flush()` (per-record saving), `adopt()`, `loadData()`, `poll()`, `ready` flag |
| `js/router.js` | hash router, `ROUTES`, `ROUTE_AREA`, `navList()`, `go()`, `render()`, `draft` / `draftCust` / `draftStock` |
| `js/auth.js` | `ME`, `monitor`, `can(area, mode)`, `api()`, sign-in and first-run screens, `boot()`, `enter()`, account page |
| `js/routes/invoices.js` | list, editor, invoice page, payments |
| `js/routes/customers.js` | list and form |
| `js/routes/inventory.js` | stock list, tiles, tag selection, add/edit piece with HUID |
| `js/routes/purchases.js` | purchase bills (list, editor, bill page, payments) and suppliers |
| `js/routes/item.js` | item page (QR target), scanner, printable tags; `tagPayload()`, `parseScan()` |
| `js/routes/analytics.js` | tabs: sales, purchases, inventory, profit & GST; period filter |
| `js/routes/settings.js` | tabs: store, rates, invoicing, preferences, data and backup; `lockFields()` for read-only |
| `js/routes/users.js` | users list and form (store admin, super admin) |
| `js/routes/stores.js` | all stores overview, add store, open read-only (super admin) |
| `js/pdf.js` | `makePDF(inv)` and the `PT` template table |
| `js/main.js` | start-up (`applyTheme`, `boot`) |
| `styles/*.css` | `base` (tokens, type), `layout` (shell), `components`, `invoice-sheet` |

## Routes

Hash routes: `#/invoices`, `#/invoices/new`, `#/invoices/<id>`, `#/invoices/<id>/edit`, `#/customers[/new|/<id>]`, `#/analytics`, `#/settings/<store|rates|invoicing|preferences|data>`.

A route file sets `ROUTES.name = { html(parts), bind(parts) }`. `html` returns a string, `LOADING` (record not found *yet* because stored data is still loading) or `null` after calling `go()` to redirect. `bind` attaches events after the HTML is in the page. Navigate with `go('invoices/' + id)`, never by setting state variables. Edits live in `draft` (invoice) and `draftCust` (customer) and are dropped when you leave their route.

### Adding a route

1. Create `src/js/routes/<name>.js` with `ROUTES.<name> = {html, bind}`.
2. Add it to `JS` in `scripts/build.js` (before `pdf`), to `ROUTE_AREA`, `NAV_ITEMS` and `navList()` in `router.js`, and an icon in `ICONS`.
3. Decide which `can(area, 'view'|'edit')` each button needs and hide the rest; the server must enforce the same (see `access-control`).
4. Add it to the route list in `test/smoke.js` and to `docs/SPEC.md`.

## Adding a field to an invoice item (checklist)

1. Add the default in `newItem()`.
2. Add the input in `itemHTML()` and, if it feeds a number, handle it in `calc()` (return it on each row and in `t`).
3. Show it in `sheetHTML()` (table and totals row) and in `makePDF()` (`cols`, row cells, totals row).
4. If it is a charge, add a line in `lines()` so it appears in the charge breakdown, summary text and PDF.
5. Add a default in `migrateInvoice()` for old invoices.
6. Update `docs/DATA_MODEL.md`, run `npm test`.

## Adding a setting

Pick the collection: store identity and invoice defaults go in `settings.store` / `settings.invoice`, store-wide choices in `settings.app`, daily prices in `rates`. Per-device choices (like the theme) are not data: keep them in `localStorage` only. Add the default in `defaults()`, merge it in `normalize()`, edit it in the matching section of `routes/settings.js` (`xxxHTML` + `bindXxx`). `normalize()` merges defaults, so old data gets the new key.

## Adding a report to Analytics

Compute from `S.invoices` through `calc()` and `money()`. Never recompute weights or GST by hand. Keep the period filter (`inPeriod`) for period reports and ignore it for "as of today" reports such as outstanding balances. Charts are inline SVG using the CSS tokens (`var(--accent)`, `var(--good)`, `var(--muted)`).

## Inventory and invoices

Stock pieces live in `S.inventory`. An invoice item points at one with `stockId`; `isSold()` / `soldBy()` are computed from the invoices, so nothing on the piece changes when it sells. Picking a piece copies its fields into the item (`itemHTML` select `data-stock`). Do not add a stored `status` to stock.

## Purchases, HUID and tags

`pcalc(p)` shares `sheetMath()` with `calc(inv)`, so a purchase line and an invoice line follow identical rules. A bill's Piece line with *Add to Inventory* creates a stock piece on save and stores `stockId` on the line and `purchaseId` / `purchaseItemId` on the piece; cost comes from `pieceCost()`. See the `hallmark-qr-tags` skill for HUID and QR details.

## Look and feel (Apple style)

System font stack (`-apple-system`, SF Pro), grey canvas, white rounded cards, grouped lists (`.list` + `.item`), segmented controls (`.seg`), pill buttons, translucent sidebar that becomes a floating tab bar under 820px. Use the tokens in `base.css`; do not hard-code colours outside the invoice paper. Check both themes and a 390px-wide screen.

## Gotchas

- Inputs re-render on `render()`. Keep typing state in `S` or `draft`, not in the DOM, and use `refreshTotals()` for live updates instead of `render()`.
- In `build.js`, any `String.replace` that inserts the script must use a function replacer, because the JS contains `$$`.
- `window.open`, clipboard and downloads can be blocked inside an iframe. Always catch and show a toast.
- Dates are `YYYY-MM-DD` strings. Compare them as strings, do not build `Date` objects from them without `T00:00:00`.
- Floating point: round payments to 2 decimals when storing, compare with a 0.005 tolerance.
