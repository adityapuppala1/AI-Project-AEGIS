# Read-only Windows P0 integration checks for AEGIS exercise stack.
# No sample insertion, migration, replay, database reset, real alert or dispatch.
# Run after: docker compose up --build -d
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "verify-windows.ps1" -Action {
  if (Get-Command docker -ErrorAction SilentlyContinue) { Assert-AegisSingleRuntime }
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

  function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "AEGIS P0 smoke FAILED: $Message" }
    Write-Host "PASS: $Message" -ForegroundColor Green
  }
  function Get-Json([string]$Url) {
    return Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 15
  }
  function Check-Status([string]$Url, [string[]]$Allowed, [string]$Label, [string]$Method = "GET") {
    $code = (& curl.exe -sS --connect-timeout 5 --max-time 15 -o NUL -w "%{http_code}" -X $Method $Url).Trim()
    Assert-True ($LASTEXITCODE -eq 0 -and $Allowed -contains $code) ("$Label [HTTP $code]")
  }
  Write-Host "AEGIS P0 LOCAL EXERCISE-ONLY smoke. No data will be modified." -ForegroundColor Cyan

  # Compose must already be built and running; these checks never start or stop it.
  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $health = Get-Json "http://localhost:8000/health"
      if ($health.status -eq "ok" -and $health.mode -eq "exercise") {
        $ready = $true
        break
      }
    } catch { Start-Sleep -Seconds 2 }
  }
  Assert-True $ready "Exercise API responds locally"

  $report = Get-Json "http://localhost:8000/v1/exercise/system/readiness"
  Assert-True ($report.status -eq "ready" -and $report.mode -eq "synthetic_exercise") "Schema and fixture preflight"

  # Verify security constraints in the local database without modifying anything.
  & docker compose exec -T api python -m app.migration_audit
  Assert-True ($LASTEXITCODE -eq 0) "Required GIS indexes, unique approvals and independent-checker trigger"
  Assert-True ($report.checks.operational_actions_enabled -eq $false) "No operational action path"
  Assert-True ($report.checks.real_integrations_connected -eq $false) "No real data connectors"

  $expected = @{
    incidents = 5; sources = 4; source_samples = 24;
    timeline_events = 7; evidence = 5; geo_assets = 5;
    agency_tasks = 7; agency_task_events = 13
  }
  foreach ($key in $expected.Keys) {
    $actual = $report.fixture_counts.$key
    Assert-True ($actual -ge $expected[$key]) ("$key fixture records ($actual >= $($expected[$key]))")
  }

  $incident = "22222222-2222-4222-8222-222222222222"
  # Exercise-record reads need a verified operator token since the API sign-in change (docs/SECURITY_ASSESSMENT.md).
  # This script holds no credential and mints no token, so it checks that each read refuses an anonymous caller.
  # The content assertions (synthetic-only flags, no real probability, scripted acknowledgements) are covered by
  # services/api tests and by a signed-in browser check; they are not repeated here without a token.
  $signInRequired = @(
    "/v1/exercise/incidents", "/v1/exercise/incidents/query", "/v1/exercise/incidents/$incident",
    "/v1/exercise/incidents/$incident/correlation?radius_m=3000", "/v1/exercise/incidents/$incident/readiness?radius_m=3000",
    "/v1/exercise/sources", "/v1/exercise/model-lab/report", "/v1/exercise/agency-tasks?limit=50",
    "/v1/exercise/agency-tasks/f6000000-0000-4000-8000-000000000001", "/v1/exercise/incidents/$incident/audit",
    "/v1/exercise/policy", "/v1/exercise/ingestion/status", "/v1/exercise/telemetry"
  )
  foreach ($path in $signInRequired) { Check-Status ("http://localhost:8000" + $path) @("401") ("$path requires sign-in") }
  Check-Status "http://localhost:8000/v1/exercise/risk" @("401") "Illustrative risk index requires sign-in" "POST"

  # Since the sign-in gate, only the landing and sign-in pages open anonymously; every other page must redirect.
  Check-Status "http://localhost:3000/" @("200") "Landing page"
  Check-Status "http://localhost:3000/sign-in" @("200") "Sign-in page"
  Check-Status "http://localhost:3000/incidents" @("307") "Incident Registry page requires sign-in"
  Check-Status "http://localhost:3000/incidents/$incident" @("307") "Incident Intelligence page requires sign-in"
  Check-Status "http://localhost:3000/sources" @("307") "Source Health page requires sign-in"
  Check-Status "http://localhost:3000/model-lab" @("307") "Model Evaluation Lab page requires sign-in"
  Check-Status "http://localhost:3000/agency-sync" @("307") "Fictional AgencySync page requires sign-in"
  Check-Status "http://localhost:3000/audit" @("307") "Audit360 exercise export page requires sign-in"
  Check-Status "http://localhost:3000/admin" @("307") "PolicyStudio read-only administration page requires sign-in"
  Check-Status "http://localhost:3000/demo" @("307") "Guided exercise requires sign-in"
  Check-Status "http://localhost:3000/ingestion" @("307") "Ingestion Monitor page requires sign-in"
  Check-Status "http://localhost:3000/approvals" @("307") "Exercise Approvals page renders without unauthorized login requires sign-in"
  Check-Status "http://localhost:3000/help" @("307") "Help Center page requires sign-in"

  # Security regression: HTTP write to operational warning is forbidden.
  Check-Status "http://localhost:8000/v1/live/public-warning" @("403") "Live public warning blocked" "POST"
  Check-Status "http://localhost:8000/v1/exercise/proposals" @("401","503") "Anonymous governance workflow stays locked"
  Write-Host "AEGIS P0 smoke PASSED. Browser keyboard/mobile testing remains a manual release gate." -ForegroundColor Green
}
