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

## Docker Desktop cannot start on Windows

An error such as `Docker Desktop is unable to start` from `docker info` means the container engine is unavailable. The app has not reached its build or database startup. Older copies of the launcher may display `NativeCommandError` at line 6; the updated launcher reports the failed engine check directly.

1. Open **Docker Desktop** from the Windows Start menu. Wait for its engine to be running before launching the research app. If it shows a specific error, retain that message.
2. If Desktop fails to start, open **PowerShell as administrator** and run `wsl --update`. Restart Windows, open Docker Desktop, and try again.
3. Check **Task Manager > Performance > CPU > Virtualization**. If it says Disabled, enable hardware virtualization in the computer's BIOS/UEFI using the manufacturer's instructions. Updating WSL cannot enable firmware virtualization.
4. If it still fails, run `wsl --status` and `wsl --version` in PowerShell. These results, together with Docker Desktop's own error, identify the next repair. If WSL is missing, on supported Windows versions run `wsl --install --no-distribution` as administrator and restart; do this only when the diagnostics identify missing WSL components.
5. In Docker Desktop settings, select **Use the WSL 2 based engine** and Linux containers. Run `docker info` again: it must show a Server section without an engine error before the app can start.

Do not use Docker's factory reset or delete its storage as a first troubleshooting step: existing Docker volumes may contain retained data. The launcher does not change Windows features, firmware settings, or Docker storage automatically.

The Windows launcher has been reviewed for PowerShell 5.1 native-command error handling but cannot be executed in this Linux development environment. Host-level Docker repairs must be verified on the affected PC.
