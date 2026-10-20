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

### Saving, versions and templates

Everything is in the **Manual ▾** menu next to **New**:

- **Save version… / Version history…**
  - Save a named snapshot of the manual.
  - Restore a snapshot, or open it as a separate copy.
  - A version is also saved automatically each time you download the Word file.
  - The newest 50 versions are kept.
- **Save as template…** saves the manual so you can start new ones from it under **New → My templates**.
- **Use these settings for my new manuals** remembers this manual's settings (language, numbering, card fields, colours, header and footer). New blank manuals can then start from them under **New → Blank manual — my default settings**.
- **Export config / Import config** save and open a manual as a `.sop.json` file.

**Where your work is saved:**
- **Signed out:** manuals, versions, templates and default settings are saved in this browser only, using IndexedDB.
- **Signed in:** they're saved to your account, so they follow you to any computer.
- **First sign-in:** the account starts with the manuals and templates from that browser.

## Desktop flow column (Part J fixes and service requests)

The Part J fix index and the service request catalog have a **Desktop flow** column. Each row can have its own Power Automate Desktop flow, and the SOP page shows a **▶ Run** button in that row.

1. Open Part J in the editor. In the table, click **+ Flow** on a row.
2. Fill in:
   - **Flow name:** shown under the Run button and in the Word document.
   - **Run URL:** in Power Automate Desktop, the flow's **⋯ → Properties → Run URL** (`ms-powerautomate:/console/flow/run?...`).
   - **Parameters:** each one needs a name that matches an **input variable** in the flow. You also set its label, type, default value and whether it is required. A default like `{Fix #}` or `{Request #}` fills in that column's value from the row.
3. On the SOP page, **▶ Run** asks for the parameter values, then opens Power Automate Desktop with them as `inputArguments`. Power Automate Desktop then asks you to confirm the run.

Any other table can have the column too: tick **Power Automate Desktop column** under the table. Moving, copying or deleting a row moves its flow with it. In the Word document, the column shows a **► Run** button, with the flow name and parameters under it. Ctrl+clicking the button in Word opens Power Automate Desktop and runs that flow, after Word's and Power Automate Desktop's confirmation prompts. Nobody can type values in a Word file, so the link passes only the parameters that have a default value, for example `{Fix #}` becomes `CRM-FIX-01`. The flow uses its own default values for the other input variables, so give those input variables sensible defaults in Power Automate Desktop, or leave them empty and ask for them inside the flow. Manuals saved before this change get the column on both Part J tables automatically.

## Run Power Automate flows from the SOP page

Inside a procedure card (or a part), choose **+ Add item → Power Automate flow (Run button)**. The item shows a small form and a **Run** button on the SOP page. Whoever follows the procedure fills in the values and starts the flow from there.

In the editor, set:
- **Flow type**, one of:
  - **Cloud flow:** a flow that starts with the trigger *When an HTTP request is received*. The Run button POSTs the values as JSON. It asks for confirmation first.
  - **Desktop flow:** a Power Automate Desktop flow. The Run button opens its run URL with the values as `inputArguments`, and Power Automate Desktop asks you to confirm the run.
  - **Other link:** any address with `{parameterName}` placeholders, opened in a new tab.
- **Flow link**, the address of the flow (see below).
- **Parameters.** Each one has:
  - a name: the exact name the flow expects
  - a label shown on the page
  - a type: text, number, date, yes/no or choice
  - a default value, and whether it is required
- **Also send where it was run from** (cloud flows). Adds a `sop` object with the manual, document ID, part, procedure ID and title, the signed-in user, the time and the page address. Use it in the flow to log or comment on the ticket.
- **Show the link in the Word document.** Off by default. The Word file always lists the automation and its parameters.

**Cloud flow setup**
1. In Power Automate, create a flow with the trigger **When an HTTP request is received**.
2. In the builder, click **Show request schema**, copy it, and paste it into the trigger's *Request Body JSON Schema*. The parameters then appear as dynamic content.
3. Save the flow, copy its **HTTP POST URL** into **Flow link**.
4. To let the page show "Flow started", end the flow's first steps with a **Response** action (status 202), and allow this site's origin if your tenant restricts it.

If the browser can't read the reply (blocked by CORS), the page says it could not confirm the start and offers **Send without reading the reply**. It never resends automatically, so check the flow's run history first. A flow sent that way receives the JSON as text, so add **Parse JSON** on `triggerBody()`.

**Desktop flow setup**
1. In the flow, create **input variables** with the same names as the parameters.
2. In Power Automate Desktop, open the flow's **⋯ → Properties** and copy the **Run URL** (`ms-powerautomate:/console/flow/run?...`) into **Flow link**.
3. The machine running the SOP page needs Power Automate Desktop installed and signed in.

> **Security:** anyone who has a cloud flow's HTTP URL can start the flow, because the link contains its own key. The link is saved with the manual, in this browser or your account, not on the public site. It does travel with an exported `.sop.json` file, and with the Word file if you show it there. Add checks in the flow too, such as allowed callers or a check on the ticket number.

## Set up sign-in (Firebase)

Sign-in stays off until the site has Firebase settings. Firebase's free plan is enough. You only do this once.

1. Go to <https://console.firebase.google.com>, choose **Create a project** and follow the steps. Google Analytics is not needed.
2. **Build → Authentication → Get started**.
   - On the **Sign-in method** tab, turn on **Email/Password**.
   - Optionally, also turn on **Google**.
3. **Authentication → Settings → Authorized domains**: add `minaimaher.github.io`. Also add any other address the site runs on.
4. **Build → Firestore Database → Create database**: choose **production mode** and the location closest to your users.
5. **Firestore Database → Rules**: replace the rules with the contents of [`firestore.rules`](firestore.rules) and choose **Publish**. These rules let each user read and write only their own data.
6. **Project settings (⚙) → General → Your apps → Web (`</>`)**:
   - Register an app; you don't need Firebase Hosting.
   - Copy the `firebaseConfig` values into [`js/firebase-config.js`](js/firebase-config.js) in place of `null`.
   - These values identify the project and are safe to publish; access is controlled by the rules.
7. Commit the change. The **Sign in** button now offers:
   - email and password, including **Create account** and **Forgot password?**
   - **Continue with Google**, if you turned it on in step 2

Manuals saved to an account are stored in your Firebase project's Firestore database (Google Cloud). Large manuals are split into pieces because Firestore limits each document to 1 MB.

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
| `js/automation.js` | Power Automate items: request body, desktop run URL, link placeholders, schema, sending |
| `js/app.js` | Editor |
| `js/store.js` | Saving: this browser (IndexedDB) or the signed-in user's Firebase account; sign-in |
| `js/firebase-config.js` | Your Firebase settings (sign-in is off while this is `null`) |
| `SETUP.md` | Record of the live configuration: GitHub Pages, Firebase project and console settings |
| `firestore.rules` | Firestore security rules: each user can access only their own data |
| `presets/` | The Arabic and English CRM manuals as starting documents |
| `tools/import_docx.py` | Converts an existing Word manual into a preset |
| `vendor/jszip.min.js` | JSZip 3.10.1 (MIT), bundled so the site works offline |
