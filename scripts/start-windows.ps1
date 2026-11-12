param([switch]$NoBuild, [switch]$LocalCopilot, [switch]$PublicEarth, [switch]$PublicIntake, [switch]$Proactive, [switch]$ProactiveScheduler, [switch]$StatisticalForecast, [switch]$StaffEmail, [switch]$SignIn)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "start-windows.ps1" -Action {
  Assert-AegisSingleRuntime
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
  docker compose version | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose is required. Install Docker Desktop and enable WSL2." }
  # Only fixed reviewed arguments; merge Docker's progress stderr inside CMD.
  # PS 5.1 callers redirecting all streams can otherwise abort on progress.
  $startCommand = 'docker compose --project-name ai-project-aegis'
  if ($SignIn) {
    # Local sign-in (Keycloak + TLS proxy). Needs the one-time setup in docs/INSTALL.md step 4.
    $idpPrivate = Join-Path $env:LOCALAPPDATA 'AEGIS\local-idp'
    foreach ($needed in @('provider.env', 'app.env', 'realm.json', 'root.crt', 'api-ca-bundle.pem')) {
      if (-not (Test-Path (Join-Path $idpPrivate $needed) -PathType Leaf)) { throw "Sign-in is not set up yet ($needed is missing). Follow docs/INSTALL.md step 4 first." }
    }
    if ($idpPrivate -match '["&|<>^%]') { throw 'The private sign-in folder path contains characters this script will not pass to cmd.exe.' }
    $env:AEGIS_LOCAL_IDP_PRIVATE_DIR = $idpPrivate
    # Naming an env file switches off the automatic .env, so pass it explicitly when it exists.
    if (Test-Path '.env' -PathType Leaf) { $startCommand += ' --env-file .env' }
    $startCommand += ' --env-file "' + (Join-Path $idpPrivate 'app.env') + '" --profile local-idp'
  }
  $startCommand += ' -f compose.yaml'
  if ($SignIn) { $startCommand += ' -f compose.local-idp.yaml' }
  if ($LocalCopilot) { $startCommand += ' -f compose.local-copilot.yaml' }
  # Display-only public USGS/NASA reference feeds; never stored or used by workflows.
  if ($PublicEarth) { $startCommand += ' -f compose.public-earth.yaml' }
  # Opt-in quarantine-only public report intake (no contact details, never creates cases).
  if ($PublicIntake) { $startCommand += ' -f compose.public-intake.yaml' }
  # Opt-in proactive multi-hazard watch (exercise only; no send path). Requires AEGIS_CONNECTOR_KEY.
  if ($Proactive -or $ProactiveScheduler) { $startCommand += ' -f compose.proactive.yaml' }
  # Opt-in staff email notices (fixed templates to opted-in staff only). The key lives in the connector vault.
  if ($StaffEmail) {
    if (-not ($Proactive -or $ProactiveScheduler)) { throw '-StaffEmail needs -Proactive: the email key is kept in the connector vault.' }
    $startCommand += ' -f compose.staff-email.yaml'
  }
  # Optional TimesFM statistical forecast (display-only). Needs AEGIS_TIMESFM_CACHE; see docs/STATISTICAL_FORECAST.md.
  if ($StatisticalForecast) {
    if (-not $env:AEGIS_TIMESFM_CACHE) { $env:AEGIS_TIMESFM_CACHE = Join-Path $env:USERPROFILE '.cache\huggingface' }
    $startCommand += ' -f compose.timesfm.yaml'
  }
  # Opt-in L3 scheduled watch loop (prepare and route only). Requires AEGIS_PROACTIVE_SCHEDULER_AGENCY_ID.
  if ($ProactiveScheduler) { $startCommand += ' -f compose.proactive-scheduler.yaml' }
  $startCommand += ' up -d'
  if (-not $NoBuild) { $startCommand += ' --build' }
  cmd.exe /d /c "$startCommand 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "Compose startup failed. Run docker compose logs to inspect." }
  Assert-AegisSingleRuntime -RequireRunning
  Write-Host "AEGIS: http://localhost:3000"
  if ($SignIn) { Write-Host "Sign in at http://localhost:3000/sign-in (demo accounts: scripts\new-demo-accounts.ps1)" }
  else { Write-Host "Started without sign-in: only the landing page opens. Use -SignIn after docs/INSTALL.md step 4." }
  Write-Host "Logs: docker compose logs -f"
}
