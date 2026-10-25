$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
docker compose down
Write-Host "AEGIS stopped. Database volume retained."
