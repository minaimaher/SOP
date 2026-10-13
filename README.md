# SOP Builder

A single-page website for writing Standard Operating Procedures. Pick a template, fill in the sections, and the page builds a formatted, numbered SOP document as you type.

## Templates

| Template | Template-specific sections |
|---|---|
| **Service request** | Request profile (category, channel, priority, response/fulfilment SLA, approval), information required from requester, intake & validation, approval, fulfilment procedure, verification & closure, communication templates |
| **Production incident** | Incident profile (service, detection source, default severity, incident commander, bridge, status page), severity matrix (P1–P4), detection & triggers, detect & log, triage & assess, contain & mitigate, communicate, resolve & recover, close & post-incident review, communication templates |

Both templates also include: document control (ID, version, owner, effective/review dates, approver, status), purpose, scope, roles & responsibilities, definitions, prerequisites, escalation matrix, references and revision history.

Procedure sections are step tables (action, responsible, details/commands, expected result), numbered by section (e.g. step `9.2`). You can add your own sections (paragraph, bullet list or procedure steps).

## Use it

Open `index.html` in a browser, or serve the folder with any static host (e.g. GitHub Pages). There is no build step and no server.

- **New SOP** – choose *Service request* or *Production incident*.
- **Copy Markdown / Download .md** – paste into Confluence, a wiki or a Git repo.
- **Download .html / Print / PDF** – a clean, printable copy of the document.
- **Export / Import .json** – back up an SOP or share it with a colleague to keep editing.

Your SOPs are saved automatically in the browser's local storage. That storage belongs to this browser only, so use **Export .json** to keep a backup or move SOPs to another machine. Two example SOPs are loaded the first time you open the page.
