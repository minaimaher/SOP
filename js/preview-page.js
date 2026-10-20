/* SOP Builder – preview page: the Word document view of one manual, updated live from the builder tab. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const M = window.SOPModel, A = window.SOPAutomation;
  const id = new URLSearchParams(location.search).get("doc") || "";
  let current = null;

  function render(d) {
    current = M.normalize(d);
    const pv = $("paper"), main = $("ppMain"), top = main.scrollTop;
    document.title = (d.name || "SOP") + " – Preview";
    $("ppName").textContent = d.name || "Preview";
    pv.setAttribute("dir", d.settings.dir === "rtl" ? "rtl" : "ltr");
    pv.setAttribute("lang", d.settings.lang);
    pv.setAttribute("style", window.SOPPreview.themeVars(d) + `;font-family:'${(d.settings.font || "Calibri").replace(/'/g, "")}', ${d.settings.lang === "ar" ? "'IBM Plex Sans Arabic', " : ""}Carlito, 'IBM Plex Sans', system-ui, sans-serif`);
    pv.innerHTML = window.SOPPreview.render(d);
    $("ppEmpty").hidden = true;
    main.scrollTop = top;
    $("ppState").textContent = "Live · updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  const ch = "BroadcastChannel" in window ? new BroadcastChannel("sop-preview") : null;
  if (ch) {
    ch.onmessage = e => { if (e.data && e.data.type === "doc" && (!id || e.data.id === id)) render(e.data.doc); };
    ch.postMessage({ type: "ready", id });
    setTimeout(() => { if (!current) $("ppState").textContent = "The SOP Builder tab is not open. Open it and click Preview."; }, 1500);
  } else $("ppState").textContent = "This browser cannot show the live preview.";

  // As in the Word file: a row's Run button opens its desktop flow with the row's default values.
  $("paper").addEventListener("click", e => {
    const b = e.target.closest("[data-flow]");
    if (!b || !current) return;
    let table = null;
    const walk = l => (l || []).forEach(x => { if (x.id === b.dataset.flow) table = x; else if (x.blocks) walk(x.blocks); });
    current.sections.forEach(s => walk(s.blocks));
    const url = table && A.rowRunUrl(table, +b.dataset.row);
    if (url) A.openUrl(url);
  });

  const zoom = $("ppZoom");
  const applyZoom = () => { $("paper").style.zoom = zoom.value / 100; $("ppZoomOut").textContent = zoom.value + "%"; };
  try { const z = localStorage.getItem("sop-preview-zoom"); if (z) zoom.value = z; } catch (e) { /* none */ }
  zoom.addEventListener("input", () => { applyZoom(); try { localStorage.setItem("sop-preview-zoom", zoom.value); } catch (e) { /* none */ } });
  applyZoom();
  $("ppPrint").addEventListener("click", () => window.print());
})();
