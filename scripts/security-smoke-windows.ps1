# Read-only checks. No IdP, token, cloud deployment or real alerts required.
$ErrorActionPreference = "Stop"
$base = "http://localhost:3000"
Write-Host "Checking AEGIS local exercise security posture..."
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
Write-Host "These checks verify configuration only; provider login, signed tokens and checker workflow still require integration testing."
