# Contributing to Research-Tool

The project has a Rust/React development pilot and a larger product blueprint. Start with the [README](README.md), [development guide](docs/development.md), [requirements](docs/product-requirements.md), and [roadmap](docs/roadmap.md). Run the relevant Rust, frontend, and live-server checks described in the development guide when changing the application.

Contributions can improve the specification, explain field-research needs, propose accessible interface designs, or implement a roadmap milestone. Keep each proposed change focused and describe which user workflow it enables.

## Before adding an application component

- Document the chosen tool versions, dependency licenses, and reproducible setup commands.
- Add an appropriate lockfile, migrations where needed, and useful automated checks alongside the implementation.
- Include developer startup, database initialization, and validation instructions; distinguish local development from production deployment.
- Use the existing checkout in the task's isolated environment unless a separate checkout is explicitly needed.

## Preserve the research data contract

- Published questionnaire versions must retain stable question and choice identifiers.
- Check permissions on the server for every project operation; hiding a screen is not authorization.
- Keep unfinished, queued, accepted, rejected, and synced responses distinguishable.
- Verify exports with representative fictional responses, including missing values, multiple choices, Unicode, mixed versions, and text that resembles spreadsheet formulas.
- Test offline retries and interrupted synchronization when touching collection or persistence code.

Never include participant records, private study documents, credentials, or real student identifiers in examples, tests, screenshots, logs, issues, or pull requests. Use clearly fictional data. Do not ask contributors to post secrets or participant data to reproduce an issue.

## Open source and upstream work

Contributions are made under this repository's [MIT license](LICENSE). Credit sources and review dependency or reused-code licenses before introducing third-party material. Studying an upstream tool's documented behavior does not grant permission to copy its source under a different license. Do not assume integrations with, endorsement by, or feature parity with KoboToolbox or ODK.
