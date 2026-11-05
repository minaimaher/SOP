/* SOP Builder – built-in starter templates (neutral content any organization can adapt).
 * Each one is built from the model's own parts, cards and tables, in English and Arabic. */
(function (global) {
  "use strict";
  const M = global.SOPModel;
  const { T, SECTIONS, CARDS } = M;
  const sec = key => SECTIONS.find(s => s.key === key);
  const card = (key, t, area, title) => { const c = CARDS.find(x => x.key === key).make(t, area); if (title) c.title = title; return c; };
  const table = (t, key) => { const [cols, rows] = t.tables[key]; return { type: "table", columns: [...cols], rows: M.clone(rows) }; };
  const h2 = text => ({ type: "heading", level: 2, text });
  const h3 = text => ({ type: "heading", level: 3, text });
  const steps = items => ({ type: "steps", items });
  const part = (t, title, blocks, extra) => ({ ...sec("sec-part").make(t), title, blocks, ...(extra || {}) });

  const L = {
    en: {
      itops: "IT operations manual (starter)", incident: "Incident response runbook (starter)", catalog: "Service request catalog (starter)",
      gov: "Part A — Governance (SOP-GOV)", inc: "Part B — Incidents (SOP-INC)", chg: "Part C — Change (SOP-CHG)", ops: "Part D — Operations (SOP-OPS)", req: "Part E — Service requests (SOP-REQ)",
      roles: "Roles and responsibilities", escalation: "Escalation", normalChange: "Normal change", emergency: "Emergency change",
      changeSteps: ["Raise the change request with scope, risk, test evidence and rollback plan.", "Get approval from the change advisory board (or the delegated approver).", "Deploy in the agreed window and record what was done.", "Verify with the business owner and close the request."],
      emergencySteps: ["Confirm the change is needed to restore service or close a security risk.", "Get verbal approval from the on-call approver and record who approved.", "Deploy, verify and monitor.", "Raise the retrospective change record within one working day."],
      monitoring: "Monitoring and routine checks", problems: "Problem management", runbook: "Runbook: symptom → fix → escalate", requestTypes: "Ticket types",
      itopsTitle: "IT operations", itopsSub: "Standard operating procedures", incidentTitle: "Incident response", catalogTitle: "Service request catalog"
    },
    ar: {
      itops: "دليل عمليات تقنية المعلومات (نموذج)", incident: "دليل الاستجابة للحوادث (نموذج)", catalog: "كتالوج طلبات الخدمة (نموذج)",
      gov: "الجزء A — الحوكمة (SOP-GOV)", inc: "الجزء B — الحوادث (SOP-INC)", chg: "الجزء C — التغيير (SOP-CHG)", ops: "الجزء D — العمليات (SOP-OPS)", req: "الجزء E — طلبات الخدمة (SOP-REQ)",
      roles: "الأدوار والمسؤوليات", escalation: "التصعيد", normalChange: "التغيير الاعتيادي", emergency: "التغيير الطارئ",
      changeSteps: ["افتح طلب التغيير مع النطاق والمخاطر وأدلة الاختبار وخطة التراجع.", "احصل على موافقة مجلس استشارات التغيير (أو المعتمِد المفوَّض).", "نفّذ النشر في النافذة المتفق عليها وسجّل ما تم.", "تحقّق مع مالك الأعمال وأغلق الطلب."],
      emergencySteps: ["تأكّد أن التغيير لازم لاستعادة الخدمة أو لإغلاق خطر أمني.", "احصل على موافقة شفهية من المعتمِد المناوب وسجّل اسمه.", "نفّذ وتحقّق وراقب.", "افتح سجل التغيير اللاحق خلال يوم عمل واحد."],
      monitoring: "المراقبة والفحوصات الدورية", problems: "إدارة المشكلات", runbook: "دليل التشغيل: العَرَض ← الإصلاح ← التصعيد", requestTypes: "أنواع التذاكر",
      itopsTitle: "عمليات تقنية المعلومات", itopsSub: "إجراءات التشغيل القياسية", incidentTitle: "الاستجابة للحوادث", catalogTitle: "كتالوج طلبات الخدمة"
    }
  };

  function base(lang, name, title, subtitle) {
    const d = M.newDoc(lang), t = T[lang];
    d.name = name;
    d.cover.title = title;
    if (subtitle) d.cover.subtitle = subtitle;
    d.sections = [sec("sec-control").make(t, d), sec("sec-about").make(t, d)];
    return d;
  }

  function itOps(lang) {
    const t = T[lang], l = L[lang], d = base(lang, l.itops, l.itopsTitle, l.itopsSub);
    d.sections.push(
      part(t, l.gov, [card("card-policy", t, "GOV", l.roles), { ...card("card-policy", t, "GOV", l.escalation), blocks: [table(t, "escalation")] }]),
      part(t, l.inc, [card("card-incident", t, "INC"), card("card-module", t, "INC")]),
      part(t, l.chg, [
        { ...card("card-blank", t, "CHG", l.normalChange), blocks: [h3(t.procedure), steps([...l.changeSteps]), h3(t.guidelines), { type: "bullets", items: [...t.guidelines] }] },
        { ...card("card-blank", t, "CHG", l.emergency), blocks: [h3(t.procedure), steps([...l.emergencySteps])] }]),
      part(t, l.ops, [{ ...card("card-policy", t, "OPS", l.monitoring), blocks: [table(t, "monitoring")] }]),
      part(t, l.req, [card("card-service", t, "REQ")]),
      sec("sec-catalog").make(t, d),
      sec("sec-appendix").make(t, d));
    d.sections[2].blocks[0].blocks.unshift(table(t, "raci"));
    return d;
  }

  function incident(lang) {
    const t = T[lang], l = L[lang], d = base(lang, l.incident, l.incidentTitle);
    d.settings.idPrefix = "IR";
    d.sections.push(
      part(t, l.inc, [
        card("card-incident", t, "INC"),
        { ...card("card-policy", t, "INC", l.escalation), blocks: [table(t, "escalation"), h3(t.procedure), steps([...t.steps.incident])] },
        { ...card("card-module", t, "INC", l.runbook) },
        { ...card("card-policy", t, "INC", l.problems), blocks: [table(t, "problems"), h2(t.guidelines), table(t, "closureIncident")] }]),
      sec("sec-appendix").make(t, d));
    return d;
  }

  function catalog(lang) {
    const t = T[lang], l = L[lang], d = base(lang, l.catalog, l.catalogTitle);
    d.settings.idPrefix = "SRV";
    const cat = sec("sec-catalog").make(t, d);
    cat.title = l.catalogTitle;
    cat.blocks = cat.blocks.slice(2);   // the service request catalog only
    d.sections.push(
      part(t, l.req, [card("card-service", t, "REQ"), { ...card("card-policy", t, "REQ", l.requestTypes), blocks: [table(t, "ticketTypes")] }]),
      cat,
      sec("sec-appendix").make(t, d));
    return d;
  }

  const list = global.SOP_PRESETS = global.SOP_PRESETS || [];
  for (const [key, make] of [["it-ops", itOps], ["incident", incident], ["service-catalog", catalog]]) {
    for (const lang of ["en", "ar"]) {
      const d = make(lang);   // ids are given when a manual is created from it
      list.push({ key: `${key}-${lang}`, name: d.name, settings: d.settings, cover: d.cover, sections: d.sections });
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
