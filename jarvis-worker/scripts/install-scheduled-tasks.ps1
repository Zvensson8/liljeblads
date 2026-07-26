# Install Windows Scheduled Tasks: Jarvis ingest at 08:00 and 15:00 daily
# Run PowerShell as current user (no admin required for user-level tasks)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot "run-ingest.ps1"

if (-not (Test-Path $script)) {
  throw "Missing $script"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" `
  -WorkingDirectory $Root

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

foreach ($pair in @(
  @{ Name = "JarvisIngestMorning"; Time = "08:00" },
  @{ Name = "JarvisIngestAfternoon"; Time = "15:00" }
)) {
  $trigger = New-ScheduledTaskTrigger -Daily -At $pair.Time
  Unregister-ScheduledTask -TaskName $pair.Name -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask `
    -TaskName $pair.Name `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Liljeblads Jarvis service-report ingest ($($pair.Time))" | Out-Null
  Write-Host "Registered task $($pair.Name) at $($pair.Time)"
}

Write-Host ""
Write-Host "Done. List with: Get-ScheduledTask -TaskName 'JarvisIngest*'"
Write-Host "Test now with:  powershell -File `"$script`""
