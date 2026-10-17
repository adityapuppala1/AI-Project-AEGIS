$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "stop-windows.ps1" -Action {
  Assert-AegisSingleRuntime
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
  cmd.exe /d /c 'docker compose --project-name ai-project-aegis stop 2>&1'
  if ($LASTEXITCODE -ne 0) { throw "Compose stop failed." }
  Write-Host "AEGIS stopped. Containers and database volume retained."
}
