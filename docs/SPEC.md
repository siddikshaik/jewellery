# Specification

Jewellery shop owner or counter staff bill customers for gold and silver items, record payments, and share a PDF invoice. Keep it simple: few screens, no jargon, one folder to back up.

The app serves several stores. People sign in; what they see depends on their role. Super admin runs the platform and can watch every store. A store admin runs one store. Store users get only the areas their admin gives them.

## Sign-in and roles

- First start: the page asks for a super admin (name, username, password of 8 or more characters). After that, nobody can self-register.
- Sign in with username and password. A session lasts 12 hours. Five wrong passwords lock that username and address for five minutes. Signing out ends it.
- **Super admin**: adds stores (each with a first store admin), adds and edits users in any store, turns a store or user off. Opens any store **read-only** from the Stores page to see its settings, rates, invoices, customers, inventory and analytics. Never changes store data. The Stores page shows each store's sales (this month, all time), collected, outstanding, customers, stock and last invoice.
- **Store admin**: full access to their own store: invoices, customers, inventory, analytics, settings and rates, and adding or editing users of their store (store users only).
- **Store user**: for each of Invoices, Customers, Inventory, Purchases the admin picks *No access*, *View only* or *View and edit*. Purchases covers suppliers too. Adding a bought piece to stock also needs Inventory *View and edit*. Analytics shows the tabs the person can see (Sales needs Invoices, Purchases needs Purchases, Inventory needs Inventory, Profit & GST needs Invoices and Purchases). Users cannot open Settings or Users. People with Invoices access can always read customer names, today's rates and store settings so they can bill; adding a customer needs Customers *View and edit*; changing rates is admin-only.
- Turning a user or a store off signs them out on their next action.
- Users change their own password on the Account page. Admins can set a new password for their users.

## Screens and routes

| Route | Screen |
| --- | --- |
| `#/invoices` | Tiles: billed, collected, outstanding, invoices with balance. Today's rates bar. Status filter, search. Each unpaid row has **Mark paid** and **Record payment** (edit access only). |
| `#/invoices/new`, `#/invoices/<id>/edit` | Invoice editor. Each item can be **picked from stock** (copies name, metal, purity, weights, making and charges, and marks the piece sold). |
| `#/invoices/<id>` | Invoice page: payments, template switch, sheet, PDF, WhatsApp, copy summary, delete. |
| `#/customers`, `#/customers/new`, `#/customers/<id>` | Name, phone, email, Instagram, GSTIN, address. Invoice count and balance shown when the person can see invoices. |
| `#/inventory`, `#/inventory/new`, `#/inventory/<id>` | Stock of gold and silver pieces. Tiles: items in stock, gold and silver net grams, stock value at today's rates, gold without a HUID. Filters: metal, in stock / sold, search by tag, HUID, name. Tick pieces to print tags. A row opens the item page. Add and edit a piece (tag, name, category, metal, purity, HUID, gross, stones, beads, net, default making and charges, notes). A sold piece shows its invoice and cannot be deleted. |
| `#/purchases`, `#/purchases/new`, `#/purchases/<id>`, `#/purchases/<id>/edit` | Bills from suppliers. Tiles: purchased, paid, to pay, bills with balance. Status filter, search. A bill has **Piece** lines (finished jewellery, with HUID, category, weights, buying rate, making, stone and beads charges, and "add to Inventory") and **Metal** lines (bullion, raw metal, old gold: weight × rate). Other charges, supplier GST, payments to the supplier. Saving adds each ticked piece to Inventory with its HUID, a new tag and a link back to the bill line. Deleting a bill removes the unsold pieces it added; it is refused if one is sold. |
| `#/suppliers`, `#/suppliers/new`, `#/suppliers/<id>` | Name, type, phone, email, GSTIN, address; purchases count and amount owed. A supplier with bills cannot be deleted. |
| `#/item/<tag>?s=&h=&g=&n=&p=` | **Item details**, the page a scanned QR opens: status, hallmark purity mark, HUID, weights, value, cost and bill (if you may see purchases), the QR code, print tag, bill this piece. Warns when the scanned tag carries different HUID, weights or purity than the record. |
| `#/scan` | Camera scanner where the browser supports QR reading; otherwise (or as well) type or paste a tag, a HUID, or what a USB scanner reads. |
| `#/tags` | Print tags for the ticked pieces: A4 sheet (3 across) or a 60 × 30 mm label roll. |
| `#/analytics/<tab>` | Period filter on every tab. **Sales**: billed, collected, outstanding, average invoice, gold and silver sold, six-month chart, revenue mix, sold by purity, customers who owe you with ageing. **Purchases**: purchased, paid, to pay, metal bought, six-month chart, spend mix, bought by purity with average rate, by supplier, suppliers you owe with ageing. **Inventory**: pieces and grams in stock, value at today's rates and at cost, sold in period and sell-through, HUID coverage with the pieces missing one, stock age, by category and purity, slowest to sell, sold by category. **Profit & GST**: sales vs purchases (before GST), margin on pieces bought and sold, GST on sales vs purchases (an estimate for planning), cash in and out, metal position (bought, sold, in stock). |
| `#/settings/store` | Store name, address, phone, GSTIN, logo, **app address for QR codes**. |
| `#/settings/rates` | Today's rates: gold 24K, 22K required, 18K, 14K, 9K optional; silver optional. |
| `#/settings/invoicing` | Default Central and State GST, invoice prefix, start numbering from, terms, default template, "do not allow billing a gold item without its HUID"; purchase GST defaults, prefix and start number. |
| `#/settings/preferences` | Payment modes, quick-add charge names, light/dark for this device. |
| `#/settings/data` | Download a backup of this store, restore from one. |
| `#/users`, `#/users/new`, `#/users/<id>` | Admin and super admin only. List, add, edit, reset password, turn off, set the three roles. |
| `#/stores`, `#/stores/new` | Super admin only. All stores with their numbers; Open (read-only), Turn off / on, Add store. |
| `#/account` | Your details, change password, sign out. |

The menu shows only what the person may open. Unknown or forbidden routes go to their first allowed page. While data is loading, a record page shows "Loading" instead of redirecting. While a super admin is looking at a store, a banner says so and every form is locked.

## HUID and hallmarking

What the rules are (from BIS and the Ministry of Consumer Affairs; check the current notifications before relying on dates):
- A hallmarked article carries three marks: the BIS logo, the purity grade (such as 22K916), and the **HUID**, a 6-character alphanumeric code (capital letters and digits) generated by BIS's system and laser-marked by a recognised Assaying & Hallmarking Centre. One code per article.
- Hallmarked gold jewellery may not be sold without a HUID (since 1 April 2023). Hallmarking silver is voluntary, but silver that is hallmarked carries a HUID too (from 1 September 2025). Anyone can check a HUID on the BIS Care app.

What the app does:
- A stock piece has a HUID field (6 characters, capitalised as you type, unique in the store). It is optional because a piece may be waiting at the hallmarking centre; gold without one is flagged in Inventory, on the item page, on the invoice editor, and counted in Analytics → Inventory.
- Picking a piece on an invoice copies its HUID onto the invoice line. The line can also be typed by hand, with a HUID. The invoice sheet, PDF and WhatsApp text print it under the item.
- A setting can forbid billing gold without a HUID. It is off by default because small pieces and some goods are exempt from hallmarking.
- The hallmark purity mark is derived from purity (24K999, 23K958, 22K916, 20K833, 18K750, 14K585, 9K375; silver 999, 925, 800) and shown on the item page, tags and QR code.

## Tags and QR codes

Every piece has a QR code. It holds one link:
`<app address>/#/item/<tag>?s=<store>&h=<HUID>&g=<gross g>&n=<net g>&p=<purity mark>`
so the **tag number, HUID, gross and net weight and purity** are inside the printed code and a phone camera opens the item page. Signed-out, the sign-in page shows those facts from the code itself, then opens the full record after sign-in. A tag from another store is refused. If a weight or HUID changed after printing, the item page says to reprint. The code is a standard QR symbol (byte mode, error correction M) made in the browser; no external service is used.

## Purchases

- A supplier bill records what was bought (pieces and metal), the buying rate per gram, supplier making/stone/beads charges, other charges, the GST charged, and payments made. What is spent, paid and owed is computed with the same rules as an invoice.
- Pieces can go straight into Inventory with their HUID. A piece remembers its bill line, so its **cost** (before GST) is read from the bill, and **margin** is sale amount minus cost for pieces bought and sold through the app.
- Metal lines (bullion, raw metal, old gold) count in spend and in the metal position but do not create stock pieces.

## Invoice

- Header: store logo (optional), store name, address, phone, GSTIN, "Tax Invoice". Bill-to block with customer contact details.
- Details: number, date, status pill. The pill says Paid or Unpaid only; a part payment shows Unpaid with Paid and Balance due in the totals. Rates per gram are not printed (they are still stored on the invoice).
- Item table columns: item (metal and purity underneath), gross, stone, beads, net, rate/g, metal value, making (amount with "% · grams" underneath), stone charges, beads charges, amount. Totals row.
- Charge breakdown, each on its own line: metal value, making charges (with total making grams), stone charges, beads charges, every other charge, subtotal, Central GST, State GST, round off, total, then paid and balance due when a payment exists.
- Amount in words (Indian system: lakh, crore). Notes. Terms. Signature line.

## Calculations

```
net        = gross − stones weight − beads weight          (must be ≥ 0)
rate       = rate for the item's purity (silver: the single silver rate)
metalValue = net × rate
makingWt   = net × makingPct / 100
making     = makingWt × rate
amount     = metalValue + making + stoneCharges + beadsCharges
subtotal   = Σ amount + Σ other charges
cgst, sgst = subtotal × % / 100
total      = round(subtotal + cgst + sgst)                  (round-off shown)
paid       = Σ payments
balance    = max(0, total − paid)
status     = Paid if paid ≥ total, Partial if paid > 0, else Unpaid
```

## Validation

- Customer required. Net weight positive on at least one item. Stones plus beads weight cannot exceed gross.
- Every purity used on the invoice must have a rate (the editor opens the rate fields for any that is missing).
- Invoice numbers are unique. A payment cannot exceed the balance. Email must look like an email.

## Out of scope (ask before adding)

Old-gold exchange against a sale, returns of bought pieces to suppliers, raw-metal (bullion) stock register, stock transfer between stores, purchase bills, password reset by email, two-factor sign-in, barcode printing, online payments.
