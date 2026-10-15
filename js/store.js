/* SOP Builder – storage and sign-in.
 *
 * Two stores share one interface:
 *   LocalStore  – this browser only (IndexedDB), used when signed out.
 *   CloudStore  – Firebase Firestore, per signed-in user.
 *
 * Interface (all async):
 *   listManuals() → [{id, name, updatedAt}]      getManual(id) → doc      putManual(doc)      deleteManual(id)
 *   listVersions(mid) → [{id, label, savedAt, auto}]   getVersion(mid, vid)   putVersion(doc, label, auto)   deleteVersion(mid, vid)
 *   listTemplates() → [{id, name, savedAt}]       getTemplate(id)          putTemplate(doc, name)   deleteTemplate(id)
 *   getPrefs() → {}                               putPrefs(prefs)
 */
(function (global) {
  "use strict";
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = () => new Date().toISOString();
  const MAX_VERSIONS = 50;
  const byDateDesc = k => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));

  /* ================= this browser (IndexedDB) ================= */
  class LocalStore {
    constructor(ns) { this.ns = ns || "guest"; this.kind = "local"; this.dbp = null; }
    db() {
      if (!this.dbp) this.dbp = new Promise((res, rej) => {
        if (!global.indexedDB) return rej(new Error("This browser cannot store data"));
        const r = indexedDB.open("sop-builder", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return this.dbp;
    }
    async tx(mode, fn) {
      const db = await this.db();
      return new Promise((res, rej) => {
        const t = db.transaction("kv", mode), s = t.objectStore("kv");
        let out;
        Promise.resolve(fn(s, v => { out = v; })).catch(rej);
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error("Storage write was cancelled (the browser may be out of space)"));
      });
    }
    key(...p) { return [this.ns, ...p].join("|"); }
    get(k) { return this.tx("readonly", (s, done) => { const r = s.get(k); r.onsuccess = () => done(r.result); }); }
    set(k, v) { return this.tx("readwrite", s => { s.put(v, k); }); }
    del(k) { return this.tx("readwrite", s => { s.delete(k); }); }
    range(prefix) {
      return this.tx("readonly", (s, done) => {
        const r = s.getAll(IDBKeyRange.bound(prefix, prefix + "￿"));
        r.onsuccess = () => done(r.result || []);
      });
    }
    delRange(prefix) { return this.tx("readwrite", s => { s.delete(IDBKeyRange.bound(prefix, prefix + "￿")); }); }

    async listManuals() { return (await this.range(this.key("manual", ""))).map(v => v.meta).sort(byDateDesc("updatedAt")); }
    async getManual(id) { const v = await this.get(this.key("manual", id)); return v ? v.doc : null; }
    putManual(doc) { return this.set(this.key("manual", doc.id), { meta: { id: doc.id, name: doc.name || "", updatedAt: now() }, doc }); }
    async deleteManual(id) { await this.del(this.key("manual", id)); await this.delRange(this.key("ver", id, "")); }

    async listVersions(mid) { return (await this.range(this.key("ver", mid, ""))).map(v => v.meta).sort(byDateDesc("savedAt")); }
    async getVersion(mid, vid) { const v = await this.get(this.key("ver", mid, vid)); return v ? v.doc : null; }
    async putVersion(doc, label, auto) {
      const meta = { id: uid(), label: label || "", savedAt: now(), auto: !!auto, name: doc.name || "" };
      await this.set(this.key("ver", doc.id, meta.id), { meta, doc });
      const all = await this.listVersions(doc.id);
      for (const old of all.slice(MAX_VERSIONS)) await this.deleteVersion(doc.id, old.id);
      return meta;
    }
    deleteVersion(mid, vid) { return this.del(this.key("ver", mid, vid)); }

    async listTemplates() { return (await this.range(this.key("tpl", ""))).map(v => v.meta).sort(byDateDesc("savedAt")); }
    async getTemplate(id) { const v = await this.get(this.key("tpl", id)); return v ? v.doc : null; }
    async putTemplate(doc, name) { const meta = { id: uid(), name: name || doc.name || "", savedAt: now() }; await this.set(this.key("tpl", meta.id), { meta, doc }); return meta; }
    deleteTemplate(id) { return this.del(this.key("tpl", id)); }

    async getPrefs() { return (await this.get(this.key("prefs"))) || {}; }
    putPrefs(p) { return this.set(this.key("prefs"), p); }
  }

  /* ================= Firebase (Firestore) ================= */
  // Firestore documents are limited to 1 MiB, so each manual is stored as text split into chunks.
  const CHUNK = 300000;
  class CloudStore {
    constructor(fb, user) {
      this.kind = "cloud"; this.user = user;
      this.db = fb.firestore();
      this.root = this.db.collection("users").doc(user.uid);
      this.written = new Map(); // path → last written chunk strings, to skip unchanged chunks
    }
    async writeChunked(ref, meta, obj) {
      const s = JSON.stringify(obj);
      const parts = [];
      for (let i = 0; i < Math.max(1, Math.ceil(s.length / CHUNK)); i++) parts.push(s.slice(i * CHUNK, (i + 1) * CHUNK));
      let prev = this.written.get(ref.path);
      if (!prev) { const snap = await ref.get(); prev = { n: snap.exists ? (snap.data().chunks || 0) : 0, parts: [] }; }
      const batch = this.db.batch();
      parts.forEach((d, i) => { if (prev.parts[i] !== d) batch.set(ref.collection("chunks").doc(String(i)), { d }); });
      for (let i = parts.length; i < prev.n; i++) batch.delete(ref.collection("chunks").doc(String(i)));
      batch.set(ref, { ...meta, chunks: parts.length, size: s.length });
      await batch.commit();
      this.written.set(ref.path, { n: parts.length, parts });
    }
    async readChunked(ref) {
      const snap = await ref.get();
      if (!snap.exists) return null;
      const n = snap.data().chunks || 0;
      const chunks = await Promise.all(Array.from({ length: n }, (_, i) => ref.collection("chunks").doc(String(i)).get()));
      const parts = chunks.map(c => (c.exists ? c.data().d : ""));
      this.written.set(ref.path, { n, parts });
      return JSON.parse(parts.join(""));
    }
    async deleteChunked(ref) {
      const snap = await ref.get();
      const n = snap.exists ? (snap.data().chunks || 0) : 0;
      const batch = this.db.batch();
      for (let i = 0; i < n; i++) batch.delete(ref.collection("chunks").doc(String(i)));
      batch.delete(ref);
      await batch.commit();
      this.written.delete(ref.path);
    }
    async list(col) { const q = await col.get(); return q.docs.map(d => ({ id: d.id, ...d.data() })); }

    async listManuals() { return (await this.list(this.root.collection("manuals"))).map(m => ({ id: m.id, name: m.name, updatedAt: m.updatedAt })).sort(byDateDesc("updatedAt")); }
    getManual(id) { return this.readChunked(this.root.collection("manuals").doc(id)); }
    putManual(doc) { return this.writeChunked(this.root.collection("manuals").doc(doc.id), { name: doc.name || "", updatedAt: now() }, doc); }
    async deleteManual(id) {
      const ref = this.root.collection("manuals").doc(id);
      for (const v of await this.listVersions(id)) await this.deleteVersion(id, v.id);
      await this.deleteChunked(ref);
    }

    async listVersions(mid) { return (await this.list(this.root.collection("manuals").doc(mid).collection("versions"))).sort(byDateDesc("savedAt")); }
    getVersion(mid, vid) { return this.readChunked(this.root.collection("manuals").doc(mid).collection("versions").doc(vid)); }
    async putVersion(doc, label, auto) {
      const meta = { label: label || "", savedAt: now(), auto: !!auto, name: doc.name || "" };
      const id = uid();
      await this.writeChunked(this.root.collection("manuals").doc(doc.id).collection("versions").doc(id), meta, doc);
      const all = await this.listVersions(doc.id);
      for (const old of all.slice(MAX_VERSIONS)) await this.deleteVersion(doc.id, old.id);
      return { id, ...meta };
    }
    deleteVersion(mid, vid) { return this.deleteChunked(this.root.collection("manuals").doc(mid).collection("versions").doc(vid)); }

    async listTemplates() { return (await this.list(this.root.collection("templates"))).sort(byDateDesc("savedAt")); }
    getTemplate(id) { return this.readChunked(this.root.collection("templates").doc(id)); }
    async putTemplate(doc, name) { const meta = { name: name || doc.name || "", savedAt: now() }; const id = uid(); await this.writeChunked(this.root.collection("templates").doc(id), meta, doc); return { id, ...meta }; }
    deleteTemplate(id) { return this.deleteChunked(this.root.collection("templates").doc(id)); }

    async getPrefs() { const s = await this.root.collection("meta").doc("prefs").get(); return s.exists ? JSON.parse(s.data().json || "{}") : {}; }
    putPrefs(p) { return this.root.collection("meta").doc("prefs").set({ json: JSON.stringify(p) }); }
  }

  /* ================= sign-in ================= */
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src));
      document.head.append(s);
    });
  }
  const Auth = {
    fb: null,
    configured: () => !!(global.SOP_FIREBASE_CONFIG && global.SOP_FIREBASE_CONFIG.apiKey),
    async init(onUser) {
      if (!Auth.configured()) return false;
      if (!global.firebase) {
        await loadScript(SDK + "firebase-app-compat.js");
        await Promise.all([loadScript(SDK + "firebase-auth-compat.js"), loadScript(SDK + "firebase-firestore-compat.js")]);
      }
      const fb = global.firebase;
      if (!fb.apps.length) fb.initializeApp(global.SOP_FIREBASE_CONFIG);
      Auth.fb = fb;
      fb.auth().onAuthStateChanged(u => onUser(u ? { uid: u.uid, email: u.email || "", name: u.displayName || "" } : null));
      return true;
    },
    signIn: (email, pw) => Auth.fb.auth().signInWithEmailAndPassword(email, pw),
    signUp: (email, pw) => Auth.fb.auth().createUserWithEmailAndPassword(email, pw),
    reset: email => Auth.fb.auth().sendPasswordResetEmail(email),
    google: () => Auth.fb.auth().signInWithPopup(new Auth.fb.auth.GoogleAuthProvider()),
    signOut: () => Auth.fb.auth().signOut(),
    store: user => new CloudStore(Auth.fb, user),
    message(e) {
      const code = (e && e.code) || "";
      return ({
        "auth/invalid-credential": "The email or password is not correct.",
        "auth/wrong-password": "The email or password is not correct.",
        "auth/user-not-found": "There is no account with this email. Choose Create account.",
        "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
        "auth/weak-password": "Use a password with at least 6 characters.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/missing-password": "Enter your password.",
        "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
        "auth/popup-closed-by-user": "The Google window was closed before signing in.",
        "auth/popup-blocked": "The browser blocked the Google window. Allow pop-ups for this site and try again.",
        "auth/unauthorized-domain": "This website address is not allowed to sign in yet. Add it under Authentication → Settings → Authorized domains in Firebase.",
        "auth/operation-not-allowed": "This sign-in method is turned off. Turn it on under Authentication → Sign-in method in Firebase.",
        "auth/network-request-failed": "Could not reach the sign-in service. Check your connection.",
        "permission-denied": "The database refused access. Publish the security rules from firestore.rules in Firebase."
      })[code] || (e && e.message) || "Something went wrong.";
    }
  };

  global.SOPStore = { LocalStore, CloudStore, Auth };
})(window);
