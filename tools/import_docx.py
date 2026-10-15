#!/usr/bin/env python3
"""Convert an SOP manual .docx into an SOP Builder preset.

Usage:
    python3 tools/import_docx.py INPUT.docx OUTPUT.js --name "Preset name" [--key preset-key]

The importer understands manuals laid out like IT-CRM-SOP-001: a cover page, a
table of contents, Heading 1 parts, Heading 2 procedure cards named
"<PREFIX>-<AREA>-<NN> · <title>" followed by a 4-column header table, Sub Label
headings, bullet / numbered / checkbox lists, tables and images. Anything it
does not recognise is kept as a plain paragraph.
"""
import argparse
import base64
import json
import re
import sys
import zipfile
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
NS = {"w": W, "r": R, "a": A, "wp": WP}
EMU_PER_IN = 914400
CARD_RE = re.compile(r"^([A-Z][A-Z0-9]*)-([A-Z]{2,})-([0-9][0-9.]*)\s*·\s*(.*)$")
CARD_KEYS = ["id", "review", "responsible", "supervisor", "trigger", "evidence", "description", "related"]


def q(tag):
    p, t = tag.split(":")
    return "{%s}%s" % (NS[p], t)


def is_on(el):
    if el is None:
        return False
    v = el.get(q("w:val"))
    return v not in ("false", "0", "off")


class Docx:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.doc = etree.fromstring(self.z.read("word/document.xml"))
        self.rels = self._rels("word/_rels/document.xml.rels")
        self.numbering = self._numbering()

    def _rels(self, name):
        try:
            x = etree.fromstring(self.z.read(name))
        except KeyError:
            return {}
        return {r.get("Id"): (r.get("Target"), r.get("TargetMode")) for r in x}

    def _numbering(self):
        try:
            x = etree.fromstring(self.z.read("word/numbering.xml"))
        except KeyError:
            return {}
        abstract = {}
        for an in x.findall(q("w:abstractNum")):
            lvl = an.find(q("w:lvl"))
            fmt = lvl.find(q("w:numFmt")).get(q("w:val")) if lvl is not None and lvl.find(q("w:numFmt")) is not None else "bullet"
            txt = lvl.find(q("w:lvlText")).get(q("w:val")) if lvl is not None and lvl.find(q("w:lvlText")) is not None else ""
            abstract[an.get(q("w:abstractNumId"))] = "steps" if fmt == "decimal" else ("checklist" if txt == "☐" else "bullets")
        out = {}
        for n in x.findall(q("w:num")):
            out[n.get(q("w:numId"))] = abstract.get(n.find(q("w:abstractNumId")).get(q("w:val")), "bullets")
        return out

    def image(self, rid):
        target, _ = self.rels.get(rid, (None, None))
        if not target:
            return None
        data = self.z.read("word/" + target.lstrip("/").replace("word/", ""))
        ext = target.rsplit(".", 1)[-1].lower()
        mime = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "gif": "gif"}.get(ext, "png")
        return "data:image/%s;base64,%s" % (mime, base64.b64encode(data).decode())

    def header_footer_text(self, kind):
        for rid, (target, _) in self.rels.items():
            if target.startswith(kind) and target.endswith(".xml"):
                x = etree.fromstring(self.z.read("word/" + target))
                cells = x.findall(".//" + q("w:tc"))
                if cells:
                    texts = ["".join(t.text or "" for t in c.iter(q("w:t"))).strip() for c in cells]
                else:  # one paragraph with the parts separated by tab stops
                    texts = [t.strip() for p in x.iter(q("w:p")) for t in "".join(run_text(r) for r in p.iter(q("w:r"))).split("\t")]
                    texts = [t for t in texts if t]
                if any(texts):
                    return texts
        return []


def run_text(r):
    out = []
    for c in r:
        if c.tag == q("w:t"):
            out.append(c.text or "")
        elif c.tag == q("w:tab"):
            out.append("\t")
        elif c.tag in (q("w:br"), q("w:cr")) and c.get(q("w:type")) != "page":
            out.append("\n")
    return "".join(out)


def inline_markup(p, d):
    """Paragraph -> mini-markup string (**bold**, `code`, [text](url))."""
    segs = []  # (text, bold, code, link)

    def add_run(r, link=None):
        t = run_text(r)
        if not t:
            return
        rpr = r.find(q("w:rPr"))
        bold = code = False
        if rpr is not None:
            bold = is_on(rpr.find(q("w:b")))
            f = rpr.find(q("w:rFonts"))
            code = f is not None and (f.get(q("w:ascii")) or "").lower().startswith("consolas")
        segs.append([t, bold, code, link])

    for c in p:
        if c.tag == q("w:r"):
            add_run(c)
        elif c.tag == q("w:hyperlink"):
            target = d.rels.get(c.get(q("r:id")), (None, None))[0]
            for r in c.iter(q("w:r")):
                add_run(r, target)
    merged = []
    for s in segs:
        if merged and merged[-1][1:] == s[1:]:
            merged[-1][0] += s[0]
        else:
            merged.append(s)
    out = []
    for t, bold, code, link in merged:
        if code:
            t = "`%s`" % t
        if link:
            t = "[%s](%s)" % (t, link)
        if bold and t.strip():
            lead = t[: len(t) - len(t.lstrip())]
            trail = t[len(t.rstrip()):]
            t = "%s**%s**%s" % (lead, t.strip(), trail)
        out.append(t)
    return "".join(out).strip()


def plain(p):
    return "".join(run_text(r) for r in p.iter(q("w:r"))).strip()


def p_style(p):
    s = p.find("w:pPr/w:pStyle", NS)
    return s.get(q("w:val")) if s is not None else ""


def table_rows(tbl, d):
    rows = []
    for tr in tbl.findall(q("w:tr")):
        cells = []
        for tc in tr.findall(q("w:tc")):
            paras = [inline_markup(p, d) for p in tc.findall(q("w:p"))]
            cells.append("\n".join(x for x in paras if x))
        is_head = tr.find("w:trPr/w:tblHeader", NS) is not None
        rows.append((cells, is_head))
    return rows


def table_widths(tbl):
    return [int(g.get(q("w:w"))) for g in tbl.findall("w:tblGrid/w:gridCol", NS)]


def image_block(p, d):
    blip = p.find(".//a:blip", NS)
    if blip is None:
        return None
    ext = p.find(".//wp:extent", NS)
    cx, cy = int(ext.get("cx")), int(ext.get("cy"))
    doc_pr = p.find(".//wp:docPr", NS)
    return {
        "type": "image",
        "src": d.image(blip.get(q("r:embed"))),
        "width": round(cx / EMU_PER_IN, 2),
        "ratio": round(cy / cx, 4),
        "alt": (doc_pr.get("descr") or doc_pr.get("name") or "") if doc_pr is not None else "",
    }


def convert(path, name, key):
    d = Docx(path)
    body = d.doc.find(q("w:body"))
    rtl = body.find(".//w:bidi", NS) is not None
    cover = {"logo": "", "logoWidth": 2.7, "eyebrow": "", "title": "", "subtitle": "", "description": "", "fields": [], "footerLine": ""}
    settings = {}
    sections = []
    state = "cover"
    cover_texts = []
    sec = None          # current section
    card = None         # current card block
    pending_card_header = False
    pending_sections = []  # sections waiting for their sectPr (orientation)
    last_list = None
    card_labels = None

    def target():
        return card["blocks"] if card is not None else sec["blocks"]

    def close_orientation(sect_pr):
        pg = sect_pr.find(q("w:pgSz")) if sect_pr is not None else None
        land = pg is not None and pg.get(q("w:orient")) == "landscape"
        for s in pending_sections:
            s["landscape"] = land
        pending_sections.clear()

    for el in body:
        if el.tag == q("w:sectPr"):
            close_orientation(el)
            continue
        if el.tag == q("w:p"):
            style = p_style(el)
            sect_pr = el.find("w:pPr/w:sectPr", NS)
            img = image_block(el, d)
            text = inline_markup(el, d)

            if state == "cover":
                if style == "TocTitle":
                    settings["tocTitle"] = plain(el)
                    state = "toc"
                elif img:
                    cover["logo"], cover["logoWidth"], cover["logoRatio"] = img["src"], img["width"], img["ratio"]
                elif text:
                    cover_texts.append(plain(el))
                if sect_pr is not None:
                    close_orientation(sect_pr)
                continue
            if state == "toc" and style != "Heading1":
                continue

            if style == "Heading1":
                state = "body"
                card = None
                last_list = None
                sec = {"type": "section", "title": plain(el), "blocks": [],
                       "pageBreak": el.find("w:pPr/w:pageBreakBefore", NS) is not None, "landscape": False}
                sections.append(sec)
                pending_sections.append(sec)
            elif style == "Heading2":
                last_list = None
                m = CARD_RE.match(plain(el))
                if m:
                    settings.setdefault("idPrefix", m.group(1))
                    card = {"type": "card", "area": m.group(2), "number": m.group(3), "title": m.group(4).strip(),
                            "fields": {}, "blocks": []}
                    sec["blocks"].append(card)
                    pending_card_header = True
                else:
                    card = None
                    sec["blocks"].append({"type": "heading", "level": 2, "text": plain(el)})
            elif style == "SubLabel":
                last_list = None
                target().append({"type": "heading", "level": 3, "text": plain(el)})
            elif img:
                last_list = None
                target().append(img)
            elif el.find("w:pPr/w:numPr", NS) is not None and text:
                num_id = el.find("w:pPr/w:numPr/w:numId", NS).get(q("w:val"))
                kind = d.numbering.get(num_id, "bullets")
                blocks = target()
                if last_list is not None and last_list["_num"] == num_id and blocks and blocks[-1] is last_list:
                    last_list["items"].append(text)
                else:
                    last_list = {"type": kind, "items": [text], "_num": num_id}
                    blocks.append(last_list)
            elif text:
                last_list = None
                target().append({"type": "paragraph", "text": text})
            if sect_pr is not None:
                close_orientation(sect_pr)
            continue

        if el.tag == q("w:tbl"):
            last_list = None
            rows = table_rows(el, d)
            if state == "cover":
                cover["fields"] = [{"label": r[0][0].replace("**", ""), "value": r[0][1] if len(r[0]) > 1 else ""} for r in rows]
                continue
            if state != "body":
                continue
            if pending_card_header and card is not None:
                pending_card_header = False
                labels = []
                values = []
                for cells, _ in rows:
                    for i in range(0, len(cells) - 1, 2):
                        labels.append(cells[i].replace("**", ""))
                        values.append(cells[i + 1].replace("**", ""))
                if card_labels is None:
                    card_labels = labels
                for i, v in enumerate(values):
                    k = CARD_KEYS[i] if i < len(CARD_KEYS) else "f%d" % i
                    if k != "id":
                        card["fields"][k] = v
                continue
            head = rows and rows[0][1]
            cols = [c.replace("**", "") for c in rows[0][0]] if head else []
            body_rows = rows[1:] if head else rows
            target().append({"type": "table", "columns": cols, "rows": [r[0] for r in body_rows],
                             "widths": table_widths(el)})

    for s in sections:
        for b in s["blocks"]:
            b.pop("_num", None)
            for c in b.get("blocks", []):
                c.pop("_num", None)

    # cover texts: eyebrow, title, subtitle, description, footer line
    ct = cover_texts + [""] * 5
    cover["eyebrow"], cover["title"], cover["subtitle"], cover["description"] = ct[0], ct[1], ct[2], ct[3]
    cover["footerLine"] = cover_texts[4] if len(cover_texts) > 4 else ""

    # areas from the "how to read" table, e.g. "GOV Governance, ACC Access" / "GOV الحوكمة، ACC الوصول"
    areas = []
    blob = json.dumps(sections, ensure_ascii=False)
    m = re.search(r"((?:[A-Z]{3}\s+[^,،\"\\]+[,،]\s*){4,}[A-Z]{3}\s+[^,،\"\\.]+)", blob)
    if m:
        for code, label in re.findall(r"([A-Z]{3})\s+([^,،]+)", m.group(1)):
            areas.append({"code": code, "name": label.strip()})
    used = []
    for s in sections:
        for b in s["blocks"]:
            if b["type"] == "card" and b["area"] not in used:
                used.append(b["area"])
    for code in used:
        if code not in [a["code"] for a in areas]:
            areas.append({"code": code, "name": ""})

    head_txt = d.header_footer_text("header")
    foot_txt = d.header_footer_text("footer")
    page_words = re.findall(r"[^\d\s]+", foot_txt[1]) if len(foot_txt) > 1 else []
    labels = card_labels or []
    settings.update({
        "lang": "ar" if rtl else "en",
        "dir": "rtl" if rtl else "ltr",
        "font": "Calibri",
        "colors": {"primary": "08395C", "text": "1E2A33", "muted": "5A6B78", "band": "E8EEF3",
                   "zebra": "F4F7FA", "border": "C9D3DC", "link": "1F6FB2"},
        "idPrefix": settings.get("idPrefix", "SOP"),
        "areas": areas,
        "cardFields": [{"key": CARD_KEYS[i], "label": l} for i, l in enumerate(labels[:len(CARD_KEYS)])],
        "headerText": head_txt[0] if head_txt else "",
        "headerLogo": True,
        "footerText": foot_txt[0] if foot_txt else "",
        "pageLabel": page_words[0] if page_words else ("صفحة" if rtl else "Page"),
        "ofLabel": page_words[1] if len(page_words) > 1 else ("من" if rtl else "of"),
        "includeToc": True,
    })
    return {"key": key, "name": name, "settings": settings, "cover": cover, "sections": sections}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--name", required=True)
    ap.add_argument("--key", default=None)
    a = ap.parse_args()
    data = convert(a.input, a.name, a.key or re.sub(r"\W+", "-", a.name.lower()).strip("-"))
    js = "window.SOP_PRESETS = window.SOP_PRESETS || [];\nwindow.SOP_PRESETS.push(%s);\n" % json.dumps(data, ensure_ascii=False)
    open(a.output, "w", encoding="utf-8").write(js)
    n_cards = sum(1 for s in data["sections"] for b in s["blocks"] if b["type"] == "card")
    print("sections=%d cards=%d areas=%s size=%dKB" % (len(data["sections"]), n_cards,
          ",".join(x["code"] for x in data["settings"]["areas"]), len(js) // 1024), file=sys.stderr)


if __name__ == "__main__":
    main()
