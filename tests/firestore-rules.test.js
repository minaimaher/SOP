const fs = require("fs");
// Security rule checks. Run from a folder with firebase-tools, @firebase/rules-unit-testing and firebase installed:
//   npx firebase emulators:exec --only firestore --project sop-rules-test "node tests/firestore-rules.test.js firestore.rules"
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, collection, query, where } = require("firebase/firestore");

let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log("  ok  ", name); } catch (e) { fail++; console.log("  FAIL", name, "-", e.message.split("\n")[0]); } }

(async () => {
  const env = await initializeTestEnvironment({ projectId: "sop-rules-test", firestore: { rules: fs.readFileSync(process.argv[2], "utf8"), host: "127.0.0.1", port: 8080 } });
  const as = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
  const alice = as("alice", "Alice@Example.com"), bob = as("bob", "bob@example.com"), carol = as("carol", "carol@example.com");
  const mallory = as("mallory", "bob@example.com", false), eve = as("eve", "eve@example.com");
  const anon = env.unauthenticatedContext().firestore();
  const ORG = "org1";
  const inv = (email, role, by = "alice@example.com", extra = {}) => ({ orgId: ORG, orgName: "Acme", email, role, invitedBy: by, invitedAt: "now", ...extra });
  const member = (db, uid, data) => setDoc(doc(db, `orgs/${ORG}/members/${uid}`), data);

  console.log("create");
  await t("someone cannot found an org for another user", (() => { const b = writeBatch(eve); b.set(doc(eve, `orgs/${ORG}`), { name: "Acme", createdBy: "alice", createdAt: "now" }); b.set(doc(eve, `orgs/${ORG}/members/eve`), { role: "owner", email: "eve@example.com", joinedAt: "now" }); return assertFails(b.commit()); })());
  await t("alice founds org with owner membership in one write", (() => { const b = writeBatch(alice); b.set(doc(alice, `orgs/${ORG}`), { name: "Acme", createdBy: "alice", createdAt: "now" }); b.set(doc(alice, `orgs/${ORG}/members/alice`), { role: "owner", email: "alice@example.com", joinedAt: "now" }); return assertSucceeds(b.commit()); })());
  await t("eve cannot add herself as owner of the existing org", assertFails(member(eve, "eve", { role: "owner", email: "eve@example.com", joinedAt: "now" })));
  await t("eve cannot add herself as reader either", assertFails(member(eve, "eve", { role: "reader", email: "eve@example.com", joinedAt: "now" })));
  await t("alice cannot re-found (org exists)", assertFails(member(alice, "alice", { role: "owner", email: "alice@example.com", joinedAt: "now" })));

  console.log("read isolation");
  await t("alice writes a manual", assertSucceeds(setDoc(doc(alice, `orgs/${ORG}/manuals/m1`), { name: "SOP", chunks: 1 })));
  await t("alice writes a manual chunk", assertSucceeds(setDoc(doc(alice, `orgs/${ORG}/manuals/m1/chunks/0`), { d: "{}" })));
  await t("eve cannot read the org", assertFails(getDoc(doc(eve, `orgs/${ORG}`))));
  await t("eve cannot read a manual", assertFails(getDoc(doc(eve, `orgs/${ORG}/manuals/m1`))));
  await t("eve cannot list manuals", assertFails(getDocs(collection(eve, `orgs/${ORG}/manuals`))));
  await t("eve cannot write a manual", assertFails(setDoc(doc(eve, `orgs/${ORG}/manuals/x`), { name: "x" })));
  await t("signed-out cannot read", assertFails(getDoc(doc(anon, `orgs/${ORG}/manuals/m1`))));
  await t("eve cannot read alice's personal data", assertFails(getDoc(doc(eve, `users/alice/meta/prefs`))));
  await t("alice reads her personal data", assertSucceeds(setDoc(doc(alice, `users/alice/meta/orgs`), { json: "{}" })));

  console.log("invites");
  await t("eve cannot invite into alice's org", assertFails(setDoc(doc(eve, `invites/${ORG}:eve2@example.com`), inv("eve2@example.com", "owner", "eve@example.com"))));
  await t("alice invites bob as editor", assertSucceeds(setDoc(doc(alice, `invites/${ORG}:bob@example.com`), inv("bob@example.com", "editor"))));
  await t("alice invites carol as reader", assertSucceeds(setDoc(doc(alice, `invites/${ORG}:carol@example.com`), inv("carol@example.com", "reader"))));
  await t("invite id must match org and email", assertFails(setDoc(doc(alice, `invites/${ORG}:x@example.com`), inv("y@example.com", "editor"))));
  await t("invite role must be valid", assertFails(setDoc(doc(alice, `invites/${ORG}:z@example.com`), inv("z@example.com", "god"))));
  await t("invite email must be lower case", assertFails(setDoc(doc(alice, `invites/${ORG}:Z@example.com`), inv("Z@example.com", "editor"))));
  await t("alice lists her org's invites", assertSucceeds(getDocs(query(collection(alice, "invites"), where("orgId", "==", ORG)))));
  await t("eve cannot list the org's invites", assertFails(getDocs(query(collection(eve, "invites"), where("orgId", "==", ORG)))));
  await t("unverified holder of bob's email cannot see the invite", assertFails(getDocs(query(collection(mallory, "invites"), where("email", "==", "bob@example.com")))));
  await t("unverified holder of bob's email cannot accept", assertFails(member(mallory, "mallory", { role: "editor", email: "bob@example.com", joinedAt: "now" })));
  await t("bob lists his invites", assertSucceeds(getDocs(query(collection(bob, "invites"), where("email", "==", "bob@example.com")))));
  await t("eve cannot list bob's invites", assertFails(getDocs(query(collection(eve, "invites"), where("email", "==", "bob@example.com")))));
  await t("bob cannot accept as owner", assertFails(member(bob, "bob", { role: "owner", email: "bob@example.com", joinedAt: "now" })));
  await t("bob cannot accept for someone else's uid", assertFails(member(bob, "zed", { role: "editor", email: "bob@example.com", joinedAt: "now" })));
  await t("bob accepts as editor and clears the invite", (() => { const b = writeBatch(bob); b.set(doc(bob, `orgs/${ORG}/members/bob`), { role: "editor", email: "bob@example.com", joinedAt: "now" }); b.delete(doc(bob, `invites/${ORG}:bob@example.com`)); return assertSucceeds(b.commit()); })());
  await t("bob cannot rejoin after the invite is used", assertFails(member(bob, "bob", { role: "editor", email: "bob@example.com", joinedAt: "now" })));
  await t("carol accepts as reader", (() => { const b = writeBatch(carol); b.set(doc(carol, `orgs/${ORG}/members/carol`), { role: "reader", email: "carol@example.com", joinedAt: "now" }); b.delete(doc(carol, `invites/${ORG}:carol@example.com`)); return assertSucceeds(b.commit()); })());

  console.log("roles");
  await t("editor bob writes a manual", assertSucceeds(setDoc(doc(bob, `orgs/${ORG}/manuals/m1/chunks/0`), { d: "{\"a\":1}" })));
  await t("editor bob saves a template", assertSucceeds(setDoc(doc(bob, `orgs/${ORG}/templates/t1`), { name: "T" })));
  await t("editor bob cannot rename the org", assertFails(updateDoc(doc(bob, `orgs/${ORG}`), { name: "Bob Inc" })));
  await t("editor bob cannot promote himself", assertFails(updateDoc(doc(bob, `orgs/${ORG}/members/bob`), { role: "owner" })));
  await t("editor bob cannot invite", assertFails(setDoc(doc(bob, `invites/${ORG}:new@example.com`), inv("new@example.com", "editor", "bob@example.com"))));
  await t("editor bob cannot remove carol", assertFails(deleteDoc(doc(bob, `orgs/${ORG}/members/carol`))));
  await t("reader carol reads a manual", assertSucceeds(getDoc(doc(carol, `orgs/${ORG}/manuals/m1`))));
  await t("reader carol lists members", assertSucceeds(getDocs(collection(carol, `orgs/${ORG}/members`))));
  await t("reader carol cannot write a manual", assertFails(setDoc(doc(carol, `orgs/${ORG}/manuals/m1/chunks/0`), { d: "x" })));
  await t("reader carol cannot delete a manual", assertFails(deleteDoc(doc(carol, `orgs/${ORG}/manuals/m1`))));

  console.log("owners");
  await t("alice renames the org", assertSucceeds(updateDoc(doc(alice, `orgs/${ORG}`), { name: "Acme Ltd" })));
  await t("alice cannot change createdBy", assertFails(updateDoc(doc(alice, `orgs/${ORG}`), { createdBy: "eve" })));
  await t("alice makes carol an editor", assertSucceeds(updateDoc(doc(alice, `orgs/${ORG}/members/carol`), { role: "editor" })));
  await t("alice cannot set an unknown role", assertFails(updateDoc(doc(alice, `orgs/${ORG}/members/carol`), { role: "god" })));
  await t("alice cannot change her own role", assertFails(updateDoc(doc(alice, `orgs/${ORG}/members/alice`), { role: "reader" })));
  await t("alice cannot remove herself", assertFails(deleteDoc(doc(alice, `orgs/${ORG}/members/alice`))));
  await t("nobody can delete the org document", assertFails(deleteDoc(doc(alice, `orgs/${ORG}`))));
  await t("bob leaves", assertSucceeds(deleteDoc(doc(bob, `orgs/${ORG}/members/bob`))));
  await t("bob can no longer read", assertFails(getDoc(doc(bob, `orgs/${ORG}/manuals/m1`))));
  await t("alice removes carol", assertSucceeds(deleteDoc(doc(alice, `orgs/${ORG}/members/carol`))));
  await t("carol can no longer read", assertFails(getDoc(doc(carol, `orgs/${ORG}/manuals/m1`))));
  await t("alice revokes a pending invite", assertSucceeds(setDoc(doc(alice, `invites/${ORG}:p@example.com`), inv("p@example.com", "reader")).then(() => deleteDoc(doc(alice, `invites/${ORG}:p@example.com`)))));

  await env.cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
