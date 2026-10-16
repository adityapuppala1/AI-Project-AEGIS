# Read-only Windows P0 integration checks for AEGIS exercise stack.
# No sample insertion, migration, replay, database reset, real alert or dispatch.
# Run after: docker compose up --build -d
$ErrorActionPreference = "Stop"
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
  timeline_events = 7; evidence = 5; geo_assets = 5
}
foreach ($key in $expected.Keys) {
  $actual = $report.fixture_counts.$key
  Assert-True ($actual -ge $expected[$key]) ("$key fixture records ($actual >= $($expected[$key]))")
}

$incident = "22222222-2222-4222-8222-222222222222"
$case = Get-Json "http://localhost:8000/v1/exercise/incidents/$incident"
Assert-True ($case.source -eq "synthetic_exercise" -and $case.operational_actions_enabled -eq $false) "Incident intelligence synthetic only"

$spatial = Get-Json "http://localhost:8000/v1/exercise/incidents/$incident/correlation?radius_m=3000"
Assert-True ($spatial.analysis_kind -eq "geographic_proximity_only" -and $spatial.validated_risk_model -eq $false) "Spatial proximity does not claim flood risk"

$assessment = Get-Json "http://localhost:8000/v1/exercise/incidents/$incident/readiness?radius_m=3000"
Assert-True ($assessment.real_world_risk_probability -eq $null -and $assessment.needs_accountable_human_review -eq $true) "Assessment has no real flood probability or autonomous decision"

$source = Get-Json "http://localhost:8000/v1/exercise/sources"
Assert-True ($source.source -eq "synthetic_exercise" -and $source.real_connectors_enabled -eq $false) "Source monitor remains simulated"

$model = Get-Json "http://localhost:8000/v1/exercise/model-lab/report"
Assert-True ($model.source -eq "synthetic_generated_fixture" -and $model.calibrated_real_world_probability -eq $false) "Model lab remains offline synthetic"

$ingest = Get-Json "http://localhost:8000/v1/exercise/ingestion/status"
Assert-True ($ingest.mode -eq "synthetic_exercise" -and $ingest.live_ingestion_enabled -eq $false) "No external ingestion route"

Check-Status "http://localhost:3000/" @("200") "Command Center page"
Check-Status "http://localhost:3000/incidents" @("200") "Incident Registry page"
Check-Status "http://localhost:3000/incidents/$incident" @("200") "Incident Intelligence page"
Check-Status "http://localhost:3000/sources" @("200") "Source Health page"
Check-Status "http://localhost:3000/model-lab" @("200") "Model Evaluation Lab page"
Check-Status "http://localhost:3000/ingestion" @("200") "Ingestion Monitor page"
Check-Status "http://localhost:3000/approvals" @("200") "Exercise Approvals page renders without unauthorized login"
Check-Status "http://localhost:3000/help" @("200") "Help Center page"

# Security regression: HTTP write to operational warning is forbidden.
Check-Status "http://localhost:8000/v1/live/public-warning" @("403") "Live public warning blocked" "POST"
Check-Status "http://localhost:8000/v1/exercise/proposals" @("401","503") "Anonymous governance workflow stays locked"
Write-Host "AEGIS P0 smoke PASSED. Browser keyboard/mobile testing remains a manual release gate." -ForegroundColor Green
