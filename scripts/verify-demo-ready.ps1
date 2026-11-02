# Read-only demo-day preflight: is the local stack ready, which opt-in profiles are on, and which online
# features will work from this network? Starts, stops and writes nothing. Run:
#   powershell -ExecutionPolicy Bypass -File .\scripts\verify-demo-ready.ps1 [-Browser]
# Verdicts: GO, GO-WITH-DEGRADED-ONLINE (works; some live public features will fall back), NO-GO.
param([switch]$Browser)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "verify-demo-ready.ps1" -Action {
  Assert-AegisSingleRuntime -RequireRunning
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
  $state = @{ fail = @(); warn = @() }
  function Pass([string]$Message) { Write-Host "PASS: $Message" -ForegroundColor Green }
  function Fail([string]$Message) { $state.fail += $Message; Write-Host "FAIL: $Message" -ForegroundColor Red }
  function Warn([string]$Message) { $state.warn += $Message; Write-Host "WARN: $Message" -ForegroundColor Yellow }
  function Get-Code([string]$Url, [string]$Method = "GET") {
    try { return [int](Invoke-WebRequest -UseBasicParsing -Uri $Url -Method $Method -TimeoutSec 15 -MaximumRedirection 0).StatusCode }
    catch { if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode } else { return 0 } }
  }
  function Get-Json([string]$Url) { try { return Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 15 } catch { return $null } }
  function Curl-Code([string[]]$CurlArguments) {
    $code = (& curl.exe -sS --connect-timeout 6 --max-time 12 -o NUL -w "%{http_code}" @CurlArguments 2>$null)
    if ($LASTEXITCODE -ne 0) { return "0" } else { return "$code".Trim() }
  }

  Write-Host "AEGIS DEMO-READINESS PREFLIGHT (read-only)" -ForegroundColor Cyan
  $branch = (git rev-parse --abbrev-ref HEAD).Trim(); $sha = (git rev-parse --short HEAD).Trim()
  $dirty = @(git status --short | Where-Object { $_ -notmatch '^\?\? (\.vscode|graphify-out)/' }).Count
  Write-Host "Source: $branch @ $sha; uncommitted changes: $dirty"
  if ($dirty -gt 0) { Warn "working tree has $dirty uncommitted change(s); the demo should run from a committed state" }

  # 1. Core stack
  $health = Get-Json "http://localhost:8000/health"
  if ($health -and $health.status -eq "ok" -and $health.mode -eq "exercise") { Pass "Exercise API healthy" } else { Fail "Exercise API not healthy" }
  $ready = Get-Json "http://localhost:8000/v1/exercise/system/readiness"
  if ($ready -and $ready.status -eq "ready" -and $ready.mode -eq "synthetic_exercise") { Pass "Schema and fixture preflight ready" } else { Fail "Readiness preflight not ready" }
  foreach ($page in @("/", "/demo", "/incidents", "/sources", "/approvals", "/department-tasks", "/audit", "/earth-watch", "/response-teams", "/help")) {
    $code = Get-Code "http://localhost:3000$page"
    if ($code -eq 200) { Pass "Page $page [200]" } else { Fail "Page $page returned $code" }
  }
  if ((Get-Code "http://localhost:8000/v1/live/public-warning" "POST") -eq 403) { Pass "Live public warning blocked [403]" } else { Fail "Live public warning is not blocked" }

  # 2. Which opt-in profiles are running
  $earth = Get-Json "http://localhost:3000/api/earth-watch/status"
  $intake = Get-Json "http://localhost:3000/api/public-intake/status"
  $earthOn = [bool]($earth -and $earth.enabled); $intakeOn = [bool]($intake -and $intake.enabled)
  if ($earthOn) { Write-Host "INFO: Earth Watch (public feeds) is ON" } else { Write-Host "INFO: Earth Watch is OFF (default synthetic profile)" }
  if ($intakeOn) { Warn "Public intake is ON. Decision D4: do not show it to an audience unless asked; restart without -PublicIntake" } else { Pass "Public intake is OFF" }

  # 3. Online reachability from this network (decides whether live public features can work)
  $online = @{}
  $online["USGS earthquake feed"] = Curl-Code @("-I", "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson")
  $online["NASA GIBS capabilities"] = Curl-Code @("-I", "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml")
  $online["NASA EONET events"] = Curl-Code @("-I", "https://eonet.gsfc.nasa.gov/api/v3/events?limit=1")
  $online["OpenStreetMap tile"] = Curl-Code @("-A", "AEGIS-preflight/1.0 (local demo check; non-commercial)", "-e", "http://localhost:3000/", "https://tile.openstreetmap.org/0/0/0.png")
  $degraded = $false
  foreach ($name in $online.Keys) {
    if ($online[$name] -match '^(200|301|302|304)$') { Write-Host "INFO: $name reachable [$($online[$name])]" }
    else { $degraded = $true; Warn "$name not reachable from this network [$($online[$name])]" }
  }
  if ($degraded) { Write-Host "INFO: unreachable services fall back to markers, lists and labelled stale or unavailable states; do not pre-cache OSM tiles (policy forbids offline use)" }
  if ($earthOn -and $degraded) { Warn "Earth Watch is on but some upstreams are unreachable; consider restarting without -PublicEarth for a clean synthetic demo" }

  # 4. Machine readiness
  $freeGb = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
  if ($freeGb -ge 5) { Pass "Free disk space ${freeGb} GB" } else { Fail "Only ${freeGb} GB free on C:" }
  $battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
  if ($battery) { Write-Host "INFO: battery $($battery.EstimatedChargeRemaining)%; keep the laptop on mains power for the demo" }

  # 5. Optional browser gates (about a minute): smoke with axe, then offline-map fallback
  if ($Browser) {
    node .git/browser-qa/smoke.cjs *> $null
    if ($LASTEXITCODE -eq 0) { Pass "Browser smoke with axe" } else { Fail "Browser smoke failed" }
    node .git/browser-qa/offline-map.cjs *> $null
    if ($LASTEXITCODE -eq 0) { Pass "Offline-map fallback behaviour" } else { Fail "Offline-map fallback check failed" }
  } else { Write-Host "INFO: browser gates skipped (add -Browser to run them)" }

  # Verdict
  if ($state.fail.Count -gt 0) { Write-Host "VERDICT: NO-GO ($($state.fail.Count) failure(s))" -ForegroundColor Red; exit 1 }
  if ($state.warn.Count -gt 0) {
    $label = if ($degraded) { "GO-WITH-DEGRADED-ONLINE" } else { "GO (with warnings)" }
    Write-Host "VERDICT: $label ($($state.warn.Count) warning(s))" -ForegroundColor Yellow
  } else { Write-Host "VERDICT: GO" -ForegroundColor Green }
}
