param([switch]$NoBuild, [switch]$LocalCopilot)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "start-windows.ps1" -Action {
  Assert-AegisSingleRuntime
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
  docker compose version | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose is required. Install Docker Desktop and enable WSL2." }
  $composeArguments = @('compose', '-f', 'compose.yaml')
  if ($LocalCopilot) { $composeArguments += @('-f', 'compose.local-copilot.yaml') }
  $composeArguments += @('up', '-d')
  if (-not $NoBuild) { $composeArguments += '--build' }
  & docker @composeArguments
  if ($LASTEXITCODE -ne 0) { throw "Compose startup failed. Run docker compose logs to inspect." }
  Assert-AegisSingleRuntime -RequireRunning
  Write-Host "AEGIS: http://localhost:3000"
  Write-Host "API docs: http://localhost:8000/docs"
  Write-Host "Logs: docker compose logs -f"
}
