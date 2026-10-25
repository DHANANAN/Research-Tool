# Run the development pilot

Use this guide to build and run the first development pilot. See the [roadmap](roadmap.md) for the larger product scope and [working API contract](api-contract.md) for the first implementation. The initial stack is Rust/Axum, bundled SQLite, and a React/Vite browser application. No separately installed database is needed.

## Prerequisites

- Rust **1.90.0**, including Cargo, rustfmt, and Clippy. The repository's `rust-toolchain.toml` records this version. Install Rust using the official [rustup instructions](https://rustup.rs/).
- Node.js **22 LTS**, and npm. Dependencies are recorded in the root `package-lock.json`.
- A C compiler and normal native build tools for bundled SQLite. On Debian/Ubuntu these are provided by `build-essential`.
- `pdftotext` and `pdfinfo`, provided by `poppler-utils` on Debian/Ubuntu, for native-text PDF import. Scanned-image OCR is not included.
- Python 3 for generating a private first-run administrator password when no explicit password was supplied.
- Bash 4.3 or later for the optional combined development-server script.

On an ordinary Debian/Ubuntu machine, its administrator can install the system prerequisites with `sudo apt-get install build-essential poppler-utils python3`. No script in this repository modifies system packages automatically.

## Build and run

Use the existing checkout in the task's isolated environment. A separate Git worktree is unnecessary unless specifically requested.

```bash
cd /path/to/Research-Tool
./scripts/setup.sh
./scripts/start.sh
```

Setup performs frozen-lockfile installation with `npm ci`, builds `web/dist`, and builds the Rust server with `cargo build --locked`. Start serves the built website and API together at the configured bind address, initially `127.0.0.1:3000`. Open that address in your local browser.

On a new database, start creates an administrator with login ID `admin`. Its random initial password is saved privately in ignored `.local/admin-password`; read that file locally to sign in. The script prints the file path, never the password. Do not commit, paste into an issue, or share that file. If you supply `RESEARCH_ADMIN_PASSWORD` yourself, that value is used only for initial administrator creation and is not written to the local password file.

Restarting preserves the database and existing accounts. Changing a bootstrap environment variable does **not** change an existing account's password. Keep the original password securely; a reset/recovery interface is outside this first pilot. The initial administrator can provision surveyor IDs and one-time activation codes in the Team screen; each surveyor activates their account and sets their own password.

The initial “Smart Cities, Silent Citizens” project contains an **unapproved draft**. Delhi, Aizawl, Chennai, and Srinagar are the four supplied cities; the fifth city remains unconfirmed. Review and replace candidate questions and consent wording before any real field collection. No participant responses or surveyor accounts are seeded.

## Edit during development

```bash
./scripts/dev.sh
```

This starts the Rust server and Vite dev server in one terminal. Vite serves the frontend at its displayed local address, normally `127.0.0.1:5173`, and proxies `/api` to port 3000. Frontend edits reload automatically. Restart the script after Rust edits. Ctrl+C stops the two processes started by the script. If you change the API bind address, update the Vite proxy correspondingly before using this mode.

For a build without the dev server, rerun `./scripts/setup.sh` after changing source, then restart `./scripts/start.sh`. Build outputs survive restarts; running processes do not.

## Configuration and retained state

| Variable or path | Purpose |
| --- | --- |
| `RESEARCH_DB_PATH` | SQLite file; scripts default to `.local/research.sqlite3` under the checkout |
| `RESEARCH_BIND` | API and built-website listen address, default `127.0.0.1:3000`; changing it may also require a Vite proxy change |
| `RESEARCH_SECURE_COOKIES` | Set `true` for an HTTPS deployment; local HTTP development defaults to non-Secure cookies |
| `RESEARCH_ADMIN_ID` | Initial administrator login ID, default `admin`; used only when bootstrapping |
| `RESEARCH_ADMIN_NAME` | Initial administrator display name; used only when bootstrapping |
| `RESEARCH_ADMIN_PASSWORD` | Initial administrator password; provide securely, never commit it |
| `.local/admin-password` | Private generated first-run password when an explicit password was not provided |
| `npm_config_cache` | npm cache location; scripts default to ignored `.local/npm-cache` so cloud setup does not require home-directory writes |
| `web/dist` | Generated static browser application served by the Rust server |
| `target` | Rust build output; `target/debug/research-tool` is the development executable |

Keep the SQLite database, its active journal files, and the initial password file private. A database file copied while writes are in progress may be inconsistent; document and test a supported SQLite backup procedure before using the pilot for participant data. Browser drafts and queues are device-local and do not constitute a backup. They can be cleared by the browser or operating system.

## Verification

The access regression check `python3 scripts/access_smoke.py` tests real organization registration on an empty Rust database, then blocks every online API request and exercises the browser playground: four profiles, editing/publishing, collection, persistence, organization isolation, and Excel export. The Vercel proxy is checked separately with `node --test api/proxy.test.cjs`.

```bash
source scripts/common.sh # Activate the retained cloud Rust toolchain when needed.
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
npm ci --include=dev
npm run build
cargo build --locked
python3 scripts/smoke.py
```

CI runs these Rust, frontend, and live-server checks. The smoke script uses an isolated temporary database and fictional data; it exercises the running API, validates generated XLSX cell data, imports a native-text PDF fixture, and verifies persistence across a restart. It does not validate offline browser behavior by itself.

The optional real-browser check uses a temporary database and fictional data. Install its separate development dependencies in a Python virtual environment if needed, then run:

```bash
python3 -m pip install -r scripts/requirements-browser.txt
python3 -m playwright install chromium
python3 scripts/browser_smoke.py
```

It exercises sign-in, creating an unrelated study, editing and publishing a questionnaire, collector activation, text validation, offline download, reload/draft recovery, persistent pending uploads, reconnect synchronization, mobile layout, and collector permissions. It writes fictional-data screenshots to ignored `.local/test-artifacts/`. CI installs Chromium and runs this check too; the workflow's existence is not a claim that hosted CI has already run.

Still test target phones manually before field use: installation, small-screen navigation, browser storage limits, interrupted interviews, expired sessions, and permission changes. Retrying a response must not create a duplicate. A desktop Chromium offline check does not establish behavior on every Android/iOS browser.

PDF extraction needs its own representative text-PDF checks; a process starting or an open port alone does not validate importing or collection. Keep actual passed, failed, skipped, and unrun results in the task report rather than assuming that the commands above have passed in every environment.

## First-pilot boundaries

Per-questionnaire assignments, institutional administration, account recovery, response correction interfaces, advanced export filters, scanned-PDF OCR, repeating groups, and production operations remain separate roadmap work. The MIT license covers source code. Participant data remains private; deployment owners set study approvals, access, retention, and hosting policies.

Phone installation and service workers require HTTPS outside localhost, and browser support varies. A phone cannot reach another machine's `127.0.0.1`; remote field testing requires an explicitly configured reachable deployment with HTTPS. Do not expose a development server publicly as a substitute for that deployment.
