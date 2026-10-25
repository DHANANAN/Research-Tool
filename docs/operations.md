# Operating the complete application

## Hosting decision

Keep the existing React/Vite client and Rust/Axum server. They already implement versioned collection, role checks, offline queues and typed Excel exports. A language migration would not supply the missing public server or persistent storage. Use one Rust instance with a persistent SQLite volume. Both website and API can run on that server; Vercel is an optional frontend connected through `RESEARCH_BACKEND_URL`.

`compose.yaml` adds a repeatable HTTPS deployment on an **existing** Linux host. It does not provision a host or domain, purchase infrastructure, or deploy anything by itself. Set DNS for your hostname to the host, allow inbound ports 80/443, install Docker with Compose, then:

```bash
cp .env.example .env
# Edit RESEARCH_DOMAIN to your real hostname.
docker compose up -d --build
curl --fail https://YOUR_HOSTNAME/api/ready
```

Caddy obtains and renews the HTTPS certificate. The app's port is private to the container network. Its named volume retains data through container replacement; never run `docker compose down --volumes` on a retained installation. Use one application replica. Create an organization in the public portal, invite a surveyor, publish a fictional form, submit, export, restart the app, and confirm the response remains before collecting research data. Container restarts alone are not backups.

To retain the Vercel domain, set its server-side `RESEARCH_BACKEND_URL` to this host's HTTPS origin and redeploy. Keep Vercel's Root Directory at repository root and Output Directory at `dist`. See [deployment.md](deployment.md).

## Health and readiness

`GET /api/health` reports that the process responds. `GET /api/ready` also queries the application database and returns 503 when that schema cannot be read. Configure the host monitor to use readiness. Neither endpoint proves full questionnaire collection or durable storage across host loss. Startup failures go to stderr. The application audit table records exports and operator recovery without storing passwords or recovery codes.

## Consistent backup and restore

Use the SQLite backup API, which includes committed WAL data, instead of copying a live database file. On a host with Python 3 and access to the database:

```bash
python3 scripts/database.py backup /path/to/research.sqlite3 /private/backups/research-2026-10-25.sqlite3
python3 scripts/database.py restore /private/backups/research-2026-10-25.sqlite3 /private/restore/research.sqlite3
```

The destination parent must exist. Both operations refuse an existing destination and validate integrity and foreign keys. Output files are mode 0600. Keep backups encrypted on separate storage and test restores on a separate instance. Browser drafts are not included. Schedule the backup command through your host's scheduler according to the study's recovery requirements; a daily backup permits up to a day of loss.

For Compose, stop the app before copying its database to the host, then restart it:

```bash
docker compose stop app
docker compose cp app:/data/research.sqlite3 /private/snapshot/research.sqlite3
# Also copy any research.sqlite3-wal file present to the same directory.
# Keep the app stopped until both copies complete; preserve any present journal.
docker compose start app
python3 scripts/database.py backup /private/snapshot/research.sqlite3 /private/backups/verified.sqlite3
```

Prefer running the Python backup tool against a host-accessible volume for automated backups without downtime. For production restoration, stop the app, preserve the old database and its journal files, place the verified restored database at the configured path with UID/GID 10001 access for the Docker image, and start the app. Do not pair a restored database with stale `-wal` or `-shm` files. Confirm readiness and response counts before reopening collection.

## Account recovery

Recovery requires trusted server-operator filesystem access. Verify the requesting researcher's identity through your organization's established channel. There is no email-reset provider configured.

```bash
RESEARCH_DB_PATH=/path/to/research.sqlite3 ./target/debug/research-tool --recover-account LOGIN_ID
# In the deployed Compose container:
docker compose exec app /app/research-tool --recover-account LOGIN_ID
```

The command prints a private random one-time code, valid for one hour. Give it directly to the verified account holder. They open **Activate account**, enter their existing login ID and the code, and set a new password. Recovery immediately revokes all existing sessions, clears the old password and login lockout, and records an operator recovery audit event. Projects, memberships and responses remain intact. Never put the code in logs, issues, screenshots, or shared documentation. If it expires, repeat recovery. Bootstrap password environment variables do not reset existing accounts.

## CSV semantics

Excel remains the wide, one-response-per-row export with a codebook. **Export CSV** uses long format: one row per non-section question per response, including stable form/version and question identifiers, label, type, collection/receipt timestamps and answer status. `answer_json` is JSON: strings retain leading zeros, numbers retain their representation, booleans remain booleans, multiple choices are arrays of codes, and missing answers are `null` with a separate status. Parse this column using `json.loads` in Python or a JSON parser in your analysis tool. Do not rely on Excel's automatic CSV type inference; use the XLSX export for typed spreadsheet cells.

CSV fields are quoted with embedded quotes escaped. Potential formula prefixes in metadata are protected with a leading apostrophe; answer strings are JSON-quoted. The browser-local demo uses the same column layout. Exports respect the selected questionnaire version and server-side administrator permissions.
