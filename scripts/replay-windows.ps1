param([Guid]$IncidentId = [Guid]::Empty)
# Local, synthetic exercise replay. Requires no credentials or live connections.
# Run from your own Windows PowerShell session with Docker Desktop already up.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "replay-windows.ps1" -Action {
  Assert-AegisSingleRuntime
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
  Write-Host "AEGIS SYNTHETIC ONLY: replaying the bundled, reviewed fixture."
  Write-Host "No real warnings, dispatch, external APIs or production sensors are involved."
  if ($IncidentId -eq [Guid]::Empty) {
    docker compose exec -T api python -m app.replay
  } else {
    docker compose exec -T api python -m app.replay --incident-id ($IncidentId.ToString())
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Exercise replay failed. Inspect: docker compose logs --tail=100 api db"
  }
  Write-Host "Synthetic ingestion summary:"
  Invoke-RestMethod -Uri "http://localhost:8000/v1/exercise/ingestion/status" -Method Get -TimeoutSec 10 |
    ConvertTo-Json -Depth 5
  Write-Host "Explore: http://localhost:3000/ingestion"
}
