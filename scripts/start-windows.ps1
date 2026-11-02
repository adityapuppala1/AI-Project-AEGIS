param([switch]$NoBuild, [switch]$LocalCopilot, [switch]$PublicEarth, [switch]$PublicIntake, [switch]$Proactive)
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
  # Display-only public USGS/NASA reference feeds; never stored or used by workflows.
  if ($PublicEarth) { $startCommand += ' -f compose.public-earth.yaml' }
  # Opt-in quarantine-only public report intake (no contact details, never creates cases).
  if ($PublicIntake) { $startCommand += ' -f compose.public-intake.yaml' }
  # Opt-in proactive multi-hazard watch (exercise only; no send path). Requires AEGIS_CONNECTOR_KEY.
  if ($Proactive) { $startCommand += ' -f compose.proactive.yaml' }
  $startCommand += ' up -d'
  if (-not $NoBuild) { $startCommand += ' --build' }
  cmd.exe /d /c "$startCommand 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "Compose startup failed. Run docker compose logs to inspect." }
  Assert-AegisSingleRuntime -RequireRunning
  Write-Host "AEGIS: http://localhost:3000"
  Write-Host "API docs: http://localhost:8000/docs"
  Write-Host "Logs: docker compose logs -f"
}
