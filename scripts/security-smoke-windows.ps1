# Read-only checks. No IdP, token, cloud deployment or real alerts required.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "security-smoke-windows.ps1" -Action {
  if (Get-Command docker -ErrorAction SilentlyContinue) { Assert-AegisSingleRuntime }
  $base = "http://localhost:3000"
  Write-Host "Checking IndTrana local exercise security posture..."
  $session = Invoke-RestMethod -Uri "$base/api/auth/session" -Method GET -TimeoutSec 10
  if ($session.authenticated) { throw "Unexpected authenticated session in a fresh PowerShell client." }
  Write-Host "PASS: No implicit operator identity"
  $code = (curl.exe -s -o NUL -w "%{http_code}" "$base/api/proposals").Trim()
  if ($code -ne "401" -and $code -ne "503") {
      throw "Expected protected proposal API to reject anonymous access; got HTTP $code"
  }
  Write-Host "PASS: Protected proposals fail closed (HTTP $code)"
  $api = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method GET -TimeoutSec 10
  if ($api.mode -ne "exercise") { throw "Backend is not in exercise mode." }
  Write-Host "PASS: API is exercise-only"
  # Exercise-record reads on the API port need a verified operator token (docs/SECURITY_ASSESSMENT.md).
  foreach ($path in @("/v1/exercise/incidents", "/v1/exercise/sources", "/v1/exercise/ingestion/status", "/v1/exercise/agency-tasks", "/v1/exercise/policy", "/v1/exercise/model-lab/report", "/v1/public-reference/earth-watch/status", "/v1/public-intake/reports")) {
    $code = (curl.exe -s -o NUL -w "%{http_code}" "http://localhost:8000$path").Trim()
    if ($code -ne "401") { throw "Expected $path to refuse an anonymous caller with 401; got HTTP $code" }
  }
  Write-Host "PASS: API exercise-record reads refuse anonymous callers (HTTP 401)"
  $code = (curl.exe -s -o NUL -w "%{http_code}" "http://localhost:8000/v1/exercise/system/readiness").Trim()
  if ($code -ne "200" -and $code -ne "503") { throw "Readiness diagnostic should stay open; got HTTP $code" }
  Write-Host "PASS: Readiness diagnostic stays open (HTTP $code)"
  Write-Host "These checks verify configuration only; provider login, signed tokens and checker workflow still require integration testing."
}
