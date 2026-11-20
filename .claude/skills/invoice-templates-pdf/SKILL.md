---
name: invoice-templates-pdf
description: Change invoice templates or the PDF layout in the jewellery billing app. Use when adding a template, adding or removing an invoice column, changing colours or fonts on the invoice, or fixing PDF overflow and page breaks.
---

# Invoice templates and PDF

An invoice is drawn twice: as HTML on screen (`sheetHTML`) and as a PDF with jsPDF (`makePDF`). They must show the same content in the same design. Change both together.

## Screen templates

`sheetHTML(inv)` (`js/routes/invoices.js`) renders `<div class="sheet t-NAME">`. Each template is a CSS block that only sets custom properties and a few layout overrides:

```
--sh-bg  --sh-ink  --sh-muted  --sh-accent  --sh-line
--sh-th  --sh-thc  --sh-zebra  --sh-tot     --sh-totc
```

To add a template `royal`:

1. Add `royal:'Royal'` to `TEMPLATES`.
2. Add a `.t-royal{...}` block to `src/styles/invoice-sheet.css` with the ten variables above, plus any header override (see `.t-modern .head`).
3. Add a preview colour in `invoicingHTML()` in `js/routes/settings.js` (`sw` object).
4. Add an entry to `PT` for the PDF and a header branch in `makePDF()` (`js/pdf.js`) if the header layout differs.

Paper colours are fixed. Do not tie them to the dark-mode tokens.

## PDF

- A4 portrait, millimetres, margins `L=13`, `R=197`.
- `PT[name]` holds RGB arrays: `bg ink muted accent headFill headInk zebra line totFill totInk` and optional `band`, `border`.
- Table columns are the `cols` array: `[label, relativeWidth, 'l'|'r']`. Widths are scaled to fit the page, so add a column by adding an entry and a `cell(i, text, y)` call in the row loop and the totals row.
- Row height is `max(11, lines*3.5 + 6.5)`. Long item names wrap with `splitTextToSize`.
- Page break: before each row, if `y + h > 262` add a page, call `paint()` and redraw the header row. Before the charges block, check the estimated height (`need`).
- The charges block uses `lines(inv,c)` so every charge is its own row. Paid and balance rows print when a payment exists.
- Use "Rs." not "₹" in PDFs. Built-in jsPDF fonts have no rupee glyph. To print ₹, embed a TTF with `addFileToVFS`/`addFont` (adds weight to the file).
- Output goes through `saveBlob()` (`js/util.js`): the Claude `downloads` capability when present, otherwise a normal browser download.

## Checking a change

Run `npm test` for the math, then open an invoice with: 1 item, 8 items (page break), a very long item name, 5 extra charges, a partial payment. Download each template and look at page 1 and the last page.
