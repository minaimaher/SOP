/* SOP Builder – editor. */
(function () {
  "use strict";
  const M = window.SOPModel;
  const KEY = "sop-builder-v2";
  const $ = id => document.getElementById(id);

  /* ---------- DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "text") n.textContent = v;
      else if (k === "value") n.value = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  }
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function toast(msg, ms) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms || 2200); }

  /* ---------- state ---------- */
  let state = load();
  let sel = { kind: "settings" };          // {kind:'settings'|'cover'|'section'|'card', sec, card}
  const openSecs = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const st = JSON.parse(raw); if (st.docs && st.docs.length) { st.docs = st.docs.map(M.normalize); return st; } }
    } catch (e) { /* storage unavailable */ }
    const docs = [];
    for (const p of M.presets()) docs.push(M.fromPreset(p.key));
    if (!docs.length) docs.push(M.newDoc("en"));
    return { docs, current: docs[0].id };
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); $("saveState").textContent = "Saved in this browser"; }
      catch (e) { $("saveState").textContent = "Not saved — browser storage is full. Use Export config."; }
    }, 400);
  }
  const doc = () => state.docs.find(d => d.id === state.current) || state.docs[0];
  const t = () => M.tx(doc());
  const findSec = id => doc().sections.find(s => s.id === id);
  const findCard = (sec, id) => sec && sec.blocks.find(b => b.id === id);

  let pvTimer;
  function changed(structural) {
    save();
    clearTimeout(pvTimer);
    pvTimer = setTimeout(renderPreview, structural ? 0 : 350);
    if (structural) renderOutline();
  }
  function changedOutline() { save(); renderOutline(); clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, 350); }

  /* ---------- inputs ---------- */
  const dirAttr = () => doc().settings.dir === "rtl" ? "rtl" : "auto";
  function txt(obj, key, opts = {}) {
    const el = h(opts.multi ? "textarea" : "input", {
      class: "inp" + (opts.cls ? " " + opts.cls : ""), id: opts.id, dir: opts.dir || dirAttr(), placeholder: opts.ph || "",
      rows: opts.multi ? (opts.rows || 2) : null, type: opts.multi ? null : (opts.type || "text"),
      oninput: e => { obj[key] = e.target.value; if (opts.after) opts.after(e.target.value); (opts.outline ? changedOutline : changed)(); if (opts.multi) grow(e.target); }
    });
    el.value = obj[key] ?? "";
    if (opts.multi) requestAnimationFrame(() => grow(el));
    return el;
  }
  function grow(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight + 2, 420) + "px"; }
  const field = (label, control, hint) => h("label", { class: "fld" }, h("span", { class: "fld-l" }, label), control, hint ? h("span", { class: "fld-h" }, hint) : null);
  function check(obj, key, label, after) {
    const c = h("input", { type: "checkbox", onchange: e => { obj[key] = e.target.checked; if (after) after(); changed(true); } });
    c.checked = !!obj[key];
    return h("label", { class: "chk" }, c, h("span", null, label));
  }
  const btn = (label, onclick, cls, title) => h("button", { type: "button", class: "btn" + (cls ? " " + cls : ""), onclick, title: title || null, "aria-label": title || null }, label);
  function tools(arr, i, rerender) {
    const mv = d => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; rerender(); };
    return h("span", { class: "tools" },
      btn("↑", () => mv(-1), "icon", "Move up"), btn("↓", () => mv(1), "icon", "Move down"),
      btn("⧉", () => { const c = M.clone(arr[i]); reId(c); arr.splice(i + 1, 0, c); rerender(); }, "icon", "Duplicate"),
      btn("✕", () => { arr.splice(i, 1); rerender(); }, "icon danger", "Remove"));
  }
  function reId(b) { b.id = M.uid(); (b.blocks || []).forEach(reId); }

  /* ---------- outline ---------- */
  function renderOutline() {
    const d = doc(), ol = $("outline");
    ol.textContent = "";
    const item = (label, kind, extra, active, sub) => h("button", {
      type: "button", class: "ol-item" + (active ? " active" : "") + (sub ? " sub" : ""), dir: "auto",
      onclick: () => select({ kind, ...extra })
    }, label);
    ol.append(item("Settings", "settings", {}, sel.kind === "settings"));
    ol.append(item("Cover page", "cover", {}, sel.kind === "cover"));
    d.sections.forEach(sec => {
      const isOpen = openSecs.has(sec.id) || sel.sec === sec.id;
      const cards = sec.blocks.filter(b => b.type === "card");
      const head = h("div", { class: "ol-sec" },
        cards.length ? h("button", { type: "button", class: "ol-tw", "aria-label": isOpen ? "Collapse" : "Expand", onclick: () => { isOpen ? openSecs.delete(sec.id) : openSecs.add(sec.id); if (sel.sec === sec.id && isOpen) openSecs.delete(sec.id); renderOutline(); } }, isOpen ? "▾" : "▸") : h("span", { class: "ol-tw" }),
        item(sec.title || "Untitled part", "section", { sec: sec.id }, sel.kind === "section" && sel.sec === sec.id),
        sec.landscape ? h("span", { class: "ol-tag", title: "Landscape pages" }, "⇆") : null);
      ol.append(head);
      if (isOpen) cards.forEach(c => ol.append(item(`${M.cardId(d, c)} · ${c.title || ""}`, "card", { sec: sec.id, card: c.id }, sel.kind === "card" && sel.card === c.id, true)));
    });
    ol.append(h("div", { class: "ol-add" }, addMenu("+ Add part", M.SECTIONS.map(p => ({ label: p.label, run: () => {
      const s = p.make(t(), d); M.normalize({ settings: d.settings, sections: [s] }); d.sections.push(s); select({ kind: "section", sec: s.id }); changed(true);
    } })))));
    const a = ol.querySelector(".ol-item.active");
    if (a) a.scrollIntoView({ block: "nearest" });
  }

  function addMenu(label, items, cls) {
    const wrap = h("div", { class: "menu" });
    const list = h("div", { class: "menu-list", role: "menu", hidden: true });
    let group = null;
    for (const it of items) {
      if (it.group && it.group !== group) { group = it.group; list.append(h("div", { class: "menu-group" }, group)); }
      list.append(h("button", { type: "button", role: "menuitem", class: "menu-item", onclick: () => { list.hidden = true; it.run(); } }, it.label));
    }
    const b = btn(label, e => { e.stopPropagation(); document.querySelectorAll(".menu-list").forEach(m => m !== list && (m.hidden = true)); list.hidden = !list.hidden; }, "add " + (cls || ""));
    b.setAttribute("aria-haspopup", "menu");
    wrap.append(b, list);
    return wrap;
  }
  document.addEventListener("click", e => { if (!e.target.closest(".menu")) document.querySelectorAll(".menu-list").forEach(m => m.hidden = true); });

  function select(s) {
    sel = s;
    if (s.sec) openSecs.add(s.sec);
    renderOutline(); renderEditor();
    $("work").dataset.view = window.matchMedia("(max-width: 900px)").matches ? "edit" : $("work").dataset.view;
    syncTabs();
    scrollPreviewTo(s.kind === "card" ? s.card : s.kind === "section" ? s.sec : s.kind === "cover" ? "__cover" : null);
  }

  /* ---------- editor ---------- */
  function renderEditor() {
    const ed = $("editor");
    const keep = ed.scrollTop;
    ed.textContent = "";
    const d = doc();
    if (sel.kind === "settings") ed.append(...settingsEditor(d));
    else if (sel.kind === "cover") ed.append(...coverEditor(d));
    else if (sel.kind === "section") { const s = findSec(sel.sec); if (s) ed.append(...sectionEditor(d, s)); else { sel = { kind: "settings" }; return renderEditor(); } }
    else if (sel.kind === "card") { const s = findSec(sel.sec), c = findCard(s, sel.card); if (c) ed.append(...cardEditor(d, s, c)); else { sel = { kind: "settings" }; return renderEditor(); } }
    ed.scrollTop = keep;
  }
  const head = (eyebrow, title, ...right) => h("div", { class: "ed-head" }, h("div", null, h("div", { class: "eyebrow" }, eyebrow), h("h2", { dir: "auto" }, title)), h("div", { class: "ed-head-r" }, ...right));
  const panel = (title, ...kids) => h("section", { class: "panel" }, title ? h("h3", null, title) : null, ...kids);

  function settingsEditor(d) {
    const s = d.settings;
    const out = [head("Document", "Settings")];
    const langSel = h("select", { class: "inp", id: "set-lang", onchange: e => {
      s.lang = e.target.value; s.dir = s.lang === "ar" ? "rtl" : "ltr"; renderEditor(); changed(true);
    } }, h("option", { value: "en" }, "English (left to right)"), h("option", { value: "ar" }, "Arabic (right to left)"));
    langSel.value = s.lang;
    out.push(panel("Document",
      field("Document name (only shown in this app)", txt(d, "name", { id: "set-name", after: () => renderDocSelect() })),
      h("div", { class: "grid2" }, field("Language and direction", langSel), field("Font", txt(s, "font", { id: "set-font", dir: "ltr", ph: "Calibri" })))));

    out.push(panel("Colours",
      h("div", { class: "colors" }, [["primary", "Headings, table headers"], ["band", "Card fields fill"], ["zebra", "Table stripes"], ["border", "Table borders"], ["text", "Body text"], ["muted", "Secondary text"], ["link", "Links"]].map(([k, label]) => {
        const c = h("input", { type: "color", id: "set-c-" + k, value: "#" + (s.colors[k] || "000000"), oninput: e => { s.colors[k] = e.target.value.slice(1).toUpperCase(); changed(); } });
        return h("label", { class: "color" }, c, h("span", null, label));
      }))));

    // ID scheme & areas
    const areas = h("div", { class: "rows" });
    const drawAreas = () => {
      areas.textContent = "";
      s.areas.forEach((a, i) => areas.append(h("div", { class: "row-inline" },
        txt(a, "code", { id: `set-area-${i}-code`, dir: "ltr", cls: "w-code", ph: "CODE", outline: true }),
        txt(a, "name", { id: `set-area-${i}-name`, ph: "Area name" }),
        tools(s.areas, i, () => { drawAreas(); changed(true); }))));
      areas.append(btn("+ Add area", () => { s.areas.push({ code: "NEW", name: "" }); drawAreas(); changed(true); }, "add"));
    };
    drawAreas();
    out.push(panel("Procedure numbering",
      field("ID prefix", txt(s, "idPrefix", { id: "set-prefix", dir: "ltr", outline: true }), `Cards are numbered ${s.idPrefix || "PREFIX"}-AREA-NN, for example ${[s.idPrefix, (s.areas[0] || {}).code || "GOV", "01"].filter(Boolean).join("-")}.`),
      h("div", { class: "fld-l" }, "Areas (codes used in card IDs)"), areas));

    // card header fields
    const cf = h("div", { class: "rows" });
    const drawCF = () => {
      cf.textContent = "";
      s.cardFields.forEach((f, i) => cf.append(h("div", { class: "row-inline" },
        h("span", { class: "pill" }, f.key === "id" ? "ID" : String(i + 1)),
        txt(f, "label", { id: `set-cf-${i}` }),
        tools(s.cardFields, i, () => { drawCF(); changed(true); }))));
      cf.append(btn("+ Add header field", () => { s.cardFields.push({ key: "f" + M.uid(), label: "" }); drawCF(); changed(true); }, "add"));
    };
    drawCF();
    out.push(panel("Card header fields", h("p", { class: "hint" }, "These fields appear in the header table of every procedure card, two per row. The ID field is filled automatically."), cf));

    out.push(panel("Pages",
      check(s, "includeToc", "Include a contents page"),
      field("Contents title", txt(s, "tocTitle", { id: "set-toc" })),
      field("Header text", txt(s, "headerText", { id: "set-header" })),
      check(s, "headerLogo", "Show the cover logo in the page header"),
      field("Footer text", txt(s, "footerText", { id: "set-footer" })),
      h("div", { class: "grid2" }, field("“Page” word", txt(s, "pageLabel", { id: "set-page" })), field("“of” word", txt(s, "ofLabel", { id: "set-of" })))));
    return out;
  }

  function coverEditor(d) {
    const cv = d.cover;
    const logoPrev = h("div", { class: "logo-prev" }, cv.logo ? h("img", { src: cv.logo, alt: "Logo" }) : h("span", { class: "hint" }, "No logo"));
    const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/gif", id: "cover-logo", hidden: true, onchange: e => readImage(e.target.files[0], (src, ratio) => { cv.logo = src; cv.logoRatio = ratio; renderEditor(); changed(); }) });
    const fl = h("div", { class: "rows" });
    const drawF = () => {
      fl.textContent = "";
      cv.fields.forEach((f, i) => fl.append(h("div", { class: "row-inline" }, txt(f, "label", { id: `cv-f${i}-l`, cls: "w-label" }), txt(f, "value", { id: `cv-f${i}-v` }), tools(cv.fields, i, () => { drawF(); changed(); }))));
      fl.append(btn("+ Add field", () => { cv.fields.push({ label: "", value: "" }); drawF(); changed(); }, "add"));
    };
    drawF();
    const wIn = h("input", { class: "inp w-num", type: "number", min: "0.5", max: "6.5", step: "0.1", id: "cover-logo-w", value: cv.logoWidth || 2.7, oninput: e => { cv.logoWidth = +e.target.value; changed(); } });
    return [head("Document", "Cover page"),
      panel("Logo", h("div", { class: "logo-row" }, logoPrev, h("div", { class: "stack" },
        h("label", { class: "btn", for: "cover-logo" }, cv.logo ? "Replace logo" : "Upload logo"), file,
        cv.logo ? btn("Remove", () => { cv.logo = ""; renderEditor(); changed(); }, "danger") : null,
        field("Width (inches)", wIn)))),
      panel("Titles",
        field("Small heading", txt(cv, "eyebrow", { id: "cv-eyebrow" })),
        field("Title", txt(cv, "title", { id: "cv-title" })),
        field("Subtitle", txt(cv, "subtitle", { id: "cv-subtitle" })),
        field("Description", txt(cv, "description", { id: "cv-desc", multi: true }))),
      panel("Document details table", fl),
      panel(null, field("Bottom line", txt(cv, "footerLine", { id: "cv-foot" })))];
  }

  function sectionEditor(d, sec) {
    const idx = d.sections.indexOf(sec);
    const rer = () => { renderEditor(); changed(true); };
    const out = [head("Part " + (idx + 1) + " of " + d.sections.length, sec.title || "Untitled part",
      btn("↑", () => { if (idx > 0) { [d.sections[idx - 1], d.sections[idx]] = [sec, d.sections[idx - 1]]; rer(); } }, "icon", "Move part up"),
      btn("↓", () => { if (idx < d.sections.length - 1) { [d.sections[idx + 1], d.sections[idx]] = [sec, d.sections[idx + 1]]; rer(); } }, "icon", "Move part down"),
      confirmBtn("Delete part", () => { d.sections.splice(idx, 1); select({ kind: "settings" }); changed(true); }))];
    out.push(panel(null,
      field("Part title", txt(sec, "title", { id: "sec-title-" + sec.id, outline: true })),
      h("div", { class: "checks" }, check(sec, "pageBreak", "Start on a new page"), check(sec, "landscape", "Landscape pages (for wide tables)"))));
    out.push(panel("Content", blockList(d, sec.blocks, { inSection: sec }), addBar(d, sec.blocks, true, sec)));
    return out;
  }

  function cardEditor(d, sec, card) {
    const s = d.settings;
    const areaSel = h("select", { class: "inp", id: "card-area-" + card.id, onchange: e => { card.area = e.target.value; renderEditor(); changed(true); } },
      s.areas.map(a => h("option", { value: a.code }, `${a.code}${a.name ? " — " + a.name : ""}`)));
    if (!s.areas.some(a => a.code === card.area)) areaSel.prepend(h("option", { value: card.area || "" }, card.area || "—"));
    areaSel.value = card.area || "";
    const moveSel = h("select", { class: "inp", id: "card-move-" + card.id, onchange: e => {
      const to = findSec(e.target.value); if (!to || to === sec) return;
      sec.blocks.splice(sec.blocks.indexOf(card), 1); to.blocks.push(card); select({ kind: "card", sec: to.id, card: card.id }); changed(true);
    } }, d.sections.map(x => h("option", { value: x.id }, x.title || "Untitled part")));
    moveSel.value = sec.id;
    const cid = M.cardId(d, card);
    const fieldsPanel = h("div", { class: "grid2" }, (s.cardFields || []).filter(f => f.key !== "id").map(f => field(f.label || "(unnamed field)", txt(card.fields, f.key, { id: `card-${card.id}-${f.key}`, multi: true, rows: 1 }))));
    const i = sec.blocks.indexOf(card);
    return [head(cid, card.title || "Untitled card",
      btn("← Part", () => select({ kind: "section", sec: sec.id }), "", "Back to the part"),
      confirmBtn("Delete card", () => { sec.blocks.splice(i, 1); select({ kind: "section", sec: sec.id }); changed(true); })),
      panel(null,
        field("Title", txt(card, "title", { id: "card-title-" + card.id, outline: true })),
        h("div", { class: "grid3" }, field("Area", areaSel),
          field("Number", txt(card, "number", { id: "card-num-" + card.id, dir: "ltr", ph: "auto", outline: true }), "Leave empty to number automatically."),
          field("Part", moveSel))),
      panel("Card header", fieldsPanel),
      panel("Card content", blockList(d, card.blocks, {}), addBar(d, card.blocks, false, sec))];
  }

  function confirmBtn(label, run) {
    const wrap = h("span", { class: "confirm" });
    const draw = () => {
      wrap.textContent = "";
      wrap.append(btn(label, () => { wrap.textContent = ""; wrap.append(h("span", { class: "confirm-q" }, "Delete?"), btn("Delete", run, "danger solid"), btn("Cancel", draw)); }, "danger"));
    };
    draw();
    return wrap;
  }

  function addBar(d, list, allowCards, sec) {
    const add = made => {
      const items = [].concat(made);
      items.forEach(b => M.normalize({ settings: d.settings, sections: [{ blocks: [b] }] }));
      list.push(...items);
      renderEditor(); changed(true);
      const last = document.querySelector(`[data-block="${items[items.length - 1].id}"]`);
      if (last) { last.scrollIntoView({ block: "center", behavior: "smooth" }); const f = last.querySelector("input,textarea"); if (f) f.focus({ preventScroll: true }); }
    };
    const blockItems = M.BLOCKS.map(b => ({ group: b.group, label: b.label, run: () => add(b.make(t())) }));
    const bar = h("div", { class: "addbar" }, addMenu("+ Add item", blockItems));
    if (allowCards) {
      const area = () => (sec.blocks.filter(b => b.type === "card").slice(-1)[0] || {}).area || (d.settings.areas[0] || {}).code || "GEN";
      bar.append(addMenu("+ Add procedure card", M.CARDS.map(c => ({ label: c.label, run: () => {
        const card = c.make(t(), area()); M.normalize({ settings: d.settings, sections: [{ blocks: [card] }] });
        list.push(card); select({ kind: "card", sec: sec.id, card: card.id }); changed(true);
      } })), "primary"));
    }
    return bar;
  }

  /* ---------- block editors ---------- */
  const TYPE_LABEL = { heading: "Heading", paragraph: "Paragraph", note: "Note", bullets: "Bullet list", steps: "Numbered steps", checklist: "Checklist", table: "Table", image: "Image", pagebreak: "Page break", card: "Procedure card" };

  function blockList(d, list, ctx) {
    const wrap = h("div", { class: "blocks" });
    if (!list.length) wrap.append(h("p", { class: "empty" }, "Nothing here yet. Add an item below."));
    list.forEach((b, i) => {
      const rer = () => { renderEditor(); changed(true); };
      if (b.type === "card") {
        const sec = ctx.inSection;
        wrap.append(h("div", { class: "blk blk-card", "data-block": b.id },
          h("div", { class: "blk-head" }, h("span", { class: "blk-type card" }, M.cardId(d, b)),
            h("button", { type: "button", class: "card-link", dir: "auto", onclick: () => select({ kind: "card", sec: sec.id, card: b.id }) }, b.title || "Untitled card"),
            h("span", { class: "blk-meta" }, `${b.blocks.length} item${b.blocks.length === 1 ? "" : "s"}`),
            tools(list, i, rer))));
        return;
      }
      wrap.append(h("div", { class: "blk", "data-block": b.id },
        h("div", { class: "blk-head" }, h("span", { class: "blk-type" }, b.type === "heading" ? (b.level === 2 ? "Section heading" : "Sub-heading") : TYPE_LABEL[b.type] || b.type), tools(list, i, rer)),
        blockBody(b, rer)));
    });
    return wrap;
  }

  function blockBody(b, rer) {
    switch (b.type) {
      case "heading": {
        const lv = h("select", { class: "inp w-level", onchange: e => { b.level = +e.target.value; rer(); } }, h("option", { value: "3" }, "Sub-heading"), h("option", { value: "2" }, "Section heading (in contents)"));
        lv.value = String(b.level || 3);
        return h("div", { class: "row-inline" }, txt(b, "text", { id: "b-" + b.id, outline: b.level === 2 }), lv);
      }
      case "paragraph": case "note":
        return h("div", null, txt(b, "text", { id: "b-" + b.id, multi: true, rows: 3 }), h("div", { class: "fld-h" }, "**bold**   `code`   [link text](https://…)"));
      case "bullets": case "steps": case "checklist": return listEditor(b, rer);
      case "table": return tableEditor(b, rer);
      case "image": return imageEditor(b, rer);
      case "pagebreak": return h("p", { class: "hint" }, "The next item starts on a new page.");
      default: return h("p", { class: "hint" }, "Unsupported item.");
    }
  }

  function listEditor(b, rer) {
    const wrap = h("div", { class: "list-ed" });
    const kind = h("select", { class: "inp w-level", onchange: e => { b.type = e.target.value; rer(); } }, h("option", { value: "bullets" }, "Bullets"), h("option", { value: "steps" }, "Numbered"), h("option", { value: "checklist" }, "Checklist"));
    kind.value = b.type;
    b.items = b.items || [];
    b.items.forEach((it, i) => {
      const obj = { v: it };
      wrap.append(h("div", { class: "row-inline li" },
        h("span", { class: "li-mark" }, b.type === "steps" ? (i + 1) + "." : b.type === "checklist" ? "☐" : "•"),
        txt(obj, "v", { id: `b-${b.id}-${i}`, multi: true, rows: 1, after: v => { b.items[i] = v; } }),
        tools(b.items, i, rer)));
    });
    wrap.append(h("div", { class: "row-inline" }, btn("+ Add line", () => { b.items.push(""); rer(); setTimeout(() => { const n = $(`b-${b.id}-${b.items.length - 1}`); if (n) n.focus(); }); }, "add"), kind));
    return wrap;
  }

  function tableEditor(b, rer) {
    b.columns = b.columns || []; b.rows = b.rows || [];
    const n = Math.max(b.columns.length, ...b.rows.map(r => r.length), 1);
    while (b.columns.length < n) b.columns.push("");
    b.rows.forEach(r => { while (r.length < n) r.push(""); });
    const dropWidths = () => { b.widths = null; };
    const tbl = h("table", { class: "tbl-ed" });
    const hr = h("tr", null, h("th", { class: "rn" }, ""));
    b.columns.forEach((c, ci) => {
      const o = { v: c };
      hr.append(h("th", null, txt(o, "v", { id: `b-${b.id}-h${ci}`, multi: true, rows: 1, cls: "cell head", after: v => { b.columns[ci] = v; } }),
        h("div", { class: "col-tools" },
          btn("‹", () => { if (ci > 0) { swapCol(b, ci, ci - 1); rer(); } }, "icon tiny", "Move column back"),
          btn("✕", () => { b.columns.splice(ci, 1); b.rows.forEach(r => r.splice(ci, 1)); dropWidths(); rer(); }, "icon tiny danger", "Remove column"),
          btn("›", () => { if (ci < b.columns.length - 1) { swapCol(b, ci, ci + 1); rer(); } }, "icon tiny", "Move column forward"))));
    });
    hr.append(h("th", { class: "rn" }, btn("+", () => { b.columns.push(""); b.rows.forEach(r => r.push("")); dropWidths(); rer(); }, "icon", "Add column")));
    tbl.append(h("thead", null, hr));
    const tb = h("tbody");
    b.rows.forEach((r, ri) => {
      const tr = h("tr", null, h("td", { class: "rn" }, String(ri + 1)));
      r.forEach((c, ci) => { const o = { v: c }; tr.append(h("td", null, txt(o, "v", { id: `b-${b.id}-r${ri}c${ci}`, multi: true, rows: 1, cls: "cell", after: v => { r[ci] = v; } }))); });
      tr.append(h("td", { class: "rn" }, tools(b.rows, ri, rer)));
      tb.append(tr);
    });
    tbl.append(tb);
    const paste = h("details", { class: "paste" }, h("summary", null, "Paste rows from Excel"),
      h("p", { class: "hint" }, "Copy cells in Excel or Google Sheets and paste them here. Each line becomes a row."),
      h("textarea", { class: "inp", rows: 3, id: `b-${b.id}-paste`, dir: dirAttr() }),
      h("div", { class: "row-inline" },
        btn("Add as rows", e => { pasteRows(b, e.target.closest("details").querySelector("textarea").value, false); rer(); }),
        btn("Replace table (first line = headers)", e => { pasteRows(b, e.target.closest("details").querySelector("textarea").value, true); rer(); })));
    return h("div", null, h("div", { class: "tbl-scroll" }, tbl),
      h("div", { class: "row-inline" }, btn("+ Add row", () => { b.rows.push(Array(b.columns.length).fill("")); rer(); }, "add"), check(b, "firstColBold", "Bold first column")), paste);
  }
  function swapCol(b, a, c) { [b.columns[a], b.columns[c]] = [b.columns[c], b.columns[a]]; b.rows.forEach(r => [r[a], r[c]] = [r[c], r[a]]); if (b.widths) [b.widths[a], b.widths[c]] = [b.widths[c], b.widths[a]]; }
  function parseTSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"' && cell === "") q = true;
      else if (ch === "\t") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  function pasteRows(b, text, replace) {
    const rows = parseTSV(text || "");
    if (!rows.length) { toast("Nothing to paste"); return; }
    if (replace) { b.columns = rows.shift(); b.rows = rows; b.widths = null; }
    else b.rows.push(...rows);
    toast(`${replace ? "Table replaced" : rows.length + " rows added"}`);
  }

  function imageEditor(b, rer) {
    const id = "img-" + b.id;
    const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/gif", id, hidden: true, onchange: e => readImage(e.target.files[0], (src, ratio) => { b.src = src; b.ratio = ratio; rer(); }) });
    const w = h("input", { class: "inp w-num", type: "number", min: "1", max: "9", step: "0.25", value: b.width || 6, id: id + "-w", oninput: e => { b.width = +e.target.value; changed(); } });
    return h("div", { class: "img-ed" },
      b.src ? h("img", { src: b.src, alt: b.alt || "", class: "img-thumb" }) : h("div", { class: "img-thumb empty" }, "No image"),
      h("div", { class: "stack" }, h("label", { class: "btn", for: id }, b.src ? "Replace image" : "Choose image"), file,
        field("Width (inches)", w), field("Caption", txt(b, "caption", { id: id + "-cap" })), field("Alt text", txt(b, "alt", { id: id + "-alt" }))));
  }
  function readImage(f, done) {
    if (!f) return;
    if (!/^image\/(png|jpe?g|gif)$/.test(f.type)) { toast("Use a PNG, JPG or GIF image"); return; }
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => done(rd.result, +(img.naturalHeight / img.naturalWidth).toFixed(4)); img.src = rd.result; };
    rd.readAsDataURL(f);
  }

  /* ---------- preview ---------- */
  function renderPreview() {
    const d = doc(), pv = $("paper");
    const top = $("previewPane").scrollTop;
    pv.setAttribute("dir", d.settings.dir === "rtl" ? "rtl" : "ltr");
    pv.setAttribute("lang", d.settings.lang);
    pv.setAttribute("style", window.SOPPreview.themeVars(d) + `;font-family:'${(d.settings.font || "Calibri").replace(/'/g, "")}', ${d.settings.lang === "ar" ? "'IBM Plex Sans Arabic', " : ""}Carlito, 'IBM Plex Sans', system-ui, sans-serif`);
    pv.innerHTML = window.SOPPreview.render(d);
    $("previewPane").scrollTop = top;
    $("stats").textContent = stats(d);
  }
  function stats(d) {
    const cards = d.sections.reduce((n, s) => n + s.blocks.filter(b => b.type === "card").length, 0);
    return `${d.sections.length} parts · ${cards} cards`;
  }
  function scrollPreviewTo(id) {
    if (!id) return;
    setTimeout(() => {
      const el = $("paper").querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (el) { const pane = $("previewPane"); pane.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1000); }
    }, 60);
  }
  $("paper").addEventListener("click", e => {
    const el = e.target.closest("[data-id]");
    if (!el || e.target.closest("a")) return;
    const id = el.dataset.id, d = doc();
    if (id === "__cover") return select({ kind: "cover" });
    if (id === "__toc") return select({ kind: "settings" });
    for (const s of d.sections) {
      if (s.id === id) return select({ kind: "section", sec: s.id });
      for (const b of s.blocks) if (b.id === id && b.type === "card") return select({ kind: "card", sec: s.id, card: b.id });
    }
    // a block: open its card or part
    for (const s of d.sections) for (const b of s.blocks) {
      if (b.id === id) return select({ kind: "section", sec: s.id });
      if (b.type === "card" && (b.blocks || []).some(c => c.id === id)) return select({ kind: "card", sec: s.id, card: b.id });
    }
  });

  /* ---------- documents ---------- */
  function renderDocSelect() {
    const s = $("docSelect");
    s.innerHTML = state.docs.map(d => `<option value="${esc(d.id)}">${esc(d.name || "Untitled")}</option>`).join("");
    s.value = doc().id;
  }
  function openDoc(id) { state.current = id; sel = { kind: "settings" }; openSecs.clear(); save(); renderAll(); }
  function renderAll() { renderDocSelect(); renderOutline(); renderEditor(); renderPreview(); }
  $("docSelect").addEventListener("change", e => openDoc(e.target.value));

  // new document sheet
  function openNewSheet() {
    const list = $("newChoices");
    list.textContent = "";
    const choices = [
      { label: "Blank manual — English", hint: "Starter cover, document control, an incident part, a service request part and appendices.", run: () => M.newDoc("en") },
      { label: "Blank manual — Arabic", hint: "نفس البداية باللغة العربية ومن اليمين إلى اليسار.", run: () => M.newDoc("ar") },
      ...M.presets().map(p => ({ label: p.name, hint: "A full copy of this manual that you can edit.", run: () => M.fromPreset(p.key) }))
    ];
    choices.forEach(c => list.append(h("button", { type: "button", class: "choice", onclick: () => {
      const d = c.run(); state.docs.push(d); $("newSheet").hidden = true; openDoc(d.id); toast("Created " + d.name);
    } }, h("strong", { dir: "auto" }, c.label), h("span", { dir: "auto" }, c.hint))));
    $("newSheet").hidden = false;
    list.querySelector("button").focus();
  }
  $("newBtn").addEventListener("click", openNewSheet);
  $("newClose").addEventListener("click", () => $("newSheet").hidden = true);
  $("newSheet").addEventListener("click", e => { if (e.target.id === "newSheet") $("newSheet").hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { $("newSheet").hidden = true; document.querySelectorAll(".menu-list").forEach(m => m.hidden = true); } });

  $("dupBtn").addEventListener("click", () => { const c = M.clone(doc()); c.id = M.uid(); c.name = (c.name || "Manual") + " (copy)"; state.docs.push(c); openDoc(c.id); toast("Duplicated"); });
  $("delBtn").addEventListener("click", () => { $("confirmText").textContent = `Delete “${doc().name}” from this browser? Export the config first if you want to keep it.`; $("confirmBar").hidden = false; });
  $("confirmNo").addEventListener("click", () => $("confirmBar").hidden = true);
  $("confirmYes").addEventListener("click", () => {
    state.docs = state.docs.filter(d => d.id !== state.current);
    if (!state.docs.length) state.docs.push(M.newDoc("en"));
    $("confirmBar").hidden = true; openDoc(state.docs[0].id); toast("Deleted");
  });

  function slug(d) { return ((d.cover.fields.find(f => /SOP|-\d/.test(f.value || "")) || {}).value || d.name || "sop").replace(/[^\w؀-ۿ.-]+/g, "-").replace(/^-|-$/g, "") || "sop"; }
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $("docxBtn").addEventListener("click", async () => {
    const b = $("docxBtn"); b.disabled = true; b.textContent = "Building…";
    try {
      const blob = await window.SOPDocx.build(doc());
      download(slug(doc()) + ".docx", blob);
      toast("Word file downloaded. Word asks to update fields on open: choose Yes to fill the page numbers.", 5000);
    } catch (e) { console.error(e); toast("Could not build the Word file: " + e.message, 5000); }
    b.disabled = false; b.textContent = "Download Word (.docx)";
  });
  $("exportBtn").addEventListener("click", () => download(slug(doc()) + ".sop.json", new Blob([JSON.stringify(doc(), null, 1)], { type: "application/json" })));
  $("importFile").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d.settings || !Array.isArray(d.sections)) throw new Error("not an SOP config");
        d.id = M.uid(); M.normalize(d); state.docs.push(d); openDoc(d.id); toast("Imported " + (d.name || "manual"));
      } catch (err) { toast("That file is not an SOP Builder config (.sop.json)", 4000); }
      e.target.value = "";
    };
    rd.readAsText(f);
  });

  // views on small screens
  function syncTabs() { const v = $("work").dataset.view; document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v))); }
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { $("work").dataset.view = b.dataset.view; syncTabs(); if (b.dataset.view === "preview") renderPreview(); }));

  renderAll();
  window.__sop = { state, doc, select };
})();
