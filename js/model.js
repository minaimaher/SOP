/* SOP Builder – document model, numbering and the library of items you can add. */
(function (global) {
  "use strict";

  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* Text used by new documents and by the item library, per document language. */
  const T = {
    en: {
      tocTitle: "Contents", pageLabel: "Page", ofLabel: "of",
      cardFields: ["SOP #", "Review date", "Responsibility", "Supervisor", "Trigger", "Evidence", "Description", "Related SOPs"],
      procedure: "Procedure", guidelines: "Guidelines", challenges: "Challenges:",
      newSection: "New part", newCard: "New procedure", subheading: "Sub-heading", heading: "Section heading",
      paragraph: "Write the paragraph here.", note: "Important: write the note here.",
      item: "Item", step: "Step", check: "Check item",
      cover: { eyebrow: "STANDARD OPERATING PROCEDURES", title: "System name", subtitle: "Operations manual", description: "Controls and procedures for operating, changing and protecting the system.",
        fields: [["Document", "SOP-001"], ["Version", "0.1 — Draft"], ["Classification", "Internal"], ["Owner", "Process owner"], ["Approved by", "—"], ["Date", ""]], footerLine: "Organisation · Department" },
      docControl: "Document control", about: "About this manual", appendices: "Appendices",
      inScope: "In scope", outScope: "Out of scope", howToRead: "How to read an SOP card",
      fieldMeaning: ["Field", "Meaning"],
      meanings: ["Unique ID: PREFIX-AREA-NN", "Date the card was last reviewed", "Role that performs the procedure", "Role accountable for the outcome and for keeping the card current", "Event that starts the procedure", "Records kept for audit", "One line on the purpose of the procedure", "Cards that come before, after or run alongside"],
      tables: {
        blank: [["Column 1", "Column 2", "Column 3"], [["", "", ""]]],
        fieldValue: [["Field", "Value"], [["SOP ID", ""], ["Version", ""], ["Classification", ""], ["Document owner", ""], ["Reviewed by", ""], ["Approved by", ""], ["Review cycle", "Annually, or after a major incident or platform upgrade"]]],
        revisions: [["Version", "Date", "Author", "Change"], [["0.1", "", "", "Initial draft"]]],
        severity: [["Severity", "Definition", "Response", "Resolution / workaround", "Notify"], [
          ["P1 — Critical", "Service down, data breach, or customer-facing service stopped", "15 min", "4 hours", "CIO, CISO, business heads"],
          ["P2 — High", "Major function or key integration broken for many users", "30 min", "8 hours", "Platform owner, business owner"],
          ["P3 — Medium", "Function degraded with a workaround", "4 hours", "3 business days", "Team lead"],
          ["P4 — Low", "Cosmetic or single-user issue", "1 business day", "10 business days", "Requester"]]],
        raci: [["Activity", "Platform owner", "Admin / Ops", "Developers", "Security", "Business owner"], [
          ["Approve production change", "A", "C", "C", "C", "C"], ["Grant user access", "A", "R", "—", "C", "R"], ["Respond to P1/P2 incidents", "A", "R", "R", "C", "I"]]],
        escalation: [["Level", "Team", "Handles"], [["L1", "Service desk", "Capture, known-error workarounds, user guidance"], ["L2", "Application operations", "Configuration, access, system jobs"], ["L3", "Developers, DBA, infrastructure", "Code defects, database, servers, integrations"], ["L4", "Vendor support", "Product defects"]]],
        runbook: [["Incident (as reported)", "Likely cause", "First checks", "Fix / workaround", "Escalate to"], [["", "", "", "", ""]]],
        monitoring: [["Frequency", "Check", "Owner", "Evidence"], [["Continuous", "Server health and service availability", "Infrastructure", "Alert ticket"], ["Daily", "Failed system jobs and integration queues", "Operations", "Operations log"], ["Monthly", "Privileged access review", "Information security", "Signed review"]]],
        closureIncident: [["Field", "What to write"], [["Description", "The problem in one sentence, in business terms"], ["Root cause", "The actual cause; if unknown, the linked problem record"], ["Issue type", "Data / Customization / Service"], ["Impacted customers", "Count with request numbers — no names or full IDs"], ["Fix", "What was done, including the fix row used"]]],
        ticketTypes: [["Ticket type", "Use when", "Examples"], [["Production Incident", "Something that worked has stopped, or data is wrong because of a system fault", ""], ["Service Request — access", "Someone needs access, a user, a role or whitelisting", ""], ["Service Request — modification", "A pre-approved routine change to data or configuration", ""], ["Change Request", "A new capability or a change to business rules", ""]]],
        problems: [["Problem", "Tickets", "Suspected root cause", "Proposed permanent fix", "Owner"], [["", "", "", "", ""]]],
        fixCatalog: [["Fix #", "Symptom reported", "Issue type", "Module", "Server / application", "Resolution steps", "Tool / function used", "Owner / escalate to"], [["FIX-01", "", "Data", "", "", "1) … 2) … 3) …", "None", ""]]],
        srvCatalog: [["Request #", "Service type", "Action type", "Application / server", "Module", "Tool / function", "Service steps", "Approver"], [["SRV-01", "", "", "", "", "None", "1) … 2) … 3) …", ""]]],
        moduleRegister: [["Module", "Purpose", "Main dependencies", "Criticality"], [["", "", "", "High"]]],
        glossary: [["Term", "Meaning"], [["KEDB", "Known-error database"], ["RACI", "Responsible, Accountable, Consulted, Informed"]]],
        contacts: [["Function", "Contact"], [["Service desk (L1)", "Ext. — / email —"], ["Operations on-call (L2)", "Phone — / mailbox —"]]]
      },
      steps: {
        incident: ["Log and classify the incident; page the on-call teams for server or database faults.", "Contain: disable the faulty component, pause the integration, or roll back.", "Communicate status every 30 minutes for P1 and every 2 hours for P2.", "Resolve and verify the fix with the business owner.", "P1/P2: root-cause analysis within 5 business days and a problem record with corrective actions."],
        service: ["The requester raises the request in the service portal with all required details attached.", "The approver approves before any work starts.", "Fulfil the request as a standard change.", "Verify the result with the requester.", "Close the ticket with the approval reference and evidence."],
        generic: ["First step", "Second step", "Third step"]
      },
      guidelines: ["Rule or do / don't note.", "Another rule."]
    },
    ar: {
      tocTitle: "المحتويات", pageLabel: "صفحة", ofLabel: "من",
      cardFields: ["رقم الإجراء", "تاريخ المراجعة", "المسؤولية", "المشرف", "المُحفِّز", "الأدلة", "الوصف", "الإجراءات ذات الصلة"],
      procedure: "الإجراء", guidelines: "الإرشادات", challenges: "التحديات:",
      newSection: "جزء جديد", newCard: "إجراء جديد", subheading: "عنوان فرعي", heading: "عنوان قسم",
      paragraph: "اكتب الفقرة هنا.", note: "مهم: اكتب الملاحظة هنا.",
      item: "بند", step: "خطوة", check: "عنصر تحقق",
      cover: { eyebrow: "دليل إجراءات التشغيل القياسية", title: "اسم النظام", subtitle: "دليل العمليات", description: "الضوابط والإجراءات لتشغيل النظام وتغييره وحمايته.",
        fields: [["الوثيقة", "SOP-001"], ["الإصدار", "0.1 — مسودة"], ["التصنيف", "داخلي"], ["المالك", "مالك الإجراء"], ["الاعتماد", "—"], ["التاريخ", ""]], footerLine: "الجهة · الإدارة" },
      docControl: "ضبط الوثيقة", about: "حول هذا الدليل", appendices: "الملاحق",
      inScope: "ضمن النطاق", outScope: "خارج النطاق", howToRead: "كيفية قراءة بطاقة الإجراء",
      fieldMeaning: ["الحقل", "المعنى"],
      meanings: ["معرّف فريد: PREFIX-AREA-NN", "تاريخ آخر مراجعة للبطاقة", "الدور الذي ينفّذ الإجراء", "الدور المساءَل عن النتيجة وعن تحديث البطاقة", "الحدث الذي يبدأ الإجراء", "السجلات المحفوظة لأغراض التدقيق", "سطر واحد يوضح الغرض من الإجراء", "البطاقات التي تسبقه أو تليه أو تُنفَّذ بالتوازي معه"],
      tables: {
        blank: [["عمود 1", "عمود 2", "عمود 3"], [["", "", ""]]],
        fieldValue: [["الحقل", "القيمة"], [["معرّف الإجراء", ""], ["الإصدار", ""], ["التصنيف", ""], ["مالك الوثيقة", ""], ["رُوجعت من قِبل", ""], ["اعتُمدت من قِبل", ""], ["دورة المراجعة", "سنويًا، أو بعد أي حادثة كبرى أو ترقية للمنصة"]]],
        revisions: [["الإصدار", "التاريخ", "المُعِد", "التغيير"], [["0.1", "", "", "المسودة الأولى"]]],
        severity: [["الخطورة", "التعريف", "الاستجابة", "الحل / الحل المؤقت", "الإبلاغ"], [
          ["P1 — حرجة", "توقف الخدمة، أو اختراق للبيانات، أو توقف خدمة موجّهة للعملاء", "15 دقيقة", "4 ساعات", "الرئيس التنفيذي للمعلومات، رئيس أمن المعلومات، رؤساء القطاعات"],
          ["P2 — عالية", "تعطّل وظيفة رئيسية أو تكامل أساسي لعدد كبير من المستخدمين", "30 دقيقة", "8 ساعات", "مالك المنصة، مالك الأعمال"],
          ["P3 — متوسطة", "تراجع أداء وظيفة مع وجود حل مؤقت", "4 ساعات", "3 أيام عمل", "قائد الفريق"],
          ["P4 — منخفضة", "مشكلة شكلية أو تخص مستخدمًا واحدًا", "يوم عمل واحد", "10 أيام عمل", "مقدّم الطلب"]]],
        raci: [["النشاط", "مالك المنصة", "مسؤول/عمليات", "المطورون", "أمن المعلومات", "مالك الأعمال"], [
          ["اعتماد تغيير في الإنتاج", "A", "C", "C", "C", "C"], ["منح وصول المستخدم", "A", "R", "—", "C", "R"], ["الاستجابة لحوادث P1/P2", "A", "R", "R", "C", "I"]]],
        escalation: [["المستوى", "الفريق", "يتولى"], [["L1", "مكتب الخدمة", "التوثيق، والحلول المؤقتة من KEDB، وإرشاد المستخدمين"], ["L2", "عمليات التطبيق", "الإعدادات، والوصول، ووظائف النظام"], ["L3", "المطورون، ومدير قواعد البيانات، والبنية التحتية", "عيوب الكود، وقواعد البيانات، والخوادم، والتكاملات"], ["L4", "دعم المورّد", "عيوب المنتج"]]],
        runbook: [["الحادثة (كما أُبلغ عنها)", "السبب المرجح", "الفحوصات الأولى", "الإصلاح / الحل المؤقت", "التصعيد إلى"], [["", "", "", "", ""]]],
        monitoring: [["التكرار", "الفحص", "المالك", "الأدلة"], [["مستمر", "سلامة الخوادم وتوافر الخدمات", "البنية التحتية", "تذكرة تنبيه"], ["يومي", "مهام النظام الفاشلة وطوابير التكامل", "العمليات", "سجل العمليات"], ["شهري", "مراجعة الوصول المميّز", "أمن المعلومات", "مراجعة موقّعة"]]],
        closureIncident: [["الحقل", "ما يُكتب"], [["الوصف", "المشكلة في جملة واحدة، بلغة الأعمال"], ["السبب الجذري", "السبب الفعلي؛ وإن كان غير معروف: رقم سجل المشكلة"], ["نوع المشكلة", "بيانات / تخصيص / خدمة"], ["العملاء المتأثرون", "العدد، مع أرقام الطلبات — دون أسماء أو أرقام هويات"], ["الإصلاح", "ما تم تنفيذه، بما في ذلك صف الإصلاح المستخدم"]]],
        ticketTypes: [["نوع التذكرة", "يُستخدم عندما", "أمثلة"], [["Production Incident", "توقّف شيء كان يعمل، أو أصبحت البيانات غير صحيحة بسبب عطل في النظام", ""], ["Service Request — access", "يحتاج شخص إلى صلاحية وصول أو مستخدم أو دور", ""], ["Service Request — modification", "تغيير روتيني معتمد مسبقًا على البيانات أو الإعدادات", ""], ["Change Request", "قدرة جديدة أو تغيير في قواعد العمل", ""]]],
        problems: [["المشكلة", "التذاكر", "السبب الجذري المحتمل", "الإصلاح الدائم المقترح", "المالك"], [["", "", "", "", ""]]],
        fixCatalog: [["رقم الإصلاح", "العَرَض المُبلَّغ عنه", "نوع المشكلة", "الوحدة", "الخادم / التطبيق", "خطوات الحل", "الأداة / الدالة المستخدمة", "المالك / التصعيد إلى"], [["FIX-01", "", "بيانات", "", "", "1) … 2) … 3) …", "لا يوجد", ""]]],
        srvCatalog: [["رقم الطلب", "نوع الخدمة", "نوع الإجراء", "التطبيق / الخادم", "الوحدة", "الأداة / الدالة", "خطوات الخدمة", "المعتمِد"], [["SRV-01", "", "", "", "", "لا يوجد", "1) … 2) … 3) …", ""]]],
        moduleRegister: [["الوحدة", "الغرض", "الاعتماديات الرئيسية", "مستوى الأهمية"], [["", "", "", "عالٍ"]]],
        glossary: [["المصطلح", "المعنى"], [["KEDB", "قاعدة بيانات الأخطاء المعروفة"], ["RACI", "المنفِّذ، المساءَل، المُستشار، المُبلَّغ"]]],
        contacts: [["الجهة", "وسيلة الاتصال"], [["مكتب الخدمة (L1)", "التحويلة — / البريد الإلكتروني —"], ["فريق العمليات المناوب (L2)", "الهاتف — / صندوق البريد —"]]]
      },
      steps: {
        incident: ["سجّل الحادثة وصنّفها؛ واستدعِ الفرق المناوبة لأي عطل في الخوادم أو قواعد البيانات.", "الاحتواء: عطّل المكوّن المعيب، أو أوقف التكامل مؤقتًا، أو نفّذ التراجع.", "أبلغ عن الحالة كل 30 دقيقة لحوادث P1، وكل ساعتين لحوادث P2.", "احلّ الحادثة وتحقّق من الحل مع مالك الأعمال.", "حوادث P1/P2: تحليل السبب الجذري خلال 5 أيام عمل، وفتح سجل مشكلة يتضمن الإجراءات التصحيحية."],
        service: ["يرفع مقدّم الطلب الطلب في بوابة الخدمة مع إرفاق جميع التفاصيل المطلوبة.", "يعتمد المعتمِد الطلب قبل البدء في أي خطوة.", "نفّذ الطلب بوصفه تغييرًا قياسيًا.", "تحقّق من النتيجة مع مقدّم الطلب.", "أغلق التذكرة مع مرجع الاعتماد والأدلة."],
        generic: ["الخطوة الأولى", "الخطوة الثانية", "الخطوة الثالثة"]
      },
      guidelines: ["قاعدة أو ملاحظة لما يجب وما لا يجب فعله.", "قاعدة أخرى."]
    }
  };
  const tx = doc => T[(doc && doc.settings && doc.settings.lang) === "ar" ? "ar" : "en"];

  const CARD_KEYS = ["id", "review", "responsible", "supervisor", "trigger", "evidence", "description", "related"];
  const AREAS = {
    en: [["GOV", "Governance"], ["ACC", "Access"], ["CHG", "Change"], ["OPS", "Operations"], ["INC", "Incidents"], ["REQ", "Service requests"]],
    ar: [["GOV", "الحوكمة"], ["ACC", "الوصول"], ["CHG", "التغيير"], ["OPS", "العمليات"], ["INC", "الحوادث"], ["REQ", "طلبات الخدمة"]]
  };

  function table(t, key, extra) {
    const [cols, rows] = t.tables[key];
    return { type: "table", columns: [...cols], rows: clone(rows), ...(extra || {}) };
  }

  /* ---------- items you can add inside a part or a card ---------- */
  const BLOCKS = [
    { key: "heading3", group: "Text", label: "Sub-heading", make: t => ({ type: "heading", level: 3, text: t.subheading }) },
    { key: "heading2", group: "Text", label: "Section heading (shown in contents)", make: t => ({ type: "heading", level: 2, text: t.heading }) },
    { key: "paragraph", group: "Text", label: "Paragraph", make: t => ({ type: "paragraph", text: t.paragraph }) },
    { key: "note", group: "Text", label: "Highlighted note", make: t => ({ type: "note", text: t.note }) },
    { key: "bullets", group: "Lists", label: "Bullet list", make: t => ({ type: "bullets", items: [t.item, t.item] }) },
    { key: "steps", group: "Lists", label: "Numbered steps", make: t => ({ type: "steps", items: [...t.steps.generic] }) },
    { key: "checklist", group: "Lists", label: "Checklist (☐)", make: t => ({ type: "checklist", items: [t.check, t.check] }) },
    { key: "procedure", group: "Lists", label: "Procedure (heading + steps)", make: t => [{ type: "heading", level: 3, text: t.procedure }, { type: "steps", items: [...t.steps.generic] }] },
    { key: "guidelines", group: "Lists", label: "Guidelines (heading + bullets)", make: t => [{ type: "heading", level: 3, text: t.guidelines }, { type: "bullets", items: [...t.guidelines] }] },
    { key: "table", group: "Tables", label: "Blank table", make: t => table(t, "blank") },
    { key: "severity", group: "Tables", label: "Severity matrix (P1–P4)", make: t => table(t, "severity") },
    { key: "raci", group: "Tables", label: "RACI matrix", make: t => table(t, "raci") },
    { key: "escalation", group: "Tables", label: "Escalation levels (L1–L4)", make: t => table(t, "escalation") },
    { key: "runbook", group: "Tables", label: "Runbook (incident → fix → escalate)", make: t => table(t, "runbook") },
    { key: "monitoring", group: "Tables", label: "Monitoring calendar", make: t => table(t, "monitoring") },
    { key: "ticketTypes", group: "Tables", label: "Ticket type rules", make: t => table(t, "ticketTypes") },
    { key: "closureIncident", group: "Tables", label: "Closure template fields", make: t => table(t, "closureIncident") },
    { key: "problems", group: "Tables", label: "Problem register", make: t => table(t, "problems") },
    { key: "moduleRegister", group: "Tables", label: "Module register", make: t => table(t, "moduleRegister") },
    { key: "fixCatalog", group: "Tables", label: "Production fix catalog (wide)", make: t => table(t, "fixCatalog") },
    { key: "srvCatalog", group: "Tables", label: "Service request catalog (wide)", make: t => table(t, "srvCatalog") },
    { key: "fieldValue", group: "Tables", label: "Document control fields", make: t => table(t, "fieldValue") },
    { key: "revisions", group: "Tables", label: "Revision history", make: t => table(t, "revisions") },
    { key: "glossary", group: "Tables", label: "Glossary", make: t => table(t, "glossary") },
    { key: "contacts", group: "Tables", label: "Contacts", make: t => table(t, "contacts") },
    { key: "image", group: "Other", label: "Image / diagram", make: () => ({ type: "image", src: "", width: 6, ratio: 0.75, caption: "" }) },
    { key: "pagebreak", group: "Other", label: "Page break", make: () => ({ type: "pagebreak" }) }
  ];

  /* ---------- procedure cards ---------- */
  const CARDS = [
    { key: "card-blank", label: "Procedure card", make: (t, area) => ({ type: "card", area, number: "", title: t.newCard, fields: {}, blocks: [
      { type: "heading", level: 3, text: t.procedure }, { type: "steps", items: [...t.steps.generic] },
      { type: "heading", level: 3, text: t.guidelines }, { type: "bullets", items: [...t.guidelines] }] }) },
    { key: "card-incident", label: "Production incident card", make: (t, area) => ({ type: "card", area, number: "", title: t === T.ar ? "إدارة الحوادث ودرجات الخطورة" : "Incident management and severity", fields: {}, blocks: [
      table(t, "severity"), { type: "heading", level: 3, text: t.procedure }, { type: "steps", items: [...t.steps.incident] },
      { type: "heading", level: 3, text: t.guidelines }, { type: "bullets", items: [...t.guidelines] }] }) },
    { key: "card-service", label: "Service request card", make: (t, area) => ({ type: "card", area, number: "", title: t === T.ar ? "طلب خدمة" : "Service request", fields: {}, blocks: [
      { type: "heading", level: 3, text: t.procedure }, { type: "steps", items: [...t.steps.service] },
      { type: "heading", level: 3, text: t.guidelines }, { type: "bullets", items: [...t.guidelines] }] }) },
    { key: "card-module", label: "Module runbook card", make: (t, area) => ({ type: "card", area, number: "", title: t === T.ar ? "اسم الوحدة" : "Module name", fields: {}, blocks: [
      { type: "paragraph", text: `**${t.challenges}** …` }, table(t, "runbook")] }) },
    { key: "card-policy", label: "Policy / guidelines card", make: (t, area) => ({ type: "card", area, number: "", title: t.newCard, fields: {}, blocks: [
      { type: "paragraph", text: t.paragraph }, { type: "heading", level: 3, text: t.guidelines }, { type: "bullets", items: [...t.guidelines] }] }) }
  ];

  /* ---------- parts (top-level sections) ---------- */
  const SECTIONS = [
    { key: "sec-part", label: "Part with procedure cards", make: t => ({ type: "section", title: t.newSection, pageBreak: true, landscape: false, blocks: [] }) },
    { key: "sec-control", label: "Document control", make: t => ({ type: "section", title: t.docControl, pageBreak: false, landscape: false, blocks: [table(t, "fieldValue"), table(t, "revisions")] }) },
    { key: "sec-about", label: "About this manual", make: (t, doc) => ({ type: "section", title: t.about, pageBreak: false, landscape: false, blocks: [
      { type: "paragraph", text: t.paragraph },
      { type: "heading", level: 3, text: t.inScope }, { type: "bullets", items: [t.item] },
      { type: "heading", level: 3, text: t.outScope }, { type: "bullets", items: [t.item] },
      { type: "heading", level: 2, text: t.howToRead },
      { type: "table", columns: [...t.fieldMeaning], rows: (doc.settings.cardFields || []).map((f, i) => [f.label, t.meanings[i] || ""]) }] }) },
    { key: "sec-catalog", label: "Catalog (landscape pages)", make: t => ({ type: "section", title: t === T.ar ? "إصلاحات الإنتاج وطلبات الخدمة" : "Production fixes and service requests", pageBreak: true, landscape: true, blocks: [
      { type: "heading", level: 2, text: t === T.ar ? "فهرس الإصلاحات" : "Fix index" }, table(t, "fixCatalog"),
      { type: "heading", level: 2, text: t === T.ar ? "كتالوج طلبات الخدمة" : "Service request catalog" }, table(t, "srvCatalog")] }) },
    { key: "sec-appendix", label: "Appendices", make: t => ({ type: "section", title: t.appendices, pageBreak: true, landscape: false, blocks: [
      { type: "heading", level: 2, text: t === T.ar ? "المصطلحات" : "Glossary" }, table(t, "glossary"),
      { type: "heading", level: 2, text: t === T.ar ? "جهات الاتصال" : "Contacts" }, table(t, "contacts")] }) }
  ];

  function newDoc(lang) {
    const t = T[lang === "ar" ? "ar" : "en"];
    const doc = {
      id: uid(), name: lang === "ar" ? "دليل إجراءات جديد" : "New SOP manual",
      settings: {
        lang: lang === "ar" ? "ar" : "en", dir: lang === "ar" ? "rtl" : "ltr", font: "Calibri", csFont: "Arial",
        colors: { primary: "08395C", text: "1E2A33", muted: "5A6B78", band: "E8EEF3", zebra: "F4F7FA", border: "C9D3DC", link: "1F6FB2" },
        idPrefix: "SOP", areas: AREAS[lang === "ar" ? "ar" : "en"].map(([code, name]) => ({ code, name })),
        cardFields: t.cardFields.map((label, i) => ({ key: CARD_KEYS[i], label })),
        tocTitle: t.tocTitle, includeToc: true, headerText: "", headerLogo: true, footerText: "",
        pageLabel: t.pageLabel, ofLabel: t.ofLabel
      },
      cover: { logo: "", logoWidth: 2.2, logoRatio: 0.32, eyebrow: t.cover.eyebrow, title: t.cover.title, subtitle: t.cover.subtitle, description: t.cover.description,
        fields: t.cover.fields.map(([label, value]) => ({ label, value })), footerLine: t.cover.footerLine },
      sections: []
    };
    doc.sections.push(SECTIONS.find(s => s.key === "sec-control").make(t, doc));
    doc.sections.push(SECTIONS.find(s => s.key === "sec-about").make(t, doc));
    const partA = SECTIONS[0].make(t, doc);
    partA.title = lang === "ar" ? "الجزء A — الحوادث (SOP-INC)" : "Part A — Incidents (SOP-INC)";
    partA.blocks.push(CARDS.find(c => c.key === "card-incident").make(t, "INC"));
    const partB = SECTIONS[0].make(t, doc);
    partB.title = lang === "ar" ? "الجزء B — طلبات الخدمة (SOP-REQ)" : "Part B — Service requests (SOP-REQ)";
    partB.blocks.push(CARDS.find(c => c.key === "card-service").make(t, "REQ"));
    doc.sections.push(partA, partB, SECTIONS.find(s => s.key === "sec-appendix").make(t, doc));
    return normalize(doc);
  }

  /* Give every section/block a stable id (used by the editor) and fill missing settings. */
  function normalize(doc) {
    doc.id = doc.id || uid();
    const base = newDocSettings(doc.settings && doc.settings.lang);
    doc.settings = { ...base, ...(doc.settings || {}), colors: { ...base.colors, ...((doc.settings || {}).colors || {}) } };
    doc.cover = { fields: [], ...(doc.cover || {}) };
    const walk = list => (list || []).forEach(b => {
      b.id = b.id || uid();
      if (b.type === "card") { b.fields = b.fields || {}; b.blocks = b.blocks || []; walk(b.blocks); }
    });
    (doc.sections || []).forEach(s => { s.id = s.id || uid(); s.blocks = s.blocks || []; walk(s.blocks); });
    return doc;
  }
  function newDocSettings(lang) {
    const t = T[lang === "ar" ? "ar" : "en"];
    return {
      lang: lang === "ar" ? "ar" : "en", dir: lang === "ar" ? "rtl" : "ltr", font: "Calibri", csFont: "Arial",
      colors: { primary: "08395C", text: "1E2A33", muted: "5A6B78", band: "E8EEF3", zebra: "F4F7FA", border: "C9D3DC", link: "1F6FB2" },
      idPrefix: "SOP", areas: [], cardFields: t.cardFields.map((label, i) => ({ key: CARD_KEYS[i], label })),
      tocTitle: t.tocTitle, includeToc: true, headerText: "", headerLogo: true, footerText: "", pageLabel: t.pageLabel, ofLabel: t.ofLabel
    };
  }

  /* Card number: the card's own number if set, otherwise the next number in its area (01, 02 …). */
  function cardId(doc, card) {
    const prefix = (doc.settings.idPrefix || "").trim();
    const counters = {};
    for (const s of doc.sections || []) for (const b of s.blocks || []) {
      if (b.type !== "card") continue;
      const area = b.area || "";
      let n = String(b.number || "").trim();
      if (!n) {
        counters[area] = (counters[area] || 0) + 1;
        n = String(counters[area]).padStart(2, "0");
      } else if (/^\d+$/.test(n)) counters[area] = Math.max(counters[area] || 0, +n);
      if (b === card) return [prefix, area, n].filter(Boolean).join("-");
    }
    return [prefix, card.area, card.number].filter(Boolean).join("-");
  }

  function presets() {
    return (global.SOP_PRESETS || []).map(p => ({ key: p.key, name: p.name }));
  }
  function fromPreset(key) {
    const p = (global.SOP_PRESETS || []).find(x => x.key === key);
    if (!p) return null;
    const d = clone(p);
    d.id = uid();
    d.name = p.name;
    return normalize(d);
  }

  global.SOPModel = { T, tx, BLOCKS, CARDS, SECTIONS, CARD_KEYS, newDoc, normalize, cardId, presets, fromPreset, uid, clone };
})(typeof window !== "undefined" ? window : globalThis);
