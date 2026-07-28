# Jarvis: check Drive inbox at 08:00 / 15:00 (Task Scheduler).
# Empty checks do not send email; only new reports are processed (idempotent).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("ingest_{0:yyyyMMdd_HHmmss}.log" -f (Get-Date))

function Write-Log($msg) {
  $line = "{0:u} {1}" -f (Get-Date), $msg
  Add-Content -Path $log -Value $line
  Write-Host $line
}

Write-Log "Starting Jarvis folder check / ingest (Drive + inbox, MODE from .env)"
$python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  Write-Log "ERROR: venv python not found at $python"
  exit 1
}

# --sync-drive forces Drive even if env temporarily disabled; primary
# toggle is DRIVE_SYNC_ENABLED=true in jarvis-worker/.env
& $python -m jarvis_worker.cli ingest --sync-drive *>> $log
$code = $LASTEXITCODE
Write-Log "Finished with exit code $code"
exit $code
