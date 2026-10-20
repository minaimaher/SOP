/* SOP Builder – Power Automate links.
 *
 * An "automation" item on a procedure card holds a flow link and a list of parameters.
 * The SOP page shows a small form and a Run button:
 *   cloud   – Power Automate cloud flow with the trigger "When an HTTP request is received":
 *             the values are POSTed as JSON (plus SOP details if enabled).
 *   desktop – Power Automate Desktop run URL (ms-powerautomate:/console/flow/run?...):
 *             the values are added as inputArguments and the link is opened.
 *   link    – any other address with {parameterName} placeholders, opened in a new tab.
 */
(function (global) {
  "use strict";

  const KINDS = ["cloud", "desktop", "link"];
  const TYPES = ["text", "number", "date", "yesno", "choice"];

  /** Converts a typed value to what the flow receives. */
  function coerce(param, raw) {
    if (param.type === "yesno") return raw === true || raw === "true";
    const s = raw == null ? "" : String(raw).trim();
    if (param.type === "number") return s === "" ? null : Number(s);
    return s;
  }

  const isEmpty = (param, v) => param.type === "yesno" ? false : v == null || v === "" || (typeof v === "number" && isNaN(v));

  /** Returns a list of problems (empty when the values can be sent). `t` gives the messages in the page language. */
  function validate(block, raw, t) {
    const problems = [];
    if (!String(block.url || "").trim()) problems.push(t.noUrl);
    for (const p of block.params || []) {
      if (!p.name) continue;
      const v = coerce(p, raw[p.name]);
      if (p.required && isEmpty(p, v)) problems.push(t.required.replace("{0}", p.label || p.name));
      else if (p.type === "number" && v !== null && isNaN(v)) problems.push(t.number.replace("{0}", p.label || p.name));
    }
    if (block.kind === "desktop" && block.url && !/^ms-powerautomate:/i.test(block.url.trim())) problems.push(t.desktopUrl);
    if (block.kind === "cloud" && block.url && !/^https:\/\//i.test(block.url.trim())) problems.push(t.cloudUrl);
    return problems;
  }

  /** The values as an object keyed by parameter name. */
  function values(block, raw) {
    const out = {};
    for (const p of block.params || []) if (p.name) out[p.name] = coerce(p, raw[p.name]);
    return out;
  }

  /** Power Automate Desktop run URL with inputArguments (replaces any inputArguments already in the link). */
  function desktopUrl(block, raw) {
    let url = String(block.url || "").trim();
    url = url.replace(/([?&])inputArguments=[^&]*(&|$)/i, (m, a, b) => (b ? a : "")).replace(/[?&]$/, "");
    const args = values(block, raw);
    if (!Object.keys(args).length) return url;
    return url + (url.includes("?") ? "&" : "?") + "inputArguments=" + encodeURIComponent(JSON.stringify(args));
  }

  /** Any address with {name} placeholders replaced by the encoded values. */
  function linkUrl(block, raw) {
    const vals = values(block, raw);
    return String(block.url || "").trim().replace(/\{([A-Za-z0-9_]+)\}/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(vals, name) ? encodeURIComponent(vals[name] == null ? "" : String(vals[name])) : m);
  }

  /** JSON body for a cloud flow. */
  function cloudBody(block, raw, context) {
    const body = values(block, raw);
    if (block.sendContext !== false && context) body.sop = context;
    return body;
  }

  /** Request body JSON schema to paste into the trigger "When an HTTP request is received". */
  function schema(block) {
    const properties = {};
    const required = [];
    for (const p of block.params || []) {
      if (!p.name) continue;
      const type = p.type === "number" ? "number" : p.type === "yesno" ? "boolean" : "string";
      properties[p.name] = { type, description: p.label || p.name };
      if (p.type === "date") properties[p.name].format = "date";
      if (p.type === "choice" && p.options) properties[p.name].enum = splitOptions(p.options);
      if (p.required) required.push(p.name);
    }
    if (block.sendContext !== false) {
      properties.sop = {
        type: "object",
        description: "Where the run was started",
        properties: {
          manual: { type: "string" }, documentId: { type: "string" }, part: { type: "string" },
          procedureId: { type: "string" }, procedure: { type: "string" }, automation: { type: "string" },
          runBy: { type: "string" }, runAt: { type: "string" }, page: { type: "string" }
        }
      };
    }
    return { type: "object", properties, required };
  }

  const splitOptions = s => String(s || "").split(/[,\n،]/).map(x => x.trim()).filter(Boolean);

  /**
   * Starts a cloud flow. Resolves to {ok, status, text}.
   * A blocked or lost reply is reported as {ok:false, unknown:true}: the flow may or may not have started,
   * so the caller must not resend automatically.
   */
  async function postCloud(url, body, timeoutMs) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 60000) : null;
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl && ctrl.signal });
      const text = await r.text().catch(() => "");
      return { ok: r.ok, status: r.status, text };
    } catch (e) {
      return { ok: false, unknown: true, error: e && e.message };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Sends without reading the reply ("simple request"), for flows whose address does not allow this website
   * to read the response. The flow receives the JSON as text; use a "Parse JSON" action on triggerBody().
   */
  async function postCloudSimple(url, body) {
    await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) });
    return { ok: true, opaque: true };
  }

  /** Opens a link (separate so tests can replace it). */
  function openUrl(url, newTab) {
    if (newTab) { global.open(url, "_blank", "noopener"); return; }
    const a = global.document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    global.document.body.append(a);
    a.click();
    a.remove();
  }

  global.SOPAutomation = { KINDS, TYPES, coerce, validate, values, desktopUrl, linkUrl, cloudBody, schema, splitOptions, postCloud, postCloudSimple, openUrl };
})(typeof window !== "undefined" ? window : globalThis);
