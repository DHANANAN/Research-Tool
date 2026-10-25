# Use your computer as the research server

The full application can run on your own computer. A browser displays the interface; Docker runs the Rust backend and persistent SQLite database. You do not need Vercel or another hosting account for this mode. The first build needs an internet connection to download dependencies. Once built, ordinary local authoring, collection and exports work without an internet connection while the local server is running; installation/update downloads still require internet access.

## Start

1. Install Docker Desktop on Windows or macOS, or Docker Engine with the Compose plugin on Linux. Start Docker. Windows Docker Desktop must use Linux containers.
2. Download or clone this repository onto the computer. Extract a downloaded ZIP first.
3. Open a terminal in the repository directory and run:

On Windows, you can double-click **Start-Research-Tool.cmd** in the extracted repository. Alternatively, use PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

The execution-policy override applies only to that PowerShell process, not the machine policy.

macOS/Linux:

```bash
bash scripts/run-local.sh
```

The first build includes Rust compilation and may take several minutes. The launcher opens **http://localhost:3000** after the database is ready. Create your own organization and account there. To try the fictional examples first, choose **Explore demo**. The four browser playground profiles use `ResearchDemo2026!`: `guest-admin`, `guest-surveyor-1`, `guest-surveyor-2`, `guest-surveyor-3`.

Local organization accounts use the server database. The playground uses browser storage. They are separate; playground answers are not automatically copied into a real organization.

## Return later, stop, and recover access

Run the same launcher to rebuild/start after pulling an update. For a quick start of an already built installation:

```bash
docker compose -p research-tool-local -f compose.local.yaml up -d
```

Open http://localhost:3000. To stop:

```bash
docker compose -p research-tool-local -f compose.local.yaml stop
```

Accounts and confirmed responses persist in the `research-tool-local_local-research-data` Docker volume. Do not delete that volume, reset Docker Desktop's storage, or run `down --volumes` unless you intend to erase it. Back up retained research data; see [operations](operations.md). The server stops being available while the computer is off or asleep. Unsynced browser drafts remain separate from server backups.

If port 3000 is already in use, set `RESEARCH_LOCAL_PORT` to an available port before starting (for example, `$env:RESEARCH_LOCAL_PORT="3001"` in PowerShell or `export RESEARCH_LOCAL_PORT=3001` in bash). Open the resulting localhost address.

For a lost local account password:

```bash
docker compose -p research-tool-local -f compose.local.yaml exec app /app/research-tool --recover-account YOUR_LOGIN_ID
```

Use the printed private one-time code in **Activate account** to set a new password. It expires in one hour and existing sessions are revoked.

## Vercel and additional devices

The public Vercel site is a separate deployment. Setting its backend URL to `localhost` cannot reach your computer: localhost there means Vercel's own machine. Use the local portal for this installation. Its requests go directly to the local server under the same origin.

The supplied local configuration binds only to this computer. Other devices cannot connect to it. Multi-device field collection needs an HTTPS address reachable by the surveyors, a computer/server kept awake and online, and appropriate network configuration. Use the [HTTPS server deployment](operations.md) when that is required. Browser PWA support varies; localhost is treated as a secure development origin by mainstream browsers.
