# AEGIS: budget-first local checks, using existing developer Python/npm installs.
# Run from repository root: powershell -ExecutionPolicy Bypass -File .\scripts\verify-code-local.ps1 -Suite api
# No GitHub Actions minutes or external infrastructure. No DB reset, CI dispatch, or real emergency actions.
param(
  [ValidateSet("api", "web", "all")]
  [string]$Suite = "api",
  [switch]$ProductionBuild
)
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
Write-Host "AEGIS local-only CI replacement; selected suite: $Suite" -ForegroundColor Cyan

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command '$Name'. Install it locally before running this suite."
  }
}
function Check-Exit([string]$Operation) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Operation failed (exit code $LASTEXITCODE)."
  }
}
if (Get-Command docker -ErrorAction SilentlyContinue) {
  & docker compose config --quiet
  Check-Exit "Docker Compose configuration"
} else {
  Write-Host "SKIP: Docker CLI absent; Compose config not validated." -ForegroundColor Yellow
}
if ($Suite -eq "api" -or $Suite -eq "all") {
  Require-Command "python"
  Push-Location "services/api"
  try {
    & python -m pytest -q
    Check-Exit "Python API tests"
    & python -m app.model_lab --check
    Check-Exit "Reproducible synthetic model report"
  } finally {
    Pop-Location
  }
}
if ($Suite -eq "web" -or $Suite -eq "all") {
  Require-Command "npm"
  Push-Location "apps/web"
  try {
    if (-not (Test-Path "node_modules")) {
      throw "Frontend node_modules missing. Run 'npm ci --no-audit --no-fund' inside apps/web once."
    }
    & npm run typecheck
    Check-Exit "Frontend typecheck"
    if ($ProductionBuild) {
      & npm run build
      Check-Exit "Next.js production build"
    } else {
      Write-Host "SKIP: Next.js production build. Pass -ProductionBuild to enable." -ForegroundColor Yellow
    }
  } finally {
    Pop-Location
  }
}
Write-Host "Completed local checks; no GitHub Actions workflow triggered." -ForegroundColor Green
