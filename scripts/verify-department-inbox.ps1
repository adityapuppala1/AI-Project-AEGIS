# Run only after the production build/start and retained PostGIS gate complete.
# Uses existing laptop browser dependencies, without installing or starting services.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-runtime-common.ps1')
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
Start-Transcript -Path .git/department-acceptance.log -Force
try {
  Invoke-AegisLocalOperation -Name 'department-inbox-acceptance' -Action {
    Assert-AegisSingleRuntime -RequireRunning
    node scripts/browser/department-inbox.cjs
    if ($LASTEXITCODE) { throw 'Department browser acceptance failed' }
    node .git/browser-qa/smoke.cjs
    if ($LASTEXITCODE) { throw 'General browser smoke failed' }
    & .\services\api\.venv\Scripts\python.exe scripts/verify-local-http.py
    if ($LASTEXITCODE) { throw 'Local HTTP verification failed' }
    Assert-AegisSingleRuntime -RequireRunning
    git rev-parse HEAD
    git status --short
  }
} finally { Stop-Transcript }
