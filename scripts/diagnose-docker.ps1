$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$docker = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $docker) { throw "Docker Desktop is not installed or docker.exe is not on PATH." }
$directory = Join-Path (Get-Location) ".local"
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$outFile = Join-Path $directory "diagnostic-stdout.txt"
$errFile = Join-Path $directory "diagnostic-stderr.txt"
$report = Join-Path $directory "docker-diagnostic.txt"
Write-Host "Checking Docker's compiler and Linux runtime. This does not start the app."
Write-Host "No research database or Docker volume will be opened or deleted."
Write-Host "Please wait. The diagnostic stops after ten minutes at most."
$process = Start-Process -FilePath $docker.Source -ArgumentList @("build", "--progress=plain", "--no-cache", "-f", "scripts/Dockerfile.diagnostic", ".") -PassThru -NoNewWindow -RedirectStandardOutput $outFile -RedirectStandardError $errFile
$finished = $process.WaitForExit(600000)
if (-not $finished) {
    $process.Kill()
    $process.WaitForExit()
    $result = "Docker diagnostic timed out after ten minutes."
} else {
    $process.WaitForExit()
    $result = "Docker command exit code: $($process.ExitCode). Read the application build exit code inside the report separately."
}
@(
    "Research-Tool Docker diagnostic"
    $result
    ""
    (Get-Content $outFile -Raw -ErrorAction SilentlyContinue)
    (Get-Content $errFile -Raw -ErrorAction SilentlyContinue)
) | Set-Content -Path $report -Encoding UTF8
Write-Host "Report saved to $report"
Start-Process notepad.exe -ArgumentList ('"' + $report + '"')
Write-Host "Copy the report from Notepad and send it in the chat."
