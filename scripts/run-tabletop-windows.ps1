# Explicitly opt-in to adding THREE fictional source observations.
# This NEVER writes to real systems or removes local Postgres data.
param(
  [switch]$ConfirmExercise,
  [string]$RunId = ""
)
$ErrorActionPreference = "Stop"
if (-not $ConfirmExercise) {
  throw "Refusing to write simulation samples. Re-run with -ConfirmExercise after reading the runbook."
}
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
$arguments = @("compose","exec","-T","api","python","-m","app.scenario_runner","--confirm-synthetic")
if ($RunId -ne "") {
  $value = [guid]::Empty
  if (-not [guid]::TryParse($RunId,[ref]$value)) {
    throw "RunId must be a valid UUID"
  }
  $arguments += @("--run-id", $value.ToString())
}
Write-Host "AEGIS: adding three fictional readings to existing local history." -ForegroundColor Cyan
Write-Host "This does not call live sensors, agencies, SMS or warning systems."
& docker @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Synthetic ReplayLab failed. Check local Docker database and source registry."
}
Write-Host "Source Health: http://localhost:3000/sources"
Write-Host "Guided Walkthrough: http://localhost:3000/demo"
