import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  writeBatch,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
const env = await initializeTestEnvironment({
  projectId: "demo-research-tool",
  firestore: { rules: readFileSync("../../firestore.rules", "utf8") },
});
const db = (uid) =>
  env.authenticatedContext(uid, { email: uid + "@example.org" }).firestore();
const user = (uid, org, role, invite = "") => ({
  id: uid,
  login_id: uid + "@example.org",
  name: uid,
  org_id: org,
  role,
  invite_id: invite,
});
try {
  await env.clearFirestore();
  const a = db("owner"),
    org = "org1",
    p = {
      id: "p",
      org_id: org,
      owner_id: "owner",
      name: "Study",
      description: "",
      cities: [],
    };
  const batch = writeBatch(a);
  batch.set(doc(a, "users", "owner"), user("owner", org, "admin"));
  batch.set(doc(a, "organizations", org), {
    id: org,
    name: "Org",
    owner_id: "owner",
    created_at: "now",
  });
  batch.set(doc(a, "projects", "p"), p);
  await assertSucceeds(batch.commit());
  const code = "A".repeat(32);
  await assertSucceeds(
    setDoc(doc(a, "invites", code), {
      id: code,
      code,
      token: code,
      org_id: org,
      label: "Team",
      created_at: "now",
      expires_at: Date.now() + 86400000,
    }),
  );
  const other = db("other");
  const ob = writeBatch(other);
  ob.set(doc(other, "users", "other"), user("other", "org2", "admin"));
  ob.set(doc(other, "organizations", "org2"), {
    id: "org2",
    name: "Other",
    owner_id: "other",
    created_at: "now",
  });
  await assertSucceeds(ob.commit());
  await assertFails(getDoc(doc(other, "projects", "p")));
  await assertFails(
    getDocs(
      query(
        collection(env.unauthenticatedContext().firestore(), "users"),
        where("org_id", "==", org),
      ),
    ),
  );
  const s = db("surveyor");
  await assertSucceeds(
    setDoc(
      doc(s, "users", "surveyor"),
      user("surveyor", org, "surveyor", code),
    ),
  );
  await assertFails(updateDoc(doc(s, "users", "surveyor"), { role: "admin" }));
  await assertFails(
    setDoc(
      doc(db("intruder"), "users", "intruder"),
      user("intruder", org, "admin"),
    ),
  );
  const f = {
    id: "f",
    org_id: org,
    project_id: "p",
    lineage: "f",
    version: 1,
    status: "draft",
    title: "Test",
    description: "",
    questions: [{ id: "q", kind: "text" }],
    reviewed: true,
  };
  await assertSucceeds(setDoc(doc(a, "forms", "f"), f));
  await assertFails(getDoc(doc(s, "forms", "f")));
  await assertSucceeds(
    updateDoc(doc(a, "forms", "f"), { status: "published" }),
  );
  await assertSucceeds(
    getDocs(
      query(
        collection(s, "forms"),
        where("org_id", "==", org),
        where("status", "==", "published"),
      ),
    ),
  );
  await assertFails(updateDoc(doc(a, "forms", "f"), { questions: [] }));
  await assertFails(getDoc(doc(db("intruder"), "forms", "f")));
  const response = {
    id: "r",
    org_id: org,
    project_id: "p",
    form_id: "f",
    form_version: 1,
    collector_id: "surveyor",
    collector_name: "surveyor",
    collected_at: "now",
    received_at: "now",
    timezone: "UTC",
    review_status: "unreviewed",
    received_server_at: serverTimestamp(),
    signature: "x",
    answers: { q: "hello" },
    statuses: { q: "answered" },
  };
  await assertSucceeds(setDoc(doc(s, "responses", "r"), response));
  await assertSucceeds(
    getDocs(
      query(
        collection(s, "responses"),
        where("org_id", "==", org),
        where("collector_id", "==", "surveyor"),
      ),
    ),
  );
  await assertFails(
    setDoc(doc(s, "responses", "forged"), {
      ...response,
      id: "forged",
      collector_id: "owner",
    }),
  );
  await assertFails(
    setDoc(doc(s, "responses", "bad-clock"), {
      ...response,
      id: "bad-clock",
      received_server_at: new Date(0),
    }),
  );
  await assertFails(getDoc(doc(other, "responses", "r")));
  await assertFails(
    updateDoc(doc(a, "responses", "r"), { answers: { q: "edited" } }),
  );
  await assertFails(deleteDoc(doc(a, "responses", "r")));
  await assertFails(getDoc(doc(db("intruder"), "responses", "r")));
  await assertSucceeds(updateDoc(doc(a, "forms", "f"), { status: "closed" }));
  await assertFails(
    setDoc(doc(s, "responses", "closed"), { ...response, id: "closed" }),
  );
  await assertFails(
    getDoc(doc(env.unauthenticatedContext().firestore(), "projects", "p")),
  );
  console.log(
    "PASS: organization bootstrap, invitations, role escalation denial, cross-org denial, draft privacy, publication immutability, own responses, forged ownership denial, append-only records and closure.",
  );
} finally {
  await env.cleanup();
}
