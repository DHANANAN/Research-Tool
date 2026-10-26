import { firebaseEnabled } from "./firebase.js";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Cloud,
  CloudOff,
  Copy,
  Download,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe2,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MoreHorizontal,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRound,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { api, downloadWorkbook, downloadCsv } from "./api.js";
import * as storage from "./storage.js";
import {
  enterDemo,
  exitDemo,
  isDemoMode,
  enableDemoMode,
  DEMO_ACCOUNTS,
} from "./demo.js";

const NAV = [
  ["overview", "Study overview", LayoutDashboard],
  ["forms", "Questionnaires", ClipboardList],
  ["collect", "Field collection", Smartphone],
  ["responses", "Responses & exports", BarChart3],
  ["team", "Research team", Users],
  ["profile", "My profile", UserRound],
];
const TYPES = [
  ["text", "Short text"],
  ["long_text", "Long text / opinion"],
  ["integer", "Whole number / rating"],
  ["decimal", "Decimal number"],
  ["single", "Single choice"],
  ["multiple", "Multiple choice"],
  ["boolean", "Yes / no"],
  ["date", "Date"],
  ["section", "Section heading"],
];
const EMPTY_QUESTION = () => ({
  id: `q_${crypto.randomUUID().slice(0, 8)}`,
  label: "",
  kind: "text",
  required: false,
  choices: [],
});
const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const badgeClass = (status) =>
  ({ draft: "badge amber", published: "badge green", closed: "badge neutral" })[
    status
  ] || "badge neutral";
const visible = (question, answers) =>
  !question.show_if ||
  answers[question.show_if.question_id] === question.show_if.equals;
const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && !value.trim()) ||
  (Array.isArray(value) && !value.length);
const deepCopy = (value) => JSON.parse(JSON.stringify(value));
const initialTheme = () => {
  try {
    const saved = localStorage.getItem("research-tool-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
};

function Button({
  children,
  icon: Icon,
  variant = "primary",
  small,
  className = "",
  ...props
}) {
  return (
    <button
      className={`btn ${variant} ${small ? "small" : ""} ${className}`}
      {...props}
    >
      {Icon && <Icon size={small ? 15 : 17} aria-hidden="true" />}
      {children}
    </button>
  );
}
function Status({ status }) {
  return (
    <span className={badgeClass(status)}>
      <i />
      {status === "published"
        ? "Published"
        : status === "closed"
          ? "Closed"
          : "Draft"}
    </span>
  );
}
function Empty({ icon: Icon = FolderOpen, title, description, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function Notice({ children, tone = "info", className = "" }) {
  return (
    <div className={`notice ${tone} ${className}`}>
      <CircleHelp size={17} />
      <div>{children}</div>
    </div>
  );
}

export default function App() {
  const [boot, setBoot] = useState(null),
    [loading, setLoading] = useState(true),
    [screen, setScreen] = useState("overview"),
    [theme, setTheme] = useState(initialTheme);
  const [projectId, setProjectId] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [offlineSession, setOfflineSession] = useState(false);
  const [queue, setQueue] = useState([]),
    [syncing, setSyncing] = useState(false),
    [message, setMessage] = useState(null),
    [storageError, setStorageError] = useState("");
  const [editor, setEditor] = useState(null),
    [mobileNav, setMobileNav] = useState(false),
    [installPrompt, setInstallPrompt] = useState(null),
    [projectModal, setProjectModal] = useState(false),
    [editingProject, setEditingProject] = useState(null);
  const syncLock = useRef(false),
    toastTimer = useRef(null),
    editorDirty = useRef(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem("research-tool-theme", theme);
    } catch {
      /* The visual preference can remain session-only. */
    }
  }, [theme]);
  const notify = useCallback((text, error = false) => {
    setMessage({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setMessage(null),
      error ? 12000 : 5000,
    );
  }, []);
  const failStorage = useCallback(
    (error) =>
      setStorageError(
        error?.message ||
          "Local storage is unavailable. Do not leave this page until your work is uploaded.",
      ),
    [],
  );
  const persistBoot = useCallback(
    async (data) => {
      try {
        await storage.set(`${data.user.id}.bootstrap`, {
          data,
          savedAt: Date.now(),
        });
        await storage.set("session", {
          userId: data.user.id,
          until: Date.now() + 24 * 60 * 60 * 1000,
        });
      } catch (error) {
        failStorage(error);
      }
    },
    [failStorage],
  );
  const refresh = useCallback(async () => {
    const data = await api("/api/bootstrap");
    setBoot(data);
    setOfflineSession(false);
    await persistBoot(data);
    return data;
  }, [persistBoot]);
  const readQueue = useCallback(
    async (userId) => {
      if (!userId) return;
      try {
        const items = await storage.all(`${userId}.outbox.`);
        setQueue(items.sort((a, b) => a.value.createdAt - b.value.createdAt));
      } catch (error) {
        failStorage(error);
      }
    },
    [failStorage],
  );
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api("/api/bootstrap");
        if (active) {
          setBoot(data);
          await persistBoot(data);
        }
      } catch (error) {
        if (!navigator.onLine) {
          try {
            const session = await storage.get("session");
            if (session?.until > Date.now()) {
              const cached = await storage.get(`${session.userId}.bootstrap`);
              if (cached?.data && active) {
                setBoot(cached.data);
                setOfflineSession(true);
              }
            }
          } catch (e) {
            failStorage(e);
          }
        } else if (error.status !== 401) notify(error.message, true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    const onOnline = () => setOnline(true),
      onOffline = () => setOnline(false),
      onInstall = (e) => {
        e.preventDefault();
        setInstallPrompt(e);
      };
    const storageFailure = (e) => setStorageError(e.detail);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("research-storage-error", storageFailure);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("research-storage-error", storageFailure);
    };
  }, [persistBoot, notify, failStorage]);
  useEffect(() => {
    if (boot) {
      if (!boot.projects.some((p) => p.id === projectId))
        setProjectId(boot.projects[0]?.id || "");
      readQueue(boot.user.id);
    }
  }, [boot, projectId, readQueue]);
  const sync = useCallback(async () => {
    if (!boot || !navigator.onLine || syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    let uploaded = 0;
    try {
      const pending = await storage.all(`${boot.user.id}.outbox.`);
      for (const item of pending) {
        try {
          const receipt = await api("/api/responses", {
            method: "POST",
            body: item.value.payload,
          });
          if (
            receipt.id !== item.value.payload.id ||
            receipt.collector_id !== item.value.payload.expected_user_id ||
            typeof receipt.received_at !== "string"
          )
            throw new Error(
              "The server receipt could not be verified. The response is still saved on this device.",
            );
          await storage.del(item.key);
          uploaded++;
        } catch (error) {
          await storage.set(item.key, {
            ...item.value,
            state: "error",
            error: error.message,
          });
          if (error.status === 401) {
            notify(
              "Your session has expired. Sign in again to upload your saved responses.",
              true,
            );
            break;
          }
        }
      }
      await readQueue(boot.user.id);
      if (uploaded) {
        notify(
          isDemoMode()
            ? `${uploaded} ${uploaded === 1 ? "response" : "responses"} saved in the playground.`
            : `${uploaded} ${uploaded === 1 ? "response" : "responses"} received by the server.`,
        );
        await refresh().catch(() => {});
      }
    } catch (error) {
      failStorage(error);
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [boot, notify, readQueue, refresh, failStorage]);
  useEffect(() => {
    if (online && boot) sync();
  }, [online, boot?.user.id]);
  const canLeaveEditor = () =>
    !editorDirty.current ||
    window.confirm(
      "This questionnaire has changes not yet saved to the server. Local recovery is retained on this device. Leave the editor?",
    );
  const openNewStudy = () => {
    if (!canLeaveEditor()) return;
    setEditor(null);
    editorDirty.current = false;
    setEditingProject(null);
    setProjectModal(true);
  };
  const openEditStudy = () => {
    const current = boot?.projects.find((item) => item.id === projectId);
    if (!current) return;
    // Keep the questionnaire editor mounted underneath this metadata dialog.
    setEditingProject(current);
    setProjectModal(true);
  };
  const navigate = (next) => {
    if (!canLeaveEditor()) return;
    editorDirty.current = false;
    setScreen(next);
    setEditor(null);
    setMobileNav(false);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (!boot) return;
    const timer = setInterval(async () => {
      if (!navigator.onLine) {
        const local = await storage.get("session").catch(() => null);
        if (!local || local.until <= Date.now()) {
          setBoot(null);
          notify(
            "Your offline access period has ended. Reconnect and sign in. Saved local work is retained.",
            true,
          );
        }
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [boot?.user.id, notify]);
  const logout = async () => {
    if (!canLeaveEditor()) return;
    if (!navigator.onLine) {
      notify(
        "Connect to sign out securely. Your saved local work is retained; keep your device locked while offline.",
        true,
      );
      return;
    }
    if (
      queue.length &&
      !window.confirm(
        `${queue.length} responses have not reached the server. They will remain on this device and require this same account to upload. Sign out anyway?`,
      )
    )
      return;
    try {
      if (navigator.onLine)
        await api("/api/auth/logout", { method: "POST", body: {} });
      else if (
        !window.confirm(
          "You are offline. Local access will close, but the server session cannot be ended until you reconnect. Continue?",
        )
      )
        return;
      await storage.del("session");
      setBoot(null);
      setEditor(null);
      setQueue([]);
      setOfflineSession(false);
    } catch (error) {
      notify(error.message, true);
    }
  };
  const leavePlayground = async () => {
    if (!canLeaveEditor()) return;
    if (
      queue.length &&
      !window.confirm(
        "Leave the playground with responses still waiting on this device? They will remain available to this same test account.",
      )
    )
      return;
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      exitDemo();
      await storage.del("session");
      setBoot(null);
      setEditor(null);
      setQueue([]);
      setOfflineSession(false);
      setScreen("overview");
    } catch (error) {
      notify(error.message, true);
    }
  };
  const doExport = async (formId, csv = false) => {
    try {
      await (csv ? downloadCsv : downloadWorkbook)(projectId, formId);
      notify(
        "Your export is ready. Keep downloaded research data private.",
      );
    } catch (error) {
      notify(error.message, true);
    }
  };
  if (loading)
    return (
      <div className="splash">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Opening your research workspace…</p>
      </div>
    );
  if (!boot)
    return (
      <Auth
        online={online}
        onSuccess={async () => {
          try {
            await refresh();
            setScreen("overview");
          } catch (e) {
            notify(e.message, true);
          }
        }}
        message={message}
      />
    );
  const project = boot.projects.find((p) => p.id === projectId),
    forms = boot.forms.filter((f) => f.project_id === projectId),
    admin = boot.user.role === "admin";
  const navItems = NAV.filter(([key]) => admin || !["team"].includes(key));
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-btn mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-caption">RESEARCH WORKSPACE</div>
        <div className="workspace-card">
          <div className="workspace-mark">
            <Leaf size={20} />
          </div>
          <div>
            <strong>Your research, connected</strong>
            <span>Open-source fieldwork suite</span>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map(([key, title, Icon]) => (
            <button
              key={key}
              className={`nav-item ${screen === key ? "active" : ""}`}
              onClick={() => navigate(key)}
            >
              <Icon size={19} />
              <span>{title}</span>
              {key === "collect" && queue.length > 0 && <b>{queue.length}</b>}
              {screen === key && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="field-note">
            <span>
              <Globe2 size={17} /> BUILT FOR THE FIELD
            </span>
            <p>Good data begins with people. Keep listening, even offline.</p>
            <button onClick={() => navigate("collect")}>
              Open field collection <ArrowUp size={14} className="diagonal" />
            </button>
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" />
            Open source. Researcher owned.<span className="version">v0.1</span>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <div className="nav-backdrop" onClick={() => setMobileNav(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{NAV.find((n) => n[0] === screen)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-btn theme-toggle"
              aria-label={`Use ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Use ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className={`connection ${online ? "" : "offline"}`}
              onClick={sync}
              disabled={syncing}
              title="Upload pending responses"
            >
              {syncing ? (
                <LoaderCircle size={15} className="spin" />
              ) : online ? (
                <Cloud size={16} />
              ) : (
                <CloudOff size={16} />
              )}
              <span>
                {syncing
                  ? "Syncing…"
                  : online
                    ? queue.length
                      ? `${queue.length} pending`
                      : "Connected"
                    : "Working offline"}
              </span>
            </button>
            <span className="topbar-divider" />
            <div className="user-info">
              <strong>{boot.user.name}</strong>
              <span>{admin ? "Administrator" : "Field surveyor"}</span>
            </div>
            <button
              className="avatar profile-trigger"
              aria-label="Open my profile"
              title="Open my profile"
              onClick={() => navigate("profile")}
            >
              {boot.user.name?.slice(0, 2).toUpperCase()}
            </button>
            <button
              className="icon-btn"
              aria-label="Sign out"
              title="Sign out"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          {isDemoMode() && (
            <section className="playground-banner" aria-label="Playground mode">
              <div>
                <strong>Guest playground</strong>
                <span>
                  Stored in this browser. Use fictional data. Live research
                  records are separate.
                </span>
              </div>
              <button type="button" onClick={leavePlayground}>
                Leave playground <LogOut size={16} />
              </button>
            </section>
          )}
          {storageError && (
            <Notice tone="danger" className="global-notice">
              <strong>Local saving needs attention.</strong> {storageError}{" "}
              Reconnect and upload your work before closing this page.
            </Notice>
          )}
          {(offlineSession || !online) && (
            <Notice tone="warning" className="global-notice">
              You are using downloaded assignments on this previously signed-in
              device. New access and server confirmation require a connection.
              Local responses have not yet been uploaded.
            </Notice>
          )}
          <div className="study-switcher">
            <div>
              <span className="eyebrow">CURRENT STUDY</span>
              <label className="project-select">
                <span className="sr-only">Current study</span>
                <select
                  aria-label="Current study"
                  value={projectId}
                  onChange={(e) => {
                    if (!canLeaveEditor()) return;
                    editorDirty.current = false;
                    setProjectId(e.target.value);
                    setEditor(null);
                  }}
                >
                  {boot.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {!boot.projects.length && (
                    <option value="">No assigned studies</option>
                  )}
                </select>
                <ChevronDown size={15} />
              </label>
            </div>
            <div className="study-switcher-actions">
              {admin && project && (
                <button
                  className="text-button"
                  onClick={openEditStudy}
                  disabled={!online}
                >
                  <Settings2 size={14} />
                  Edit study
                </button>
              )}
              {admin && (
                <button className="text-button" onClick={openNewStudy}>
                  <Plus size={14} />
                  New study
                </button>
              )}
              <span className="pilot-badge">
                <span />
                Development pilot
              </span>
            </div>
          </div>
          {editor ? (
            <FormEditor
              form={editor}
              projectId={projectId}
              userId={boot.user.id}
              onDirty={(value) => {
                editorDirty.current = value;
              }}
              onBack={() => setEditor(null)}
              onSaved={async (saved) => {
                setEditor(saved);
                await refresh();
              }}
              onPublished={async () => {
                setEditor(null);
                await refresh();
                notify(
                  "Questionnaire published. Field collection is now available.",
                );
              }}
              notify={notify}
              online={online}
            />
          ) : screen === "overview" ? (
            <Overview
              project={project}
              forms={forms}
              stats={boot.stats}
              admin={admin}
              queue={queue}
              navigate={navigate}
              onCreateStudy={openNewStudy}
              onEdit={setEditor}
              onInstall={
                installPrompt
                  ? async () => {
                      await installPrompt.prompt();
                      setInstallPrompt(null);
                    }
                  : null
              }
            />
          ) : screen === "forms" ? (
            <Forms
              forms={forms}
              project={project}
              admin={admin}
              online={online}
              onEdit={setEditor}
              refresh={refresh}
              notify={notify}
              onCollect={() => navigate("collect")}
            />
          ) : screen === "collect" ? (
            <Collection
              forms={forms}
              project={project}
              user={boot.user}
              online={online}
              queue={queue}
              syncing={syncing}
              sync={sync}
              refreshQueue={() => readQueue(boot.user.id)}
              notify={notify}
              failStorage={failStorage}
            />
          ) : screen === "responses" ? (
            <Responses
              project={project}
              user={boot.user}
              forms={forms}
              online={online}
              onExport={doExport}
              notify={notify}
            />
          ) : screen === "profile" ? (
            <Profile
              user={boot.user}
              org={boot.org}
              project={project}
              projects={boot.projects}
              stats={boot.stats}
              admin={admin}
              navigate={navigate}
            />
          ) : (
            <Team
              project={project}
              user={boot.user}
              online={online}
              notify={notify}
              refresh={refresh}
            />
          )}
        </main>
        <footer className="page-footer">
          <span>Thoughtful collection. Meaningful research.</span>
          <span>
            <ShieldCheck size={13} />
            Private study data · Open-source software
          </span>
        </footer>
      </div>
      {message && (
        <div className={`toast ${message.error ? "error" : ""}`} role="status">
          {message.error ? <CircleHelp size={19} /> : <CheckCheck size={19} />}
          <span>{message.text}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setMessage(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {projectModal && (
        <ProjectModal
          project={editingProject}
          onClose={() => setProjectModal(false)}
          onSave={async (values) => {
            try {
              const created = await api(
                editingProject
                  ? `/api/projects/${editingProject.id}`
                  : "/api/projects",
                {
                  method: editingProject ? "PUT" : "POST",
                  body: values,
                },
              );
              await refresh();
              setProjectId(created.id);
              setProjectModal(false);
              notify(
                editingProject
                  ? "Study details and locations updated."
                  : "Your study workspace is ready.",
              );
            } catch (e) {
              notify(e.message, true);
            }
          }}
        />
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Leaf size={23} strokeWidth={1.8} />
      </span>
      <span>
        research<span className="brand-light">tool</span>
        <i />
      </span>
    </div>
  );
}
function Auth({ onSuccess, online, message }) {
  const [tab, setTab] = useState("login");
  const [values, setValues] = useState({
    login_id: "",
    password: "",
    activation_code: "",
    org_name: "",
    name: "",
    token: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [playground, setPlayground] = useState(isDemoMode());
  const [showGuests, setShowGuests] = useState(false);
  const set = (key) => (event) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const switchTab = (next) => {
    setTab(next);
    setError("");
  };
  const openGuest = async (loginId) => {
    setBusy(true);
    setError("");
    try {
      await enterDemo(loginId);
      await onSuccess();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    const guest = DEMO_ACCOUNTS.find(
      (account) => account.login_id === values.login_id.trim(),
    );
    const local = playground || (tab === "login" && guest);
    if (!online && !local) {
      setError(
        "Connect to create or access a live account. The playground works on this device.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (tab === "login" && guest) {
        if (values.password !== "ResearchDemo2026!")
          throw new Error(
            "Use the public test password ResearchDemo2026!, or choose a profile under Explore demo.",
          );
        await enterDemo(guest.login_id);
      } else {
        if (playground) enableDemoMode();
        else if (isDemoMode()) exitDemo();
        const path = {
          login: "/api/auth/login",
          activate: "/api/auth/activate",
          register: "/api/auth/register",
          join: "/api/auth/join",
        }[tab];
        const body =
          tab === "login"
            ? { login_id: values.login_id, password: values.password }
            : tab === "activate"
              ? {
                  login_id: values.login_id,
                  activation_code: values.activation_code,
                  password: values.password,
                }
              : tab === "register"
                ? {
                    org_name: values.org_name,
                    login_id: values.login_id,
                    name: values.name,
                    password: values.password,
                  }
                : {
                    token: values.token,
                    login_id: values.login_id,
                    name: values.name,
                    password: values.password,
                  };
        await api(path, { method: "POST", body });
      }
      setValues({
        login_id: "",
        password: "",
        activation_code: "",
        org_name: "",
        name: "",
        token: "",
      });
      await onSuccess();
    } catch (failure) {
      setError(
        [404, 503].includes(failure.status)
          ? "The live account service is unavailable. Choose Explore demo to try the tool now, or create a playground organization on this device."
          : failure.message,
      );
    } finally {
      setBusy(false);
    }
  };
  const tabs = [
    ["login", "Sign in"],
    ["register", "Create organization"],
    ["join", "Join a team"],
    ["activate", "Activate account"],
  ];
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Brand />
        <div className="auth-story-main">
          <span className="eyebrow">RESEARCH MANAGEMENT SUITE</span>
          <h1>
            Your questions.
            <br />
            Your field team.
            <br />
            <em>Your research.</em>
          </h1>
          <p>
            Create questionnaires, collect answers, and download a dataset you
            can analyze. Start an organization or explore with the example
            accounts.
          </p>
          <div className="auth-principles">
            <span>
              <ShieldCheck size={18} />
              Researcher owned
            </span>
            <span>
              <WifiOff size={18} />
              Offline fieldwork
            </span>
            <span>
              <Globe2 size={18} />
              Open source
            </span>
          </div>
          <div className="auth-example-note">
            <strong>Smart Cities, Silent Citizens</strong>
            <p>
              An editable example study helps you try questionnaires,
              collection, and Excel exports. Its sample content is for
              demonstration.
            </p>
          </div>
        </div>
        <span className="auth-footnote">
          A familiar research portal. Built for any study.
        </span>
      </div>
      <div className="auth-form-area">
        <div className="auth-entry-heading">
          <span className="eyebrow">WELCOME TO RESEARCH-TOOL</span>
          <h2>Open your workspace</h2>
          <p>Sign in, create an organization, or take a look around.</p>
        </div>
        <section className="guest-entry" aria-label="Guest access">
          <div className="guest-entry-heading">
            <div>
              <strong>Try the complete workflow</strong>
              <p>
                No personal account needed. Your playground stays in this
                browser.
              </p>
            </div>
            <Button
              variant="secondary"
              icon={Users}
              disabled={busy}
              onClick={() => setShowGuests(!showGuests)}
              aria-expanded={showGuests}
            >
              Explore demo
            </Button>
          </div>
          {showGuests && (
            <div className="guest-profiles">
              <p className="guest-credentials">
                Four test accounts · password: <code>ResearchDemo2026!</code>
              </p>
              <div className="guest-profile-grid">
                {DEMO_ACCOUNTS.map((account, index) => (
                  <button
                    type="button"
                    className="guest-profile"
                    disabled={busy}
                    key={account.login_id}
                    onClick={() => openGuest(account.login_id)}
                  >
                    <span className="guest-profile-icon">
                      {account.role === "admin" ? (
                        <Settings2 size={20} />
                      ) : (
                        <ClipboardList size={20} />
                      )}
                    </span>
                    <strong>
                      {account.role === "admin"
                        ? "Guest administrator"
                        : `Guest surveyor ${index}`}
                    </strong>
                    <span>
                      {account.role === "admin"
                        ? "Create and edit questionnaires; view and export responses."
                        : "Collect fictional answers and test fieldwork."}
                    </span>
                    <code>{account.login_id}</code>
                  </button>
                ))}
              </div>
              <p className="guest-data-note">
                Playground: stored in this browser. Use fictional data. This is
                separate from live research accounts.
              </p>
            </div>
          )}
        </section>
        <div className="auth-tabs" aria-label="Account access">
          {tabs.filter(([key]) => !(firebaseEnabled && !playground && key === "activate")).map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => switchTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <form className="auth-form" onSubmit={submit}>
          <h3>
            {tab === "login"
              ? "Sign in to your account"
              : tab === "register"
                ? "Create an organization and administrator account"
                : tab === "join"
                  ? "Join your research team"
                  : "Activate your surveyor account"}
          </h3>
          <p>
            {tab === "login"
              ? "Use your own login ID or one of the test accounts above."
              : tab === "register"
                ? "Your organization brings your research team, questionnaires, and studies together."
                : tab === "join"
                  ? "Enter the invitation code shared by your administrator."
                  : "Use the one-time code supplied by your study administrator."}
          </p>
          {firebaseEnabled && !playground && <Notice>Cloud accounts use an email address as the login ID. Surveyors: choose Join organization and enter your invitation code. Invitations last seven days.</Notice>}
          {firebaseEnabled && !playground && tab === "login" && <button type="button" className="text-button" onClick={async () => {
            try { await api("/api/auth/reset", {method:"POST",body:{login_id:values.login_id}}); setError("Password reset requested. Check your email inbox."); }
            catch(e) { setError(e.message); }
          }}>Reset password by email</button>}
          {(error || message?.error) && (
            <div role="alert">
              <Notice tone="danger">{error || message.text}</Notice>
            </div>
          )}
          {tab === "register" && (
            <label>
              Organization name
              <input
                aria-label="Organization name"
                required
                autoComplete="organization"
                value={values.org_name}
                onChange={set("org_name")}
                placeholder="Institution or research group"
              />
            </label>
          )}
          {["register", "join"].includes(tab) && (
            <label>
              Your full name
              <input
                aria-label="Your full name"
                required
                autoComplete="name"
                value={values.name}
                onChange={set("name")}
                placeholder="Your name"
              />
            </label>
          )}
          {tab === "join" && (
            <label>
              Invitation code
              <input
                aria-label="Invitation code"
                required
                autoComplete="off"
                value={values.token}
                onChange={set("token")}
                placeholder="Code from your administrator"
              />
            </label>
          )}
          <label>
            {["register", "join"].includes(tab)
              ? "Choose a login ID"
              : "Login ID"}
            <input
              aria-label={
                ["register", "join"].includes(tab)
                  ? "Choose a login ID"
                  : "Login ID"
              }
              required
              autoComplete="username"
              value={values.login_id}
              onChange={set("login_id")}
              placeholder={
                tab === "login"
                  ? "Your login ID"
                  : "For example, your email or team ID"
              }
            />
          </label>
          {tab === "activate" && (
            <label>
              One-time activation code
              <input
                aria-label="One-time activation code"
                required
                autoComplete="off"
                value={values.activation_code}
                onChange={set("activation_code")}
                placeholder="Enter your activation code"
              />
            </label>
          )}
          <label>
            {["join", "activate"].includes(tab)
              ? "Choose a password"
              : "Password"}
            <input
              aria-label={
                ["join", "activate"].includes(tab)
                  ? "Choose a password"
                  : "Password"
              }
              required
              type="password"
              minLength={tab === "login" ? undefined : 12}
              autoComplete={
                tab === "login" ? "current-password" : "new-password"
              }
              value={values.password}
              onChange={set("password")}
              placeholder={
                tab === "login"
                  ? "Enter your password"
                  : "At least 12 characters"
              }
            />
          </label>
          <label className="auth-playground-toggle">
            <input
              type="checkbox"
              checked={playground}
              onChange={(event) => setPlayground(event.target.checked)}
            />
            <span>
              <strong>
                {tab === "register"
                  ? "Create this organization in the local playground"
                  : "Use the local playground"}
              </strong>
              <small>
                Practice on this browser with fictional information. Live
                accounts require the online service.
              </small>
            </span>
          </label>
          <Button
            type="submit"
            disabled={
              busy ||
              (!online &&
                !playground &&
                !(
                  tab === "login" &&
                  DEMO_ACCOUNTS.some(
                    (account) => account.login_id === values.login_id.trim(),
                  )
                ))
            }
            icon={busy ? LoaderCircle : ArrowRight}
          >
            {busy
              ? "Opening workspace…"
              : tab === "login"
                ? "Sign in to workspace"
                : tab === "register"
                  ? "Create organization"
                  : tab === "join"
                    ? "Join organization"
                    : "Activate account"}
          </Button>
          {tab === "login" && (
            <button
              type="button"
              className="text-button auth-toggle"
              onClick={() => switchTab("activate")}
            >
              Have an invitation? Activate your account
            </button>
          )}
          {!online && (
            <Notice tone="warning">
              You are offline. Choose a playground profile to explore, or
              reconnect to use a live account.
            </Notice>
          )}
          <div className="auth-help">
            <CircleHelp size={17} />
            <span>
              Need help with a live account? Contact your study administrator.
            </span>
          </div>
        </form>
        <span className="auth-copyright">
          Research-Tool · An open-source research workspace
        </span>
      </div>
    </div>
  );
}

function Overview({
  project,
  forms,
  stats,
  admin,
  queue,
  navigate,
  onCreateStudy,
  onEdit,
  onInstall,
}) {
  const published = forms.filter((f) => f.status === "published"),
    drafts = forms.filter((f) => f.status === "draft");
  const isSmartCities = project?.name.toLowerCase().includes("smart cities");
  if (!project)
    return (
      <>
        <PageHeading
          eyebrow="A PLACE FOR YOUR NEXT QUESTION"
          title={admin ? "Begin a new study." : "Your fieldwork starts here."}
          description={
            admin
              ? "Create a study, prepare its questionnaire, and invite the people who will help collect."
              : "Your administrator will assign a project and publish a questionnaire for you."
          }
        >
          {admin && (
            <Button icon={Plus} onClick={onCreateStudy}>
              Create study
            </Button>
          )}
        </PageHeading>
        <Empty
          title="A clear workspace, ready for research"
          description="Your assigned research projects will appear here."
        />
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow="FROM QUESTIONS TO UNDERSTANDING"
        title="Study overview"
        description="A shared home for your study, your field team, and every answer that matters."
      >
        <Button
          icon={admin ? Plus : Smartphone}
          onClick={admin ? () => navigate("forms") : () => navigate("collect")}
        >
          {admin ? "Manage questionnaires" : "Start collecting"}
        </Button>
      </PageHeading>
      <section className="study-hero">
        <div className="hero-copy">
          <span className="hero-label">
            <span />
            ACTIVE WORKSPACE <span className="hero-label-divider">/</span>{" "}
            {isSmartCities ? "ICSSR RESEARCH CONTEXT" : "YOUR RESEARCH CONTEXT"}
          </span>
          <h2>{project.name}</h2>
          <p>
            {project.description ||
              "Understanding lived experiences through careful, accessible field research."}
          </p>
          <div className="hero-tags">
            <span>
              <Users size={14} />
              {isSmartCities
                ? "Older adults & the oldest old"
                : "Researcher-led fieldwork"}
            </span>
            <span>
              <MapPin size={14} />
              {project.cities.length} locations configured
            </span>
          </div>
          <button className="hero-link" onClick={() => navigate("collect")}>
            Take your study into the field <ArrowRight size={16} />
          </button>
        </div>
        <CityArtwork />
        <div className="hero-index">
          STUDY WORKSPACE <span>01</span>
        </div>
      </section>
      <div className="stats-grid">
        <Stat
          icon={ClipboardList}
          title="Questionnaires"
          value={forms.length}
          note={`${published.length} published · ${drafts.length} in draft`}
        />
        <Stat
          icon={FileCheck2}
          title={admin ? "Workspace responses" : "Your responses"}
          value={stats.responses ?? 0}
          note="Across your accessible projects"
        />
        <Stat
          icon={Users}
          title="Workspace surveyors"
          value={stats.surveyors ?? 0}
          note="Across your accessible projects"
        />
        <Stat
          icon={Cloud}
          title="Pending upload"
          value={queue.length}
          note={
            queue.length
              ? "Saved on this device · sync to upload"
              : "No responses waiting on this device"
          }
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel questionnaire-panel">
          <PanelHeading
            title="Your questionnaires"
            description="Thoughtful questions are the beginning."
            action={
              <button className="text-button" onClick={() => navigate("forms")}>
                View all <ArrowRight size={15} />
              </button>
            }
          />
          {forms.length ? (
            <div className="form-list">
              {forms.slice(0, 3).map((form) => (
                <button
                  key={form.id}
                  className="form-list-row"
                  onClick={() => (admin ? onEdit(form) : navigate("collect"))}
                >
                  <span
                    className={`document-icon ${form.status === "published" ? "green" : ""}`}
                  >
                    <FileText size={22} />
                  </span>
                  <span className="form-row-copy">
                    <strong>{form.title}</strong>
                    <span>
                      {
                        form.questions.filter((q) => q.kind !== "section")
                          .length
                      }{" "}
                      questions <i />
                      Version {form.version}
                    </span>
                  </span>
                  <Status status={form.status} />
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={ClipboardList}
              title="What would you like to understand?"
              description="Your questionnaires will appear here once they are created."
            />
          )}
          <div className="panel-bottom-note">
            <ShieldCheck size={15} />
            <span>
              Drafts stay editable. Published versions protect the meaning of
              your data.
            </span>
          </div>
        </section>
        <section className="panel readiness-panel">
          <span className="eyebrow">A THOUGHTFUL START</span>
          <h3>Ready for the field?</h3>
          <p>Small checks. Dependable collection.</p>
          <div className="readiness-items">
            <Readiness
              done={forms.length > 0}
              label="Prepare your questionnaire"
              detail="Create a draft and review every question."
            />
            <Readiness
              done={published.length > 0}
              label="Review & publish a version"
              detail="Confirm your protocol and consent wording."
            />
            <Readiness
              done={false}
              label="Confirm field team access"
              detail="Check individual access in Research team."
            />
          </div>
          <button
            className="text-button"
            onClick={() => navigate(admin ? "forms" : "collect")}
          >
            {admin ? "Prepare your study" : "Open field collection"}{" "}
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <section className="panel city-panel">
        <div>
          <span className="eyebrow">RESEARCH ACROSS CITIES</span>
          <h3>
            {isSmartCities
              ? "Different cities. Every perspective matters."
              : "Different places. Meaningful perspectives."}
          </h3>
          <p>
            {isSmartCities
              ? "Study locations and age definitions remain editable. The final city list and approved protocol need confirmation."
              : "Configure the locations that matter to your study. Your research is never limited to a fixed city list or population."}
          </p>
        </div>
        <div className="city-chips">
          {project.cities.map((city, i) => (
            <span key={city}>
              <span className="city-number">0{i + 1}</span>
              <MapPin size={14} />
              {city}
            </span>
          ))}
        </div>
      </section>
      <div className="bottom-callouts">
        <div>
          <span className="small-icon">
            <Smartphone size={22} />
          </span>
          <div>
            <strong>Your workspace goes with you.</strong>
            <p>
              Use your phone browser or add this web app to your home screen.
            </p>
          </div>
          {onInstall ? (
            <Button
              small
              variant="secondary"
              icon={Download}
              onClick={onInstall}
            >
              Install app
            </Button>
          ) : (
            <span className="muted mobile-hide">
              Browser & home-screen access
            </span>
          )}
        </div>
        <div>
          <span className="small-icon orange">
            <FileSpreadsheet size={23} />
          </span>
          <div>
            <strong>Answers, ready for analysis.</strong>
            <p>
              Export real responses to Excel with stable columns and a codebook.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => navigate("responses")}
            aria-label="View responses and exports"
          >
            <ArrowRight size={19} />
          </button>
        </div>
      </div>
    </>
  );
}
function Stat({ icon: Icon, title, value, note }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <Icon size={19} />
      </div>
      <strong>
        {value}
        <span>{title === "Pending upload" ? "on device" : ""}</span>
      </strong>
      <p>{note}</p>
    </div>
  );
}
function Readiness({ done, label, detail }) {
  return (
    <div className={`readiness-item ${done ? "done" : ""}`}>
      <span>{done ? <Check size={13} /> : <i />}</span>
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
function PanelHeading({ title, description, action }) {
  return (
    <div className="panel-heading">
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
function CityArtwork() {
  return (
    <svg
      className="city-artwork"
      viewBox="0 0 400 220"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="225" cy="97" r="85" fill="#31594f" opacity=".6" />
      <circle
        cx="225"
        cy="97"
        r="113"
        stroke="#8caa91"
        strokeDasharray="3 7"
        opacity=".28"
      />
      <path d="M28 181H375M45 171H356" stroke="#c3c9a7" strokeOpacity=".4" />
      <path
        d="M77 170V109H112V170M83 110V98H106V110M90 98V86H99V98M87 126H102M87 138H102M87 150H102"
        stroke="#d7d7b3"
        strokeWidth="2"
      />
      <path
        d="M125 170V81H168V170M134 96H159M134 109H159M134 122H159M134 135H159M134 148H159M146 81V65"
        stroke="#b2c6af"
        strokeWidth="2"
      />
      <path
        d="M181 170V119H225V170M186 118C186 88 220 88 220 118M203 96V79M191 136H215M191 148H215"
        stroke="#d9b880"
        strokeWidth="2"
      />
      <path
        d="M240 170V66H283V170M246 66V51H277V66M251 81V91M265 81V91M251 103V113M265 103V113M251 125V135M265 125V135M251 147V157M265 147V157"
        stroke="#d7d7b3"
        strokeWidth="2"
      />
      <path
        d="M302 170V119H331V170M306 119V106H327V119M311 106V95H322V106M310 134H323M310 146H323"
        stroke="#b1c7b0"
        strokeWidth="2"
      />
      <path
        d="M52 170V146M52 149C32 145 37 124 52 121C68 123 72 146 52 149ZM349 170V140M349 143C332 139 335 120 349 118C363 120 368 139 349 143Z"
        stroke="#8eb49b"
        strokeWidth="2"
      />
      <circle cx="197" cy="52" r="5" fill="#f0b578" />
      <circle cx="326" cy="67" r="3" fill="#91b49c" />
      <path
        d="M80 63L91 59L102 63M301 34L309 31L317 34"
        stroke="#afc5ad"
        strokeWidth="1.5"
      />
      <path
        d="M48 188C110 178 194 202 248 186C283 177 324 183 365 188"
        stroke="#99b29b"
        strokeOpacity=".4"
      />
    </svg>
  );
}

function Forms({
  forms,
  project,
  admin,
  online,
  onEdit,
  refresh,
  notify,
  onCollect,
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [importOpen, setImportOpen] = useState(false);
  const newForm = () =>
    onEdit({
      id: null,
      project_id: project.id,
      title: "Untitled questionnaire",
      description: "",
      version: 1,
      status: "draft",
      reviewed: false,
      questions: [
        {
          id: "q_consent",
          label:
            "After hearing the study information, do you agree to participate?",
          kind: "boolean",
          required: true,
          choices: [],
        },
      ],
    });
  const shown = forms.filter(
    (f) =>
      (filter === "all" || f.status === filter) &&
      f.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="ASK WITH INTENTION"
        title="Questionnaire library"
        description="Build, review, and publish questionnaires that your field team can trust."
      >
        {admin && (
          <>
            <Button
              variant="secondary"
              icon={Upload}
              disabled={!project || !online}
              onClick={() => setImportOpen(true)}
            >
              Import questionnaire
            </Button>
            <Button
              icon={Plus}
              disabled={!project || !online}
              onClick={newForm}
            >
              New questionnaire
            </Button>
          </>
        )}
      </PageHeading>
      <div className="toolbar">
        <div className="tabs">
          {["all", "draft", "published", "closed"].map((tab) => (
            <button
              key={tab}
              className={filter === tab ? "active" : ""}
              onClick={() => setFilter(tab)}
            >
              {tab === "all"
                ? "All questionnaires"
                : tab[0].toUpperCase() + tab.slice(1)}
              <span>
                {tab === "all"
                  ? forms.length
                  : forms.filter((f) => f.status === tab).length}
              </span>
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search questionnaires"
            placeholder="Search questionnaires…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="questionnaire-grid">
        {shown.map((form) => (
          <article className="questionnaire-card" key={form.id}>
            <div className="card-top">
              <span className="document-icon">
                <ClipboardList size={25} />
              </span>
              <Status status={form.status} />
            </div>
            <span className="eyebrow">VERSION {form.version}</span>
            <h3>{form.title}</h3>
            <p>
              {form.description ||
                "Add an introduction to help your team understand this questionnaire."}
            </p>
            <div className="card-meta">
              <span>
                <FileText size={14} />
                {form.questions.filter((q) => q.kind !== "section").length}{" "}
                questions
              </span>
              <span>
                {form.reviewed ? (
                  <>
                    <Check size={14} />
                    Reviewed
                  </>
                ) : (
                  "Review needed"
                )}
              </span>
            </div>
            <div className="card-actions">
              <Button
                variant="secondary"
                small
                onClick={() => (admin ? onEdit(form) : onCollect())}
                icon={admin ? Settings2 : Smartphone}
              >
                {admin
                  ? form.status === "draft"
                    ? "Edit questionnaire"
                    : "View questionnaire"
                  : "Collect answers"}
              </Button>
              <span className="muted">
                {form.status === "draft" ? "Unpublished" : "Version protected"}
              </span>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <div className="panel">
          <Empty
            icon={ClipboardList}
            title={
              search
                ? "No matching questionnaires"
                : "Your next question starts here"
            }
            description={
              admin
                ? "Create a questionnaire or import a PDF draft, then review it before publication."
                : "Your administrator will publish questionnaires for this project."
            }
          >
            {admin && project && (
              <Button icon={Plus} onClick={newForm} disabled={!online}>
                Create a questionnaire
              </Button>
            )}
          </Empty>
        </div>
      )}
      <Notice>
        Imported questions and example study questions are drafts, not approved
        research instruments. Check the protocol, consent wording, question
        types, and skip rules before publishing.
      </Notice>
      {importOpen && (
        <ImportModal
          project={project}
          notify={notify}
          onClose={() => setImportOpen(false)}
          onImported={(result) => {
            onEdit({
              id: null,
              project_id: project.id,
              title: result.title || "Imported questionnaire",
              description:
                "Imported candidate draft. Review against the original document and approved study protocol.",
              questions: result.questions,
              reviewed: false,
              status: "draft",
              version: 1,
            });
            setImportOpen(false);
          }}
        />
      )}
    </>
  );
}

function FormEditor({
  form,
  projectId,
  userId,
  onDirty,
  onBack,
  onSaved,
  onPublished,
  notify,
  online,
}) {
  const [draft, setDraft] = useState(deepCopy(form)),
    [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [dirty, setDirty] = useState(false);
  const recoveryKey = `${userId}.editor.${form.id || `new.${projectId}`}`;
  useEffect(() => {
    let active = true;
    setDraft(deepCopy(form));
    setDirty(false);
    setSelected(0);
    if (form.status === "draft")
      storage
        .get(recoveryKey)
        .then((local) => {
          if (active && local?.draft) {
            setDraft(local.draft);
            setDirty(true);
            notify(
              "Recovered local questionnaire changes. Save this draft to update the server.",
            );
          }
        })
        .catch((error) => notify(error.message, true));
    return () => {
      active = false;
    };
  }, [form.id, form.status]);
  useEffect(() => {
    onDirty(dirty);
    const listener = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => {
      window.removeEventListener("beforeunload", listener);
      onDirty(false);
    };
  }, [dirty]);
  const editable = draft.status === "draft",
    question = draft.questions[selected];
  const update = (patch) => {
    const next = { ...draft, ...patch, reviewed: patch.reviewed ?? false };
    setDraft(next);
    setDirty(true);
    storage
      .set(recoveryKey, { draft: next, updatedAt: Date.now() })
      .catch((error) => notify(error.message, true));
  };
  const editQuestion = (patch) =>
    update({
      questions: draft.questions.map((q, i) =>
        i === selected ? { ...q, ...patch } : q,
      ),
    });
  const save = async () => {
    const result = await api(
      draft.id ? `/api/forms/${draft.id}` : `/api/projects/${projectId}/forms`,
      {
        method: draft.id ? "PUT" : "POST",
        body: {
          title: draft.title,
          description: draft.description,
          questions: draft.questions,
          reviewed: draft.reviewed,
        },
      },
    );
    setDraft(deepCopy(result));
    setDirty(false);
    await storage.del(recoveryKey);
    await onSaved(result);
    return result;
  };
  const act = async (action) => {
    setBusy(true);
    try {
      if (action === "save") {
        await save();
        notify("Draft saved. Your questionnaire is still unpublished.");
      } else if (action === "publish") {
        const saved = await save();
        await api(`/api/forms/${saved.id}/publish`, {
          method: "POST",
          body: {},
        });
        await onPublished();
      } else if (action === "revise") {
        const revised = await api(`/api/forms/${draft.id}/revise`, {
          method: "POST",
          body: {},
        });
        setDraft(deepCopy(revised));
        await onSaved(revised);
        notify(
          "A new draft version is ready. Existing responses keep their original version.",
        );
      } else {
        if (
          !window.confirm(
            "Close this version to new submissions? Offline responses using it will need attention when they reconnect.",
          )
        )
          return;
        const closed = await api(`/api/forms/${draft.id}/close`, {
          method: "POST",
          body: {},
        });
        setDraft(closed);
        await onSaved(closed);
        notify("This version is closed to new submissions.");
      }
    } catch (error) {
      notify(error.message, true);
    } finally {
      setBusy(false);
    }
  };
  const move = (delta) => {
    const next = selected + delta;
    if (next < 0 || next >= draft.questions.length) return;
    const questions = [...draft.questions];
    [questions[selected], questions[next]] = [
      questions[next],
      questions[selected],
    ];
    update({ questions });
    setSelected(next);
  };
  const back = () => {
    if (
      dirty &&
      !window.confirm(
        "Leave this editor? Unsaved changes in this questionnaire draft will be lost.",
      )
    )
      return;
    onBack();
  };
  const previous = draft.questions
    .slice(0, selected)
    .filter((q) => !["section", "multiple"].includes(q.kind));
  return (
    <>
      <button className="text-button back-link" onClick={back}>
        <ArrowLeft size={16} />
        Back to workspace
      </button>
      <PageHeading
        eyebrow={`QUESTIONNAIRE BUILDER · VERSION ${draft.version}`}
        title={
          editable
            ? "Make every question count."
            : "A protected questionnaire version."
        }
        description={
          editable
            ? "Build a clear, accessible conversation. Save your draft before leaving this editor."
            : "Published versions are fixed. Create a revision to change questions without reinterpreting past answers."
        }
      >
        <Button
          variant="secondary"
          icon={preview ? Settings2 : Smartphone}
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Return to editor" : "Preview form"}
        </Button>
        {editable ? (
          <>
            <Button
              variant="secondary"
              icon={Save}
              disabled={busy || !online}
              onClick={() => act("save")}
            >
              {busy ? "Saving…" : "Save draft"}
            </Button>
            <Button
              icon={Send}
              disabled={busy || !online || !draft.reviewed}
              onClick={() => act("publish")}
            >
              Publish version
            </Button>
          </>
        ) : (
          <>
            <Button
              icon={Plus}
              disabled={busy || !online}
              onClick={() => act("revise")}
            >
              Create revision
            </Button>
            {draft.status === "published" && (
              <Button
                variant="secondary"
                disabled={busy || !online}
                onClick={() => act("close")}
              >
                Close version
              </Button>
            )}
          </>
        )}
      </PageHeading>
      <div className="editor-meta panel">
        <div className="editor-title">
          <label>
            Questionnaire title
            <input
              value={draft.title}
              readOnly={!editable}
              onChange={(e) => update({ title: e.target.value })}
            />
          </label>
          <label>
            Introduction / study information
            <textarea
              rows="3"
              value={draft.description}
              readOnly={!editable}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Explain the study purpose and approved consent process in accessible language."
            />
          </label>
        </div>
        <div className="editor-version">
          <Status status={draft.status} />
          <span>Version {draft.version}</span>
          <span>{draft.questions.length} items</span>
          {dirty && <b>Unsaved changes</b>}
        </div>
      </div>
      {preview ? (
        <div className="panel form-preview">
          <span className="eyebrow">PREVIEW ONLY · NO ANSWERS ARE SAVED</span>
          <FormQuestions
            form={draft}
            answers={{}}
            setAnswer={() => {}}
            preview
          />
          <Notice>
            Use this preview to inspect wording and layout. Publish only after
            checking your actual study protocol.
          </Notice>
        </div>
      ) : (
        <div className="editor-layout">
          <aside className="panel question-outline">
            <PanelHeading
              title="Question outline"
              description="Choose an item to edit."
            />
            <div>
              {draft.questions.map((q, i) => (
                <button
                  className={`outline-item ${i === selected ? "active" : ""}`}
                  key={i}
                  onClick={() => setSelected(i)}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{q.label || "Untitled question"}</strong>
                    <small>{TYPES.find((t) => t[0] === q.kind)?.[1]}</small>
                  </div>
                  {q.required && <i>*</i>}
                </button>
              ))}
            </div>
            {editable && (
              <Button
                variant="secondary"
                icon={Plus}
                onClick={() => {
                  update({ questions: [...draft.questions, EMPTY_QUESTION()] });
                  setSelected(draft.questions.length);
                }}
              >
                Add question
              </Button>
            )}
          </aside>
          <section className="panel question-editor">
            {question ? (
              <>
                <div className="question-editor-heading">
                  <span className="eyebrow">
                    ITEM {String(selected + 1).padStart(2, "0")}
                  </span>
                  {editable && (
                    <div className="question-tools">
                      <button
                        className="icon-btn"
                        aria-label="Move question up"
                        onClick={() => move(-1)}
                        disabled={selected === 0}
                      >
                        <ArrowUp size={17} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Move question down"
                        onClick={() => move(1)}
                        disabled={selected === draft.questions.length - 1}
                      >
                        <ArrowDown size={17} />
                      </button>
                      <button
                        className="icon-btn danger-text"
                        aria-label="Delete question"
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Remove this question from the draft?",
                            )
                          )
                            return;
                          update({
                            questions: draft.questions.filter(
                              (_, i) => i !== selected,
                            ),
                          });
                          setSelected(Math.max(0, selected - 1));
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )}
                </div>
                <label>
                  Question wording
                  <textarea
                    value={question.label}
                    readOnly={!editable}
                    rows="3"
                    onChange={(e) => editQuestion({ label: e.target.value })}
                    placeholder="Write a clear question in the participant's language."
                  />
                </label>
                <div className="form-two-col">
                  <label>
                    Answer type
                    <select
                      value={question.kind}
                      disabled={!editable}
                      onChange={(e) =>
                        editQuestion({
                          kind: e.target.value,
                          choices: ["single", "multiple"].includes(
                            e.target.value,
                          )
                            ? question.choices.length
                              ? question.choices
                              : [
                                  { code: "option_1", label: "First option" },
                                  { code: "option_2", label: "Second option" },
                                ]
                            : [],
                        })
                      }
                    >
                      {TYPES.map(([value, title]) => (
                        <option value={value} key={value}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Stable question code
                    <input
                      value={question.id}
                      readOnly={!editable}
                      onChange={(e) =>
                        editQuestion({
                          id: e.target.value.replace(/[^A-Za-z0-9_]/g, ""),
                        })
                      }
                    />
                    <small>Use letters, numbers, and single underscores.</small>
                  </label>
                </div>
                {["single", "multiple"].includes(question.kind) && (
                  <div className="choice-editor">
                    <label>Answer options</label>
                    <p>
                      Stable codes become export columns. Labels are what the
                      participant sees.
                    </p>
                    {question.choices.map((choice, i) => (
                      <div className="choice-edit-row" key={i}>
                        <input
                          aria-label={`Option ${i + 1} code`}
                          placeholder="option_code"
                          value={choice.code}
                          readOnly={!editable}
                          onChange={(e) =>
                            editQuestion({
                              choices: question.choices.map((c, index) =>
                                index === i
                                  ? { ...c, code: e.target.value }
                                  : c,
                              ),
                            })
                          }
                        />
                        <input
                          aria-label={`Option ${i + 1} label`}
                          placeholder="Display label"
                          value={choice.label}
                          readOnly={!editable}
                          onChange={(e) =>
                            editQuestion({
                              choices: question.choices.map((c, index) =>
                                index === i
                                  ? { ...c, label: e.target.value }
                                  : c,
                              ),
                            })
                          }
                        />
                        {editable && (
                          <button
                            className="icon-btn"
                            aria-label={`Remove option ${i + 1}`}
                            onClick={() =>
                              editQuestion({
                                choices: question.choices.filter(
                                  (_, index) => index !== i,
                                ),
                              })
                            }
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    {editable && (
                      <button
                        className="text-button"
                        onClick={() =>
                          editQuestion({
                            choices: [
                              ...question.choices,
                              {
                                code: `option_${question.choices.length + 1}`,
                                label: "",
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={15} />
                        Add answer option
                      </button>
                    )}
                  </div>
                )}
                {["integer", "decimal"].includes(question.kind) && (
                  <div className="form-two-col">
                    <label>
                      Minimum value
                      <input
                        type="number"
                        disabled={!editable}
                        value={question.min ?? ""}
                        onChange={(e) =>
                          editQuestion({
                            min:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Maximum value
                      <input
                        type="number"
                        disabled={!editable}
                        value={question.max ?? ""}
                        onChange={(e) =>
                          editQuestion({
                            max:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                {question.kind !== "section" && (
                  <>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={question.required}
                        disabled={!editable}
                        onChange={(e) =>
                          editQuestion({ required: e.target.checked })
                        }
                      />
                      <span>
                        <strong>Required answer</strong>
                        <small>
                          Ask for an answer when this question is visible.
                        </small>
                      </span>
                    </label>
                    <div className="conditional-editor">
                      <label>
                        Show this question
                        <select
                          disabled={!editable}
                          value={question.show_if?.question_id || ""}
                          onChange={(e) => {
                            const source = previous.find(
                              (q) => q.id === e.target.value,
                            );
                            editQuestion({
                              show_if: source
                                ? {
                                    question_id: source.id,
                                    equals:
                                      source.kind === "boolean"
                                        ? true
                                        : ["integer", "decimal"].includes(
                                              source.kind,
                                            )
                                          ? 0
                                          : "",
                                  }
                                : null,
                            });
                          }}
                        >
                          <option value="">Always</option>
                          {previous.map((q) => (
                            <option value={q.id} key={q.id}>
                              When “{q.label || q.id}” matches…
                            </option>
                          ))}
                        </select>
                      </label>
                      {question.show_if && (
                        <label>
                          Matching answer
                          {previous.find(
                            (q) => q.id === question.show_if.question_id,
                          )?.kind === "boolean" ? (
                            <select
                              disabled={!editable}
                              value={String(question.show_if.equals)}
                              onChange={(e) =>
                                editQuestion({
                                  show_if: {
                                    ...question.show_if,
                                    equals: e.target.value === "true",
                                  },
                                })
                              }
                            >
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          ) : (
                            <input
                              readOnly={!editable}
                              value={question.show_if.equals}
                              placeholder="Use the stable choice code for choice questions"
                              onChange={(e) => {
                                const source = previous.find(
                                  (q) => q.id === question.show_if.question_id,
                                );
                                editQuestion({
                                  show_if: {
                                    ...question.show_if,
                                    equals: ["integer", "decimal"].includes(
                                      source?.kind,
                                    )
                                      ? Number(e.target.value)
                                      : e.target.value,
                                  },
                                });
                              }}
                            />
                          )}
                        </label>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <Empty
                title="Add your first question"
                description="Begin with study information and the consent process appropriate to your research."
              />
            )}
          </section>
        </div>
      )}
      {editable && (
        <div className="review-panel">
          <ShieldCheck size={23} />
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.reviewed}
              onChange={(e) => update({ reviewed: e.target.checked })}
            />
            <span>
              <strong>
                I have reviewed this questionnaire against the study protocol.
              </strong>
              <small>
                I checked the wording, question types, choices, consent, and
                conditions. Publication locks this version.
              </small>
            </span>
          </label>
        </div>
      )}
    </>
  );
}

function FormQuestions({
  form,
  answers,
  setAnswer,
  errors = {},
  preview = false,
}) {
  const [previewAnswers, setPreviewAnswers] = useState({});
  const current = preview ? previewAnswers : answers;
  const change = preview
    ? (id, value) => setPreviewAnswers((a) => ({ ...a, [id]: value }))
    : setAnswer;
  return (
    <div className="survey-questions">
      {form.questions
        .filter(
          (q) =>
            visible(q, current) &&
            (current.q_consent !== false || q.id === "q_consent"),
        )
        .map((q, index) =>
          q.kind === "section" ? (
            <div key={q.id} className="survey-section">
              <span className="eyebrow">SECTION</span>
              <h3>{q.label}</h3>
            </div>
          ) : (
            <div
              className={`survey-question ${errors[q.id] ? "invalid" : ""}`}
              key={q.id}
            >
              <label
                className="survey-question-label"
                htmlFor={`answer-${q.id}`}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>
                  {q.label}
                  {q.required && <b aria-label="required"> *</b>}
                </strong>
              </label>
              {["single", "multiple", "boolean"].includes(q.kind) ? (
                <fieldset
                  className={`answer-options ${q.kind === "boolean" ? "boolean-options" : ""}`}
                >
                  <legend className="sr-only">{q.label}</legend>
                  {(q.kind === "boolean"
                    ? [
                        { code: true, label: "Yes" },
                        { code: false, label: "No" },
                      ]
                    : q.choices
                  ).map((choice) => (
                    <label
                      className={`answer-option ${q.kind === "multiple" ? ((current[q.id] || []).includes(choice.code) ? "selected" : "") : current[q.id] === choice.code ? "selected" : ""}`}
                      key={String(choice.code)}
                    >
                      <input
                        type={q.kind === "multiple" ? "checkbox" : "radio"}
                        name={`answer-${q.id}`}
                        value={String(choice.code)}
                        checked={
                          q.kind === "multiple"
                            ? (current[q.id] || []).includes(choice.code)
                            : current[q.id] === choice.code
                        }
                        onChange={(e) =>
                          change(
                            q.id,
                            q.kind === "multiple"
                              ? e.target.checked
                                ? [...(current[q.id] || []), choice.code]
                                : (current[q.id] || []).filter(
                                    (c) => c !== choice.code,
                                  )
                              : choice.code,
                          )
                        }
                      />
                      <span>{choice.label}</span>
                    </label>
                  ))}
                </fieldset>
              ) : q.kind === "long_text" ? (
                <textarea
                  id={`answer-${q.id}`}
                  aria-describedby={errors[q.id] ? `error-${q.id}` : undefined}
                  rows="4"
                  value={current[q.id] ?? ""}
                  onChange={(e) => change(q.id, e.target.value)}
                  placeholder="Record the participant's answer in their own words…"
                />
              ) : (
                <input
                  id={`answer-${q.id}`}
                  aria-describedby={errors[q.id] ? `error-${q.id}` : undefined}
                  type={
                    ["integer", "decimal"].includes(q.kind)
                      ? "number"
                      : q.kind === "date"
                        ? "date"
                        : "text"
                  }
                  step={
                    q.kind === "integer"
                      ? "1"
                      : q.kind === "decimal"
                        ? "any"
                        : undefined
                  }
                  min={q.min ?? undefined}
                  max={q.max ?? undefined}
                  value={current[q.id] ?? ""}
                  onChange={(e) =>
                    change(
                      q.id,
                      ["integer", "decimal"].includes(q.kind)
                        ? e.target.value === ""
                          ? ""
                          : Number(e.target.value)
                        : e.target.value,
                    )
                  }
                  placeholder="Enter an answer"
                />
              )}
              {errors[q.id] && (
                <p className="field-error" id={`error-${q.id}`}>
                  {errors[q.id]}
                </p>
              )}
            </div>
          ),
        )}
    </div>
  );
}

function Collection({
  forms,
  project,
  user,
  online,
  queue,
  syncing,
  sync,
  refreshQueue,
  notify,
  failStorage,
}) {
  const published = forms.filter((f) => f.status === "published");
  const [formId, setFormId] = useState(""),
    [answers, setAnswers] = useState({}),
    [saved, setSaved] = useState(""),
    [errors, setErrors] = useState({}),
    [submitting, setSubmitting] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [downloaded, setDownloaded] = useState(false);
  const form = published.find((f) => f.id === formId),
    interviewId = useRef(crypto.randomUUID()),
    saveSerial = useRef(Promise.resolve()),
    seq = useRef(0),
    selectedRef = useRef("");
  useEffect(() => {
    setFormId("");
    setAnswers({});
    setReviewing(false);
  }, [project?.id]);
  useEffect(() => {
    selectedRef.current = formId;
    interviewId.current = crypto.randomUUID();
    setAnswers({});
    setErrors({});
    setReviewing(false);
    setSaved("");
    setDownloaded(false);
    if (!formId) return;
    let active = true;
    (async () => {
      try {
        const local = await storage.get(`${user.id}.draft.${formId}`);
        if (active && local) {
          interviewId.current = local.interviewId || crypto.randomUUID();
          setAnswers(local.answers || {});
          setSaved("Draft recovered from this device");
        }
        const cached = await storage.get(`${user.id}.form.${formId}`);
        if (active) setDownloaded(!!cached);
      } catch (e) {
        failStorage(e);
      }
    })();
    return () => {
      active = false;
    };
  }, [formId, user.id, failStorage]);
  const downloadForm = async (selectedForm) => {
    try {
      await storage.set(`${user.id}.form.${selectedForm.id}`, {
        form: selectedForm,
        downloadedAt: Date.now(),
      });
      setDownloaded(true);
      notify(
        "This questionnaire is downloaded. Complete a practice offline reload before leaving for the field.",
      );
    } catch (e) {
      failStorage(e);
    }
  };
  const setAnswer = (id, value) => {
    const next =
      id === "q_consent" && value === false
        ? { q_consent: false }
        : { ...answers, [id]: value };
    // Clear hidden branches immediately so previous answers cannot leak into a changed path.
    for (let pass = 0; pass < form.questions.length; pass++) {
      let changed = false;
      for (const q of form.questions)
        if (!visible(q, next) && Object.hasOwn(next, q.id)) {
          delete next[q.id];
          changed = true;
        }
      if (!changed) break;
    }
    setAnswers(next);
    setErrors({});
    setSaved("Saving on this device…");
    const currentSeq = ++seq.current;
    saveSerial.current = saveSerial.current
      .catch(() => {})
      .then(async () => {
        try {
          await storage.set(`${user.id}.draft.${form.id}`, {
            answers: next,
            interviewId: interviewId.current,
            formId: form.id,
            updatedAt: Date.now(),
          });
          if (currentSeq === seq.current && selectedRef.current === form.id)
            setSaved("Draft saved on this device");
        } catch (e) {
          setSaved("Not saved — storage needs attention");
          failStorage(e);
        }
      });
  };
  const validate = () => {
    const found = {};
    for (const q of form.questions.filter(
      (q) => q.kind !== "section" && visible(q, answers),
    )) {
      const value = answers[q.id];
      if (
        typeof value === "string" &&
        new TextEncoder().encode(value).length > 20000
      )
        found[q.id] =
          "Keep this answer within 20,000 UTF-8 bytes. Shorten it before submitting.";
      if (q.required && isEmpty(value))
        found[q.id] = "Please record an answer before continuing.";
      if (["integer", "decimal"].includes(q.kind) && !isEmpty(value)) {
        if (
          !Number.isFinite(value) ||
          (q.kind === "integer" && !Number.isInteger(value))
        )
          found[q.id] = "Enter a valid number.";
        else if (q.min != null && value < q.min)
          found[q.id] = `The minimum allowed value is ${q.min}.`;
        else if (q.max != null && value > q.max)
          found[q.id] = `The maximum allowed value is ${q.max}.`;
      }
      if (q.id === "q_consent" && value !== true)
        found[q.id] =
          "Consent is needed to continue this interview. Do not collect answers after a refusal.";
    }
    setErrors(found);
    if (Object.keys(found).length) {
      notify("Please check the highlighted answers before continuing.", true);
      setTimeout(
        () =>
          document
            .querySelector(".survey-question.invalid")
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        50,
      );
      return false;
    }
    return true;
  };
  const submit = async () => {
    if (!validate()) return;
    if (!navigator.onLine) {
      const localSession = await storage.get("session").catch(() => null);
      if (
        localSession?.userId !== user.id ||
        localSession.until <= Date.now()
      ) {
        notify(
          "Your offline access period has ended. Reconnect and sign in with this account; your draft is retained.",
          true,
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      await saveSerial.current;
      const id = interviewId.current,
        payload = {
          id,
          expected_user_id: user.id,
          form_id: form.id,
          collected_at: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          answers,
        };
      await storage.queueDraft(user.id, form.id, {
        payload,
        projectId: project.id,
        formTitle: form.title,
        createdAt: Date.now(),
        state: "pending",
      });
      interviewId.current = crypto.randomUUID();
      setAnswers({});
      setSaved("");
      setReviewing(false);
      await refreshQueue();
      notify(
        isDemoMode()
          ? "Response queued on this device for the local playground."
          : "Response saved on this device. It is pending until a server receipt confirms upload.",
      );
      if (navigator.onLine) await sync();
    } catch (error) {
      failStorage(error);
      notify(
        "This response could not be queued. Keep this page open and resolve storage before leaving.",
        true,
      );
    } finally {
      setSubmitting(false);
    }
  };
  const recoverQueued = (item) => {
    const blob = new Blob(
      [
        JSON.stringify(
          { format: "research-tool-local-recovery-v1", ...item.value },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `research-response-${item.value.payload.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    notify(
      "A private local recovery copy was downloaded. This is not a server-confirmed submission.",
    );
  };
  const discardQueued = async (item) => {
    if (
      !window.confirm(
        "Permanently delete this unsent response from this device? It has not reached the server and cannot be recovered.",
      )
    )
      return;
    try {
      await storage.del(item.key);
      await refreshQueue();
    } catch (e) {
      failStorage(e);
    }
  };
  const projectQueue = queue.filter(
    (item) => item.value.projectId === project?.id,
  );
  return (
    <>
      <PageHeading
        eyebrow="LISTEN. RECORD. UNDERSTAND."
        title="Field collection"
        description={
          isDemoMode()
            ? "Try a published example questionnaire and save fictional answers in this browser."
            : "Use a published questionnaire, save your work on this device, and upload when connected."
        }
      >
        <Button
          icon={syncing ? LoaderCircle : RefreshCw}
          disabled={!online || syncing || !queue.length}
          onClick={sync}
        >
          {syncing
            ? "Uploading…"
            : `Sync responses${queue.length ? ` (${queue.length})` : ""}`}
        </Button>
      </PageHeading>
      <div className="collection-layout">
        <section className="collection-main">
          <div className="panel collection-picker">
            <label>
              Questionnaire
              <select
                aria-label="Questionnaire"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
              >
                <option value="">Choose a published questionnaire</option>
                {published.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} · v{f.version}
                  </option>
                ))}
              </select>
            </label>
            {form && (
              <div className="download-row">
                <span className={`badge ${downloaded ? "green" : "neutral"}`}>
                  {downloaded ? <CheckCheck size={13} /> : <Cloud size={13} />}
                  {downloaded
                    ? "Downloaded to this device"
                    : "Available in this workspace"}
                </span>
                <Button
                  small
                  variant="secondary"
                  icon={Download}
                  disabled={!online}
                  onClick={() => downloadForm(form)}
                >
                  Make available offline
                </Button>
              </div>
            )}
          </div>
          {!published.length ? (
            <div className="panel">
              <Empty
                icon={Smartphone}
                title="Your fieldwork is almost ready"
                description="An administrator needs to review and publish a questionnaire before collection can begin."
              />
            </div>
          ) : !form ? (
            <div className="panel">
              <Empty
                icon={ClipboardList}
                title="Choose the conversation to begin"
                description="Select a published questionnaire above. Each interview becomes one response, with its original form version preserved."
              />
            </div>
          ) : !online && !downloaded ? (
            <div className="panel">
              <Empty
                icon={CloudOff}
                title="Download this form before going offline"
                description="Reconnect, sign in, and choose Make available offline. Your saved drafts remain on this device."
              />
            </div>
          ) : (
            <div className="panel interview-panel">
              <div className="interview-heading">
                <span className="eyebrow">
                  {reviewing ? "REVIEW BEFORE SUBMISSION" : "NEW INTERVIEW"} ·
                  VERSION {form.version}
                </span>
                <h2>{form.title}</h2>
                <p>{form.description}</p>
                <div>
                  <span>
                    <ShieldCheck size={14} />
                    Private research response
                  </span>
                  <span>
                    {saved && (
                      <>
                        <Save size={13} />
                        {saved}
                      </>
                    )}
                  </span>
                </div>
              </div>
              {!form.questions.some((q) => q.id === "q_consent") && (
                <Notice tone="warning">
                  This questionnaire has no built-in consent question. Follow
                  the administrator's study information and consent process
                  before collecting answers.
                </Notice>
              )}
              {reviewing ? (
                <div className="response-review">
                  {form.questions
                    .filter((q) => q.kind !== "section" && visible(q, answers))
                    .map((q) => (
                      <div key={q.id}>
                        <strong>{q.label}</strong>
                        <p>{displayAnswer(q, answers[q.id])}</p>
                      </div>
                    ))}
                  <Notice>
                    {isDemoMode()
                      ? "Submitting saves this fictional interview to the playground in this browser. It is not uploaded to the live research service."
                      : "Submitting queues this interview for upload. It becomes a confirmed submission only after the server acknowledges it. Submitted answers cannot be edited by the collector."}
                  </Notice>
                </div>
              ) : (
                <FormQuestions
                  form={form}
                  answers={answers}
                  setAnswer={setAnswer}
                  errors={errors}
                />
              )}
              {answers.q_consent === false && (
                <Notice tone="warning">
                  <strong>Respect the participant's decision.</strong> Consent
                  was declined. Stop this interview; do not collect or submit
                  survey answers.
                </Notice>
              )}
              <div className="interview-actions">
                {reviewing ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setReviewing(false)}
                      icon={ArrowLeft}
                    >
                      Back to answers
                    </Button>
                    <Button
                      icon={submitting ? LoaderCircle : Send}
                      disabled={submitting}
                      onClick={submit}
                    >
                      {submitting ? "Saving response…" : "Submit response"}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="muted">* Required when shown</span>
                    <Button
                      icon={ArrowRight}
                      disabled={answers.q_consent === false}
                      onClick={() => {
                        if (validate()) {
                          setReviewing(true);
                          window.scrollTo(0, 0);
                        }
                      }}
                    >
                      Review answers
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
        <aside className="collection-aside">
          <section className="panel field-status">
            <div className="field-status-icon">
              {online ? <Cloud size={25} /> : <CloudOff size={25} />}
            </div>
            <h3>
              {online
                ? "Connected for fieldwork"
                : "Working without a connection"}
            </h3>
            <p>
              {isDemoMode()
                ? "This playground records fictional interviews in this browser. It does not upload them to the live service."
                : online
                  ? "Save locally first. Uploads are confirmed only by a verified server receipt."
                  : "Downloaded assignments and saved drafts stay on this device. Reconnect to upload."}
            </p>
            <div className="queue-total">
              <strong>{projectQueue.length}</strong>
              <span>
                responses waiting
                <br />
                on this device
              </span>
            </div>
            <Button
              variant="secondary"
              icon={RefreshCw}
              disabled={!online || syncing || !projectQueue.length}
              onClick={sync}
            >
              {syncing ? "Uploading…" : "Upload saved responses"}
            </Button>
          </section>
          <section className="field-tips">
            <span className="eyebrow">A MOMENT OF CARE</span>
            <h3>Listen at their pace.</h3>
            <p>
              Explain the purpose. Ask permission. Let people answer in their
              own words. A thoughtful pause is part of good research.
            </p>
            <div>
              <ShieldCheck size={15} />
              <span>
                Browser storage is not a backup. Upload before clearing data,
                changing devices, or leaving a shared phone.
              </span>
            </div>
          </section>
        </aside>
      </div>
      {projectQueue.length > 0 && (
        <section className="panel queue-panel">
          <PanelHeading
            title="Saved on this device"
            description={
              isDemoMode()
                ? "These interviews are waiting to be recorded in this browser's playground."
                : "These responses have not yet received server confirmation."
            }
          />
          {projectQueue.map((item) => (
            <div className="queue-row" key={item.key}>
              <span
                className={`queue-dot ${item.value.state === "error" ? "error" : ""}`}
              />
              <div>
                <strong>{item.value.formTitle}</strong>
                <span>
                  {fmtDate(item.value.createdAt)} ·{" "}
                  {item.value.payload.id.slice(0, 8)}
                </span>
                {item.value.error && (
                  <p className="field-error">{item.value.error}</p>
                )}
              </div>
              <span
                className={`badge ${item.value.state === "error" ? "red" : "amber"}`}
              >
                {item.value.state === "error"
                  ? "Needs attention"
                  : "Pending upload"}
              </span>
              <button
                className="icon-btn"
                aria-label="Download local recovery copy"
                title="Download local recovery copy"
                onClick={() => recoverQueued(item)}
              >
                <Download size={16} />
              </button>
              <button
                className="icon-btn danger-text"
                aria-label="Delete unsent response"
                onClick={() => discardQueued(item)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function displayAnswer(question, value) {
  if (isEmpty(value)) return "Not recorded";
  if (question.kind === "boolean") return value ? "Yes" : "No";
  if (question.kind === "multiple")
    return value
      .map(
        (code) => question.choices.find((c) => c.code === code)?.label || code,
      )
      .join(", ");
  if (question.kind === "single")
    return question.choices.find((c) => c.code === value)?.label || value;
  return String(value);
}

function Responses({ project, user, forms, online, onExport, notify }) {
  const [responses, setResponses] = useState([]),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [formFilter, setFormFilter] = useState("");
  const load = useCallback(async () => {
    if (!project || !navigator.onLine) return;
    setBusy(true);
    try {
      setResponses(await api(`/api/projects/${project.id}/responses`));
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }, [project?.id, notify]);
  useEffect(() => {
    setResponses([]);
    setSelected(null);
    setFormFilter("");
    load();
  }, [load]);
  const shown = responses.filter(
      (r) => !formFilter || r.form_id === formFilter,
    ),
    admin = user.role === "admin";
  return (
    <>
      <PageHeading
        eyebrow="FROM ANSWERS TO INSIGHT"
        title="Responses & exports"
        description={
          isDemoMode()
            ? "Playground responses stored in this browser, with question codes and form versions kept intact."
            : "Confirmed server submissions, with question codes and form versions kept intact."
        }
      >
        <Button
          variant="secondary"
          icon={RefreshCw}
          disabled={!online || busy || !project}
          onClick={load}
        >
          {busy ? "Loading…" : "Refresh responses"}
        </Button>
        {admin && (
          <Button
            variant="secondary"
            disabled={!online || !project}
            onClick={() => onExport(formFilter, true)}
          >
            Export CSV
          </Button>
        )}
        {admin && (
          <Button
            icon={Download}
            disabled={!online || !project}
            onClick={() => onExport(formFilter)}
          >
            Export Excel
          </Button>
        )}
      </PageHeading>
      <div className="response-summary">
        <div>
          <span className="document-icon green">
            <FileCheck2 size={24} />
          </span>
          <div>
            <strong>{shown.length}</strong>
            <span>
              {formFilter ? "matching" : "visible"}{" "}
              {isDemoMode()
                ? "playground responses"
                : "server-confirmed responses"}
            </span>
          </div>
        </div>
        <div className="response-export-note">
          <FileSpreadsheet size={22} />
          <p>
            One row per response.
            <br />
            <span>Excel: typed answers and codebook. CSV: one question per row, with JSON answer values.</span>
          </p>
        </div>
      </div>
      <div className="toolbar">
        <span className="muted">
          {admin
            ? "All submissions in this study"
            : "Your own submissions only"}{" "}
          · Local drafts are excluded
        </span>
        <label className="filter-select">
          <span className="sr-only">Filter questionnaire</span>
          <select
            value={formFilter}
            onChange={(e) => setFormFilter(e.target.value)}
          >
            <option value="">All questionnaires</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title} · v{f.version}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="panel response-table-panel">
        {!online ? (
          <Empty
            icon={CloudOff}
            title="Connect to view confirmed responses"
            description="Your local fieldwork remains in Field collection. This view reads authorized records from the server."
          />
        ) : !shown.length ? (
          <Empty
            icon={FileSpreadsheet}
            title={
              busy
                ? "Loading your study responses…"
                : "Every meaningful dataset starts with a first answer."
            }
            description={
              isDemoMode()
                ? "Save a fictional interview in Field collection to see it here. Your playground Excel export includes its answers and a codebook."
                : "Once a field response is uploaded and confirmed, it appears here. Your Excel export includes the response table and a codebook."
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>RESPONSE</th>
                  <th>QUESTIONNAIRE</th>
                  <th>COLLECTED BY</th>
                  <th>RECEIVED</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((response) => (
                  <tr key={response.id}>
                    <td>
                      <button
                        className="text-button mono"
                        onClick={() => setSelected(response)}
                      >
                        {response.id.slice(0, 8)}
                      </button>
                    </td>
                    <td>
                      <strong>
                        {forms.find((f) => f.id === response.form_id)?.title ||
                          "Questionnaire"}
                      </strong>
                      <small>Version {response.form_version}</small>
                    </td>
                    <td>{response.collector_name || response.collector_id}</td>
                    <td>{fmtDate(response.received_at)}</td>
                    <td>
                      <span className="badge green">
                        <CheckCheck size={12} />
                        Received
                      </span>
                      <small>{response.review_status}</small>
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        aria-label={`View response ${response.id.slice(0, 8)}`}
                        onClick={() => setSelected(response)}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Notice>
        Exports contain private study data. Store and share them according to
        your institution's consent, access, and retention requirements. The
        application organizes responses; research interpretation stays with you.
      </Notice>
      {selected && (
        <Modal
          title="Submitted response"
          onClose={() => setSelected(null)}
          wide
        >
          <div className="response-detail-meta">
            <span className="mono">{selected.id}</span>
            <span>Received {fmtDate(selected.received_at)}</span>
          </div>
          <div className="response-review">
            {(
              forms.find((f) => f.id === selected.form_id)?.questions ||
              Object.keys(selected.answers).map((id) => ({
                id,
                label: id,
                choices: [],
              }))
            )
              .filter((q) => q.kind !== "section")
              .map((q) => (
                <div key={q.id}>
                  <strong>{q.label}</strong>
                  <p>{displayAnswer(q, selected.answers[q.id])}</p>
                  <small>
                    {q.id} · {selected.statuses[q.id] || "answered"}
                  </small>
                </div>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function Profile({ user, org, project, projects, stats, admin, navigate }) {
  const roleName = admin ? "Administrator" : "Field surveyor";
  return (
    <>
      <PageHeading
        eyebrow="YOUR RESEARCH IDENTITY"
        title="My profile"
        description="A quick view of your account, organization, and current access."
      />
      <section className="profile-hero panel">
        <span className="profile-avatar" aria-hidden="true">
          {user.name?.slice(0, 2).toUpperCase()}
        </span>
        <div className="profile-identity">
          <span className="eyebrow">SIGNED IN AS</span>
          <h2>{user.name}</h2>
          <p className="mono">{user.login_id}</p>
          <span className={`badge ${admin ? "green" : "neutral"}`}>
            {roleName}
          </span>
        </div>
        <div className="profile-actions">
          <Button
            icon={admin ? Users : Smartphone}
            onClick={() => navigate(admin ? "team" : "collect")}
          >
            {admin ? "View research team" : "Open field collection"}
          </Button>
        </div>
      </section>
      <div className="profile-grid">
        <section className="panel profile-details">
          <PanelHeading
            title="Account details"
            description="The identity attached to your research activity."
          />
          <dl>
            <div>
              <dt>Full name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Login ID</dt>
              <dd className="mono">{user.login_id}</dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd>{org?.name || "Independent workspace"}</dd>
            </div>
            <div>
              <dt>Current study</dt>
              <dd>{project?.name || "No study selected"}</dd>
            </div>
          </dl>
        </section>
        <section className="panel profile-access">
          <PanelHeading
            title="Access summary"
            description="What this account can do in the workspace."
          />
          <div className="profile-metrics">
            <div>
              <strong>{projects.length}</strong>
              <span>Assigned {projects.length === 1 ? "study" : "studies"}</span>
            </div>
            <div>
              <strong>{stats.responses ?? 0}</strong>
              <span>{admin ? "Organization responses" : "My responses"}</span>
            </div>
            <div>
              <strong>{admin ? stats.surveyors ?? 0 : "Field"}</strong>
              <span>{admin ? "Field surveyors" : "Collection access"}</span>
            </div>
          </div>
          <p className="profile-permission-note">
            <ShieldCheck size={18} />
            {admin
              ? "You can manage questionnaires, team access, responses, and exports."
              : "You can collect assigned questionnaires and review your own submissions."}
          </p>
        </section>
      </div>
    </>
  );
}

function Team({ project, user, online, notify, refresh }) {
  const [members, setMembers] = useState([]),
    [memberSearch, setMemberSearch] = useState(""),
    [inviteOpen, setInviteOpen] = useState(false),
    [invitation, setInvitation] = useState(null),
    [orgInvites, setOrgInvites] = useState([]),
    [newOrgInvite, setNewOrgInvite] = useState(null),
    [orgInviteLabel, setOrgInviteLabel] = useState(""),
    [orgInviteCode, setOrgInviteCode] = useState(""),
    [creatingOrgInvite, setCreatingOrgInvite] = useState(false),
    [busy, setBusy] = useState(false);
  const visibleMembers = members.filter((member) =>
    `${member.name} ${member.login_id} ${member.role}`
      .toLowerCase()
      .includes(memberSearch.trim().toLowerCase()),
  );
  const load = useCallback(async () => {
    if (!project || !navigator.onLine) return;
    try {
      setMembers(await api(`/api/projects/${project.id}/members`));
    } catch (e) {
      notify(e.message, true);
    }
  }, [project?.id, notify]);
  const loadOrgInvites = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const d = await api("/api/org/invite");
      setOrgInvites(d.tokens || []);
    } catch (_) {
      /* account may not have an org */
    }
  }, []);
  useEffect(() => {
    setMembers([]);
    setInvitation(null);
    setNewOrgInvite(null);
    load();
    loadOrgInvites();
  }, [load, loadOrgInvites]);
  const invite = async (values) => {
    setBusy(true);
    try {
      const result = await api(`/api/projects/${project.id}/members`, {
        method: "POST",
        body: values,
      });
      setInvitation(result.activation_code ? result : null);
      setInviteOpen(false);
      await load();
      await refresh();
      notify(
        result.existing
          ? "Existing surveyor assigned to this study. Their current account remains unchanged."
          : "Surveyor account created. Share the one-time activation code securely.",
      );
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const copyInvitationCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      notify("Invitation code copied to clipboard.");
    } catch {
      notify(
        "Clipboard access is unavailable. Select and copy the displayed invitation code.",
        true,
      );
    }
  };
  const createOrgInvite = async (e) => {
    e.preventDefault();
    if (!orgInviteLabel.trim()) return;
    setCreatingOrgInvite(true);
    try {
      const result = await api("/api/org/invite", {
        method: "POST",
        body: {
          label: orgInviteLabel.trim(),
          code: orgInviteCode.trim() || undefined,
        },
      });
      setNewOrgInvite(result);
      setOrgInviteLabel("");
      setOrgInviteCode("");
      await loadOrgInvites();
      notify("Invitation code generated. Share it with your surveyors.");
    } catch (e) {
      notify(e.message, true);
    } finally {
      setCreatingOrgInvite(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="INDIVIDUAL ACCESS. SHARED PURPOSE."
        title="Research team"
        description="Give every surveyor their own identity and access to this study's published questionnaires."
      >
        {(!firebaseEnabled || isDemoMode()) && <Button
          icon={Plus}
          disabled={!project || !online}
          onClick={() => setInviteOpen(true)}
        >
          Add field surveyor
        </Button>}
      </PageHeading>
      <div className="team-callout">
        <span className="small-icon">
          <Users size={24} />
        </span>
        <div>
          <h3>One person. One account. Clear responsibility.</h3>
          <p>
            Surveyors and invigilators collect assigned project data.
            Administrators manage questions, team access, and exports.
          </p>
        </div>
        <ShieldCheck size={27} />
      </div>

      {firebaseEnabled && !isDemoMode() && <Notice>Cloud mode: use the organization invitation panel to invite surveyors. Members can collect for all published studies in this organization. Custom invitation codes are replaced with secure generated codes.</Notice>}
      {/* Project-level activation code result */}
      {invitation && (
        <section className="panel invitation-result">
          <div className="panel-heading">
            <div>
              <h3>Share this invitation securely</h3>
              <p>
                The code is displayed for this invitation only. It is not stored
                in your browser.
              </p>
            </div>
            <button
              className="icon-btn"
              aria-label="Dismiss activation code"
              onClick={() => setInvitation(null)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="invitation-values">
            <div>
              <label>Login ID</label>
              <strong className="mono">{invitation.user.login_id}</strong>
            </div>
            <div>
              <label>One-time activation code</label>
              <strong className="mono activation-code">
                {invitation.activation_code}
              </strong>
            </div>
          </div>
          <Notice>
            The surveyor selects the "Activate account" tab on the sign-in
            screen, enters this ID and code, and chooses their own password.
          </Notice>
        </section>
      )}

      {/* Org-level invite token panel */}
      {online && (
        <section className="panel org-invites-panel">
          <PanelHeading
            title="Organization invitation codes"
            description="Create an invitation code for your organisation. Surveyors register using this code on the sign-in page and instantly get access to your studies."
          />
          {newOrgInvite && (
            <div
              className="invitation-result"
              style={{ marginBottom: "1.25rem" }}
            >
              <div className="panel-heading" style={{ marginBottom: ".5rem" }}>
                <div>
                  <h3 style={{ marginBottom: ".2rem" }}>
                    Invitation code ready — copy and share
                  </h3>
                  <p style={{ fontSize: ".85rem", opacity: ".75" }}>
                    Surveyors select &quot;Join a team&quot; on the sign-in
                    screen, enter this code, and set their credentials.
                  </p>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => setNewOrgInvite(null)}
                  aria-label="Dismiss"
                >
                  <X size={18} />
                </button>
              </div>
              <div
                className="invitation-values"
                style={{ alignItems: "center", gap: "1.5rem" }}
              >
                <div>
                  <label>Label</label>
                  <strong>{newOrgInvite.label}</strong>
                </div>
                <div>
                  <label>Invitation code</label>
                  <strong
                    className="mono activation-code"
                    style={{ fontSize: "1.1rem", letterSpacing: ".5px" }}
                  >
                    {newOrgInvite.code || newOrgInvite.token}
                  </strong>
                </div>
                <button
                  className="button"
                  type="button"
                  onClick={() =>
                    copyInvitationCode(newOrgInvite.code || newOrgInvite.token)
                  }
                  style={{ marginLeft: "auto" }}
                >
                  <Copy size={16} /> Copy code
                </button>
              </div>
            </div>
          )}
          <form
            onSubmit={createOrgInvite}
            style={{
              display: "flex",
              gap: ".75rem",
              alignItems: "flex-end",
              flexWrap: "wrap",
              marginBottom: "1.25rem",
            }}
          >
            <label style={{ flex: 2, minWidth: "220px", marginBottom: 0 }}>
              Group / study label
              <input
                value={orgInviteLabel}
                onChange={(e) => setOrgInviteLabel(e.target.value)}
                placeholder="e.g. Batch 2026 field team"
                required
              />
            </label>
            <label style={{ flex: 1, minWidth: "160px", marginBottom: 0 }}>
              Custom code (optional)
              <input
                disabled={firebaseEnabled && !isDemoMode()}
                  value={orgInviteCode}
                onChange={(e) => setOrgInviteCode(e.target.value)}
                placeholder="Leave blank to auto-generate"
              />
            </label>
            <Button
              type="submit"
              icon={creatingOrgInvite ? LoaderCircle : Plus}
              disabled={creatingOrgInvite}
            >
              {creatingOrgInvite ? "Creating…" : "Generate invite code"}
            </Button>
          </form>
          {orgInvites.length > 0 && (
            <div style={{ display: "grid", gap: "1rem" }}>
              {orgInvites.map((t) => {
                const code = t.code || t.token;
                const enrolled = t.members || [];
                return (
                  <div
                    key={t.id}
                    style={{
                      background: "var(--surface-sunken,#161a22)",
                      border: "1px solid var(--border,#2c3240)",
                      borderRadius: "8px",
                      padding: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: ".75rem",
                        flexWrap: "wrap",
                        marginBottom: ".5rem",
                      }}
                    >
                      <span className="avatar light">
                        <Radio size={15} />
                      </span>
                      <div style={{ flex: 1, minWidth: "200px" }}>
                        <strong style={{ fontSize: "1rem" }}>{t.label}</strong>
                        <div
                          className="mono"
                          style={{
                            fontSize: ".78rem",
                            opacity: ".65",
                            marginTop: "2px",
                          }}
                        >
                          Created by {t.created_by} · {fmtDate(t.created_at)}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: ".5rem",
                        }}
                      >
                        <span
                          className="mono activation-code"
                          style={{
                            fontSize: ".9rem",
                            fontWeight: 600,
                            padding: ".3rem .6rem",
                            background: "var(--surface,#0d1117)",
                            border: "1px solid var(--border,#30363d)",
                            borderRadius: "6px",
                            letterSpacing: ".5px",
                          }}
                        >
                          {code}
                        </span>
                        <button
                          className="icon-btn"
                          title="Copy invitation code"
                          onClick={() => copyInvitationCode(code)}
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                      <span
                        className={`badge ${enrolled.length ? "green" : "neutral"}`}
                      >
                        {enrolled.length} surveyor
                        {enrolled.length === 1 ? "" : "s"} joined
                      </span>
                    </div>

                    {/* Enrolled surveyors list for this code */}
                    <div
                      style={{
                        marginTop: ".75rem",
                        paddingTop: ".75rem",
                        borderTop: "1px solid var(--border,#2c3240)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: ".75rem",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: ".05em",
                          color: "var(--muted,#8b949e)",
                          marginBottom: ".4rem",
                        }}
                      >
                        {enrolled.length
                          ? `Registered surveyors (${enrolled.length}):`
                          : "No surveyors have registered with this code yet."}
                      </div>
                      {enrolled.length > 0 && (
                        <div style={{ display: "grid", gap: ".35rem" }}>
                          {enrolled.map((m) => (
                            <div
                              key={m.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: ".6rem",
                                fontSize: ".82rem",
                                background: "rgba(255,255,255,0.02)",
                                padding: ".35rem .6rem",
                                borderRadius: "4px",
                                border: "1px solid rgba(255,255,255,0.04)",
                              }}
                            >
                              <span
                                className="avatar light"
                                style={{
                                  width: "22px",
                                  height: "22px",
                                  fontSize: ".68rem",
                                  minWidth: "22px",
                                }}
                              >
                                {m.name.slice(0, 2).toUpperCase()}
                              </span>
                              <strong>{m.name}</strong>
                              <span
                                className="mono"
                                style={{ opacity: 0.7, fontSize: ".78rem" }}
                              >
                                {m.login_id}
                              </span>
                              <span
                                style={{
                                  marginLeft: "auto",
                                  opacity: 0.55,
                                  fontSize: ".75rem",
                                }}
                              >
                                Joined {fmtDate(m.joined_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Project members */}
      <section className="panel">
        <PanelHeading
          title="Project members"
          description={`${members.length} people with individual access to this study.`}
        />
        {members.length > 3 && (
          <label className="team-search">
            <span className="sr-only">Find a team member</span>
            <Search size={17} />
            <input
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Find by name, login ID, or role"
            />
          </label>
        )}
        {members.length ? (
          visibleMembers.length ? (
          <div className="member-profile-grid">
            {visibleMembers.map((member) => (
              <article className="member-profile-card" key={member.id}>
                <span
                  className={`profile-avatar small ${member.role === "admin" ? "" : "light"}`}
                >
                  {member.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="member-profile-copy">
                  <strong>{member.name}</strong>
                  <span className="mono">{member.login_id}</span>
                  {member.id === user.id && <em>You</em>}
                </div>
                <span
                  className={`badge ${member.role === "admin" ? "green" : "neutral"}`}
                >
                  {member.role === "admin" ? "Administrator" : "Field surveyor"}
                </span>
                <p className="member-access">
                  {member.role === "admin"
                    ? "Manage & export"
                    : "Collect project responses"}
                </p>
              </article>
            ))}
          </div>
          ) : (
            <Empty
              icon={Search}
              title="No matching team member"
              description="Try a different name, login ID, or role."
            />
          )
        ) : (
          <Empty
            icon={Users}
            title={
              online
                ? "Bring your field team together"
                : "Connect to view your team"
            }
            description="Create a unique login ID for each collector and share their one-time activation code securely."
          />
        )}
      </section>
      <div className="two-info-cards">
        <div className="panel">
          <ShieldCheck size={23} />
          <h3>Access follows the project.</h3>
          <p>
            Collectors can submit to their assigned project and view their own
            responses. Other collectors' answers and bulk exports stay
            restricted.
          </p>
        </div>
        <div className="panel">
          <CircleHelp size={23} />
          <h3>Keep fieldwork personal.</h3>
          <p>
            Use a team prefix when assigning roll numbers that may overlap
            between institutions. Avoid shared passwords or shared collector
            accounts.
          </p>
        </div>
      </div>
      {inviteOpen && (
        <InviteModal
          busy={busy}
          onClose={() => setInviteOpen(false)}
          onSave={invite}
        />
      )}
    </>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  const modalRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    modalRef.current?.focus();
    const listener = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = [
          ...(modalRef.current?.querySelectorAll(
            'button, input, select, textarea, [tabindex="0"]',
          ) || []),
        ].filter((el) => !el.disabled);
        if (!focusable.length) return;
        if (e.shiftKey && document.activeElement === focusable[0]) {
          e.preventDefault();
          focusable.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === focusable.at(-1)) {
          e.preventDefault();
          focusable[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex="-1"
        ref={modalRef}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ProjectModal({ project, onClose, onSave }) {
  const [values, setValues] = useState({
      name: project?.name || "",
      description: project?.description || "",
      cities: project?.cities.join(", ") || "",
    }),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={project ? "Edit study" : "Begin a new study"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave({
              ...values,
              cities: values.cities
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="modal-intro">
          A focused workspace for any research question. Locations and study
          populations are your choice.
        </p>
        <label>
          Study name
          <input
            required
            aria-label="Study name"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            placeholder="What is your study called?"
          />
        </label>
        <label>
          Description
          <textarea
            rows="4"
            aria-label="Description"
            value={values.description}
            onChange={(e) =>
              setValues({ ...values, description: e.target.value })
            }
            placeholder="Describe the research purpose and context."
          />
        </label>
        <label>
          Locations, separated by commas
          <input
            aria-label="Locations, separated by commas"
            value={values.cities}
            onChange={(e) => setValues({ ...values, cities: e.target.value })}
            placeholder="Optional — cities, districts, or field sites"
          />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} icon={project ? Save : Plus}>
            {busy
              ? project
                ? "Saving…"
                : "Creating…"
              : project
                ? "Save study"
                : "Create study"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function InviteModal({ busy, onClose, onSave }) {
  const [values, setValues] = useState({ login_id: "", name: "" });
  return (
    <Modal title="Add a field surveyor" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(values);
        }}
      >
        <p className="modal-intro">
          Create an individual account and a one-time activation code. Your
          surveyor chooses their own password.
        </p>
        <label>
          Full name
          <input
            required
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            placeholder="Name of the field team member"
          />
        </label>
        <label>
          Unique login ID
          <input
            required
            value={values.login_id}
            onChange={(e) => setValues({ ...values, login_id: e.target.value })}
            placeholder="For example, team_a_001"
          />
          <small>Use a team prefix if roll numbers overlap.</small>
        </label>
        <Notice>
          “Invigilator” uses the surveyor role in this release. This account can
          collect for this project but cannot edit questionnaires or export
          everyone's responses.
        </Notice>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" icon={Users} disabled={busy}>
            {busy ? "Creating invitation…" : "Create surveyor invitation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ImportModal({ project, onClose, onImported, notify }) {
  const [mode, setMode] = useState("pdf"),
    [text, setText] = useState(""),
    [file, setFile] = useState(null),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true);
    try {
      let candidate;
      if (mode === "pdf") {
        if (!file) throw new Error("Choose a text-based PDF first.");
        if (file.size > 8 * 1024 * 1024)
          throw new Error(
            "Use a PDF smaller than 8 MB. Split larger documents before import.",
          );
        candidate = await api(`/api/projects/${project.id}/import-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
      } else {
        if (!text.trim())
          throw new Error(
            "Paste questionnaire text to create a candidate draft.",
          );
        candidate = await api(`/api/projects/${project.id}/import`, {
          method: "POST",
          body: { text },
        });
      }
      setResult(candidate);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Turn a document into a draft" onClose={onClose} wide>
      <p className="modal-intro">
        Import helps with transcription. A researcher still checks every
        question, choice, consent statement, and rule before publication.
      </p>
      {!result ? (
        <>
          <div className="tabs import-tabs">
            <button
              className={mode === "pdf" ? "active" : ""}
              onClick={() => setMode("pdf")}
            >
              <FileText size={15} />
              Text-based PDF
            </button>
            <button
              className={mode === "text" ? "active" : ""}
              onClick={() => setMode("text")}
            >
              <ClipboardList size={15} />
              Paste questionnaire text
            </button>
          </div>
          {mode === "pdf" ? (
            <label className="upload-zone">
              <Upload size={29} />
              <strong>
                {file ? file.name : "Choose your questionnaire PDF"}
              </strong>
              <span>
                Text-based documents · up to 8 MB · scanned OCR is not supported
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          ) : (
            <label>
              Questionnaire text
              <textarea
                rows="11"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "Study title\n\n1. What would you like to understand?\n2. Which services do you use?"
                }
              />
            </label>
          )}
          <Notice>
            Complex layouts, matrices, and skip logic may not import reliably.
            Unsupported material needs manual authoring. Source files are not
            automatically approved research instruments.
          </Notice>
          <div className="modal-actions">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              icon={busy ? LoaderCircle : Sparkles}
              disabled={busy}
              onClick={run}
            >
              {busy
                ? "Preparing candidate questions…"
                : "Extract candidate draft"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="import-result">
            <span className="document-icon green">
              <FileCheck2 size={24} />
            </span>
            <div>
              <h3>{result.title || "Candidate draft ready"}</h3>
              <p>
                {result.questions.length} candidate items · unpublished · review
                required
              </p>
            </div>
          </div>
          {result.warnings?.length > 0 && (
            <div className="import-warnings">
              <strong>Review notes</strong>
              <ul>
                {result.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="import-question-list">
            {result.questions.map((q, i) => (
              <div key={i}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <p>{q.label}</p>
                <small>
                  {TYPES.find((t) => t[0] === q.kind)?.[1] || q.kind}
                </small>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setResult(null)}>
              Try another document
            </Button>
            <Button icon={Settings2} onClick={() => onImported(result)}>
              Open editable draft
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
