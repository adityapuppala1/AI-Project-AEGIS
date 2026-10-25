$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose is required. Install Docker Desktop and enable WSL2." }
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { throw "Compose startup failed. Run docker compose logs to inspect." }
Write-Host "AEGIS: http://localhost:3000"
Write-Host "API docs: http://localhost:8000/docs"
Write-Host "Logs: docker compose logs -f"
