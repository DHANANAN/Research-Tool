$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Install and start Docker Desktop, then run this script again."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Start Docker Desktop and try again." }
docker compose -p research-tool-local -f compose.local.yaml up -d --build
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
