/* SOP Builder – HTML preview that mirrors the Word layout. */
(function (global) {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function inline(text) {
    return global.SOPDocx.parseInline(text).map(s => {
      let h = esc(s.t).replace(/\n/g, "<br>");
      if (s.code) h = `<code>${h}</code>`;
      if (s.link) h = `<a href="${esc(s.link)}" target="_blank" rel="noopener">${h}</a>`;
      if (s.b) h = `<strong>${h}</strong>`;
      return h;
    }).join("");
  }

  function table(b) {
    const cols = b.columns || [];
    const rows = (b.rows || []).filter(r => r && r.some(c => String(c ?? "").trim()));
    const n = Math.max(cols.length, ...rows.map(r => r.length), 1);
    const w = Array.isArray(b.widths) && b.widths.length === n ? b.widths : null;
    const sum = w ? w.reduce((a, c) => a + +c, 0) : 0;
    let h = `<div class="pv-tbl-wrap"><table class="pv-tbl${n >= 7 ? " pv-tbl-wide" : ""}">`;
    if (w) h += `<colgroup>${w.map(v => `<col style="width:${(v / sum * 100).toFixed(2)}%">`).join("")}</colgroup>`;
    if (cols.length) h += `<thead><tr>${Array.from({ length: n }, (_, i) => `<th>${inline(cols[i] || "")}</th>`).join("")}</tr></thead>`;
    h += `<tbody>${rows.map(r => `<tr>${Array.from({ length: n }, (_, i) => `<td>${inline(r[i] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return h;
  }

  function cardHeader(doc, card, id) {
    const fields = (doc.settings.cardFields || []).filter(f => f && f.label);
    let h = `<table class="pv-card-head"><colgroup><col style="width:16%"><col style="width:34%"><col style="width:16%"><col style="width:34%"></colgroup>`;
    const val = f => f.key === "id" ? id : (card.fields || {})[f.key] || "";
    for (let i = 0; i < fields.length; i += 2) {
      const a = fields[i], b = fields[i + 1];
      h += `<tr class="${i === 0 ? "first" : ""}"><th>${esc(a.label)}</th>`;
      h += b ? `<td>${inline(val(a))}</td><th>${esc(b.label)}</th><td>${inline(val(b))}</td>` : `<td colspan="3">${inline(val(a))}</td>`;
      h += `</tr>`;
    }
    return h + `</table>`;
  }

  function block(doc, b) {
    const id = `data-id="${esc(b.id)}"`;
    switch (b.type) {
      case "heading": return b.level === 2 ? `<h3 class="pv-h2" ${id}>${inline(b.text)}</h3>` : `<h4 class="pv-sub" ${id}>${inline(b.text)}</h4>`;
      case "paragraph": return `<p class="pv-p" ${id}>${inline(b.text)}</p>`;
      case "note": return `<p class="pv-note" ${id}>${inline(b.text)}</p>`;
      case "bullets": case "checklist": return `<ul class="pv-list ${b.type}" ${id}>${(b.items || []).filter(t => String(t).trim()).map(t => `<li>${inline(t)}</li>`).join("")}</ul>`;
      case "steps": return `<ol class="pv-list" ${id}>${(b.items || []).filter(t => String(t).trim()).map(t => `<li>${inline(t)}</li>`).join("")}</ol>`;
      case "table": return `<div ${id}>${table(b)}</div>`;
      case "image": return b.src ? `<figure class="pv-fig" ${id}><img src="${esc(b.src)}" alt="${esc(b.alt || "")}" style="width:${Math.min(+b.width || 6, 6.7) / 6.7 * 100}%">${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ""}</figure>`
        : `<div class="pv-empty" ${id}>Image: choose a file</div>`;
      case "pagebreak": return `<div class="pv-break" ${id}><span>page break</span></div>`;
      case "card": {
        const cid = global.SOPModel.cardId(doc, b);
        return `<section class="pv-card" ${id}><h3 class="pv-h2">${esc(cid)} · ${inline(b.title)}</h3>${cardHeader(doc, b, cid)}${(b.blocks || []).map(c => block(doc, c)).join("")}</section>`;
      }
      default: return "";
    }
  }

  function render(doc) {
    const s = doc.settings, cv = doc.cover || {};
    let h = `<div class="pv-page pv-cover" data-id="__cover">`;
    h += `<div class="pv-logo">${cv.logo ? `<img src="${esc(cv.logo)}" alt="" style="width:${(+cv.logoWidth || 2.7) * 0.9}in">` : ""}</div>`;
    if (cv.eyebrow) h += `<div class="pv-eyebrow">${inline(cv.eyebrow)}</div>`;
    if (cv.title) h += `<h1 class="pv-title">${inline(cv.title)}</h1>`;
    if (cv.subtitle) h += `<div class="pv-subtitle">${inline(cv.subtitle)}</div>`;
    if (cv.description) h += `<p class="pv-desc">${inline(cv.description)}</p>`;
    const fields = (cv.fields || []).filter(f => f.label || f.value);
    if (fields.length) h += `<table class="pv-cover-fields">${fields.map(f => `<tr><th>${inline(f.label)}</th><td>${inline(f.value)}</td></tr>`).join("")}</table>`;
    if (cv.footerLine) h += `<div class="pv-coverfoot">${inline(cv.footerLine)}</div>`;
    h += `</div>`;

    if (s.includeToc !== false) {
      h += `<div class="pv-page" data-id="__toc"><h2 class="pv-toc-title">${esc(s.tocTitle || "Contents")}</h2><div class="pv-toc">`;
      for (const sec of doc.sections || []) {
        h += `<div class="l1">${esc(sec.title)}</div>`;
        for (const b of sec.blocks || []) {
          if (b.type === "card") h += `<div class="l2">${esc(global.SOPModel.cardId(doc, b))} · ${esc(b.title)}</div>`;
          else if (b.type === "heading" && b.level === 2) h += `<div class="l2">${esc(b.text)}</div>`;
        }
      }
      h += `</div></div>`;
    }
    for (const sec of doc.sections || []) {
      h += `<div class="pv-page${sec.landscape ? " landscape" : ""}" data-id="${esc(sec.id)}">`;
      if (sec.landscape) h += `<div class="pv-orient">Landscape pages</div>`;
      h += `<h2 class="pv-h1">${inline(sec.title)}</h2>${(sec.blocks || []).map(b => block(doc, b)).join("")}</div>`;
    }
    return h;
  }

  function themeVars(doc) {
    const c = doc.settings.colors || {};
    const v = k => "#" + String(c[k] || "").replace("#", "");
    return `--d-primary:${v("primary")};--d-text:${v("text")};--d-muted:${v("muted")};--d-band:${v("band")};--d-zebra:${v("zebra")};--d-border:${v("border")};--d-link:${v("link")}`;
  }

  global.SOPPreview = { render, themeVars, inline };
})(window);
