import publicConfig from "./firebase-config.json";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  getCountFromServer,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  seedStudy,
  checkSchema,
  validatedAnswers,
  workbookFromSnapshot,
  csvFromSnapshot,
} from "./demo.js";
export const firebaseEnabled =
  (import.meta.env.VITE_BACKEND || publicConfig.backend) === "firebase";
let services;
function service() {
  if (!services) {
    const config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || publicConfig.apiKey,
      authDomain:
        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || publicConfig.authDomain,
      projectId:
        import.meta.env.VITE_FIREBASE_PROJECT_ID || publicConfig.projectId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || publicConfig.appId,
    };
    if (Object.values(config).some((v) => !v))
      throw new Error(
        "Firebase setup is incomplete. Check the four VITE_FIREBASE settings and redeploy.",
      );
    const app = initializeApp(config);
    services = { auth: getAuth(app), db: getFirestore(app) };
    if (
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_EMULATORS === "true"
    ) {
      connectAuthEmulator(services.auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      connectFirestoreEmulator(services.db, "127.0.0.1", 8080);
    }
  }
  return services;
}
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clean = (v) => JSON.parse(JSON.stringify(v));
export async function shareQuestionnaire(form) {
  const user = await current();
  if (user.role !== 'admin' || form.status !== 'published') throw fail('Publish the questionnaire before sharing.');
  const stored = await read('forms', form.id);
  await setDoc(ref('publicForms', form.id), stored);
  return `${location.origin}/?survey=${encodeURIComponent(form.id)}`;
}
export async function publicQuestionnaire(fid) {
  return read('publicForms', fid);
}
export async function submitPublicQuestionnaire(form, answers, responseId) {
  const values = validatedAnswers(form, answers);
  await setDoc(ref('responses', responseId), clean({
    id: responseId, org_id: form.org_id, project_id: form.project_id,
    form_id: form.id, form_version: form.version, collector_id: 'public',
    collector_name: 'Online participant', collected_at: now(), received_at: now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    review_status: 'unreviewed', ...values,
  }));
}
function ref(kind, key) {
  return doc(service().db, kind, key);
}
async function read(kind, key) {
  const d = await getDoc(ref(kind, key));
  if (!d.exists()) throw fail("Record not found.", 404);
  return d.data();
}
async function list(kind, filters) {
  return (
    await getDocs(
      query(
        collection(service().db, kind),
        ...filters.map(([k, v]) => where(k, "==", v)),
      ),
    )
  ).docs.map((d) => {
    const value = d.data();
    return value.received_server_at
      ? {
          ...value,
          received_at: value.received_server_at.toDate().toISOString(),
        }
      : value;
  });
}
async function current() {
  const { auth } = service();
  await auth.authStateReady();
  if (!auth.currentUser) throw fail("Sign in to continue.", 401);
  try {
    return await read("users", auth.currentUser.uid);
  } catch (e) {
    if (e.status === 404)
      throw fail(
        "Finish creating your organization or joining with an invitation using the same email and password.",
        401,
      );
    throw e;
  }
}
async function enroll(input) {
  const { auth } = service();
  const email = input.login_id.trim().toLowerCase();
  if (!email.includes("@"))
    throw fail("Use your email address as your login ID in cloud mode.");
  if (input.password.length < 12)
    throw fail("Use a password of at least 12 characters.");
  try {
    await createUserWithEmailAndPassword(auth, email, input.password);
  } catch (e) {
    if (e.code !== "auth/email-already-in-use") throw e;
    await signInWithEmailAndPassword(auth, email, input.password);
  }
  if ((await getDoc(ref("users", auth.currentUser.uid))).exists())
    throw fail(
      "This account already belongs to an organization. Sign in instead.",
    );
  return { id: auth.currentUser.uid, login_id: email, name: input.name.trim() };
}
async function project(pid, user, admin = false) {
  const p = await read("projects", pid);
  if (p.org_id !== user.org_id || (admin && user.role !== "admin"))
    throw fail("Access denied.", 403);
  return p;
}
export async function firebaseRequest(path, options = {}) {
  try {
    return await request(path, options);
  } catch (e) {
    if (e.status) throw e;
    const messages = {
      "permission-denied":
        "Access denied. Check your organization membership and deployed Firestore rules.",
      unavailable: "Cannot reach Firebase. Your local drafts remain saved.",
      "resource-exhausted":
        "Firebase quota reached. Try again after the quota resets.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/operation-not-allowed":
        "Enable Email/Password in Firebase Authentication.",
      "auth/network-request-failed": "Cannot reach Firebase Authentication.",
      "auth/too-many-requests": "Too many attempts. Try again later.",
    };
    throw fail(
      messages[e.code] || e.message || "Firebase request failed.",
      e.code?.startsWith("auth/") ? 401 : 400,
    );
  }
}
async function request(path, { method = "GET", body: input = {} }) {
  const { auth, db } = service();
  if (path === "/api/auth/logout") {
    await signOut(auth);
    return { ok: true };
  }
  if (path === "/api/auth/reset") {
    await sendPasswordResetEmail(auth, input.login_id.trim());
    return { ok: true };
  }
  if (path === "/api/auth/login") {
    await signInWithEmailAndPassword(
      auth,
      input.login_id.trim(),
      input.password,
    );
    return { user: await current() };
  }
  if (path === "/api/auth/activate")
    throw fail(
      "In cloud mode, use Join organization with your email and invitation code.",
    );
  if (["/api/auth/register", "/api/auth/join"].includes(path)) {
    if (!input.name?.trim()) throw fail("Enter your name.");
    const user = await enroll(input),
      batch = writeBatch(db);
    let org;
    if (path.endsWith("register")) {
      if (!input.org_name?.trim()) throw fail("Enter an organization name.");
      org = {
        id: id(),
        name: input.org_name.trim(),
        owner_id: user.id,
        created_at: now(),
      };
      Object.assign(user, { org_id: org.id, role: "admin", invite_id: "" });
      batch.set(ref("organizations", org.id), org);
      const seed = { projects: [], forms: [], memberships: [] };
      seedStudy(seed, user);
      for (const p of seed.projects)
        batch.set(ref("projects", p.id), { ...p, org_id: org.id });
      for (const f of seed.forms)
        batch.set(ref("forms", f.id), clean({ ...f, org_id: org.id }));
    } else {
      const code = input.token?.trim().toUpperCase();
      if (!code) throw fail("Enter the invitation code.");
      const invite = await read("invites", code);
      if (invite.expires_at < Date.now())
        throw fail("Invitation expired. Ask for a new code.");
      Object.assign(user, {
        org_id: invite.org_id,
        role: "surveyor",
        invite_id: code,
      });
    }
    batch.set(ref("users", user.id), user);
    await batch.commit();
    return { user, org: org || (await read("organizations", user.org_id)) };
  }
  const user = await current(),
    orgFilter = [["org_id", user.org_id]];
  if (path === "/api/bootstrap") {
    const [org, projects, forms] = await Promise.all([
      read("organizations", user.org_id),
      list("projects", orgFilter),
      list(
        "forms",
        user.role === "admin"
          ? orgFilter
          : [...orgFilter, ["status", "published"]],
      ),
    ]);
    const count = async (kind, filters) =>
      (
        await getCountFromServer(
          query(
            collection(db, kind),
            ...filters.map(([k, v]) => where(k, "==", v)),
          ),
        )
      ).data().count;
    const [responses, surveyors] = await Promise.all([
      count("responses", [
        ...orgFilter,
        ...(user.role === "admin" ? [] : [["collector_id", user.id]]),
      ]),
      count("users", [...orgFilter, ["role", "surveyor"]]),
    ]);
    return { user, org, projects, forms, stats: { responses, surveyors } };
  }
  if (path === "/api/org/invite") {
    if (user.role !== "admin")
      throw fail("Administrator access required.", 403);
    if (method === "GET") {
      const tokens = await list("invites", orgFilter);
      const members = await list("users", orgFilter);
      return {
        tokens: tokens.map((t) => ({
          ...t,
          members: members.filter((u) => u.invite_id === t.id),
          use_count: members.filter((u) => u.invite_id === t.id).length,
        })),
      };
    }
    const code = id().replaceAll("-", "").toUpperCase();
    const invite = {
      id: code,
      code,
      token: code,
      org_id: user.org_id,
      label: input.label || "Surveyors",
      created_at: now(),
      expires_at: Date.now() + 7 * 86400000,
    };
    await setDoc(ref("invites", code), invite);
    return { ...invite, members: [], use_count: 0 };
  }
  if (path === "/api/projects" && method === "POST") {
    if (!input.name?.trim()) throw fail("Enter a study name.");
    const p = {
      id: id(),
      org_id: user.org_id,
      owner_id: user.id,
      name: input.name,
      description: input.description || "",
      cities: input.cities || [],
    };
    await setDoc(ref("projects", p.id), p);
    return p;
  }
  const pr = path.match(/^\/api\/projects\/([^/]+)(?:\/(.+))?$/);
  if (pr) {
    const [, pid, action] = pr,
      p = await project(pid, user, method !== "GET");
    if (!action && method === "PUT") {
      const updated = {
        ...p,
        name: input.name,
        description: input.description,
        cities: input.cities,
      };
      await setDoc(ref("projects", pid), clean(updated));
      return updated;
    }
    if (action === "members") {
      if (method === "GET") return list("users", orgFilter);
      throw fail(
        "Use the organization invitation panel below. Surveyors join with their own email and password and can access this organization’s published studies.",
      );
    }
    if (action === "responses")
      return list("responses", [
        ...orgFilter,
        ["project_id", pid],
        ...(user.role === "admin" ? [] : [["collector_id", user.id]]),
      ]);
    if (action === "forms") {
      const f = {
        id: id(),
        org_id: user.org_id,
        project_id: pid,
        lineage: id(),
        version: 1,
        status: "draft",
        title: input.title,
        description: input.description || "",
        questions: input.questions,
        reviewed: !!input.reviewed,
      };
      if (f.reviewed) checkSchema(f.questions);
      await setDoc(ref("forms", f.id), clean(f));
      return f;
    }
    if (action === "import")
      return {
        title: "Imported draft",
        questions: (input.text || "")
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => /^\d+[.)]\s/.test(s) || s.endsWith("?"))
          .slice(0, 200)
          .map((label, i) => ({
            id: `q_import_${i + 1}`,
            label,
            kind: "long_text",
            required: false,
            choices: [],
          })),
        warnings: [
          "Review every extracted question, choice and condition before publication.",
        ],
      };
    if (action === "import-pdf")
      throw fail(
        "Cloud mode supports pasted questionnaire text. Copy text from your PDF into the text import tab; PDF extraction requires the optional Rust server.",
      );
  }
  const fr = path.match(/^\/api\/forms\/([^/]+)(?:\/(publish|revise|close))?$/);
  if (fr)
    return runTransaction(db, async (tx) => {
      const r = ref("forms", fr[1]),
        snapshot = await tx.get(r);
      if (!snapshot.exists()) throw fail("Form not found.", 404);
      const f = snapshot.data();
      if (f.org_id !== user.org_id || user.role !== "admin")
        throw fail("Administrator access required.", 403);
      const action = fr[2];
      let updated;
      if (action === "revise") {
        updated = {
          ...f,
          id: id(),
          status: "draft",
          reviewed: false,
          version: f.version + 1,
        };
        tx.set(ref("forms", updated.id), updated);
        return updated;
      }
      if (action === "close") updated = { ...f, status: "closed" };
      else {
        if (f.status !== "draft")
          throw fail("Published forms are immutable.", 409);
        updated =
          action === "publish"
            ? { ...f, status: "published" }
            : {
                ...f,
                title: input.title,
                description: input.description || "",
                questions: input.questions,
                reviewed: !!input.reviewed,
              };
        if (action === "publish" && !f.reviewed)
          throw fail("Review before publication.");
        if (updated.reviewed) checkSchema(updated.questions);
      }
      tx.set(r, clean(updated));
      return updated;
    });
  if (path === "/api/responses") {
    if (input.expected_user_id !== user.id)
      throw fail("Sign in as the owner of this pending response.", 403);
    const signature = JSON.stringify([
      input.form_id,
      input.collected_at,
      input.timezone,
      Object.entries(input.answers).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    return runTransaction(db, async (tx) => {
      const r = ref("responses", input.id),
        old = await tx.get(r);
      if (old.exists()) {
        const prev = old.data();
        if (prev.signature !== signature || prev.collector_id !== user.id)
          throw fail("Response ID already has different content.", 409);
        return { ...prev, duplicate: true };
      }
      const snap = await tx.get(ref("forms", input.form_id));
      if (!snap.exists()) throw fail("Form not found.");
      const f = snap.data();
      if (f.status !== "published" || f.org_id !== user.org_id)
        throw fail("Questionnaire is closed or unavailable.", 409);
      const values = validatedAnswers(f, input.answers);
      const response = {
        id: input.id,
        org_id: user.org_id,
        project_id: f.project_id,
        form_id: f.id,
        form_version: f.version,
        collector_id: user.id,
        collector_name: user.name,
        collected_at: new Date(input.collected_at).toISOString(),
        received_at: now(),
        timezone: input.timezone,
        review_status: "unreviewed",
        signature,
        ...values,
      };
      tx.set(r, { ...clean(response), received_server_at: serverTimestamp() });
      return { ...response, duplicate: false };
    });
  }
  throw fail("Unsupported cloud operation.", 404);
}
export async function firebaseExport(pid, fid, csv = false) {
  const user = await current();
  if (user.role !== "admin") throw fail("Administrator access required.", 403);
  const p = await project(pid, user, true);
  const [forms, responses] = await Promise.all([
    list("forms", [
      ["org_id", user.org_id],
      ["project_id", pid],
    ]),
    list("responses", [
      ["org_id", user.org_id],
      ["project_id", pid],
    ]),
  ]);
  const snapshot = {
    mode: "FIREBASE CLOUD",
    project: p,
    forms: forms.filter((f) => f.status !== "draft" && (!fid || f.id === fid)),
    responses: responses.filter((r) => !fid || r.form_id === fid),
  };
  return csv
    ? new Blob([csvFromSnapshot(snapshot)], { type: "text/csv;charset=utf-8" })
    : workbookFromSnapshot(snapshot);
}
