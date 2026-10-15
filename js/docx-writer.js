/* SOP Builder – Word (.docx) writer.
 * Builds WordprocessingML directly and zips it with JSZip.
 * Layout mirrors IT-CRM-SOP-001: cover page, contents field, Heading 1 parts,
 * numbered procedure cards with a 4-column header table, banded data tables,
 * lists, images, and portrait/landscape sections. Right-to-left aware.
 */
(function (global) {
  "use strict";

  const EMU = 914400;           // EMU per inch
  const TWIP = 1440;            // twips per inch
  const PAGE = { w: 11906, h: 16838, margin: 1134, top: 1300 };

  const x = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hex = (c, d) => (/^[0-9a-f]{6}$/i.test(String(c || "").replace("#", "")) ? String(c).replace("#", "").toUpperCase() : d);

  /* ---------- inline mini-markup: **bold**, `code`, [text](url) ---------- */
  function parseInline(text) {
    const out = [];
    const re = /\*\*([\s\S]+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let last = 0, m;
    const src = String(text ?? "");
    while ((m = re.exec(src))) {
      if (m.index > last) out.push({ t: src.slice(last, m.index) });
      if (m[1] != null) parseInline(m[1]).forEach(s => out.push({ ...s, b: true }));
      else if (m[2] != null) out.push({ t: m[2], code: true });
      else out.push({ t: m[3], link: m[4] });
      last = re.lastIndex;
    }
    if (last < src.length) out.push({ t: src.slice(last) });
    return out;
  }

  const AR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const LT = /[A-Za-z0-9À-ɏ]/;
  // Split text into right-to-left and left-to-right runs so Word lays out mixed Arabic/Latin correctly.
  function splitDir(t) {
    const out = [];
    let cur = null;
    for (const ch of t) {
      const d = AR.test(ch) ? "r" : LT.test(ch) ? "l" : null;
      if (!cur) { cur = { d: d || "r", t: ch }; continue; }
      if (d && d !== cur.d) {
        let carry = "";
        if (cur.d === "l") { const m = /[^A-Za-z0-9À-ɏ)\]]+$/.exec(cur.t); if (m) { carry = m[0]; cur.t = cur.t.slice(0, -carry.length); } }
        if (cur.t) out.push(cur);
        cur = { d, t: carry + ch };
      } else cur.t += ch;
    }
    if (cur && cur.t) out.push(cur);
    return out;
  }

  class Writer {
    constructor(doc) {
      this.doc = doc;
      const s = doc.settings || {};
      this.s = s;
      this.rtl = s.dir === "rtl";
      const c = s.colors || {};
      this.c = {
        primary: hex(c.primary, "08395C"), text: hex(c.text, "1E2A33"), muted: hex(c.muted, "5A6B78"),
        band: hex(c.band, "E8EEF3"), zebra: hex(c.zebra, "F4F7FA"), border: hex(c.border, "C9D3DC"), link: hex(c.link, "1F6FB2")
      };
      this.font = s.font || "Calibri";
      this.csFont = s.csFont || "Arial";
      this.rels = [];            // document relationships
      this.media = [];           // {name, data(base64), ext}
      this.mediaByKey = new Map();
      this.drawingId = 1;
      this.nums = [];            // extra numbering instances for numbered lists
      this.nextNum = 10;
    }

    rel(type, target, external) {
      const id = "rId" + (this.rels.length + 20);
      this.rels.push({ id, type, target, external });
      return id;
    }
    addMedia(dataUrl) {
      if (this.mediaByKey.has(dataUrl)) return this.mediaByKey.get(dataUrl);
      const m = /^data:image\/(png|jpe?g|gif);base64,(.*)$/i.exec(dataUrl || "");
      if (!m) return null;
      const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
      const name = "image" + (this.media.length + 1) + "." + ext;
      this.media.push({ name, data: m[2], ext });
      this.mediaByKey.set(dataUrl, name);
      return name;
    }

    /* ---------- runs & paragraphs ---------- */
    rPr(o = {}) {
      const f = o.code ? "Consolas" : this.font;
      const cs = o.code ? "Consolas" : this.csFont;
      let r = `<w:rFonts w:ascii="${f}" w:cs="${cs}" w:eastAsia="${f}" w:hAnsi="${f}"/>`;
      if (o.b) r += "<w:b/><w:bCs/>";
      else if (o.unbold) r += `<w:b w:val="false"/><w:bCs w:val="false"/>`;
      const col = o.code ? this.c.primary : o.link ? this.c.link : o.color;
      if (col) r += `<w:color w:val="${col}"/>`;
      const sz = o.code ? Math.max((o.size || 21) - 3, 14) : o.size;
      if (sz) r += `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
      if (o.link) r += `<w:u w:val="single"/>`;
      if (o.rtl) r += "<w:rtl/>";
      return `<w:rPr>${r}</w:rPr>`;
    }
    runs(text, o = {}) {
      let xml = "";
      for (const seg of parseInline(text)) {
        const opt = { ...o, b: o.b || seg.b, code: seg.code, link: seg.link };
        const pieces = this.rtl && !seg.code ? splitDir(seg.t) : [{ d: this.rtl ? "l" : "l", t: seg.t }];
        let inner = "";
        for (const p of pieces) {
          const lines = p.t.split("\n");
          lines.forEach((ln, i) => {
            if (i) inner += `<w:r>${this.rPr({ ...opt, rtl: p.d === "r" })}<w:br/></w:r>`;
            if (ln) inner += `<w:r>${this.rPr({ ...opt, rtl: p.d === "r" })}<w:t xml:space="preserve">${x(ln)}</w:t></w:r>`;
          });
        }
        if (seg.link && /^https?:\/\//i.test(seg.link)) {
          const id = this.rel("http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", seg.link, true);
          xml += `<w:hyperlink r:id="${id}" w:history="1">${inner}</w:hyperlink>`;
        } else xml += inner;
      }
      return xml;
    }
    p(content, o = {}) {
      let pPr = "";
      if (o.style) pPr += `<w:pStyle w:val="${o.style}"/>`;
      if (o.keepNext) pPr += "<w:keepNext/>";
      if (o.pageBreakBefore) pPr += "<w:pageBreakBefore/>";
      if (o.num) pPr += `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.num}"/></w:numPr>`;
      if (o.border) pPr += o.border;
      if (o.shd) pPr += `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>`;
      if (o.tabs) pPr += o.tabs;
      if (this.rtl) pPr += "<w:bidi/>";
      if (o.spacing) pPr += o.spacing;
      if (o.ind) pPr += o.ind;
      if (o.jc) pPr += `<w:jc w:val="${o.jc}"/>`;
      return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content || ""}</w:p>`;
    }
    rtlRun(o) { return this.rtl ? { ...o, rtl: true } : o; }

    /* ---------- drawing ---------- */
    drawing(name, relId, wIn, ratio, descr) {
      const cx = Math.round(wIn * EMU), cy = Math.round(wIn * (ratio || 0.75) * EMU);
      const id = this.drawingId++;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Picture ${id}" descr="${x(descr || "")}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }
    image(src, wIn, ratio, descr) {
      const name = this.addMedia(src);
      if (!name) return "";
      const id = this.rel("http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", "media/" + name);
      return this.drawing(name, id, wIn, ratio, descr);
    }

    /* ---------- tables ---------- */
    cellBorders() {
      const b = `w:val="single" w:color="${this.c.border}" w:sz="4"`;
      return `<w:tcBorders><w:top ${b}/><w:left ${b}/><w:bottom ${b}/><w:right ${b}/></w:tcBorders>`;
    }
    cell(w, fill, paras, span) {
      return `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${w}"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${this.cellBorders()}<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:type="dxa" w:w="70"/><w:left w:type="dxa" w:w="100"/><w:bottom w:type="dxa" w:w="70"/><w:right w:type="dxa" w:w="100"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>${paras}</w:tc>`;
    }
    cellParas(text, o, keepNext) {
      const lines = String(text ?? "").split("\n");
      return lines.map(l => this.p(this.runs(l, o), { keepNext, spacing: `<w:spacing w:before="0" w:after="0"/>` })).join("");
    }
    table(widths, rowsXml) {
      const total = widths.reduce((a, b) => a + b, 0);
      return `<w:tbl><w:tblPr>${this.rtl ? "<w:bidiVisual/>" : ""}<w:tblW w:type="dxa" w:w="${total}"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rowsXml}</w:tbl>` + this.spacer();
    }
    spacer() { return `<w:p><w:pPr>${this.rtl ? "<w:bidi/>" : ""}<w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="8"/></w:rPr></w:pPr></w:p>`; }

    fitWidths(n, rel, total, rows) {
      let w = Array.isArray(rel) && rel.length === n && rel.every(v => +v > 0) ? rel.map(Number) : null;
      if (!w) {
        // proportional to typical text length, bounded so short columns stay readable
        w = Array.from({ length: n }, (_, i) => {
          const lens = rows.map(r => String(r[i] ?? "").length).sort((a, b) => a - b);
          const med = lens.length ? lens[Math.floor(lens.length * 0.75)] : 10;
          return Math.min(Math.max(med, 8), 80);
        });
      }
      const sum = w.reduce((a, b) => a + b, 0);
      const out = w.map(v => Math.floor(v / sum * total));
      out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
      return out;
    }

    dataTable(block, width) {
      const cols = block.columns || [];
      const rows = (block.rows || []).filter(r => r && r.some(c => String(c ?? "").trim()));
      const n = Math.max(cols.length, ...rows.map(r => r.length), 1);
      const widths = this.fitWidths(n, block.widths, width, [cols, ...rows]);
      const sz = n >= 7 ? 16 : 18;
      let xml = "";
      if (cols.length) {
        xml += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${widths.map((w, i) => this.cell(w, this.c.primary, this.cellParas(cols[i] || "", this.rtlRun({ b: true, color: "FFFFFF", size: sz })))).join("")}</w:tr>`;
      }
      rows.forEach((r, ri) => {
        const fill = ri % 2 ? this.c.zebra : "FFFFFF";
        xml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${widths.map((w, i) => this.cell(w, fill, this.cellParas(r[i] || "", this.rtlRun({ size: sz, b: block.firstColBold && i === 0 })))).join("")}</w:tr>`;
      });
      return this.table(widths, xml);
    }

    cardHeader(card, id, width) {
      const fields = (this.s.cardFields || []).filter(f => f && f.label);
      const labelW = Math.round(width * 1550 / 9638), valW = Math.round((width - 2 * labelW) / 2);
      const widths = [labelW, valW, labelW, width - 2 * labelW - valW];
      const val = f => f.key === "id" ? id : (card.fields || {})[f.key] || "";
      let xml = "";
      for (let i = 0; i < fields.length; i += 2) {
        const a = fields[i], b = fields[i + 1];
        const first = i === 0;
        const lab = f => this.cell(0, this.c.primary, this.cellParas(f.label, this.rtlRun({ b: true, color: "FFFFFF", size: 18 }), true));
        const v = (f, w, span) => this.cell(w, this.c.band, this.cellParas(val(f), this.rtlRun({ size: 18, b: first, unbold: !first }), true), span);
        let row = lab(a).replace('w:w="0"', `w:w="${labelW}"`);
        if (b) row += v(a, valW) + lab(b).replace('w:w="0"', `w:w="${labelW}"`) + v(b, widths[3]);
        else row += v(a, width - labelW, 3);
        xml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row}</w:tr>`;
      }
      return fields.length ? this.table(widths, xml) : "";
    }

    /* ---------- numbering ---------- */
    listNum(kind) {
      if (kind === "bullets") return 1;
      if (kind === "checklist") return 2;
      const id = this.nextNum++;
      this.nums.push(id);
      return id;
    }

    /* ---------- blocks ---------- */
    blocks(list, width, ctx) {
      return (list || []).map(b => this.block(b, width, ctx)).join("");
    }
    block(b, width, ctx) {
      const body = { spacing: `<w:spacing w:after="120" w:line="288" w:lineRule="auto"/>` };
      switch (b.type) {
        case "heading":
          return b.level === 2
            ? this.p(this.runs(b.text, this.rtlRun({})), { style: "Heading2", keepNext: true })
            : this.p(this.runs(b.text, this.rtlRun({})), { style: "SubLabel" });
        case "paragraph":
          return this.p(this.runs(b.text, this.rtlRun({})), body);
        case "note":
          return this.p(this.runs(b.text, this.rtlRun({})), {
            ...body, shd: this.c.band,
            border: `<w:pBdr><w:${this.rtl ? "right" : "left"} w:val="single" w:sz="18" w:space="8" w:color="${this.c.primary}"/></w:pBdr>`,
            ind: `<w:ind w:start="160" w:end="160"/>`
          });
        case "bullets": case "steps": case "checklist": {
          const num = this.listNum(b.type);
          return (b.items || []).filter(t => String(t).trim()).map(t =>
            this.p(this.runs(t, this.rtlRun({})), { style: "ListParagraph", num, spacing: `<w:spacing w:after="60" w:line="288" w:lineRule="auto"/>` })).join("");
        }
        case "table":
          return this.dataTable(b, width);
        case "image": {
          if (!b.src) return "";
          const wIn = Math.min(+b.width || 6, width / TWIP);
          let xml = this.p(this.image(b.src, wIn, +b.ratio || 0.75, b.alt), { jc: "center", spacing: `<w:spacing w:before="120" w:after="120"/>` });
          if (b.caption) xml += this.p(this.runs(b.caption, this.rtlRun({ color: this.c.muted, size: 18 })), { jc: "center", spacing: `<w:spacing w:after="160"/>` });
          return xml;
        }
        case "card": {
          const id = ctx.cardId(b);
          const title = `${id} · ${b.title || ""}`;
          return this.p(this.runs(title, this.rtlRun({})), { style: "Heading2", keepNext: true }) +
            this.cardHeader(b, id, width) + this.blocks(b.blocks, width, ctx);
        }
        case "pagebreak":
          return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
        default:
          return "";
      }
    }

    /* ---------- cover & contents ---------- */
    cover(width) {
      const cv = this.doc.cover || {};
      let xml = "";
      if (cv.logo) xml += this.p(this.image(cv.logo, +cv.logoWidth || 2.7, +cv.logoRatio || 0.32, "logo"), { jc: "end", spacing: `<w:spacing w:before="400" w:after="1400"/>` });
      else xml += this.p("", { spacing: `<w:spacing w:before="400" w:after="1400"/>` });
      if (cv.eyebrow) xml += this.p(this.runs(cv.eyebrow, this.rtlRun({ b: true, color: this.c.muted, size: 26 })), { spacing: `<w:spacing w:after="120"/>` });
      if (cv.title) xml += this.p(this.runs(cv.title, this.rtlRun({ b: true, color: this.c.primary, size: 52 })), { spacing: `<w:spacing w:after="160"/>` });
      if (cv.subtitle) xml += this.p(this.runs(cv.subtitle, this.rtlRun({ color: this.c.primary, size: 34 })), {
        border: `<w:pBdr><w:bottom w:val="single" w:color="${this.c.primary}" w:sz="18" w:space="12"/></w:pBdr>`, spacing: `<w:spacing w:after="400"/>`
      });
      if (cv.description) xml += this.p(this.runs(cv.description, this.rtlRun({ color: this.c.muted, size: 24 })), { spacing: `<w:spacing w:after="1600"/>` });
      const fields = (cv.fields || []).filter(f => f.label || f.value);
      if (fields.length) {
        const w1 = Math.round(width * 2600 / 9638), widths = [w1, width - w1];
        const rows = fields.map(f => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${this.cell(widths[0], this.c.primary, this.cellParas(f.label, this.rtlRun({ b: true, color: "FFFFFF", size: 18 })))}${this.cell(widths[1], this.c.band, this.cellParas(f.value, this.rtlRun({ size: 18 })))}</w:tr>`).join("");
        xml += this.table(widths, rows);
      }
      if (cv.footerLine) xml += this.p(this.runs(cv.footerLine, this.rtlRun({ color: this.c.muted, size: 20 })), { spacing: `<w:spacing w:before="600"/>` });
      return xml + `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    }
    toc(entries) {
      const title = this.s.tocTitle || (this.rtl ? "المحتويات" : "Contents");
      let xml = this.p(this.runs(title, this.rtlRun({})), { style: "TocTitle" });
      const tabs = `<w:tabs><w:tab w:val="end" w:leader="dot" w:pos="${PAGE.w - 2 * PAGE.margin}"/></w:tabs>`;
      const fieldStart = `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
      if (!entries.length) entries = [{ level: 1, text: this.rtl ? "حدّث الفهرس من Word" : "Update this table in Word" }];
      entries.forEach((e, i) => {
        const o = e.level === 1 ? this.rtlRun({ b: true, color: this.c.primary, size: 21 }) : this.rtlRun({ unbold: true, color: this.c.text, size: 19 });
        xml += this.p((i === 0 ? fieldStart : "") + this.runs(e.text, o), {
          style: e.level === 1 ? "TOC1" : "TOC2", tabs,
          spacing: e.level === 1 ? `<w:spacing w:before="100" w:after="30"/>` : `<w:spacing w:before="0" w:after="10"/>`,
          ind: `<w:ind w:start="${e.level === 1 ? 0 : 360}"/>`
        });
      });
      xml += `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
      return xml + `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    }

    /* ---------- header / footer ---------- */
    hfTable(width, leftXml, rightXml) {
      const none = `w:val="none" w:sz="0" w:space="0" w:color="auto"`;
      const w1 = Math.round(width * 0.65), w2 = width - w1;
      const c = (w, inner) => `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${w}"/><w:tcBorders><w:top ${none}/><w:left ${none}/><w:bottom ${none}/><w:right ${none}/></w:tcBorders><w:tcMar><w:top w:type="dxa" w:w="0"/><w:left w:type="dxa" w:w="0"/><w:bottom w:type="dxa" w:w="40"/><w:right w:type="dxa" w:w="0"/></w:tcMar><w:vAlign w:val="bottom"/></w:tcPr>${inner}</w:tc>`;
      return `<w:tbl><w:tblPr>${this.rtl ? "<w:bidiVisual/>" : ""}<w:tblW w:type="dxa" w:w="${width}"/><w:tblBorders><w:top ${none}/><w:left ${none}/><w:bottom ${none}/><w:right ${none}/><w:insideH ${none}/><w:insideV ${none}/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${w1}"/><w:gridCol w:w="${w2}"/></w:tblGrid><w:tr>${c(w1, leftXml)}${c(w2, rightXml)}</w:tr></w:tbl>`;
    }
    header(width, rels) {
      const small = this.rtlRun({ color: this.c.muted, size: 16 });
      let logo = "";
      if (this.s.headerLogo !== false && this.doc.cover && this.doc.cover.logo) {
        const name = this.addMedia(this.doc.cover.logo);
        if (name) {
          rels.push(`<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
          const ratio = +this.doc.cover.logoRatio || 0.32;
          logo = this.drawing(name, "rIdLogo", Math.min(1.15, 0.35 / ratio), ratio, "logo");
        }
      }
      const left = this.p(this.runs(this.s.headerText || "", small), { jc: "start" });
      const right = this.p(logo, { jc: "end" });
      return this.wrap("hdr", this.hfTable(width, left, right) + `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:color="${this.c.primary}" w:sz="8" w:space="1"/></w:pBdr><w:spacing w:after="0"/></w:pPr></w:p>`);
    }
    footer(width) {
      const small = this.rtlRun({ color: this.c.muted, size: 16 });
      const fld = code => `<w:r>${this.rPr({ b: true, color: this.c.primary, size: 16 })}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${this.rPr({ b: true, color: this.c.primary, size: 16 })}<w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r>${this.rPr({ b: true, color: this.c.primary, size: 16 })}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${this.rPr({ b: true, color: this.c.primary, size: 16 })}<w:t>1</w:t></w:r><w:r>${this.rPr({ b: true, color: this.c.primary, size: 16 })}<w:fldChar w:fldCharType="end"/></w:r>`;
      const pageLabel = this.s.pageLabel ?? (this.rtl ? "صفحة" : "Page");
      const ofLabel = this.s.ofLabel ?? (this.rtl ? "من" : "of");
      const left = this.p(this.runs(this.s.footerText || "", small), { jc: "start" });
      const right = this.p(this.runs(pageLabel + " ", small) + fld("PAGE") + this.runs(" " + ofLabel + " ", small) + fld("NUMPAGES"), { jc: "end" });
      return this.wrap("ftr", `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:color="${this.c.border}" w:sz="4" w:space="1"/></w:pBdr><w:spacing w:after="60"/></w:pPr></w:p>` + this.hfTable(width, left, right));
    }
    wrap(tag, inner) {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">${inner || "<w:p/>"}</w:${tag}>`;
    }

    sectPr(landscape, first) {
      const w = landscape ? PAGE.h : PAGE.w, h = landscape ? PAGE.w : PAGE.h;
      const hp = landscape ? "rIdHL" : "rIdHP", fp = landscape ? "rIdFL" : "rIdFP";
      return `<w:sectPr><w:headerReference w:type="default" r:id="${hp}"/>${first ? `<w:headerReference w:type="first" r:id="rIdHF"/>` : ""}<w:footerReference w:type="default" r:id="${fp}"/>${first ? `<w:footerReference w:type="first" r:id="rIdFF"/>` : ""}<w:type w:val="nextPage"/><w:pgSz w:w="${w}" w:h="${h}"${landscape ? ` w:orient="landscape"` : ""}/><w:pgMar w:top="${PAGE.top}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="500" w:footer="500" w:gutter="0"/>${first ? "<w:titlePg/>" : ""}<w:docGrid w:linePitch="360"/></w:sectPr>`;
    }

    styles() {
      const f = this.font, cs = this.csFont, P = this.c.primary;
      const rf = `<w:rFonts w:ascii="${f}" w:cs="${cs}" w:eastAsia="${f}" w:hAnsi="${f}"/>`;
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${rf}<w:color w:val="${this.c.text}"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:bidi="${this.rtl ? "ar-SA" : "en-US"}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:color="${P}" w:sz="12" w:space="6"/></w:pBdr><w:spacing w:before="240" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr>${rf}<w:b/><w:bCs/><w:color w:val="${P}"/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr>${rf}<w:b/><w:bCs/><w:color w:val="${P}"/><w:sz w:val="27"/><w:szCs w:val="27"/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="SubLabel"><w:name w:val="Sub Label"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr>${rf}<w:b/><w:bCs/><w:color w:val="${P}"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="TocTitle"><w:name w:val="TOC Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr>${rf}<w:b/><w:bCs/><w:color w:val="${P}"/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="end" w:leader="dot" w:pos="${PAGE.w - 2 * PAGE.margin}"/></w:tabs><w:spacing w:before="100" w:after="30"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="${P}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="end" w:leader="dot" w:pos="${PAGE.w - 2 * PAGE.margin}"/></w:tabs><w:spacing w:before="0" w:after="10"/><w:ind w:start="360"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="${this.c.link}"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
    }
    numbering() {
      const P = this.c.primary;
      const lvl = (fmt, text, ind, hang) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="start"/><w:pPr><w:ind w:start="${ind}" w:hanging="${hang}"/></w:pPr><w:rPr>${fmt === "decimal" ? "<w:b/><w:bCs/>" : ""}<w:color w:val="${P}"/></w:rPr></w:lvl>`;
      let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`;
      xml += `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>${lvl("bullet", "•", 400, 260)}</w:abstractNum>`;
      xml += `<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="singleLevel"/>${lvl("bullet", "☐", 420, 300)}</w:abstractNum>`;
      xml += `<w:abstractNum w:abstractNumId="3"><w:multiLevelType w:val="singleLevel"/>${lvl("decimal", "%1.", 420, 300)}</w:abstractNum>`;
      xml += `<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>`;
      for (const id of this.nums) xml += `<w:num w:numId="${id}"><w:abstractNumId w:val="3"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;
      return xml + `</w:numbering>`;
    }

    /* ---------- assemble ---------- */
    async build() {
      if (!global.JSZip) throw new Error("JSZip is not loaded");
      const doc = this.doc;
      const pw = PAGE.w - 2 * PAGE.margin, lw = PAGE.h - 2 * PAGE.margin;
      const ctx = { cardId: c => global.SOPModel.cardId(doc, c) };

      // contents entries
      const entries = [];
      for (const sec of doc.sections || []) {
        if (sec.hideInToc) continue;
        entries.push({ level: 1, text: sec.title || "" });
        for (const b of sec.blocks || []) {
          if (b.type === "card") entries.push({ level: 2, text: `${ctx.cardId(b)} · ${b.title || ""}` });
          else if (b.type === "heading" && b.level === 2) entries.push({ level: 2, text: b.text || "" });
        }
      }

      let body = this.cover(pw);
      if (this.s.includeToc !== false) body += this.toc(entries);

      // group sections by orientation; a section break closes each group
      const secs = doc.sections || [];
      let groupLandscape = false, first = true, prevBreakWasSection = true;
      secs.forEach((sec, i) => {
        const land = !!sec.landscape;
        if (land !== groupLandscape) {
          body += `<w:p><w:pPr>${this.sectPr(groupLandscape, first)}</w:pPr></w:p>`;
          first = false;
          groupLandscape = land;
          prevBreakWasSection = true;
        }
        const width = land ? lw : pw;
        const pageBreak = !!sec.pageBreak && !prevBreakWasSection && i > 0;
        body += this.p(this.runs(sec.title || "", this.rtlRun({})), { style: "Heading1", pageBreakBefore: pageBreak });
        body += this.blocks(sec.blocks, width, ctx);
        prevBreakWasSection = false;
      });
      body += this.sectPr(groupLandscape, first);

      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`;

      const hpRels = [], hlRels = [];
      const hdrP = this.header(pw, hpRels), hdrL = this.header(lw, hlRels);
      const relsXml = (list) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.join("")}</Relationships>`;
      const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
      const docRels = [
        `<Relationship Id="rIdStyles" Type="${R}styles" Target="styles.xml"/>`,
        `<Relationship Id="rIdNum" Type="${R}numbering" Target="numbering.xml"/>`,
        `<Relationship Id="rIdSettings" Type="${R}settings" Target="settings.xml"/>`,
        `<Relationship Id="rIdHP" Type="${R}header" Target="header1.xml"/>`,
        `<Relationship Id="rIdHL" Type="${R}header" Target="header2.xml"/>`,
        `<Relationship Id="rIdHF" Type="${R}header" Target="header3.xml"/>`,
        `<Relationship Id="rIdFP" Type="${R}footer" Target="footer1.xml"/>`,
        `<Relationship Id="rIdFL" Type="${R}footer" Target="footer2.xml"/>`,
        `<Relationship Id="rIdFF" Type="${R}footer" Target="footer3.xml"/>`,
        ...this.rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${x(r.target)}"${r.external ? ` TargetMode="External"` : ""}/>`)
      ];
      const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
      const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x((doc.cover && doc.cover.title) || doc.name || "SOP")}</dc:title><dc:creator>SOP Builder</dc:creator><dc:language>${this.rtl ? "ar-SA" : "en-US"}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
      const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>SOP Builder</Application></Properties>`;
      const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>${[1, 2, 3].map(i => `<Override PartName="/word/header${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

      const zip = new global.JSZip();
      zip.file("[Content_Types].xml", types);
      zip.file("_rels/.rels", relsXml([
        `<Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/>`,
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`,
        `<Relationship Id="rId3" Type="${R}extended-properties" Target="docProps/app.xml"/>`]));
      zip.file("docProps/core.xml", core);
      zip.file("docProps/app.xml", app);
      zip.file("word/document.xml", docXml);
      zip.file("word/_rels/document.xml.rels", relsXml(docRels));
      zip.file("word/styles.xml", this.styles());
      zip.file("word/numbering.xml", this.numbering());
      zip.file("word/settings.xml", settings);
      zip.file("word/header1.xml", hdrP);
      zip.file("word/header2.xml", hdrL);
      zip.file("word/header3.xml", this.wrap("hdr", "<w:p/>"));
      zip.file("word/footer1.xml", this.footer(pw));
      zip.file("word/footer2.xml", this.footer(lw));
      zip.file("word/footer3.xml", this.wrap("ftr", "<w:p/>"));
      zip.file("word/_rels/header1.xml.rels", relsXml(hpRels));
      zip.file("word/_rels/header2.xml.rels", relsXml(hlRels));
      for (const m of this.media) zip.file("word/media/" + m.name, m.data, { base64: true });
      return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
    }
  }

  global.SOPDocx = { build: doc => new Writer(doc).build(), parseInline, splitDir };
})(typeof window !== "undefined" ? window : globalThis);
