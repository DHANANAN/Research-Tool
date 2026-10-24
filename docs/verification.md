# Development verification

These observations describe this cloud development instance on 25 October 2026. They do not establish a public deployment, hosted CI result, approved research instrument, or performance on every phone.

## Executed checks

| Check | Result and scope |
| --- | --- |
| `./scripts/setup.sh` | Passed frozen npm installation, production frontend build, and locked Rust build. TLS and package integrity checks remained enabled. |
| Rust formatting and Clippy | Passed `cargo fmt --all -- --check` and Clippy for all targets with warnings denied. |
| `cargo test --locked` | 16 tests passed: 9 unit and 7 API integration tests. Zero failing or ignored tests. Empty binary/doc-test targets are not counted as tests. |
| `python3 scripts/smoke.py` | Passed a live temporary-server check covering login, CSRF, one-time activation, project isolation, questionnaire versions, consent, typed answers, idempotent receipts, closure, native-text PDF import, real XLSX contents, and database persistence across restart. |
| `python3 scripts/browser_smoke.py` | Passed the complete Chromium workflow, including metadata editing, offline reload/recovery/queue persistence, exactly-once reconnection, mobile layout, permissions, and the administrator's actual Excel download. |
| Real uploaded PDF | The supplied 60-page, 1.3 MB review document produced 200 optional question candidates and four review warnings. The explicit 200-candidate limit was reached: this was an incomplete import requiring instrument-by-instrument review, not a faithful automatic conversion or publication. |
| Synthetic response volume | A separate temporary server accepted 1,000 fictional short interviews through four HTTP workers. Ten exact retries created no additional rows. The XLSX contained exactly the same 1,000 unique response IDs, before and after a server restart. |
| Retained development data | The working database contains the unreviewed starter draft and zero participant/test responses. Test databases and temporary servers are separate. |

The synthetic volume check used a Rust debug build, SQLite, loopback HTTP without TLS, short three-question responses, and a machine reporting five CPU threads and about 33 GiB RAM. It demonstrates that specific workflow; it is not a production capacity or network-latency guarantee.

## Reproducible browser check

`python3 scripts/browser_smoke.py` uses Chromium, a temporary database, and fictional data. It exercises a newly created unrelated study, metadata editing, questionnaire editing and reviewed publication, surveyor activation, required-text validation, downloaded forms, offline reload and draft recovery, queued-response persistence, a 390-pixel phone layout, reconnection with exactly one received response, collector permissions, and an administrator's Excel download. Its development dependencies and setup are documented in [development.md](development.md).

The implementation also has storage-level checks performed during development for IndexedDB commit/rollback, per-user isolation, stable interview IDs, and failed service-worker update recovery. These observations supplement the checked-in browser test; they are not a substitute for running it after changes. Screenshots from fictional-data browser checks are saved under ignored `.local/test-artifacts/`.

## Still required before real field deployment

- A reachable HTTPS deployment, secure-cookie configuration, backup/restore and account recovery procedures, and institution-approved data handling.
- Actual target-device testing on Android/iOS, installation behavior, storage pressure, prolonged disconnection, and the study's expected questionnaire sizes and languages.
- Confirmation of the final ICSSR city list, eligibility, participant information, consent, translations, and scoring. The supplied document is explicitly a review/pilot version.
- Implementation of any study-dependent roadmap features such as repeat groups, scanned-PDF OCR, supervisor review/corrections, richer assignments, or additional languages.

The shared ChatGPT conversation was inaccessible from this environment. Prior-source and supplied-document findings, their limits, and the independent implementation approach are recorded in [legacy recovery](legacy-recovery.md), [study context](study-context.md), and [design inspirations](design-inspirations.md).
