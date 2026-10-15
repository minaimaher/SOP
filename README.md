# SOP Builder

A website for building Standard Operating Procedure manuals and downloading them as Word documents. You configure the document (language, numbering scheme, card fields, colours, header and footer), add parts, procedure cards and content items, and the site builds a `.docx` with the same layout as **IT-CRM-SOP-001 — Dynamics 365 CRM Production SOP v1.4**.

Both versions of that manual are included as presets, so you can start from the real document and change it:

- **SDB CRM Production SOP v1.4 (Arabic)**: right to left
- **SDB CRM Production SOP v1.4 (English)**: left to right

## Use it

Open `index.html` in a browser, or publish the folder on any static host (for example GitHub Pages). There is no build step and no server; the Word file is generated in the browser.

1. **Settings**
   - Set the language and direction.
   - Set the colours.
   - Set the ID prefix and area codes. Cards are numbered `PREFIX-AREA-NN`, for example `CRM-GOV-01`.
   - Set the fields in every card's header table: number, review date, responsibility, supervisor, trigger, evidence, description and related SOPs. You can rename, add, remove and reorder them.
   - Set the contents title and the header and footer text.
2. **Cover page**: logo, titles, document details table and bottom line.
3. **Parts**: each part is a chapter that starts with a Heading 1. Use **+ Add part** to add one:
   - Part with procedure cards
   - Document control
   - About this manual
   - Catalog (landscape pages)
   - Appendices
4. **Procedure cards**: use **+ Add procedure card** to add one:
   - Procedure card
   - Production incident card
   - Service request card
   - Module runbook card
   - Policy / guidelines card

   Each card gets the next number in its area unless you type a number yourself (e.g. `14.1`).
5. **Items**: use **+ Add item** inside a part or card.
   - Text: sub-headings, section headings, paragraphs and highlighted notes.
   - Lists: bullets, numbered steps and checklists.
   - Tables: blank tables and ready-made ones, including:
     - severity matrix (P1–P4), RACI, escalation levels
     - runbook (incident → cause → checks → fix → escalate), monitoring calendar
     - ticket type rules, closure template, problem register, module register
     - production fix catalog, service request catalog
     - document control fields, revision history, glossary, contacts
   - Images and page breaks.

   You can paste table rows straight from Excel.
6. **Download Word (.docx)**: when Word opens the file it asks to update fields. Choose **Yes** to fill in the page numbers in the contents.

The preview on the right updates as you type; click anything in it to jump to that item in the editor.

Text formatting inside any field: `**bold**`, `` `code` `` and `[link text](https://example.com)`.

### Saving and sharing

- Your manuals are saved automatically in this browser's local storage.
- **Export config** saves a manual as a `.sop.json` file.
- **Import config** opens one. Use these to back up, move a manual to another computer, or share it with a colleague.

## Import another Word manual

`tools/import_docx.py` converts a manual laid out like IT-CRM-SOP-001 into a preset. It reads:

- the cover page
- Heading 1 parts
- Heading 2 cards named `PREFIX-AREA-NN · title`, with their header tables
- sub-labels, lists, tables and images
- landscape sections

It needs Python 3 with `lxml` (installed with `python-docx`).

```sh
python3 tools/import_docx.py "My SOP.docx" presets/my-sop.js --name "My SOP" --key my-sop
```

Then add `<script src="presets/my-sop.js"></script>` to `index.html` next to the other presets. It will appear under **New**.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page |
| `css/app.css` | Editor and preview styles |
| `js/model.js` | Document model, card numbering and the library of parts, cards and items |
| `js/docx-writer.js` | Builds the Word document (WordprocessingML, zipped with JSZip) |
| `js/preview.js` | Live HTML preview |
| `js/app.js` | Editor |
| `presets/` | The Arabic and English CRM manuals as starting documents |
| `tools/import_docx.py` | Converts an existing Word manual into a preset |
| `vendor/jszip.min.js` | JSZip 3.10.1 (MIT), bundled so the site works offline |
