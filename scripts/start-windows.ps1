param([switch]$NoBuild, [switch]$LocalCopilot)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "start-windows.ps1" -Action {
  Assert-AegisSingleRuntime
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
  docker compose version | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose is required. Install Docker Desktop and enable WSL2." }
  # Only fixed reviewed arguments; merge Docker's progress stderr inside CMD.
  # PS 5.1 callers redirecting all streams can otherwise abort on progress.
  $startCommand = 'docker compose --project-name ai-project-aegis -f compose.yaml'
  if ($LocalCopilot) { $startCommand += ' -f compose.local-copilot.yaml' }
  $startCommand += ' up -d'
  if (-not $NoBuild) { $startCommand += ' --build' }
  cmd.exe /d /c "$startCommand 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "Compose startup failed. Run docker compose logs to inspect." }
  Assert-AegisSingleRuntime -RequireRunning
  Write-Host "AEGIS: http://localhost:3000"
  Write-Host "API docs: http://localhost:8000/docs"
  Write-Host "Logs: docker compose logs -f"
}
