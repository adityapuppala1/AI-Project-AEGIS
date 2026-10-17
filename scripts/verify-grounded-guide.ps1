$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
Start-Transcript -Path .git/grounded-guide-verification.log -Force
try {
  & .\scripts\verify-code-local.ps1 -Suite all
  if ($LASTEXITCODE) { throw 'Native checks failed' }
  . .\scripts\local-runtime-common.ps1
  Invoke-AegisLocalOperation -Name 'grounded-guide-build' -Action {
    Assert-AegisSingleRuntime -RequireRunning
    Push-Location apps/web
    try {
      node --test scripts/tests/grounded-guide-route.test.cjs
      if ($LASTEXITCODE) { throw 'Grounded guide proxy tests failed' }
    } finally { Pop-Location }
    cmd.exe /d /c 'docker compose --project-name ai-project-aegis build api web 2>&1'
    if ($LASTEXITCODE) { throw 'Production build failed' }
  }
  & .\scripts\start-windows.ps1 -NoBuild -LocalCopilot
  if ($LASTEXITCODE) { throw 'Guarded startup failed' }
  Invoke-AegisLocalOperation -Name 'grounded-guide-browser-http' -Action {
    Assert-AegisSingleRuntime -RequireRunning
    node scripts/browser/grounded-guide.cjs
    if ($LASTEXITCODE) { throw 'Grounded guide browser check failed' }
    node .git/browser-qa/smoke.cjs
    if ($LASTEXITCODE) { throw 'General browser smoke failed' }
    & .\services\api\.venv\Scripts\python.exe scripts/verify-local-http.py
    if ($LASTEXITCODE) { throw 'Local HTTP verification failed' }
    Assert-AegisSingleRuntime -RequireRunning
    git rev-parse HEAD
    git status --short
  }
} finally { Stop-Transcript }
