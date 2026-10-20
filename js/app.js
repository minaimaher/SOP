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
  function toast(msg, ms, action) {
    const t = $("toast");
    t.textContent = msg;
    if (action) t.append(h("button", { type: "button", class: "toast-btn", onclick: () => { t.hidden = true; action.run(); } }, action.label));
    t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms || 2200);
  }
  // Remove an entry from a list and offer to put it back.
  function removeWithUndo(arr, i, rerender, what) {
    const [gone] = arr.splice(i, 1);
    rerender();
    toast(`${what || "Item"} deleted`, 6000, { label: "Undo", run: () => { arr.splice(Math.min(i, arr.length), 0, gone); rerender(); toast("Restored"); } });
  }

  /* ---------- state ---------- */
  const { LocalStore, Auth } = window.SOPStore;
  let store = new LocalStore("guest");     // this browser, or the signed-in user's account
  let user = null;
  let prefs = {};
  let state = { docs: [], current: null };
  let sel = { kind: "settings" };          // {kind:'settings'|'cover'|'section'|'card', sec, card}
  const openSecs = new Set();
  const dirty = new Set();                 // manuals changed since the last save

  async function loadAll(st) {
    const docs = [];
    for (const m of await st.listManuals()) {
      try { const d = await st.getManual(m.id); if (d) docs.push(M.normalize(d)); } catch (e) { console.error(e); }
    }
    return docs;
  }
  const builtIns = () => { const d = M.presets().map(p => M.fromPreset(p.key)); return d.length ? d : [M.newDoc("en")]; };

  // Signed out: manuals saved in this browser. On the first visit, bring over manuals kept by the earlier
  // version of the site (localStorage), otherwise start with the built-in manuals.
  async function bootGuest() {
    let docs = [];
    try { docs = await loadAll(store); } catch (e) { console.error(e); }
    if (!docs.length) {
      try { const st = JSON.parse(localStorage.getItem(KEY) || "null"); if (st && st.docs) docs = st.docs.map(M.normalize); } catch (e) { /* none */ }
      if (!docs.length) docs = builtIns();
      for (const d of docs) { try { await store.putManual(d); } catch (e) { console.error(e); } }
    }
    try { prefs = await store.getPrefs(); } catch (e) { prefs = {}; }
    setDocs(docs);
  }
  function setDocs(docs) {
    state.docs = docs;
    state.current = docs.some(d => d.id === prefs.lastOpen) ? prefs.lastOpen : docs[0].id;
    sel = { kind: "settings" }; openSecs.clear();
    renderAll();
    setSaveState(savedText());
  }
  const savedText = () => store.kind === "cloud" ? "Saved to your account" : "Saved in this browser only";
  function setSaveState(t) { const n = $("saveState"); if (n) n.textContent = t; }

  let saveTimer;
  function save() {
    const d = doc(); if (d) dirty.add(d.id);
    setSaveState("Saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, store.kind === "cloud" ? 1500 : 500);
  }
  let flushing = Promise.resolve();
  function flush() {
    clearTimeout(saveTimer);
    flushing = flushing.then(async () => {
      const ids = [...dirty]; dirty.clear();
      if (!ids.length) return;
      try {
        for (const id of ids) { const d = state.docs.find(x => x.id === id); if (d) await store.putManual(d); }
        setSaveState(savedText());
      } catch (e) {
        ids.forEach(i => dirty.add(i));
        console.error(e);
        setSaveState("Not saved: " + Auth.message(e) + " Use Manual → Export config to keep a copy.");
      }
    });
    return flushing;
  }
  window.addEventListener("beforeunload", e => { if (dirty.size) { flush(); e.preventDefault(); e.returnValue = ""; } });
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
  function tools(arr, i, rerender, what) {
    const mv = d => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; rerender(); };
    return h("span", { class: "tools" },
      btn("↑", () => mv(-1), "icon", "Move up"), btn("↓", () => mv(1), "icon", "Move down"),
      btn("⧉", () => { const c = M.clone(arr[i]); reId(c); arr.splice(i + 1, 0, c); rerender(); }, "icon", "Duplicate"),
      btn("✕", () => removeWithUndo(arr, i, rerender, what), "icon danger", what ? "Delete " + what.toLowerCase() : "Remove"));
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
  const TYPE_LABEL = { heading: "Heading", paragraph: "Paragraph", note: "Note", bullets: "Bullet list", steps: "Numbered steps", checklist: "Checklist", table: "Table", image: "Image", pagebreak: "Page break", automation: "Power Automate flow", card: "Procedure card" };

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
      case "automation": return automationEditor(b, rer);
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
    const hr = h("tr", null, h("th", { class: "rn" }, "#"));
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
      const tr = h("tr", null, h("td", { class: "rn" }, h("div", { class: "rn-num" }, String(ri + 1)), tools(b.rows, ri, rer, "Row")));
      r.forEach((c, ci) => { const o = { v: c }; tr.append(h("td", null, txt(o, "v", { id: `b-${b.id}-r${ri}c${ci}`, multi: true, rows: 1, cls: "cell", after: v => { r[ci] = v; } }))); });
      tr.append(h("td", { class: "rn end" }));
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

  /* Power Automate item: flow link, parameters and what the Run button sends. */
  const A = window.SOPAutomation;
  const KIND_LABEL = { cloud: "Cloud flow — trigger “When an HTTP request is received”", desktop: "Desktop flow — run URL (ms-powerautomate:)", link: "Other link with {parameters}" };
  const KIND_HINT = {
    cloud: "Paste the HTTP POST URL from the flow's trigger. The Run button sends the values as JSON.",
    desktop: "In Power Automate Desktop: flow ⋯ → Properties → Run URL. The values are passed as the flow's input variables (same names).",
    link: "Any address. Put {parameterName} where a value goes, e.g. https://jira…/browse/{ticketNumber}"
  };
  const TYPE_NAMES = { text: "Text", number: "Number", date: "Date", yesno: "Yes / No", choice: "Choice" };
  function automationEditor(b, rer) {
    b.params = b.params || [];
    if (b.sendContext === undefined) b.sendContext = true;
    const id = "auto-" + b.id;
    const kind = h("select", { class: "inp", id: id + "-kind", onchange: e => { b.kind = e.target.value; rer(); } }, A.KINDS.map(k => h("option", { value: k }, KIND_LABEL[k])));
    kind.value = A.KINDS.includes(b.kind) ? b.kind : "cloud";
    const rows = h("div", { class: "auto-params" });
    if (!b.params.length) rows.append(h("p", { class: "hint" }, "No parameters. The flow runs without input values."));
    b.params.forEach((p, i) => {
      const type = h("select", { class: "inp", onchange: e => { p.type = e.target.value; rer(); } }, A.TYPES.map(k => h("option", { value: k }, TYPE_NAMES[k])));
      type.value = p.type || "text";
      const req = h("input", { type: "checkbox", onchange: e => { p.required = e.target.checked; changed(); } });
      req.checked = !!p.required;
      rows.append(h("div", { class: "auto-param" },
        h("div", { class: "auto-param-grid" },
          field("Name in the flow", txt(p, "name", { id: `${id}-p${i}-name`, dir: "ltr", ph: "ticketNumber" })),
          field("Label on the page", txt(p, "label", { id: `${id}-p${i}-label` })),
          field("Type", type),
          field("Default value", txt(p, "default", { id: `${id}-p${i}-def`, ph: p.type === "yesno" ? "true or false" : "" })),
          p.type === "choice" ? field("Choices (comma separated)", txt(p, "options", { id: `${id}-p${i}-opt` })) : null,
          h("label", { class: "chk" }, req, h("span", null, "Required"))),
        tools(b.params, i, rer, "Parameter")));
    });
    const schemaBtn = b.kind === "desktop" || b.kind === "link" ? null : btn("Show request schema", () => {
      const json = JSON.stringify(A.schema(b), null, 2);
      sheet("Request body JSON schema",
        h("p", { class: "hint" }, "Paste this into the trigger “When an HTTP request is received” → Request Body JSON Schema. The values then appear as dynamic content in the flow."),
        h("textarea", { class: "inp code", rows: 14, readonly: true, dir: "ltr", id: "schema-text" }, json),
        h("div", { class: "row-inline" }, btn("Copy", () => navigator.clipboard.writeText(json).then(() => toast("Copied"), () => toast("Select the text and copy it")), "primary")));
    });
    return h("div", { class: "auto-ed" },
      field("Title", txt(b, "title", { id: id + "-title" })),
      field("Flow type", kind),
      field("Flow link", txt(b, "url", { id: id + "-url", dir: "ltr", ph: b.kind === "desktop" ? "ms-powerautomate:/console/flow/run?environmentid=…&workflowid=…&source=Other" : "https://…" }), KIND_HINT[kind.value]),
      field("Description", txt(b, "description", { id: id + "-desc", multi: true, rows: 2 })),
      h("div", { class: "fld-l" }, "Parameters"), rows,
      h("div", { class: "row-inline" }, btn("+ Add parameter", () => { b.params.push({ name: "", label: "", type: "text", required: false, default: "", options: "" }); rer(); }, "add"), schemaBtn),
      kind.value === "cloud" ? check(b, "sendContext", "Also send where it was run from (manual, procedure, user, time)") : null,
      check(b, "showInWord", "Show the link in the Word document"),
      kind.value === "cloud" ? h("p", { class: "warn" }, "Anyone who has a cloud flow link can start that flow. Keep the link out of public pages and the Word file unless that is intended.") : null);
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
    restoreRuns(pv);
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
  /* ---------- Power Automate Run buttons ---------- */
  const runValues = {};   // block id → {param: value} typed on the page (kept across preview refreshes)
  const runStatus = {};   // block id → {cls, text, simple}
  function findAuto(id) {
    const d = doc();
    for (const s of d.sections) for (const b of s.blocks) {
      if (b.id === id) return { block: b, sec: s };
      if (b.type === "card") for (const c of b.blocks || []) if (c.id === id) return { block: c, sec: s, card: b };
    }
    return null;
  }
  const readField = el => el.type === "checkbox" ? el.checked : el.value;
  function rawValues(box) {
    const raw = {};
    box.querySelectorAll("[data-param]").forEach(el => { raw[el.dataset.param] = readField(el); });
    return raw;
  }
  function restoreRuns(pv) {
    pv.querySelectorAll("[data-auto]").forEach(box => {
      const v = runValues[box.dataset.auto];
      if (v) box.querySelectorAll("[data-param]").forEach(el => {
        if (!(el.dataset.param in v)) return;
        if (el.type === "checkbox") el.checked = !!v[el.dataset.param]; else el.value = v[el.dataset.param];
      });
      drawStatus(box);
    });
  }
  function setStatus(box, st) { runStatus[box.dataset.auto] = st; drawStatus(box); }
  function drawStatus(box) {
    const st = runStatus[box.dataset.auto], out = box.querySelector(".pv-auto-status");
    out.textContent = ""; out.className = "pv-auto-status";
    if (!st) return;
    if (st.cls) out.classList.add(st.cls);
    out.append(h("span", null, st.text));
    if (st.confirm) out.append(h("span", { class: "pv-auto-btns" },
      h("button", { type: "button", class: "pv-auto-run", "data-act": "start" }, st.yes),
      h("button", { type: "button", class: "pv-auto-sec", "data-act": "cancel" }, st.no)));
    if (st.simple) out.append(h("span", { class: "pv-auto-btns" }, h("button", { type: "button", class: "pv-auto-sec", "data-act": "simple" }, st.simple)));
  }
  function runContext(found) {
    const d = doc();
    const docField = (d.cover.fields || []).find(f => /document|المستند|الوثيقة|^id$|رقم/i.test(f.label || ""));
    return {
      manual: d.name || "", documentId: docField ? docField.value || "" : "", part: found.sec.title || "",
      procedureId: found.card ? M.cardId(d, found.card) : "", procedure: found.card ? found.card.title || "" : "",
      automation: found.block.title || "", runBy: user ? user.email || user.uid : "not signed in",
      runAt: new Date().toISOString(), page: location.href.split("#")[0]
    };
  }
  async function runAuto(box, act) {
    const found = findAuto(box.dataset.auto);
    if (!found) return;
    const b = found.block, tx = t().auto, raw = rawValues(box);
    runValues[b.id] = raw;
    if (act === "cancel") return setStatus(box, null);
    const problems = A.validate(b, raw, tx);
    if (problems.length) return setStatus(box, { cls: "bad", text: problems.join(" ") });
    const kind = A.KINDS.includes(b.kind) ? b.kind : "cloud";
    if (kind === "desktop") { A.openUrl(A.desktopUrl(b, raw)); return setStatus(box, { cls: "ok", text: tx.opened }); }
    if (kind === "link") { A.openUrl(A.linkUrl(b, raw), true); return setStatus(box, { cls: "ok", text: tx.openedLink }); }
    const body = A.cloudBody(b, raw, runContext(found));
    if (act === "simple") {
      setStatus(box, { text: tx.sending });
      try { await A.postCloudSimple(b.url.trim(), body); setStatus(box, { cls: "ok", text: tx.okOpaque }); }
      catch (e) { setStatus(box, { cls: "bad", text: tx.failed.replace("{0}", e.message || "network error") }); }
      return;
    }
    if (act !== "start") return setStatus(box, { confirm: true, text: tx.confirm.replace("{0}", b.title || ""), yes: tx.yes, no: tx.cancel });
    box.querySelectorAll("button").forEach(x => x.disabled = true);
    setStatus(box, { text: tx.sending });
    const r = await A.postCloud(b.url.trim(), body);
    box.querySelectorAll("button").forEach(x => x.disabled = false);
    if (r.ok) setStatus(box, { cls: "ok", text: tx.ok.replace("{0}", r.status) });
    else if (r.unknown) setStatus(box, { cls: "warn", text: tx.unknown, simple: tx.simple });
    else setStatus(box, { cls: "bad", text: tx.failed.replace("{0}", `${r.status} ${(r.text || "").slice(0, 200)}`.trim()) });
  }
  ["input", "change"].forEach(ev => $("paper").addEventListener(ev, e => {
    const el = e.target.closest("[data-param]"), box = el && el.closest("[data-auto]");
    if (box) runValues[box.dataset.auto] = { ...(runValues[box.dataset.auto] || {}), [el.dataset.param]: readField(el) };
  }));

  $("paper").addEventListener("click", e => {
    const autoBox = e.target.closest("[data-auto]");
    if (autoBox && e.target.closest(".pv-auto-form, .pv-auto-actions, .pv-auto-status")) {
      const b = e.target.closest("button");
      if (b && !b.disabled) runAuto(autoBox, b.dataset.act || "run");
      return;
    }
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
  function rememberOpen(id) { prefs.lastOpen = id; store.putPrefs(prefs).catch(() => {}); }
  function openDoc(id) { state.current = id; rememberOpen(id); sel = { kind: "settings" }; openSecs.clear(); renderAll(); }
  function renderAll() { renderDocSelect(); renderOutline(); renderEditor(); renderPreview(); }
  function addDoc(d, msg) { M.normalize(d); state.docs.push(d); dirty.add(d.id); flush(); openDoc(d.id); if (msg) toast(msg); }
  $("docSelect").addEventListener("change", e => openDoc(e.target.value));
  const fmtDate = iso => { try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return iso || ""; } };

  /* in-page dialog */
  function sheet(title, ...body) {
    $("sheetTitle").textContent = title;
    const b = $("sheetBody"); b.textContent = ""; b.append(...body.flat().filter(Boolean));
    $("sheet").hidden = false;
    const f = b.querySelector("input, button"); if (f) f.focus();
  }
  const closeSheet = () => { $("sheet").hidden = true; };
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSheet(); document.querySelectorAll(".menu-list").forEach(m => m.hidden = true); } });
  const sub = text => h("h3", { class: "sheet-sub" }, text);
  function inlineConfirm(label, run) {
    const w = h("span", { class: "confirm" });
    const draw = () => { w.textContent = ""; w.append(btn(label, () => { w.textContent = ""; w.append(btn("Delete", run, "danger solid"), btn("Cancel", draw)); }, "danger")); };
    draw();
    return w;
  }

  /* new manual: blank, my templates, built-in manuals */
  function openNewSheet() {
    const choice = (label, hint, make, extra) => h("div", { class: "choice-row" },
      h("button", { type: "button", class: "choice", onclick: async () => {
        try { const d = await make(); closeSheet(); addDoc(d, "Created " + d.name); } catch (e) { toast(Auth.message(e), 5000); }
      } }, h("strong", { dir: "auto" }, label), h("span", { dir: "auto" }, hint)), extra || null);
    const blank = [
      choice("Blank manual — English", "Starter cover, document control, an incident part, a service request part and appendices.", () => M.newDoc("en")),
      choice("Blank manual — Arabic", "نفس البداية باللغة العربية ومن اليمين إلى اليسار.", () => M.newDoc("ar"))
    ];
    if (prefs.defaultSettings) blank.unshift(choice("Blank manual — my default settings", "Uses the language, numbering, card fields, colours, header and footer you saved as your defaults.", () => {
      const ds = M.clone(prefs.defaultSettings), d = M.newDoc(ds.lang);
      d.settings = ds; return d;
    }));
    const tpl = h("div", { class: "choices" }, h("p", { class: "hint" }, "Loading…"));
    store.listTemplates().then(list => {
      tpl.textContent = "";
      if (!list.length) tpl.append(h("p", { class: "hint" }, "No templates yet. Open a manual and choose Manual → Save as template."));
      list.forEach(m => tpl.append(choice(m.name || "Untitled template", "Saved " + fmtDate(m.savedAt), async () => {
        const d = await store.getTemplate(m.id); d.id = M.uid(); d.name = m.name || d.name; return d;
      }, inlineConfirm("Delete", async () => { await store.deleteTemplate(m.id); toast("Template deleted"); openNewSheet(); }))));
    }).catch(e => { tpl.textContent = ""; tpl.append(h("p", { class: "hint" }, Auth.message(e))); });
    sheet("New manual",
      sub("Start blank"), h("div", { class: "choices" }, blank),
      sub(user ? "My templates" : "My templates (this browser)"), tpl,
      sub("Built-in manuals"), h("div", { class: "choices" }, M.presets().map(p => choice(p.name, "A full copy of this manual that you can edit.", () => M.fromPreset(p.key)))));
  }
  $("newBtn").addEventListener("click", openNewSheet);

  /* versions */
  function openVersions() {
    const d = doc();
    const label = h("input", { class: "inp", id: "ver-label", dir: "auto", placeholder: "Version note, e.g. v1.5 approved by CAB" });
    const list = h("div", { class: "ver-list" }, h("p", { class: "hint" }, "Loading…"));
    const draw = () => store.listVersions(d.id).then(vs => {
      list.textContent = "";
      if (!vs.length) list.append(h("p", { class: "hint" }, "No saved versions yet."));
      vs.forEach(v => list.append(h("div", { class: "ver" },
        h("div", { class: "ver-main" }, h("strong", { dir: "auto" }, v.label || (v.auto ? "Automatic" : "Version")), h("span", null, fmtDate(v.savedAt) + (v.auto ? " · automatic" : ""))),
        h("div", { class: "ver-tools" },
          btn("Restore", async () => {
            await flush();
            await store.putVersion(M.clone(doc()), "Before restoring " + fmtDate(v.savedAt), true);
            const old = await store.getVersion(d.id, v.id); old.id = d.id;
            const i = state.docs.findIndex(x => x.id === d.id); state.docs[i] = M.normalize(old);
            dirty.add(d.id); flush(); closeSheet(); sel = { kind: "settings" }; renderAll();
            toast("Restored the version from " + fmtDate(v.savedAt) + ". The previous state was saved as a version.", 5000);
          }),
          btn("Open as copy", async () => {
            const old = await store.getVersion(d.id, v.id); old.id = M.uid(); old.name = (old.name || d.name) + " (" + (v.label || fmtDate(v.savedAt)) + ")";
            closeSheet(); addDoc(old, "Opened the version as a new manual");
          }),
          inlineConfirm("Delete", async () => { await store.deleteVersion(d.id, v.id); draw(); })))));
    }).catch(e => { list.textContent = ""; list.append(h("p", { class: "hint" }, Auth.message(e))); });
    const saveBtn = btn("Save version", async () => {
      saveBtn.disabled = true;
      try { await flush(); await store.putVersion(M.clone(doc()), label.value.trim(), false); label.value = ""; toast("Version saved"); draw(); }
      catch (e) { toast(Auth.message(e), 5000); }
      saveBtn.disabled = false;
    }, "primary");
    sheet("Versions of “" + (d.name || "Untitled") + "”",
      h("p", { class: "hint" }, "Save a snapshot before big changes. A version is also saved automatically each time you download the Word file. The newest 50 versions are kept."),
      h("div", { class: "row-inline" }, label, saveBtn), sub("Saved versions"), list);
    draw();
  }

  function openSaveTemplate() {
    const name = h("input", { class: "inp", id: "tpl-name", dir: "auto", value: doc().name || "" });
    const go = btn("Save template", async () => {
      go.disabled = true;
      try { await store.putTemplate(M.clone(doc()), name.value.trim() || doc().name); closeSheet(); toast("Template saved. Find it under New → My templates."); }
      catch (e) { toast(Auth.message(e), 5000); go.disabled = false; }
    }, "primary");
    sheet("Save as template", h("p", { class: "hint" }, "Saves this manual's settings, cover and content so you can start new manuals from it."), field("Template name", name), h("div", { class: "row-inline" }, go));
  }

  /* Manual menu */
  function renderManualMenu() {
    const wrap = $("manualMenu"); wrap.textContent = "";
    const items = [
      { group: "This manual", label: "Save version…", run: openVersions },
      { label: "Version history…", run: openVersions },
      { label: "Save as template…", run: openSaveTemplate },
      { label: "Use these settings for my new manuals", run: () => { prefs.defaultSettings = M.clone(doc().settings); store.putPrefs(prefs).then(() => toast("Saved as your default settings. New → Blank manual — my default settings uses them."), e => toast(Auth.message(e), 5000)); } },
      { label: "Duplicate", run: () => { const c = M.clone(doc()); c.id = M.uid(); c.name = (c.name || "Manual") + " (copy)"; addDoc(c, "Duplicated"); } },
      { group: "Files", label: "Export config (.sop.json)", run: () => download(slug(doc()) + ".sop.json", new Blob([JSON.stringify(doc(), null, 1)], { type: "application/json" })) },
      { label: "Import config…", run: () => $("importFile").click() }
    ];
    if (user) items.push({ group: "Account", label: "Copy this browser's manuals to my account", run: copyGuestToCloud });
    items.push({ group: " ", label: "Delete manual…", run: () => {
      $("confirmText").textContent = `Delete “${doc().name}”${user ? " from your account" : " from this browser"}, with its versions? This cannot be undone.`;
      $("confirmBar").hidden = false;
    } });
    const m = addMenu("Manual ▾", items);
    m.querySelector("button").classList.remove("add");
    wrap.append(m);
  }
  $("confirmNo").addEventListener("click", () => $("confirmBar").hidden = true);
  $("confirmYes").addEventListener("click", async () => {
    const id = state.current;
    $("confirmBar").hidden = true;
    dirty.delete(id);
    state.docs = state.docs.filter(d => d.id !== id);
    try { await store.deleteManual(id); toast("Deleted"); } catch (e) { toast(Auth.message(e), 5000); }
    if (!state.docs.length) { const d = M.newDoc("en"); state.docs.push(d); dirty.add(d.id); flush(); }
    openDoc(state.docs[0].id);
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
      store.putVersion(M.clone(doc()), "Word download", true).catch(e => console.error(e));
      toast("Word file downloaded. Word asks to update fields on open: choose Yes to fill the page numbers.", 5000);
    } catch (e) { console.error(e); toast("Could not build the Word file: " + e.message, 5000); }
    b.disabled = false; b.textContent = "Download Word (.docx)";
  });
  $("importFile").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d.settings || !Array.isArray(d.sections)) throw new Error("not an SOP config");
        d.id = M.uid(); addDoc(d, "Imported " + (d.name || "manual"));
      } catch (err) { toast("That file is not an SOP Builder config (.sop.json)", 4000); }
      e.target.value = "";
    };
    rd.readAsText(f);
  });

  /* ---------- account ---------- */
  function renderAccount() {
    const a = $("account"); a.textContent = "";
    if (user) {
      const m = addMenu(user.email || user.name || "Account", [
        { group: "Signed in as " + (user.email || user.name), label: "Sign out", run: async () => { await flush(); Auth.signOut(); } }
      ]);
      const b = m.querySelector("button"); b.classList.remove("add"); b.classList.add("acct"); b.title = "Signed in";
      a.append(m);
    } else a.append(btn("Sign in", openSignIn));
    renderManualMenu();
  }
  function openSignIn() {
    if (!Auth.configured()) {
      sheet("Sign in", h("p", null, "Sign-in is not set up for this website yet. Until it is, your manuals, templates and versions are saved in this browser only."),
        h("p", { class: "hint" }, "To turn it on, create a free Firebase project and paste its settings into js/firebase-config.js. The README explains each step under “Set up sign-in”."));
      return;
    }
    const email = h("input", { class: "inp", type: "email", id: "auth-email", autocomplete: "email", required: true, dir: "ltr" });
    const pw = h("input", { class: "inp", type: "password", id: "auth-pw", autocomplete: "current-password", dir: "ltr" });
    const err = h("p", { class: "auth-err", role: "alert" });
    const run = async (fn, okMsg) => {
      err.textContent = "";
      try { await fn(); closeSheet(); if (okMsg) toast(okMsg, 5000); }
      catch (e) { err.textContent = Auth.message(e); }
    };
    const form = h("form", { class: "auth", onsubmit: e => { e.preventDefault(); run(() => Auth.signIn(email.value.trim(), pw.value)); } },
      field("Email", email), field("Password", pw), err,
      h("div", { class: "row-inline" },
        h("button", { type: "submit", class: "btn primary" }, "Sign in"),
        btn("Create account", () => run(() => Auth.signUp(email.value.trim(), pw.value), "Account created. Your manuals now save to your account.")),
        btn("Forgot password?", () => {
          if (!email.value.trim()) { err.textContent = "Enter your email first, then choose Forgot password."; return; }
          Auth.reset(email.value.trim()).then(() => { err.textContent = ""; toast("Password reset email sent to " + email.value.trim(), 5000); }, e => { err.textContent = Auth.message(e); });
        }, "link")),
      h("div", { class: "or" }, h("span", null, "or")),
      btn("Continue with Google", () => run(() => Auth.google()), "google"));
    sheet("Sign in", h("p", { class: "hint" }, "Sign in to keep your manuals, templates, versions and default settings in your account and open them on any computer."), form);
  }

  async function copyGuestToCloud() {
    const guest = new LocalStore("guest");
    try {
      const docs = await loadAll(guest);
      const have = new Set(state.docs.map(d => d.id));
      let n = 0;
      for (const d of docs) { if (have.has(d.id)) continue; await store.putManual(d); state.docs.push(d); n++; }
      for (const t of await guest.listTemplates()) await store.putTemplate(await guest.getTemplate(t.id), t.name);
      renderDocSelect();
      toast(n ? `Copied ${n} manual${n === 1 ? "" : "s"} from this browser to your account` : "Your account already has every manual from this browser");
    } catch (e) { toast(Auth.message(e), 5000); }
  }

  async function onUser(u) {
    if (!u && !user) { renderAccount(); return; }     // still signed out
    await flush();
    user = u;
    if (u) {
      setSaveState("Loading your manuals…");
      store = Auth.store(u);
      try {
        prefs = await store.getPrefs();
        let docs = await loadAll(store);
        if (!docs.length) {
          // first sign-in: start the account with the manuals and templates from this browser
          const guest = new LocalStore("guest");
          docs = await loadAll(guest).catch(() => []);
          if (!docs.length) docs = builtIns();
          for (const d of docs) await store.putManual(d);
          for (const t of await guest.listTemplates().catch(() => [])) await store.putTemplate(await guest.getTemplate(t.id), t.name);
          toast(`Welcome. ${docs.length} manual${docs.length === 1 ? " was" : "s were"} added to your account.`, 5000);
        }
        setDocs(docs);
      } catch (e) {
        console.error(e);
        toast("Could not open your account: " + Auth.message(e), 7000);
        store = new LocalStore("guest"); user = null;
        await bootGuest();
      }
    } else {
      store = new LocalStore("guest");
      await bootGuest();
      toast("Signed out. You are now editing the manuals saved in this browser.", 4000);
    }
    renderAccount();
  }

  // views on small screens
  function syncTabs() { const v = $("work").dataset.view; document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === v))); }
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => { $("work").dataset.view = b.dataset.view; syncTabs(); if (b.dataset.view === "preview") renderPreview(); }));

  (async () => {
    renderAccount();
    await bootGuest();
    try { await Auth.init(onUser); }
    catch (e) { console.error(e); toast("Sign-in is unavailable right now: " + e.message, 6000); }
  })();
  window.__sop = { get state() { return state; }, doc, select, flush, get store() { return store; } };
})();
