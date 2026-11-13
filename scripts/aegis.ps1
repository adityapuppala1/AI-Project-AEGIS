# IndTrana one-step installer and service control for Windows (Windows PowerShell 5.1 or PowerShell 7).
# Usage: aegis.cmd [install|start|stop|status|doctor|help] [-Yes] [-Ci] [-NoBuild] [-NoSignIn] [-NoPublicEarth]
#        [-NoProactive] [-LocalCopilot] [-PublicIntake] [-StaffEmail] [-StatisticalForecast] [-ProactiveScheduler]
# It reuses the reviewed scripts (start-windows.ps1, stop-windows.ps1, prepare-local-idp.ps1, update-local-idp.ps1,
# new-demo-accounts.ps1, new-connector-key.ps1) and the shared single-operation lease. It never deletes a volume,
# never stops anything that is not this project's, never touches the exercise-* accounts and never prints a secret.
param(
  [Parameter(Position = 0)][string]$Command = 'help',
  [switch]$Yes, [switch]$Ci, [switch]$NoBuild, [switch]$NoSignIn, [switch]$NoPublicEarth, [switch]$NoProactive,
  [switch]$LocalCopilot, [switch]$PublicIntake, [switch]$StaffEmail, [switch]$StatisticalForecast, [switch]$ProactiveScheduler
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-runtime-common.ps1')
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Project = 'ai-project-aegis'
$Private = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'AEGIS'
$IdpDir = Join-Path $Private 'local-idp'
$StateFile = Join-Path $Private 'runtime-ports.env'
$DefaultWeb = 3000; $DefaultApi = 8000; $IdpPort = 8443
if ($env:CI -or $env:GITHUB_ACTIONS -or $env:TF_BUILD -or $env:GITLAB_CI -or $env:JENKINS_URL) { $Ci = $true }
if ($Ci) { $Yes = $true }
$SignIn = -not $NoSignIn
$script:Failed = $false

function Say([string]$Status, [string]$Text) {
  $line = '{0,-10} {1}' -f $Status, $Text
  if ($Ci) { Write-Host $line; return }
  $colour = switch ($Status) { 'OK' { 'Green' } 'fixed' { 'Cyan' } 'needs you' { 'Yellow' } 'FAIL' { 'Red' } default { 'Gray' } }
  Write-Host $line -ForegroundColor $colour
}
function Stop-WithMessage([string]$Text) { Say 'FAIL' $Text; throw 'AEGIS_STOP' }
function Confirm-Step([string]$Question) {
  if ($Yes) { return $true }
  $answer = Read-Host "$Question [y/N]"
  return ($answer -match '^(y|yes)$')
}
function Invoke-Reviewed([string]$ScriptName, [string[]]$Arguments = @()) {
  $shell = (Get-Process -Id $PID).Path
  & $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $ScriptName) @Arguments | Out-Host
  return $LASTEXITCODE
}
function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine'); $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
  $dockerBin = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'
  if ((Test-Path $dockerBin) -and ($env:Path -notlike "*$dockerBin*")) { $env:Path += ";$dockerBin" }
}

# ---------- 1. detection ----------
function Show-Platform {
  $arch = $env:PROCESSOR_ARCHITECTURE
  $os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
  if (-not $os) { $os = 'Windows' }
  $ciText = if ($Ci) { ', running in CI (no prompts)' } else { '' }
  Say 'OK' "Detected $os ($arch)$ciText; package manager: winget"
}

# ---------- 2. dependencies ----------
function Install-WithWinget([string]$Id, [string]$Label) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Stop-WithMessage "$Label is missing and winget is not available. Install $Label by hand, then run aegis.cmd install again."
  }
  if (-not (Confirm-Step "Install $Label with winget (Windows may ask for administrator approval)?")) {
    Stop-WithMessage "$Label is required. Install it, then run aegis.cmd install again."
  }
  & winget install --id $Id -e --accept-source-agreements --accept-package-agreements | Out-Host
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "winget could not install $Label. Install it by hand, then run aegis.cmd install again." }
  Update-SessionPath
}
function Test-DockerDaemon { & docker info --format '{{.ServerVersion}}' *> $null; return ($LASTEXITCODE -eq 0) }
function Confirm-Dependencies {
  Update-SessionPath
  if (Get-Command git -ErrorAction SilentlyContinue) { Say 'OK' 'git is installed' }
  else { Install-WithWinget 'Git.Git' 'Git'; Say 'fixed' 'git installed' }
  $fixedDocker = $false
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Install-WithWinget 'Docker.DockerDesktop' 'Docker Desktop'; $fixedDocker = $true }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Stop-WithMessage 'Docker Desktop was installed but its command is not available yet. Restart Windows, start Docker Desktop once, then run aegis.cmd install again.'
  }
  Say $(if ($fixedDocker) { 'fixed' } else { 'OK' }) 'Docker is installed'
  if (-not (Test-DockerDaemon)) {
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $desktop)) { Stop-WithMessage 'Docker is not running. Start Docker Desktop, then run this again.' }
    Say 'info' 'Docker is not running; starting Docker Desktop (waiting up to 3 minutes)'
    Start-Process -FilePath $desktop | Out-Null
    $deadline = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $deadline -and -not (Test-DockerDaemon)) { Start-Sleep -Seconds 5 }
    if (-not (Test-DockerDaemon)) {
      Stop-WithMessage 'Docker Desktop did not finish starting. Open Docker Desktop, wait until it says "Engine running" (a restart of Windows may be needed after a first install), then run this again.'
    }
    Say 'fixed' 'Docker engine started'
  } else { Say 'OK' 'Docker engine is running' }
  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Docker Compose v2 is missing. Update Docker Desktop, then run this again.' }
  Say 'OK' 'Docker Compose v2 is available'
}

# ---------- 3. local files ----------
function Confirm-EnvFile {
  $envPath = Join-Path $Root '.env'
  if (-not (Test-Path $envPath -PathType Leaf)) {
    Copy-Item (Join-Path $Root '.env.example') $envPath
    Say 'fixed' '.env created from .env.example (local-only values, never committed)'
  } else { Say 'OK' '.env exists' }
  if ($NoProactive -and -not $ProactiveScheduler) { return }
  $lines = @(Get-Content $envPath)
  $existing = @($lines | Where-Object { $_ -match '^AEGIS_CONNECTOR_KEY=.+' })
  if ($existing.Count -gt 0) { Say 'OK' 'Connector key is set in .env'; return }
  # The key is generated by the reviewed script and written straight into .env; it is never shown.
  $shell = (Get-Process -Id $PID).Path
  $key = (& $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'new-connector-key.ps1') | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or -not $key) { Stop-WithMessage 'Could not generate the connector key. Run scripts\new-connector-key.ps1 by hand and add AEGIS_CONNECTOR_KEY to .env.' }
  $kept = @($lines | Where-Object { $_ -notmatch '^AEGIS_CONNECTOR_KEY=' })
  [IO.File]::WriteAllLines($envPath, [string[]]($kept + ('AEGIS_CONNECTOR_KEY=' + $key.Trim())), (New-Object Text.UTF8Encoding($false)))
  $key = $null
  Say 'fixed' 'Connector key generated and saved to .env (not shown)'
}
function Get-ComposePrefix {
  $prefix = @('compose', '--project-name', $Project)
  if (Test-Path (Join-Path $Root '.env') -PathType Leaf) { $prefix += @('--env-file', (Join-Path $Root '.env')) }
  $prefix += @('--env-file', (Join-Path $IdpDir 'app.env'), '-f', (Join-Path $Root 'compose.yaml'), '-f', (Join-Path $Root 'compose.local-idp.yaml'), '--profile', 'local-idp')
  return $prefix
}
function Confirm-SignInFiles {
  if (-not $SignIn) { Say 'skip' 'Sign-in not requested (-NoSignIn)'; return }
  $core = @('provider.env', 'app.env', 'realm.json')
  $present = @($core | Where-Object { Test-Path (Join-Path $IdpDir $_) -PathType Leaf })
  if ($present.Count -eq 0) {
    if ((Invoke-Reviewed 'prepare-local-idp.ps1' @('-GenerateLocalSecrets')) -ne 0) { Stop-WithMessage 'Could not create the private sign-in files. Run scripts\prepare-local-idp.ps1 -GenerateLocalSecrets and read its message.' }
    Say 'fixed' 'Private sign-in files created outside the repository (not shown)'
  } elseif ($present.Count -lt $core.Count) {
    Stop-WithMessage "Some private sign-in files are missing in $IdpDir. They are never overwritten automatically; move that folder aside only if you are sure, then run install again."
  } else { Say 'OK' 'Private sign-in files exist' }
  $env:AEGIS_LOCAL_IDP_PRIVATE_DIR = $IdpDir
  $rootCrt = Join-Path $IdpDir 'root.crt'; $bundle = Join-Path $IdpDir 'api-ca-bundle.pem'
  if ((Test-Path $rootCrt) -and (Test-Path $bundle)) { Say 'OK' 'Sign-in certificate files exist'; return }
  Confirm-IdpPortFree
  Say 'info' 'Setting up the local sign-in certificate (first install only, a few minutes)'
  $compose = Get-ComposePrefix
  Invoke-AegisLocalOperation -Name 'aegis.ps1 sign-in certificate' -Action {
    Set-Location $Root
    cmd.exe /d /c ('docker ' + (($compose | ForEach-Object { '"' + $_ + '"' }) -join ' ') + ' up -d local-idp local-idp-tls 2>&1') | Out-Host
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'The identity provider did not start. Run aegis.cmd doctor.' }
    $copied = $false
    for ($i = 0; $i -lt 40 -and -not $copied; $i++) {
      & docker @compose cp 'local-idp-tls:/data/caddy/pki/authorities/local/root.crt' $rootCrt *> $null
      if ($LASTEXITCODE -eq 0 -and (Test-Path $rootCrt)) { $copied = $true } else { Start-Sleep -Seconds 3 }
    }
    if (-not $copied) { Stop-WithMessage 'The HTTPS proxy did not create its certificate within two minutes. Run aegis.cmd install again.' }
    & docker image inspect "$Project-api" *> $null
    if ($LASTEXITCODE -ne 0) {
      cmd.exe /d /c ('docker compose --project-name ' + $Project + ' -f "' + (Join-Path $Root 'compose.yaml') + '" build api 2>&1') | Out-Host
      if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'The API image did not build. Run aegis.cmd doctor.' }
    }
    $roots = @(& docker run --rm --entrypoint cat "$Project-api" /etc/ssl/certs/ca-certificates.crt)
    if ($LASTEXITCODE -ne 0 -or $roots.Count -lt 10) { Stop-WithMessage 'Could not read the API certificate list. Run aegis.cmd doctor.' }
    [IO.File]::WriteAllText($bundle, (($roots -join "`n") + "`n" + [IO.File]::ReadAllText($rootCrt)), [Text.Encoding]::ASCII)
  }
  Say 'fixed' 'Sign-in certificate copied and the API told to trust it'
  $trusted = @(Get-ChildItem Cert:\CurrentUser\Root -ErrorAction SilentlyContinue | Where-Object { $_.Subject -like '*Caddy Local Authority*' })
  if ($trusted.Count -gt 0) { Say 'OK' 'This Windows account already trusts the local sign-in certificate'; return }
  if ($Ci) { Say 'needs you' "Browsers will warn at indtrana-idp.localhost:$IdpPort until you run: Import-Certificate -FilePath `"$rootCrt`" -CertStoreLocation Cert:\CurrentUser\Root"; return }
  if (Confirm-Step 'Let this Windows account trust the local sign-in certificate (Windows shows one confirmation box)?') {
    Import-Certificate -FilePath $rootCrt -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    Say 'fixed' 'Local sign-in certificate trusted for this Windows account'
  } else { Say 'needs you' 'Certificate not trusted; the browser will warn at the sign-in page (docs/INSTALL.md step 4c)' }
}

# ---------- 4. runtime inventory and ports ----------
function Get-OwnContainers { return @(Get-AegisRuntimeContainers) }
function Test-Running { $c = Get-OwnContainers; return ((@($c | Where-Object { $_.Service -in @('api', 'web', 'db') })).Count -ge 3) }
function Read-State {
  # AEGIS_ADDED_ORIGINS lists only the sign-in origins this script itself added to the provider (http://localhost:<port>).
  $state = @{ AEGIS_WEB_PORT = $DefaultWeb; AEGIS_API_PORT = $DefaultApi; AEGIS_ADDED_ORIGINS = @() }
  if (Test-Path $StateFile) {
    foreach ($line in Get-Content $StateFile) {
      if ($line -match '^(AEGIS_WEB_PORT|AEGIS_API_PORT)=(\d{2,5})$') { $state[$Matches[1]] = [int]$Matches[2] }
      if ($line -match '^AEGIS_ADDED_ORIGINS=(.*)$') { $state.AEGIS_ADDED_ORIGINS = @($Matches[1] -split ' ' | Where-Object { $_ -match '^http://localhost:\d{2,5}$' }) }
    }
  }
  return $state
}
function Write-State([int]$Web, [int]$Api, [string[]]$Origins = $null) {
  if ($null -eq $Origins) { $Origins = @((Read-State).AEGIS_ADDED_ORIGINS) }
  [IO.Directory]::CreateDirectory($Private) | Out-Null
  [IO.File]::WriteAllLines($StateFile, [string[]]@("AEGIS_WEB_PORT=$Web", "AEGIS_API_PORT=$Api", ('AEGIS_ADDED_ORIGINS=' + (@($Origins | Sort-Object -Unique) -join ' '))), [Text.Encoding]::ASCII)
}
function Get-ListenerPids([int]$Port) {
  $pids = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)
  # Get-NetTCPConnection can return nothing in some Windows PowerShell 5.1 sessions; netstat is the fallback.
  foreach ($line in @(& netstat.exe -ano -p TCP 2>$null)) {
    # A listening socket has no remote end (0.0.0.0:0 or [::]:0); some Windows builds print its state as CLOSED.
    if ($line -match ('^\s*TCP\s+\S+:' + $Port + '\s+(0\.0\.0\.0:0|\[::\]:0)\s+\S+\s+(\d+)\s*$')) { $pids += [int]$Matches[2] }
  }
  return @($pids | Sort-Object -Unique)
}
function Test-PortFree([int]$Port) {
  if (@(Get-ListenerPids $Port).Count -gt 0) { return $false }
  try { $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port); $listener.Start(); $listener.Stop(); return $true }
  catch { return $false }
}
function Get-PortHolder([int]$Port) {
  $names = @(& docker ps --format '{{.Names}} {{.Ports}}' 2>$null | Where-Object { $_ -match (":$Port->") } | ForEach-Object { ($_ -split ' ')[0] })
  if ($names.Count -gt 0) { return "Docker container $($names -join ', ')" }
  $owners = @(Get-ListenerPids $Port)
  $labels = foreach ($owner in $owners) { $p = Get-Process -Id $owner -ErrorAction SilentlyContinue; if ($p) { "$($p.ProcessName) (PID $owner)" } else { "PID $owner" } }
  if ($labels) { return ($labels -join ', ') }
  return 'a reserved or unknown program'
}
function Get-OwnPublishedPort([string]$Service, [int]$Inside) {
  # The host port this project's own running container for that service publishes, or 0 (stack partly running).
  $lines = @(& docker ps --filter "label=com.docker.compose.project=$Project" --filter "label=com.docker.compose.service=$Service" --format '{{.Ports}}' 2>$null)
  foreach ($line in $lines) { if ($line -match (':(\d+)->' + $Inside + '/tcp')) { return [int]$Matches[1] } }
  return 0
}
function Find-FreePort([int]$Preferred, [int[]]$Avoid) {
  for ($candidate = $Preferred; $candidate -lt $Preferred + 50; $candidate++) {
    if ($Avoid -contains $candidate) { continue }
    if (Test-PortFree $candidate) { return $candidate }
  }
  Stop-WithMessage "No free port found between $Preferred and $($Preferred + 49). Close a program using one of them, then run this again."
}
function Confirm-IdpPortFree {
  if (-not $SignIn) { return }
  $idp = @(Get-OwnContainers | Where-Object { $_.Service -eq 'local-idp-tls' })
  if ($idp.Count -gt 0) { return }
  if (-not (Test-PortFree $IdpPort)) {
    Stop-WithMessage "Port $IdpPort (sign-in provider) is used by $(Get-PortHolder $IdpPort). This port is part of the sign-in address and is not moved automatically. Close that program, then run this again."
  }
}
function Resolve-Ports {
  # Prefer the standard ports whenever they are free; move only the one that is taken, and save the result.
  $web = $DefaultWeb; $api = $DefaultApi
  # A port already published by this project's own running container is kept, never moved.
  $ownWeb = Get-OwnPublishedPort 'web' 3000; $ownApi = Get-OwnPublishedPort 'api' 8000
  if ($ownWeb -gt 0) { $web = $ownWeb; Say 'OK' "Port $web is already used by this project's web container; kept" }
  elseif (-not (Test-PortFree $web)) { $holder = Get-PortHolder $web; $web = Find-FreePort ($DefaultWeb + 1) @($DefaultApi, $IdpPort); Say 'fixed' "Port $DefaultWeb is used by $holder; the web app will use $web" }
  else { Say 'OK' "Port $web (web) is free" }
  if ($ownApi -gt 0) { $api = $ownApi; Say 'OK' "Port $api is already used by this project's API container; kept" }
  elseif (-not (Test-PortFree $api)) { $holder = Get-PortHolder $api; $api = Find-FreePort ($DefaultApi + 1) @($web, $IdpPort); Say 'fixed' "Port $DefaultApi is used by $holder; the API will use $api" }
  else { Say 'OK' "Port $api (API) is free" }
  Confirm-IdpPortFree
  if ($SignIn) { Say 'OK' "Port $IdpPort (sign-in provider) is available" }
  Write-State $web $api
  return @{ AEGIS_WEB_PORT = $web; AEGIS_API_PORT = $api }
}
function Use-Ports($Ports) {
  $env:AEGIS_WEB_PORT = [string]$Ports.AEGIS_WEB_PORT; $env:AEGIS_API_PORT = [string]$Ports.AEGIS_API_PORT
  $env:APP_ORIGIN = "http://localhost:$($Ports.AEGIS_WEB_PORT)"
}

# ---------- 5. health and repair ----------
function Test-Http([string]$Url) {
  try { $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop; return ($r.StatusCode -lt 500) }
  catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 500) { return $true }; return $false }
}
function Wait-Http([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) { if (Test-Http $Url) { return $true }; Start-Sleep -Seconds 3 }
  return $false
}
function Confirm-Healthy($Ports, [switch]$Repair) {
  $checks = @(@('api', "http://localhost:$($Ports.AEGIS_API_PORT)/health"), @('web', "http://localhost:$($Ports.AEGIS_WEB_PORT)/"))
  foreach ($check in $checks) {
    if (Wait-Http $check[1] 120) { Say 'OK' "$($check[0]) answers at $($check[1])"; continue }
    if (-not $Repair) { Stop-WithMessage "$($check[0]) does not answer at $($check[1]). Run aegis.cmd doctor." }
    Say 'info' "$($check[0]) does not answer; restarting that one service once"
    Invoke-AegisLocalOperation -Name "aegis.ps1 restart $($check[0])" -Action {
      Set-Location $Root
      cmd.exe /d /c "docker compose --project-name $Project restart $($check[0]) 2>&1" | Out-Host
    }
    if (Wait-Http $check[1] 120) { Say 'fixed' "$($check[0]) restarted and answers"; continue }
    & docker compose --project-name $Project logs --tail 30 $check[0] | Out-Host
    Stop-WithMessage "$($check[0]) still does not answer after one restart. The last log lines are above; fix the cause, then run aegis.cmd start."
  }
}
function Remove-StaleContainers {
  $stale = @(& docker ps -a --filter "label=com.docker.compose.project=$Project" --filter 'status=dead' --filter 'status=created' --format '{{.ID}} {{.Names}}')
  $stale = @($stale | Where-Object { $_ })
  if ($stale.Count -eq 0) { Say 'OK' 'No broken leftover containers of this project'; return }
  foreach ($entry in $stale) {
    $id = ($entry -split ' ')[0]
    # docker rm without -v: named volumes (the database) are never removed.
    & docker rm $id *> $null
  }
  Say 'fixed' "Removed $($stale.Count) broken leftover container(s) of this project (data volumes kept)"
}
function Sync-SignInOrigins([int]$WebPort) {
  # Adds http://localhost:<web port> when the web port moved, and removes origins this script added earlier (recorded in
  # the state file) once they are no longer in use. Never removes anything it did not record. Accounts untouched.
  if (-not $SignIn) { return }
  $state = Read-State
  $origin = "http://localhost:$WebPort"
  $add = @(); if ($WebPort -ne $DefaultWeb) { $add = @($origin) }
  $drop = @($state.AEGIS_ADDED_ORIGINS | Where-Object { $_ -ne $origin })
  if ($add.Count -eq 0 -and $drop.Count -eq 0) { return }
  Invoke-AegisLocalOperation -Name 'aegis.ps1 sign-in addresses' -Action {
    $container = @(& docker ps --filter "label=com.docker.compose.project=$Project" --filter 'label=com.docker.compose.service=local-idp' --format '{{.ID}}')
    if ($container.Count -ne 1) { Stop-WithMessage 'The identity provider is not running, so the sign-in addresses could not be updated.' }
    $id = $container[0]
    # Same pattern as update-local-idp.ps1: no double quotes in the shell snippets, BOM stripped on write.
    # Residual risk (as in update-local-idp.ps1): kcadm has no stdin password option, so the provider's local bootstrap
    # password is briefly on a command line inside the provider container only.
    $login = 'K=/opt/keycloak/bin/kcadm.sh; $K config credentials --server http://localhost:8080 --realm master --user $KC_BOOTSTRAP_ADMIN_USERNAME --password $KC_BOOTSTRAP_ADMIN_PASSWORD >/dev/null 2>&1 || { echo ADMIN_LOGIN_FAILED; exit 0; }; '
    $client = 'CID=$($K get clients -r indtrana-exercise -q clientId=indtrana-local-web --fields id --format csv --noquotes | head -1); '
    $raw = @(& docker exec $id sh -c ($login + $client + '$K get clients/$CID -r indtrana-exercise --fields redirectUris,webOrigins,attributes'))
    if ($LASTEXITCODE -ne 0 -or $raw -contains 'ADMIN_LOGIN_FAILED') { Stop-WithMessage 'The identity provider refused its local administrator; sign-in addresses were not changed.' }
    $current = ($raw -join "`n") | ConvertFrom-Json
    $redirects = @($current.redirectUris | Where-Object { $_ }); $origins = @($current.webOrigins | Where-Object { $_ })
    $logout = @(([string]$current.attributes.'post.logout.redirect.uris') -split '##' | Where-Object { $_ })
    $before = ($redirects + $origins + $logout) -join '|'
    foreach ($old in $drop) {
      $redirects = @($redirects | Where-Object { $_ -ne "$old/api/auth/callback" })
      $origins = @($origins | Where-Object { $_ -ne $old }); $logout = @($logout | Where-Object { $_ -ne $old })
    }
    foreach ($new in $add) {
      if ($redirects -notcontains "$new/api/auth/callback") { $redirects += "$new/api/auth/callback" }
      if ($origins -notcontains $new) { $origins += $new }
      if ($logout -notcontains $new) { $logout += $new }
    }
    if ((($redirects + $origins + $logout) -join '|') -ne $before) {
      $update = [PSCustomObject]@{ redirectUris = [string[]]$redirects; webOrigins = [string[]]$origins; attributes = [PSCustomObject]@{ 'post.logout.redirect.uris' = ($logout -join '##') } }
      ($update | ConvertTo-Json -Depth 5 -Compress) | & docker exec -i $id sh -c ($login + $client + 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-client.json; $K update clients/$CID -r indtrana-exercise -f /tmp/aegis-client.json >/dev/null; code=$?; rm -f /tmp/aegis-client.json; exit $code') | Out-Null
      if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Could not update the sign-in addresses in the provider.' }
    }
    $saved = Read-State
    Write-State $saved.AEGIS_WEB_PORT $saved.AEGIS_API_PORT ([string[]]$add)
    foreach ($new in $add) { Say 'fixed' "Sign-in also accepts $new (callback, origin and sign-out address)" }
    foreach ($old in $drop) { Say 'fixed' "Removed the earlier extra sign-in address $old (added by this script)" }
  }
}

# ---------- 6. commands ----------
function Get-StartArguments {
  $arguments = @()
  if ($NoBuild) { $arguments += '-NoBuild' }
  if ($SignIn) { $arguments += '-SignIn' }
  if (-not $NoPublicEarth) { $arguments += '-PublicEarth' }
  if (-not $NoProactive) { $arguments += '-Proactive' }
  foreach ($pair in @(@($LocalCopilot, '-LocalCopilot'), @($PublicIntake, '-PublicIntake'), @($StaffEmail, '-StaffEmail'), @($StatisticalForecast, '-StatisticalForecast'), @($ProactiveScheduler, '-ProactiveScheduler'))) {
    if ($pair[0]) { $arguments += $pair[1] }
  }
  return $arguments
}
function Confirm-IdpAddress {
  # An install made before the rename still uses aegis-idp.localhost / aegis-exercise. Moving it stops the provider
  # for a backup and signs everyone out, so it is asked once; -Ci never moves it. After a failed attempt or a rollback
  # the hold marker (local-idp\address-migration.hold, a separate file because Write-State rewrites the ports file)
  # stops further automatic attempts until the owner runs the migration script explicitly.
  if (-not $SignIn) { return }
  $realmFile = Join-Path $IdpDir 'realm.json'
  if (-not (Test-Path $realmFile)) { return }
  if (-not (Select-String -Path $realmFile -Pattern '"realm"\s*:\s*"aegis-exercise"' -Quiet)) {
    Say 'OK' 'Sign-in provider already on the IndTrana address (indtrana-idp.localhost); nothing to move'; return
  }
  $hold = Join-Path $IdpDir 'address-migration.hold'
  $instruction = 'Run: powershell -ExecutionPolicy Bypass -File .\scripts\migrate-local-idp-address.ps1 (see docs\LOCAL_IDP_ADDRESS.md)'
  if (Test-Path $hold) { Say 'needs you' "The sign-in provider still uses the old address and automatic moving is on hold. $instruction"; return }
  if ($Ci) { Say 'needs you' "The sign-in provider still uses the old address (sign-in will not work until it is moved). $instruction"; return }
  if (-not (Confirm-Step 'Move the sign-in provider to the IndTrana address now? (backup first, accounts kept, everyone signs in again)')) {
    Say 'needs you' "Sign-in provider not moved; sign-in will not work until it is. $instruction"; return
  }
  Say 'info' 'Moving the sign-in provider to the IndTrana address (backup first; accounts are kept)'
  if ((Invoke-Reviewed 'migrate-local-idp-address.ps1') -ne 0) {
    [IO.File]::WriteAllText($hold, ('automatic attempt failed ' + (Get-Date -Format 's') + "`n"), [Text.Encoding]::ASCII)
    Stop-WithMessage "Moving the sign-in provider failed and was rolled back; automatic attempts are now on hold. Read the message above. $instruction"
  }
  Say 'fixed' 'Sign-in provider moved to indtrana-idp.localhost; everyone signs in again'
}
function Start-Stack {
  if (Test-Running) {
    $ports = Read-State; Use-Ports $ports
    Say 'OK' 'IndTrana is already running (one copy only; nothing new started)'
    Confirm-Healthy $ports -Repair
    Confirm-IdpAddress
    return $ports
  }
  Remove-StaleContainers
  $ports = Resolve-Ports; Use-Ports $ports
  Assert-AegisSingleRuntimeQuiet
  $arguments = @(Get-StartArguments | Where-Object { $_ -ne '-NoBuild' }) + '-NoBuild'
  if (-not $NoBuild) {
    # Build separately so that only a build failure leads to the one rebuild without cache.
    $buildFiles = '-f compose.yaml'
    if ($StatisticalForecast) {
      if (-not $env:AEGIS_TIMESFM_CACHE) { $env:AEGIS_TIMESFM_CACHE = Join-Path $env:USERPROFILE '.cache\huggingface' }
      $buildFiles += ' -f compose.timesfm.yaml'
    }
    Say 'info' 'Building the images (the first build takes several minutes)'
    Invoke-AegisLocalOperation -Name 'aegis.ps1 build' -Action {
      Set-Location $Root
      cmd.exe /d /c "docker compose --project-name $Project $buildFiles build 2>&1" | Out-Host
      if ($LASTEXITCODE -ne 0) {
        Say 'info' 'The build failed; building once more without the build cache'
        cmd.exe /d /c "docker compose --project-name $Project $buildFiles build --no-cache 2>&1" | Out-Host
        if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'The images still do not build. Read the build output above, fix the cause, then run aegis.cmd start.' }
        Say 'fixed' 'Images built without the cache'
      }
    }
  }
  Say 'info' ('Starting IndTrana with ' + ($arguments -join ' '))
  if ((Invoke-Reviewed 'start-windows.ps1' $arguments) -ne 0) { Stop-WithMessage 'Start failed. Run aegis.cmd doctor, then aegis.cmd start.' }
  Confirm-Healthy $ports -Repair
  Confirm-IdpAddress
  Sync-SignInOrigins $ports.AEGIS_WEB_PORT
  return $ports
}
function Invoke-Install {
  $ports = Start-Stack
  if ($SignIn) {
    if ((Invoke-Reviewed 'update-local-idp.ps1') -ne 0) { Stop-WithMessage 'Updating the sign-in provider failed. Run scripts\update-local-idp.ps1 and read its message.' }
    Say 'OK' 'Sign-in provider settings are up to date'
    if ((Invoke-Reviewed 'new-demo-accounts.ps1') -ne 0) { Stop-WithMessage 'Creating the demo accounts failed. Run scripts\new-demo-accounts.ps1 and read its message.' }
    Say 'OK' "Demo accounts ready; passwords are in $IdpDir\demo-credentials.txt (never printed)"
  }
  return $ports
}
function Invoke-Stop {
  if (-not (Test-Running) -and @(Get-OwnContainers).Count -eq 0) { Say 'OK' 'IndTrana is already stopped'; return }
  if ((Invoke-Reviewed 'stop-windows.ps1') -ne 0) { Stop-WithMessage 'Stop failed. Run aegis.cmd doctor.' }
  Say 'OK' 'IndTrana stopped; containers and the database volume are kept'
}
function Invoke-Status {
  $ports = Read-State
  $containers = @(Get-OwnContainers)
  foreach ($item in $containers) { Say 'info' "running: $($item.Service) ($($item.Name))" }
  if (-not (Test-Running)) { Say 'info' 'IndTrana is not running. Start it with: aegis.cmd start'; return $false }
  $ok = $true
  foreach ($check in @(@('API', "http://localhost:$($ports.AEGIS_API_PORT)/health"), @('Web', "http://localhost:$($ports.AEGIS_WEB_PORT)/"))) {
    if (Test-Http $check[1]) { Say 'OK' "$($check[0]) answers at $($check[1])" } else { Say 'needs you' "$($check[0]) does not answer at $($check[1]); run aegis.cmd doctor"; $ok = $false }
  }
  return $ok
}
function Invoke-Doctor {
  Remove-StaleContainers
  Assert-AegisSingleRuntimeQuiet
  if (Test-Running) {
    $ports = Read-State; Use-Ports $ports
    Confirm-Healthy $ports -Repair
    Confirm-IdpAddress
    Sync-SignInOrigins $ports.AEGIS_WEB_PORT
  } else {
    Say 'info' 'IndTrana is stopped; checking the ports it would use'
    $null = Resolve-Ports
  }
}
function Assert-AegisSingleRuntimeQuiet {
  $state = Read-State; Use-Ports $state
  try { Invoke-AegisLocalOperation -Name 'aegis.ps1 inventory' -Action { Assert-AegisSingleRuntime | Out-Null } }
  catch { if ($_.Exception.Message -eq 'AEGIS_STOP') { throw }; Stop-WithMessage $_.Exception.Message }
  Say 'OK' 'Exactly one IndTrana copy (or none) and no competing IndTrana job'
}
function Assert-OwnContainers {
  # Before any sign-in bootstrap: refuse containers started by another checkout, another system or a one-off job.
  try { Assert-AegisProjectOwnership -Root $Root; Test-AegisRuntimeInventory -Containers @(Get-OwnContainers) -Root $Root }
  catch { Stop-WithMessage $_.Exception.Message }
}
function Show-Help {
  Write-Host @'
IndTrana one-step control (Windows)
  aegis.cmd install   first-time setup: dependencies, local files, sign-in, start, demo accounts
  aegis.cmd start     start IndTrana (does nothing if it is already running)
  aegis.cmd stop      stop IndTrana (data is kept)
  aegis.cmd status    show whether IndTrana is running and answering (exit 0 running, 3 stopped or not answering)
  aegis.cmd doctor    find and fix common problems without deleting data
Options: -Yes (no questions) -Ci (no questions, no colour) -NoBuild -NoSignIn -NoPublicEarth -NoProactive
         -LocalCopilot -PublicIntake -StaffEmail -StatisticalForecast -ProactiveScheduler
Ports: 3000 web, 8000 API, 8443 sign-in. If 3000 or 8000 is taken by another program, the next free port is used
and saved in %LOCALAPPDATA%\AEGIS\runtime-ports.env. Port 8443 is never moved. See docs\DEPLOYMENT.md.
'@
}

# ---------- main ----------
$exitCode = 0
$installerLease = $null
try {
  $Command = $Command.ToLowerInvariant().TrimStart('-')
  if ($Command -in @('help', 'h', '?')) { Show-Help; exit 0 }
  if ($Command -notin @('install', 'start', 'stop', 'status', 'doctor')) { Show-Help; exit 2 }
  if ($env:OS -ne 'Windows_NT') { Stop-WithMessage 'This script is for Windows. On macOS or Linux run ./aegis.sh instead.' }
  [IO.Directory]::CreateDirectory($Private) | Out-Null
  try { $installerLease = [IO.File]::Open((Join-Path $Private 'aegis-control.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
  catch [IO.IOException] { Stop-WithMessage 'Another aegis.cmd is already running. Wait for it to finish.' }
  Set-Location $Root
  Show-Platform
  switch ($Command) {
    'status' {
      if (-not (Get-Command docker -ErrorAction SilentlyContinue) -or -not (Test-DockerDaemon)) { Say 'info' 'Docker is not running, so IndTrana is not running.'; $exitCode = 3; break }
      if (-not (Invoke-Status)) { $exitCode = 3 }
    }
    'stop' { Confirm-Dependencies; Assert-OwnContainers; Invoke-Stop }
    'doctor' { Confirm-Dependencies; Assert-OwnContainers; Confirm-EnvFile; Confirm-SignInFiles; Invoke-Doctor; Say 'OK' 'Doctor finished' }
    default {
      Confirm-Dependencies; Assert-OwnContainers; Confirm-EnvFile; Confirm-SignInFiles
      if ($Command -eq 'install') { $ports = Invoke-Install } else { $ports = Start-Stack }
      Say 'OK' "IndTrana is running: http://localhost:$($ports.AEGIS_WEB_PORT)"
    }
  }
} catch {
  if ($_.Exception.Message -ne 'AEGIS_STOP') { Say 'FAIL' $_.Exception.Message }
  $exitCode = 1
} finally {
  if ($null -ne $installerLease) { $installerLease.Dispose() }
}
exit $exitCode
