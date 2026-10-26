// A deliberately local playground. This module never authenticates against, or
// writes to, the real research server. Only fictional data belongs here.
import templates from "../../assets/study-templates.json";

const MODE = "research-tool-playground-active";
const PUBLIC_PASSWORD = "ResearchDemo2026!";
export const DEMO_ACCOUNTS = [
  {
    login_id: "guest-admin",
    name: "Demo Research Administrator",
    role: "admin",
    password: PUBLIC_PASSWORD,
  },
  ...[1, 2, 3].map((n) => ({
    login_id: `guest-surveyor-${n}`,
    name: `Demo Surveyor ${n}`,
    role: "surveyor",
    password: PUBLIC_PASSWORD,
  })),
];
export const isDemoMode = () => localStorage.getItem(MODE) === "true";
export const enableDemoMode = () => localStorage.setItem(MODE, "true");
export const exitDemo = () => localStorage.removeItem(MODE);
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const publicUser = ({ password_hash, activation_code, active, ...user }) =>
  user;
const copy = (value) => structuredClone(value);
const hash = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export function seedStudy(state, owner, publishedPractice = false) {
  const project = {
    id: id(),
    name: "Smart Cities, Silent Citizens",
    description:
      "EXAMPLE / FICTIONAL DATA ONLY. Editable review templates about older residents and city services. Not approved research instruments; confirm the city list, consent, eligibility and scoring.",
    cities: ["Delhi", "Aizawl", "Chennai", "Srinagar"],
  };
  state.projects.push({ ...project, owner_id: owner.id });
  state.memberships.push({ project_id: project.id, user_id: owner.id });
  for (const template of templates)
    state.forms.push({
      id: id(),
      project_id: project.id,
      title: template.title,
      description: template.description,
      questions: copy(template.questions),
      version: 1,
      status: "draft",
      reviewed: false,
      lineage: id(),
    });
  if (publishedPractice) {
    const question = (qid, label, kind, required = false, choices = []) => ({
      id: qid,
      label,
      kind,
      required,
      choices,
      min: null,
      max: null,
      show_if:
        qid === "q_consent" ? null : { question_id: "q_consent", equals: true },
    });
    state.forms.unshift({
      id: id(),
      lineage: id(),
      project_id: project.id,
      title: "SC / SC — fictional collection practice",
      description:
        "Published only for testing the software. Use invented answers. This short practice form is not the approved ICSSR questionnaire.",
      version: 1,
      status: "published",
      reviewed: true,
      questions: [
        question(
          "q_consent",
          "Are you using invented answers to test this practice interview?",
          "boolean",
          true,
        ),
        question(
          "q_code",
          "Fictional participant code (no real names)",
          "text",
        ),
        question(
          "q_city",
          "Example city",
          "single",
          false,
          project.cities.map((label, i) => ({ code: `city_${i + 1}`, label })),
        ),
        {
          ...question(
            "q_visits",
            "Number of service visits in this fictional example",
            "integer",
          ),
          min: 0,
          max: 100,
        },
        question(
          "q_barriers",
          "Example barriers — select all that apply",
          "multiple",
          false,
          [
            { code: "digital", label: "Digital access" },
            { code: "physical", label: "Physical access" },
            { code: "language", label: "Language" },
          ],
        ),
        question(
          "q_comments",
          "What would make the service easier to use?",
          "long_text",
        ),
      ],
    });
  }
  return project;
}
function initialState(passwordHash) {
  const state = {
    users: [],
    orgs: [],
    projects: [],
    forms: [],
    responses: [],
    memberships: [],
    invites: [],
    activeUserId: null,
  };
  const org = {
    id: id(),
    name: "SC / SC Demonstration Organization",
    created_at: now(),
  };
  state.orgs.push(org);
  for (const profile of DEMO_ACCOUNTS)
    state.users.push({
      id: `playground-${profile.login_id}`,
      org_id: org.id,
      login_id: profile.login_id,
      name: profile.name,
      role: profile.role,
      active: true,
      password_hash: passwordHash,
    });
  const project = seedStudy(state, state.users[0], true);
  for (const user of state.users.slice(1))
    state.memberships.push({ project_id: project.id, user_id: user.id });
  return state;
}

let opening;
function database() {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open("research-tool-playground-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          fail(
            "The playground could not open browser storage. Check your browser storage settings.",
          ),
        );
    }).catch((error) => {
      opening = null;
      throw error;
    });
  return opening;
}
async function transaction(operation) {
  const [db, passwordHash] = await Promise.all([
    database(),
    hash(PUBLIC_PASSWORD),
  ]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    const store = tx.objectStore("state");
    let result, failure;
    const request = store.get("workspace");
    request.onsuccess = () => {
      try {
        const state = request.result || initialState(passwordHash);
        result = copy(operation(state));
        store.put(state, "workspace");
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () =>
      reject(
        failure ||
          fail(
            "Browser storage could not save the playground. Your last action was not committed.",
          ),
      );
  });
}
export async function enterDemo(loginId = "guest-admin") {
  if (!DEMO_ACCOUNTS.some((account) => account.login_id === loginId))
    throw fail("Choose one of the four public playground profiles.");
  const result = await transaction((state) => {
    const user = state.users.find((user) => user.login_id === loginId);
    state.activeUserId = user.id;
    return { user: publicUser(user) };
  });
  enableDemoMode();
  return result;
}

function authenticate(state) {
  const user = state.users.find(
    (user) => user.id === state.activeUserId && user.active,
  );
  if (!user) throw fail("Sign in to the playground to continue.", 401);
  return user;
}
function projectAccess(state, user, projectId, admin = false) {
  const project = state.projects.find((project) => project.id === projectId);
  if (
    !project ||
    !state.memberships.some(
      (member) => member.project_id === projectId && member.user_id === user.id,
    )
  )
    throw fail("Project or record not found.", 404);
  if (admin && (user.role !== "admin" || project.owner_id !== user.id))
    throw fail("Administrator access is required.", 403);
  return project;
}
export function checkSchema(questions) {
  if (!questions.length || questions.length > 200)
    throw fail("A questionnaire needs between 1 and 200 questions.");
  const seen = new Set();
  const identifier = (value) =>
    /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) && !value.includes("__");
  for (const q of questions) {
    if (!identifier(q.id) || seen.has(q.id) || !q.label.trim())
      throw fail("Each question needs a unique valid code and wording.");
    if (
      ![
        "text",
        "long_text",
        "integer",
        "decimal",
        "boolean",
        "date",
        "single",
        "multiple",
        "section",
      ].includes(q.kind)
    )
      throw fail("Unsupported question type.");
    if (q.show_if && !seen.has(q.show_if.question_id))
      throw fail("Conditions must refer to earlier questions.");
    if (
      q.id === "q_consent" &&
      (q.kind !== "boolean" || !q.required || q.show_if)
    )
      throw fail(
        "The consent gate must be an unconditional required yes/no question.",
      );
    if (
      ["single", "multiple"].includes(q.kind) &&
      (!q.choices.length ||
        new Set(q.choices.map((c) => c.code)).size !== q.choices.length ||
        q.choices.some((c) => !identifier(c.code) || !c.label.trim()))
    )
      throw fail("Choice questions need unique valid option codes and labels.");
    if (q.min != null && q.max != null && q.min > q.max)
      throw fail("The minimum cannot exceed the maximum.");
    seen.add(q.id);
  }
}
export function validatedAnswers(form, input) {
  const answers = {},
    statuses = {};
  if (
    Object.keys(input).some(
      (key) =>
        !form.questions.some((q) => q.id === key && q.kind !== "section"),
    )
  )
    throw fail("The response contains an unknown question.");
  if (
    form.questions.some((q) => q.id === "q_consent") &&
    input.q_consent !== true
  )
    throw fail("Consent is required before submitting.");
  for (const q of form.questions) {
    if (q.kind === "section") continue;
    const value = input[q.id],
      empty =
        value == null ||
        (typeof value === "string" && !value.trim()) ||
        (Array.isArray(value) && !value.length);
    if (q.show_if && answers[q.show_if.question_id] !== q.show_if.equals) {
      if (!empty) throw fail("A hidden question contains an outdated answer.");
      statuses[q.id] = "skipped";
      continue;
    }
    if (empty) {
      if (q.required) throw fail(`Answer required: ${q.label}`);
      statuses[q.id] = "not_recorded";
      continue;
    }
    let valid = true;
    if (["integer", "decimal"].includes(q.kind))
      valid =
        typeof value === "number" &&
        Number.isFinite(value) &&
        (q.kind !== "integer" || Number.isInteger(value)) &&
        (q.min == null || value >= q.min) &&
        (q.max == null || value <= q.max);
    if (q.kind === "boolean") valid = typeof value === "boolean";
    if (["text", "long_text"].includes(q.kind))
      valid =
        typeof value === "string" &&
        new TextEncoder().encode(value).length <= 20000;
    if (q.kind === "date")
      valid =
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value;
    if (q.kind === "single") valid = q.choices.some((c) => c.code === value);
    if (q.kind === "multiple")
      valid =
        Array.isArray(value) &&
        new Set(value).size === value.length &&
        value.every((code) => q.choices.some((c) => c.code === code));
    if (!valid) throw fail(`Invalid answer: ${q.label}`);
    answers[q.id] = value;
    statuses[q.id] = "answered";
  }
  return { answers, statuses };
}

export async function demoRequest(path, options = {}) {
  const method = options.method || "GET",
    input = options.body || {};
  const preparedHash = ["register", "join", "activate", "login"].some(
    (action) => path === `/api/auth/${action}`,
  )
    ? await hash(input.password || "")
    : null;
  return transaction((state) => {
    if (path === "/api/auth/logout") {
      state.activeUserId = null;
      return { ok: true };
    }
    if (path === "/api/auth/login") {
      const user = state.users.find(
        (u) =>
          u.login_id === input.login_id &&
          u.password_hash === preparedHash &&
          u.active,
      );
      if (!user) throw fail("Incorrect playground login ID or password.", 401);
      state.activeUserId = user.id;
      return { user: publicUser(user) };
    }
    if (
      ["/api/auth/register", "/api/auth/join", "/api/auth/activate"].includes(
        path,
      )
    ) {
      if (!input.login_id?.trim() || (input.password?.length || 0) < 12)
        throw fail(
          "Provide a login ID and password of at least 12 characters.",
        );
      if (path.endsWith("/activate")) {
        const user = state.users.find(
          (u) =>
            u.login_id === input.login_id &&
            !u.active &&
            u.activation_code === input.activation_code,
        );
        if (!user) throw fail("Invalid activation code.", 401);
        user.active = true;
        user.activation_code = null;
        user.password_hash = preparedHash;
        state.activeUserId = user.id;
        return { user: publicUser(user) };
      }
      if (
        !input.name?.trim() ||
        state.users.some((u) => u.login_id === input.login_id)
      )
        throw fail(
          "Provide your name and a login ID not already used in this playground.",
        );
      let org, role;
      if (path.endsWith("/register")) {
        if (!input.org_name?.trim()) throw fail("Enter an organization name.");
        org = { id: id(), name: input.org_name, created_at: now() };
        state.orgs.push(org);
        role = "admin";
      } else {
        const invite = state.invites.find(
          (i) => i.code === input.token?.trim().toUpperCase(),
        );
        if (!invite) throw fail("Invalid playground invitation code.");
        org = state.orgs.find((o) => o.id === invite.org_id);
        role = "surveyor";
      }
      const user = {
        id: id(),
        org_id: org.id,
        login_id: input.login_id,
        name: input.name,
        role,
        password_hash: preparedHash,
        active: true,
      };
      state.users.push(user);
      if (role === "admin") seedStudy(state, user);
      else {
        const invite = state.invites.find(
          (i) => i.code === input.token.trim().toUpperCase(),
        );
        invite.members.push({ ...publicUser(user), joined_at: now() });
        invite.use_count++;
        for (const p of state.projects.filter(
          (p) =>
            state.users.find((u) => u.id === p.owner_id)?.org_id === org.id,
        ))
          state.memberships.push({ project_id: p.id, user_id: user.id });
      }
      state.activeUserId = user.id;
      return { user: publicUser(user), org };
    }
    const user = authenticate(state);
    if (path === "/api/bootstrap") {
      const projects = state.projects.filter((p) =>
        state.memberships.some(
          (m) => m.project_id === p.id && m.user_id === user.id,
        ),
      );
      const pids = projects.map((p) => p.id);
      return {
        user: publicUser(user),
        org: state.orgs.find((o) => o.id === user.org_id),
        projects: projects.map(({ owner_id, ...p }) => p),
        forms: state.forms.filter(
          (f) =>
            pids.includes(f.project_id) &&
            (user.role === "admin" || f.status !== "draft"),
        ),
        stats: {
          responses: state.responses.filter(
            (r) =>
              pids.includes(r.project_id) &&
              (user.role === "admin" || r.collector_id === user.id),
          ).length,
          surveyors: new Set(
            state.memberships
              .filter(
                (m) =>
                  pids.includes(m.project_id) &&
                  state.users.some(
                    (u) => u.id === m.user_id && u.role === "surveyor",
                  ),
              )
              .map((m) => m.user_id),
          ).size,
        },
      };
    }
    if (path === "/api/org/invite") {
      if (user.role !== "admin")
        throw fail("Administrator access is required.", 403);
      if (method === "GET")
        return {
          tokens: state.invites.filter((i) => i.org_id === user.org_id),
        };
      const code = (input.code || `INV-${id().slice(0, 8)}`)
        .trim()
        .toUpperCase();
      if (state.invites.some((i) => i.code === code))
        throw fail("Invitation code already exists.");
      const invite = {
        id: id(),
        org_id: user.org_id,
        code,
        token: code,
        label: input.label,
        members: [],
        use_count: 0,
        created_at: now(),
      };
      state.invites.push(invite);
      return invite;
    }
    if (path === "/api/projects" && method === "POST") {
      if (user.role !== "admin")
        throw fail("Administrator access is required.", 403);
      if (!input.name?.trim()) throw fail("Enter a study name.");
      const project = {
        id: id(),
        name: input.name,
        description: input.description || "",
        cities: input.cities || [],
        owner_id: user.id,
      };
      state.projects.push(project);
      state.memberships.push({ project_id: project.id, user_id: user.id });
      return project;
    }
    const projectRoute = path.match(/^\/api\/projects\/([^/]+)(?:\/(.+))?$/);
    if (projectRoute) {
      const [, pid, action] = projectRoute;
      const project = projectAccess(
        state,
        user,
        pid,
        method !== "GET" || action === "members",
      );
      if (!action && method === "PUT") {
        Object.assign(project, {
          name: input.name,
          description: input.description,
          cities: input.cities,
        });
        return project;
      }
      if (action === "responses")
        return state.responses.filter(
          (r) =>
            r.project_id === pid &&
            (user.role === "admin" || r.collector_id === user.id),
        );
      if (action === "members" && method === "GET")
        return state.users
          .filter((u) =>
            state.memberships.some(
              (m) => m.project_id === pid && m.user_id === u.id,
            ),
          )
          .map(publicUser);
      if (action === "members" && method === "POST") {
        let member = state.users.find((u) => u.login_id === input.login_id);
        if (
          member &&
          (member.org_id !== user.org_id || member.role !== "surveyor")
        )
          throw fail("This login ID is unavailable.");
        const existing = !!member;
        if (!member) {
          member = {
            id: id(),
            org_id: user.org_id,
            login_id: input.login_id,
            name: input.name,
            role: "surveyor",
            active: false,
            activation_code: id(),
            password_hash: null,
          };
          state.users.push(member);
        }
        if (
          !state.memberships.some(
            (m) => m.project_id === pid && m.user_id === member.id,
          )
        )
          state.memberships.push({ project_id: pid, user_id: member.id });
        return {
          user: publicUser(member),
          existing,
          activation_code: existing ? null : member.activation_code,
        };
      }
      if (action === "forms" && method === "POST") {
        if (input.reviewed) checkSchema(input.questions);
        const form = {
          id: id(),
          lineage: id(),
          project_id: pid,
          version: 1,
          status: "draft",
          ...copy(input),
        };
        state.forms.push(form);
        return form;
      }
      if (action === "import") {
        const questions = (input.text || "")
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => /^\d+[.)]\s/.test(line) || line.endsWith("?"))
          .slice(0, 200)
          .map((label, i) => ({
            id: `q_import_${i + 1}`,
            label: label.replace(/^\d+[.)]\s*/, ""),
            kind: "long_text",
            required: false,
            choices: [],
          }));
        return {
          title: "Imported playground draft",
          questions,
          warnings: [
            "Playground import recognizes numbered/question-mark lines only. Manually check all wording, choices, consent and branching.",
          ],
        };
      }
      if (action === "import-pdf")
        throw fail(
          "PDF extraction requires the connected Rust server. In this playground, paste the questionnaire text or enter questions manually.",
          503,
        );
    }
    const formRoute = path.match(
      /^\/api\/forms\/([^/]+)(?:\/(publish|revise|close))?$/,
    );
    if (formRoute) {
      const form = state.forms.find((f) => f.id === formRoute[1]);
      if (!form) throw fail("Questionnaire not found.", 404);
      projectAccess(state, user, form.project_id, true);
      const action = formRoute[2];
      if (!action && method === "PUT") {
        if (form.status !== "draft")
          throw fail("Published versions are immutable.", 409);
        if (input.reviewed) checkSchema(input.questions);
        Object.assign(form, copy(input));
        return form;
      }
      if (action === "publish") {
        if (form.status !== "draft" || !form.reviewed)
          throw fail("Review the draft before publishing.");
        checkSchema(form.questions);
        form.status = "published";
        return form;
      }
      if (action === "close") {
        form.status = "closed";
        return form;
      }
      if (action === "revise") {
        const revision = {
          ...copy(form),
          id: id(),
          version:
            Math.max(
              ...state.forms
                .filter((f) => f.lineage === form.lineage)
                .map((f) => f.version),
            ) + 1,
          status: "draft",
          reviewed: false,
        };
        state.forms.push(revision);
        return revision;
      }
    }
    if (path === "/api/responses" && method === "POST") {
      if (input.expected_user_id !== user.id)
        throw fail(
          "Sign in to the playground account that owns this pending interview.",
          403,
        );
      const previous = state.responses.find((r) => r.id === input.id);
      const canonical = (v) => JSON.stringify(v, Object.keys(v).sort());
      const signature = JSON.stringify([
        input.form_id,
        input.expected_user_id,
        input.collected_at,
        input.timezone,
        canonical(input.answers),
      ]);
      if (previous) {
        if (previous.signature !== signature)
          throw fail("This response ID already has different answers.", 409);
        return {
          id: previous.id,
          collector_id: previous.collector_id,
          received_at: previous.received_at,
          duplicate: true,
        };
      }
      const form = state.forms.find((f) => f.id === input.form_id);
      if (!form) throw fail("Form not found.", 404);
      projectAccess(state, user, form.project_id);
      if (form.status !== "published")
        throw fail("This questionnaire is closed or unpublished.", 409);
      const values = validatedAnswers(form, input.answers);
      const response = {
        id: input.id,
        form_id: form.id,
        project_id: form.project_id,
        form_version: form.version,
        collector_id: user.id,
        collector_name: user.name,
        collected_at: new Date(input.collected_at).toISOString(),
        timezone: input.timezone,
        received_at: now(),
        review_status: "unreviewed",
        ...values,
        signature,
      };
      state.responses.push(response);
      return {
        id: response.id,
        collector_id: user.id,
        received_at: response.received_at,
        duplicate: false,
      };
    }
    throw fail("This action is not available in the playground.", 404);
  });
}

export async function demoWorkbook(projectId, formId) {
  const snapshot = await transaction((state) => {
    const user = authenticate(state);
    const project = projectAccess(state, user, projectId, true);
    return {
      project,
      forms: state.forms.filter(
        (f) =>
          f.project_id === projectId &&
          (!formId || f.id === formId) &&
          f.status !== "draft",
      ),
      responses: state.responses.filter(
        (r) => r.project_id === projectId && (!formId || r.form_id === formId),
      ),
    };
  });
  return workbookFromSnapshot(snapshot);
}

export async function workbookFromSnapshot(snapshot) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  // Explicit scalar types keep =, +, -, @ answer text inert in spreadsheets.
  const cell = (value) =>
    value == null
      ? null
      : {
          type:
            typeof value === "number"
              ? Number
              : typeof value === "boolean"
                ? Boolean
                : String,
          value: value,
        };
  const sheet = (name, rows) => ({
    sheet: name,
    data: rows.map((row) => row.map(cell)),
    columns: Array.from(
      { length: Math.max(...rows.map((row) => row.length)) },
      () => ({ width: 24 }),
    ),
    stickyRowsCount: 1,
  });
  const sheets = [];
  const codebook = [
    [
      "worksheet",
      "form_id",
      "version",
      "export_column",
      "question_code",
      "wording",
      "type",
      "required",
      "choice_code",
      "choice_label",
    ],
  ];
  snapshot.forms.forEach((form, index) => {
    const name =
      snapshot.forms.length === 1 ? "Responses" : `Responses_${index + 1}`;
    const questions = form.questions.filter((q) => q.kind !== "section");
    const labelCounts = questions.reduce((counts, question) => {
      const label = question.label.trim() || question.id;
      counts[label] = (counts[label] || 0) + 1;
      return counts;
    }, {});
    const exportLabel = (question) => {
      const label = question.label.trim() || question.id;
      return labelCounts[label] > 1 ? `${label} [${question.id}]` : label;
    };
    const headers = [
      "Response ID",
      "Questionnaire",
      "Questionnaire version",
      "Collector name",
      "Collector ID",
      "Collected at (UTC)",
      "Received at (UTC)",
      "Review status",
    ];
    for (const q of questions) {
      const column = exportLabel(q);
      headers.push(column);
      for (const c of q.choices.length ? q.choices : [{ code: "", label: "" }])
        codebook.push([
          name,
          form.id,
          form.version,
          column,
          q.id,
          q.label,
          q.kind,
          q.required ? "yes" : "no",
          c.code,
          c.label,
        ]);
    }
    const rows = [headers];
    for (const r of snapshot.responses.filter((r) => r.form_id === form.id)) {
      const row = [
        r.id,
        form.title,
        r.form_version,
        r.collector_name || "",
        r.collector_id,
        r.collected_at,
        r.received_at,
        r.review_status,
      ];
      for (const q of questions) {
        const status = r.statuses?.[q.id] || "not_recorded",
          value = r.answers[q.id];
        if (status !== "answered") {
          row.push(null);
          continue;
        }
        if (q.kind === "multiple") {
          const selected = Array.isArray(value) ? value : [];
          row.push(
            selected
              .map(
                (code) =>
                  q.choices.find((choice) => choice.code === code)?.label || code,
              )
              .join("; "),
          );
        } else if (q.kind === "single") {
          row.push(
            q.choices.find((choice) => choice.code === value)?.label || value,
          );
        } else if (q.kind === "boolean") {
          row.push(value ? "Yes" : "No");
        } else {
          row.push(value);
        }
      }
      rows.push(row);
    }
    sheets.push(sheet(name, rows));
  });
  sheets.push(sheet("Codebook", codebook));
  sheets.push(
    sheet("ExportInfo", [
      ["Property", "Value"],
      ["mode", snapshot.mode || "LOCAL PLAYGROUND — fictional data only"],
      ["project", snapshot.project.name],
      ["response_count", snapshot.responses.length],
      ["created_at_utc", now()],
      [
        "version_policy",
        "Each questionnaire version has one clean horizontal sheet: one response per row and one question per column. The Codebook maps readable columns to stable question and choice codes.",
      ],
    ]),
  );
  return writeExcelFile(sheets).toBlob();
}

export async function demoCsv(projectId, formId) {
  return transaction((state) => {
    const user = authenticate(state);
    projectAccess(state, user, projectId, true);
    const forms = state.forms.filter(f => f.project_id === projectId && (!formId || f.id === formId));
    return csvFromSnapshot({forms, responses: state.responses.filter(r => r.project_id === projectId)});
  });
}

export function csvFromSnapshot({forms, responses}) {
    const field = (value, index) => {
      let text = String(value);
      if (!(index === 11 && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) && /^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const rows = ["response_id,project_id,form_id,form_version,collector_id,collected_at_utc,received_at_utc,question_id,question_label,question_type,status,answer_json"];
    for (const r of responses) {
      const f = forms.find(f => f.id === r.form_id);
      if (!f) continue;
      for (const q of f.questions.filter(q => q.kind !== "section")) {
        const status = r.statuses[q.id] || "not_recorded";
        rows.push([r.id, r.project_id, r.form_id, r.form_version, r.collector_id, r.collected_at, r.received_at, q.id, q.label, q.kind, status, JSON.stringify(status === "answered" ? r.answers[q.id] ?? null : null)].map(field).join(","));
      }
    }
    return rows.join("\r\n") + "\r\n";
}
