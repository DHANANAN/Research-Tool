# Development verification

These observations describe this cloud development instance on 25 October 2026. They do not establish a public deployment, hosted CI result, approved research instrument, or performance on every phone.

## Executed checks

Deployment cleanup was also verified in a fresh Node 22.23.4 / npm 10.9.9 container with no installed dependencies: `npm ci --include=dev`, `npm run build`, and both proxy checks passed. The browser access check passed against the simplified build. The deployment now uses one root package/lockfile, with full registry integrity metadata; the nested frontend manifests and npm workspace were removed. These are local results, not a claim that the public Vercel deployment has completed.

| Check | Result and scope |
| --- | --- |
| `./scripts/setup.sh` | Passed frozen npm installation, production frontend build, and locked Rust build. TLS and package integrity checks remained enabled. |
| Rust formatting and Clippy | Passed `cargo fmt --all -- --check` and Clippy for all targets with warnings denied. |
| `cargo test --locked` | 21 tests passed: 9 unit and 12 API integration tests, including organization registration, legacy migration, invitation joining, and opt-in demo isolation. Zero failing or ignored tests. Empty binary/doc-test targets are not counted as tests. |
| `python3 scripts/smoke.py` | Passed a live temporary-server check covering login, CSRF, one-time activation, project isolation, questionnaire versions, consent, typed answers, idempotent receipts, closure, native-text PDF import, real XLSX contents, and database persistence across restart. |
| `python3 scripts/browser_smoke.py` | Passed the complete Chromium workflow, including metadata editing, offline reload/recovery/queue persistence, exactly-once reconnection, mobile layout, permissions, and the administrator's actual Excel download. |
| `python3 scripts/access_smoke.py` | Passed real account/organization registration, then all four guest profiles with every online API blocked: editing, publication, collection, persistence, organization isolation, literal Excel output, mobile layout, and leaving the playground. No guest mutation reached the online server. |
| `node --test api/proxy.test.cjs` | Two tests passed: missing-backend JSON errors and forwarding of authenticated JSON, session cookies, PDF bytes, and XLSX downloads. |
| Container | Built the production image and exercised health/HTML, real registration, four opt-in demo logins, example isolation, PDF tools, and persistence after restarting the temporary container. Temporary containers/volumes were removed. |
| Browser dependencies | `npm audit` reported zero vulnerabilities after choosing the lightweight XLSX writer. The pinned writer's shared-string dictionary is adjusted at build time so literal answers such as `constructor` remain valid; the access check verifies this and inert formula-like text. |
| Real uploaded PDF | The supplied 60-page, 1.3 MB review document produced 200 optional question candidates and four review warnings. The explicit 200-candidate limit was reached: this was an incomplete import requiring instrument-by-instrument review, not a faithful automatic conversion or publication. |
| Synthetic response volume | A separate temporary server accepted 1,000 fictional short interviews through four HTTP workers. Ten exact retries created no additional rows. The XLSX contained exactly the same 1,000 unique response IDs, before and after a server restart. |
| Retained development data | The working database contains the unreviewed starter draft and zero participant/test responses. Test databases and temporary servers are separate. |

The synthetic volume check used a Rust debug build, SQLite, loopback HTTP without TLS, short three-question responses, and a machine reporting five CPU threads and about 33 GiB RAM. It demonstrates that specific workflow; it is not a production capacity or network-latency guarantee.

## Reproducible browser check

`python3 scripts/browser_smoke.py` uses Chromium, a temporary database, and fictional data. It exercises a newly created unrelated study, metadata editing, questionnaire editing and reviewed publication, surveyor activation, required-text validation, downloaded forms, offline reload and draft recovery, queued-response persistence, a 390-pixel phone layout, reconnection with exactly one received response, collector permissions, and an administrator's Excel download. Its development dependencies and setup are documented in [development.md](development.md).

The implementation also has storage-level checks performed during development for IndexedDB commit/rollback, per-user isolation, stable interview IDs, and failed service-worker update recovery. These observations supplement the checked-in browser test; they are not a substitute for running it after changes. Screenshots from fictional-data browser checks are saved under ignored `.local/test-artifacts/`.

## Still required before real field deployment

The repository's [Vercel/Rust deployment configuration](deployment.md) is prepared and locally checked. This development environment cannot access the supplied public Vercel domain or its project settings. Public deployment and `RESEARCH_BACKEND_URL` configuration remain outside the verified local results. The browser playground works independently of that server connection; shared online accounts require it.

- A reachable HTTPS deployment, secure-cookie configuration, backup/restore and account recovery procedures, and institution-approved data handling.
- Actual target-device testing on Android/iOS, installation behavior, storage pressure, prolonged disconnection, and the study's expected questionnaire sizes and languages.
- Confirmation of the final ICSSR city list, eligibility, participant information, consent, translations, and scoring. The supplied document is explicitly a review/pilot version.
- Implementation of any study-dependent roadmap features such as repeat groups, scanned-PDF OCR, supervisor review/corrections, richer assignments, or additional languages.

The shared ChatGPT conversation was inaccessible from this environment. Prior-source and supplied-document findings, their limits, and the independent implementation approach are recorded in [legacy recovery](legacy-recovery.md), [study context](study-context.md), and [design inspirations](design-inspirations.md).

## Local-computer and operations repair (25 October 2026)

The current user-provided Vercel address is `https://researchtool-chi.vercel.app/`. This workspace's outbound proxy rejects connections to it before application HTTP can be inspected. No callable Vercel integration or deployment credentials are available in this session. Public API availability, Vercel settings, and production collection remain **unverified**.

The user requested using their own PC as the server. `compose.local.yaml` and Windows/macOS/Linux launchers now run the complete application on localhost with a persistent database volume. The Windows launcher cannot be executed in this Linux environment; the Compose configuration and shell syntax have been checked. A separate Compose configuration supports HTTPS on an existing public server; automatic public certificate issuance requires that server and DNS and has not been exercised here.

Executed locally: clean npm installation and production build; 22 Rust tests; warnings-denied Clippy; HTTP collection/export/restart smoke checks; both Chromium suites; proxy tests; and a live-WAL backup/restore test that refuses overwriting an existing database. New checks cover operator recovery/session revocation/one-time reactivation, database readiness failure, CSV negative numbers/zero/false/leading-zero identifiers/Unicode/multiple-choice/missing answers, and browser-demo CSV download. These are development-environment results, not public production results.

The complete release Docker image also built successfully using Node 22 and Rust 1.90.0. This sandbox required an explicit build-time proxy host mapping and its trusted CA bundle; these environment-specific settings are not committed. An isolated Compose instance using `compose.local.yaml` passed real HTTP organization registration, all 15 draft templates, publication, surveyor activation, submission, duplicate-safe retry, XLSX/CSV download, static asset/service-worker serving, and response persistence after container restart. The test used a separate disposable volume and fictional accounts. This verifies the Linux container deployment; Windows Docker Desktop and public HTTPS remain untested here.

## Docker compiler-file workaround (26 October 2026)

The supplied Windows build log failed before application compilation: Cargo could not execute the `proc-macro2` build script (`ENOENT`). The precise Windows root cause remains unconfirmed. The Dockerfile now places Cargo artifacts in a locked architecture-specific BuildKit cache, copies the release executable out of that mount, and uses the Rust 1.90.0 compiler already present in the pinned builder instead of installing editor components.

A fresh Cargo cache compiled all dependencies and the release executable successfully in this Linux environment. The resulting Compose container passed organization registration, publication, surveyor activation, submission/retry, XLSX/CSV export, static assets and response persistence across restart. An initial test was blocked by this workspace's own full filesystem; removing disposable build caches resolved that local capacity issue. Neither the Linux test nor its disk-space finding establishes the cause or resolution on the user's Windows computer.
