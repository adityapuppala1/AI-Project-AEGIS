# IndTrana: budget-first local checks, using existing developer Python/npm installs.
# Run from repository root: powershell -ExecutionPolicy Bypass -File .\scripts\verify-code-local.ps1 -Suite api
# No GitHub Actions minutes or external infrastructure. No DB reset, CI dispatch, or real emergency actions.
param(
  [ValidateSet("api", "web", "all")]
  [string]$Suite = "api",
  [switch]$ProductionBuild,
  [string]$PythonExecutable = ""
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "verify-code-local.ps1" -Action {
  if (Get-Command docker -ErrorAction SilentlyContinue) { Assert-AegisSingleRuntime }
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
  Write-Host "IndTrana local-only CI replacement; selected suite: $Suite" -ForegroundColor Cyan

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
    if (-not $PythonExecutable) {
      $repoPython = Join-Path (Get-Location) "services/api/.venv/Scripts/python.exe"
      $PythonExecutable = if (Test-Path $repoPython) { $repoPython } else { "python" }
    }
    Require-Command $PythonExecutable
    Push-Location "services/api"
    try {
      & $PythonExecutable -m pytest -q
      Check-Exit "Python API tests"
      & $PythonExecutable -m app.model_lab --check
      Check-Exit "Reproducible synthetic model report"
    } finally {
      Pop-Location
    }
  }
  if ($Suite -eq "web" -or $Suite -eq "all") {
    $npmCommand = if (Get-Command "npm.cmd" -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
    Require-Command $npmCommand
    Push-Location "apps/web"
    try {
      if (-not (Test-Path "node_modules")) {
        throw "Frontend node_modules missing. Run 'npm ci --no-audit --no-fund' inside apps/web once."
      }
      & $npmCommand run typecheck
      Check-Exit "Frontend typecheck"
      if ($ProductionBuild) {
        & $npmCommand run build
        Check-Exit "Next.js production build"
      } else {
        Write-Host "SKIP: Next.js production build. Pass -ProductionBuild to enable." -ForegroundColor Yellow
      }
    } finally {
      Pop-Location
    }
  }
  Write-Host "Completed local checks; no GitHub Actions workflow triggered." -ForegroundColor Green
}
