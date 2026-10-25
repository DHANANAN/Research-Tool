$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Install and start Docker Desktop, then run this script again."
}
# Windows PowerShell 5.1 promotes redirected native stderr to a terminating
# NativeCommandError with ErrorActionPreference=Stop. Let cmd handle native
# redirection and inspect its exit code so a failed daemon gets useful guidance.
& $env:ComSpec /d /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Docker is installed, but its engine is not running." -ForegroundColor Yellow
    Write-Host "Open Docker Desktop from Start and wait for 'Engine running'."
    Write-Host "If Docker Desktop says it cannot start:"
    Write-Host "  1. Open PowerShell as administrator and run: wsl --update"
    Write-Host "  2. Restart Windows, then open Docker Desktop again."
    Write-Host "  3. Check Task Manager > Performance > CPU > Virtualization."
    Write-Host "     If Disabled, enable virtualization in your PC's BIOS/UEFI."
    Write-Host "If it still fails, run 'wsl --status' and 'wsl --version' and share their output."
    Write-Host "More help: docs/local-computer.md (Docker Desktop cannot start)."
    Write-Host "The research application has not started; no database was changed."
    exit 1
}
# Preserve ordinary Docker build output, including stderr, without converting
# native error messages into a premature PowerShell exception.
& $env:ComSpec /d /c "docker compose -p research-tool-local -f compose.local.yaml up -d --build"
if ($LASTEXITCODE -ne 0) { throw "The application build failed. See the error above." }
$port = if ($env:RESEARCH_LOCAL_PORT) { $env:RESEARCH_LOCAL_PORT } else { "3000" }
$url = "http://localhost:$port"
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $ready = Invoke-RestMethod -Uri "$url/api/ready" -TimeoutSec 2
        if ($ready.ok) {
            Write-Host "Your local research portal: $url"
            Write-Host "Create an organization. Data stays in the local Docker volume."
            Start-Process $url
            exit 0
        }
    } catch { Start-Sleep -Seconds 1 }
}
throw "Server is not ready. Run: docker compose -p research-tool-local -f compose.local.yaml logs app"
