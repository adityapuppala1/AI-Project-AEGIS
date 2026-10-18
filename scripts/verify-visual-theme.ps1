$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
Start-Transcript -Path .git/visual-theme-verification.log -Force
try {
  . .\scripts\local-runtime-common.ps1
  Invoke-AegisLocalOperation -Name 'visual-theme-build' -Action {
    Assert-AegisSingleRuntime -RequireRunning
    Push-Location apps/web
    try {
      node --test scripts/tests/theme-system.test.cjs
      if ($LASTEXITCODE) { throw 'Theme contract tests failed' }
      npm.cmd run typecheck
      if ($LASTEXITCODE) { throw 'TypeScript check failed' }
    } finally { Pop-Location }
    cmd.exe /d /c 'docker compose --project-name ai-project-aegis build web 2>&1'
    if ($LASTEXITCODE) { throw 'Production web build failed' }
  }
  & .\scripts\start-windows.ps1 -NoBuild -LocalCopilot
  if ($LASTEXITCODE) { throw 'Guarded startup failed' }
  Invoke-AegisLocalOperation -Name 'visual-theme-browser-http' -Action {
    Assert-AegisSingleRuntime -RequireRunning
    node scripts/browser/theme-system.cjs
    if ($LASTEXITCODE) { throw 'Theme browser check failed' }
    node .git/browser-qa/smoke.cjs
    if ($LASTEXITCODE) { throw 'General browser smoke failed' }
    & .\services\api\.venv\Scripts\python.exe scripts/verify-local-http.py
    if ($LASTEXITCODE) { throw 'Local HTTP verification failed' }
    Assert-AegisSingleRuntime -RequireRunning
    git rev-parse HEAD
    git status --short
  }
} finally { Stop-Transcript }
