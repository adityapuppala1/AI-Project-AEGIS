# Existing isolated verification database only; never creates/drops databases or volumes.
param([ValidatePattern('^aegis_verification_[a-z0-9_]+$')][string]$TestDatabaseName = 'aegis_verification_57878ac')
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
Start-Transcript -Path .git/reassignment-verification.log -Force
try {
  & .\scripts\verify-code-local.ps1 -Suite all
  if ($LASTEXITCODE) { throw 'Native checks failed' }
  . .\scripts\local-runtime-common.ps1
  Invoke-AegisLocalOperation -Name 'task-reassignment-build-database' -Action {
    Assert-AegisSingleRuntime -RequireRunning
    Push-Location apps/web
    try {
      node --test scripts/tests/department-scope.test.cjs scripts/tests/department-proxy.test.cjs scripts/tests/proposal-proxy.test.cjs
      if ($LASTEXITCODE) { throw 'Scope/proxy checks failed' }
    } finally { Pop-Location }
    cmd.exe /d /c 'docker compose --project-name ai-project-aegis build api web 2>&1'
    if ($LASTEXITCODE) { throw 'Production build failed' }
    $testDirectory = (Join-Path (Get-Location) 'services/api/integration_tests') + ':/integration_tests:ro'
    # Database name is allowlisted above; DATABASE_URL expands inside the container only.
    $testCommand = 'export AEGIS_TEST_DATABASE_URL=${DATABASE_URL%/aegis}/' + $TestDatabaseName + '; python -m pytest -q -p no:cacheprovider /integration_tests'
    docker compose --project-name ai-project-aegis run --rm --no-deps -T -v $testDirectory api sh -c $testCommand
    if ($LASTEXITCODE) { throw 'Retained PostGIS checks failed' }
  }
  & .\scripts\start-windows.ps1 -NoBuild -LocalCopilot
  if ($LASTEXITCODE) { throw 'Guarded startup failed' }
} finally { Stop-Transcript }
# Separate transcript and lease; no nested operation lock.
& .\scripts\verify-department-inbox.ps1
