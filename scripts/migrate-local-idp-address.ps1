# Moves an existing LOCAL exercise identity provider from the old sign-in address to the IndTrana one:
#   https://aegis-idp.localhost:8443/realms/aegis-exercise  ->  https://indtrana-idp.localhost:8443/realms/indtrana-exercise
#   web client aegis-local-web                             ->  indtrana-local-web
# The realm and client are renamed in place with the provider's admin tool, so every account, its id, password,
# roles and attributes stay exactly as they are. Nothing is deleted and no volume is removed or recreated.
# Before any change it backs up the provider data volume (provider stopped, so the copy is consistent), the HTTPS
# proxy volume (its local certificate authority) and the five private files, and verifies the archives: tar must read
# them, the provider's database file (h2/keycloakdb.mv.db) and the proxy's root certificate must be in them, and the
# entry count must equal the number of files in the source. Backups hold password hashes, the bootstrap admin
# password and the local CA private key: the folder is restricted to the current Windows user (docs/LOCAL_IDP_ADDRESS.md).
# The certificate authority is reused: the HTTPS proxy issues the new host's certificate from the same local root.
# Safe to run again: an install already on the new address reports "already migrated" and changes nothing.
# Existing sign-in sessions end (the token issuer changes); people sign in again.
#   Migrate:   powershell -ExecutionPolicy Bypass -File .\scripts\migrate-local-idp-address.ps1
#   Roll back: powershell -ExecutionPolicy Bypass -File .\scripts\migrate-local-idp-address.ps1 -Rollback -Backup <folder>
#              (without -Backup it shows the newest backup and asks you to type its time stamp). A safety backup of the
#              current state is taken first, and a hold marker stops aegis.cmd from migrating again automatically.
# It never prints a secret and never creates, changes or deletes an account.
param([switch]$Rollback, [string]$Backup)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-runtime-common.ps1')

$OldRealm = 'aegis-exercise'; $NewRealm = 'indtrana-exercise'
$OldClient = 'aegis-local-web'; $NewClient = 'indtrana-local-web'
$IdpDir = Join-Path $env:LOCALAPPDATA 'AEGIS\local-idp'
$BackupRoot = Join-Path $env:LOCALAPPDATA 'AEGIS\local-idp-backups'
$HoldMarker = Join-Path $IdpDir 'address-migration.hold'
$PrivateFiles = @('provider.env', 'app.env', 'realm.json', 'root.crt', 'api-ca-bundle.pem')
$ProviderStore = './h2/keycloakdb.mv.db'
$ProxyStore = './caddy/pki/authorities/local/root.crt'
$MaxAccounts = 999
$Repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$ToolImage = ((Get-Content (Join-Path $Repo 'compose.local-idp.yaml')) | Where-Object { $_ -match '^\s*image:\s*(caddy:\S+)' } | Select-Object -First 1) -replace '^\s*image:\s*', ''
if (-not $ToolImage) { throw 'Could not read the HTTPS proxy image from compose.local-idp.yaml.' }

function Say([string]$What, [string]$Result) { Write-Host ("{0,-62} {1}" -f $What, $Result) }
function Get-ServiceContainer([string]$Service) {
  $ids = @(& docker ps -a --filter 'label=com.docker.compose.project=ai-project-aegis' --filter "label=com.docker.compose.service=$Service" --format '{{.ID}}')
  if ($ids.Count -ne 1) { throw "Expected exactly one $Service container of this project; found $($ids.Count). Nothing was changed." }
  return $ids[0]
}
function Get-VolumeName([string]$Container, [string]$Destination) {
  # JSON, not a Go template with quotes: Windows PowerShell 5.1 mangles double quotes in native arguments.
  $mounts = (& docker inspect -f '{{json .Mounts}}' $Container) -join "`n" | ConvertFrom-Json
  $name = [string](@($mounts | Where-Object { $_.Destination -eq $Destination -and $_.Type -eq 'volume' })[0].Name)
  if (-not $name) { throw "Could not find the volume mounted at $Destination. Nothing was changed." }
  return $name
}
function Protect-Folder([string]$Folder) {
  # Current Windows user only: inheritance off, everyone else removed.
  $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  Set-Acl -Path $Folder -AclObject $acl
  # Everything inside takes only what the folder passes down.
  if (Get-ChildItem -Force $Folder) { & icacls (Join-Path $Folder '*') /reset /T /C /Q | Out-Null; if ($LASTEXITCODE -ne 0) { throw "Could not restrict the permissions inside $Folder." } }
}
function Invoke-Tool([string]$Volume, [string]$Folder, [string]$VolumeMode, [string]$FolderMode, [string]$Command) {
  # Shell commands contain no double quotes (Windows PowerShell 5.1). set -e: any failing step fails the tool.
  & docker run --rm -v ($Volume + ':/data' + $VolumeMode) -v ($Folder + ':/backup' + $FolderMode) --entrypoint sh $ToolImage -c ('set -e; ' + $Command)
  if ($LASTEXITCODE -ne 0) { throw 'The backup tool container failed.' }
}
function Test-Archive([string]$Folder, [string]$Name, [string]$Required, [int]$Expected = -1) {
  # tar must read the whole archive on its own (exit status checked, no pipe), the store file must be listed, and the
  # entry count must match the source when it is known.
  & docker run --rm -v ($Folder + ':/backup') --entrypoint sh $ToolImage -c ('set -e; tar tzf /backup/' + $Name + '.tgz > /backup/' + $Name + '.list')
  if ($LASTEXITCODE -ne 0) { throw "The $Name archive cannot be read." }
  $entries = @(Get-Content (Join-Path $Folder "$Name.list") | Where-Object { $_ -and $_ -ne './' })
  if (-not ($entries -contains $Required)) { throw "The $Name archive does not contain $Required." }
  if ($Expected -ge 0 -and $entries.Count -ne $Expected) { throw "The $Name archive has $($entries.Count) entries; the source had $Expected." }
  return $entries.Count
}
function Backup-Volume([string]$Volume, [string]$Folder, [string]$Name, [string]$Required) {
  Invoke-Tool $Volume $Folder ':ro' '' ('find /data -mindepth 1 | wc -l > /backup/' + $Name + '.source-count; tar czf /backup/' + $Name + '.tgz -C /data .')
  $expected = [int]((Get-Content (Join-Path $Folder "$Name.source-count") -Raw).Trim())
  return (Test-Archive $Folder $Name $Required $expected)
}
function Restore-Volume([string]$Volume, [string]$Folder, [string]$Name, [string]$Required) {
  # Check first; extract beside the live data inside the volume; swap only after a complete extract.
  $null = Test-Archive $Folder $Name $Required
  $check = $Required.TrimStart('.', '/')
  Invoke-Tool $Volume $Folder '' ':ro' ('rm -rf /data/.indtrana-restore /data/.indtrana-previous; mkdir /data/.indtrana-restore; ' +
    'tar xzf /backup/' + $Name + '.tgz -C /data/.indtrana-restore; test -e /data/.indtrana-restore/' + $check + '; ' +
    'mkdir /data/.indtrana-previous; ' +
    'find /data -mindepth 1 -maxdepth 1 ! -name .indtrana-restore ! -name .indtrana-previous -exec mv {} /data/.indtrana-previous/ \;; ' +
    'find /data/.indtrana-restore -mindepth 1 -maxdepth 1 -exec mv {} /data/ \;; ' +
    'rm -rf /data/.indtrana-restore /data/.indtrana-previous')
}
function Invoke-Idp([string]$Id, [string]$Script, [string]$Stdin = $null) {
  $login = 'K=/opt/keycloak/bin/kcadm.sh; $K config credentials --server http://localhost:8080 --realm master --user $KC_BOOTSTRAP_ADMIN_USERNAME --password $KC_BOOTSTRAP_ADMIN_PASSWORD >/dev/null 2>&1 || { echo ADMIN_LOGIN_FAILED; exit 0; }; '
  $output = if ($Stdin) { $Stdin | & docker exec -i $Id sh -c ($login + $Script) } else { & docker exec $Id sh -c ($login + $Script) }
  if ($LASTEXITCODE -ne 0) { throw 'A command inside the identity provider container failed.' }
  if (@($output) -contains 'ADMIN_LOGIN_FAILED') { throw 'ADMIN_LOGIN_FAILED' }
  return @($output)
}
function Wait-Idp([string]$Id) {
  for ($i = 0; $i -lt 90; $i++) { try { Invoke-Idp $Id 'echo READY' | Out-Null; return } catch { Start-Sleep -Seconds 2 } }
  throw 'The identity provider did not answer its admin tool within three minutes.'
}
function Get-Realms([string]$Id) { return @(Invoke-Idp $Id '$K get realms --fields realm --format csv --noquotes') | Where-Object { $_ } }
function Get-UserIds([string]$Id, [string]$Realm) {
  # One page of up to 1000; the comparison is only trusted below that, so more accounts stop the run.
  $ids = @(Invoke-Idp $Id ('$K get users -r ' + $Realm + ' --limit 1000 --fields id --format csv --noquotes') | Where-Object { $_ } | Sort-Object)
  if ($ids.Count -gt $MaxAccounts) { throw "More than $MaxAccounts accounts: the id comparison would be incomplete. Nothing was changed." }
  return $ids
}
function Test-PrivateRealmFile([string]$Realm) { return [bool](Select-String -Path (Join-Path $IdpDir 'realm.json') -Pattern ('"realm"\s*:\s*"' + $Realm + '"') -Quiet) }
function Set-PrivateRealmNames([string]$FromRealm, [string]$ToRealm, [string]$FromClient, [string]$ToClient) {
  # Exact quoted names only; the rest of the file (including credentials) is never read out or printed.
  $path = Join-Path $IdpDir 'realm.json'
  $text = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($path))
  $next = $text.Replace('"' + $FromRealm + '"', '"' + $ToRealm + '"').Replace('"' + $FromClient + '"', '"' + $ToClient + '"')
  if ($next -ne $text) { [IO.File]::WriteAllBytes($path, [Text.Encoding]::UTF8.GetBytes($next)) }
  return ($next -ne $text)
}
function Assert-RoleClaim([string]$Id) {
  # Read-only: the web client still has the mapper that signs its client roles into the access token as aegis_roles.
  $cid = @(Invoke-Idp $Id ('$K get clients -r ' + $NewRealm + ' -q clientId=' + $NewClient + ' --fields id --format csv --noquotes') | Where-Object { $_ })[0]
  if (-not $cid) { throw 'The renamed web client was not found.' }
  $mappers = (Invoke-Idp $Id ('$K get clients/' + $cid + '/protocol-mappers/models -r ' + $NewRealm)) -join "`n" | ConvertFrom-Json
  $roles = @($mappers | Where-Object { $_.protocolMapper -eq 'oidc-usermodel-client-role-mapper' -and $_.config.'claim.name' -eq 'aegis_roles' })
  if ($roles.Count -ne 1 -or $roles[0].config.'usermodel.clientRoleMapping.clientId' -ne $NewClient -or $roles[0].config.'access.token.claim' -ne 'true') {
    throw 'The role claim mapper does not point at the renamed web client.'
  }
}
function Backup-All([string]$Folder) {
  $idp = Get-ServiceContainer 'local-idp'; $tls = Get-ServiceContainer 'local-idp-tls'
  $dataVolume = Get-VolumeName $idp '/opt/keycloak/data'; $tlsVolume = Get-VolumeName $tls '/data'
  New-Item -ItemType Directory -Force $Folder | Out-Null
  Protect-Folder $BackupRoot
  foreach ($file in $PrivateFiles) { if (Test-Path (Join-Path $IdpDir $file)) { Copy-Item (Join-Path $IdpDir $file) (Join-Path $Folder $file) } }
  & docker stop $idp | Out-Null
  try {
    $dataCount = Backup-Volume $dataVolume $Folder 'keycloak-data' $ProviderStore
    $proxyCount = Backup-Volume $tlsVolume $Folder 'proxy-data' $ProxyStore
  } finally { & docker start $idp | Out-Null }
  Protect-Folder $Folder
  Say "Backup verified ($dataCount provider entries, $proxyCount proxy entries, private files)" 'done'
  Write-Host ('Backup folder: ' + $Folder)
}
function Restore-Backup([string]$Folder) {
  $idp = Get-ServiceContainer 'local-idp'; $tls = Get-ServiceContainer 'local-idp-tls'
  $dataVolume = Get-VolumeName $idp '/opt/keycloak/data'; $tlsVolume = Get-VolumeName $tls '/data'
  & docker stop $idp | Out-Null; & docker stop $tls | Out-Null
  try {
    Restore-Volume $dataVolume $Folder 'keycloak-data' $ProviderStore
    Restore-Volume $tlsVolume $Folder 'proxy-data' $ProxyStore
    foreach ($file in $PrivateFiles) { if (Test-Path (Join-Path $Folder $file)) { Copy-Item (Join-Path $Folder $file) (Join-Path $IdpDir $file) -Force } }
  } finally {
    & docker start $tls | Out-Null; & docker start $idp | Out-Null
  }
  Wait-Idp $idp
}
function Invoke-Rollback {
  $folder = $Backup
  if (-not $folder) {
    $newest = Get-ChildItem $BackupRoot -Directory | Where-Object { $_.Name -notlike '*-before-rollback' } | Sort-Object Name | Select-Object -Last 1
    if (-not $newest) { throw 'No backup found to roll back to. Nothing was changed.' }
    Write-Host ('Newest backup: ' + $newest.Name + ' (made ' + $newest.CreationTime.ToString('yyyy-MM-dd HH:mm:ss') + ').')
    Write-Host 'Accounts and passwords changed after that time are lost by a rollback.'
    $typed = Read-Host ('Type ' + $newest.Name + ' to restore it, anything else to stop')
    if ($typed -ne $newest.Name) { throw 'Rollback not confirmed. Nothing was changed.' }
    $folder = $newest.FullName
  }
  if (-not (Test-Path (Join-Path $folder 'keycloak-data.tgz'))) { throw 'That folder is not a provider backup. Nothing was changed.' }
  $null = Test-Archive $folder 'keycloak-data' $ProviderStore
  $null = Test-Archive $folder 'proxy-data' $ProxyStore
  Backup-All (Join-Path $BackupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-before-rollback'))
  Restore-Backup $folder
  [IO.File]::WriteAllText($HoldMarker, ('rolled back ' + (Get-Date -Format 's') + "`n"), [Text.Encoding]::ASCII)
  Say 'Provider data and private files restored from the backup' 'rolled back'
  Write-Host 'aegis.cmd will not move the address again until you run this script without -Rollback.'
  Write-Host 'The old address only works with code at a commit that still uses it (aegis-idp.localhost / aegis-exercise).'
}
function Invoke-Migration {
  $idp = Get-ServiceContainer 'local-idp'
  Wait-Idp $idp
  $realms = Get-Realms $idp
  $kcOld = $realms -contains $OldRealm; $kcNew = $realms -contains $NewRealm
  if ($kcOld -and $kcNew) { throw "Both $OldRealm and $NewRealm exist in the provider. Stop and inspect; nothing was changed." }
  if (-not $kcOld -and -not $kcNew) { throw 'The exercise realm was not found in the provider. Nothing was changed.' }
  if ($kcNew) {
    if (Set-PrivateRealmNames $OldRealm $NewRealm $OldClient $NewClient) { Say 'Private realm file names the new realm' 'updated' }
    Assert-RoleClaim $idp
    if (Test-Path $HoldMarker) { Remove-Item $HoldMarker }
    Say 'Sign-in address is indtrana-idp.localhost / indtrana-exercise' 'already migrated'
    return
  }
  # An earlier run that stopped after updating the file but before the rename: put the file back to match.
  if (Set-PrivateRealmNames $NewRealm $OldRealm $NewClient $OldClient) { Say 'Private realm file matched to the provider again' 'fixed' }

  $before = Get-UserIds $idp $OldRealm
  if ($before.Count -lt 1) { throw 'No accounts were listed in the old realm; refusing to continue. Nothing was changed.' }
  $folder = Join-Path $BackupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
  Backup-All $folder
  [IO.File]::WriteAllLines((Join-Path $folder 'user-ids-before.txt'), [string[]]$before, [Text.Encoding]::ASCII)
  Wait-Idp $idp

  try {
    # The private file first: the provider only reads it at start, and a restore puts it back.
    $null = Set-PrivateRealmNames $OldRealm $NewRealm $OldClient $NewClient
    Invoke-Idp $idp ('$K update realms/' + $OldRealm + ' -s realm=' + $NewRealm + ' >/dev/null') | Out-Null
    $cid = @(Invoke-Idp $idp ('$K get clients -r ' + $NewRealm + ' -q clientId=' + $OldClient + ' --fields id --format csv --noquotes') | Where-Object { $_ })[0]
    if (-not $cid) { throw 'The web client was not found after the realm rename.' }
    Invoke-Idp $idp ('$K update clients/' + $cid + ' -r ' + $NewRealm + ' -s clientId=' + $NewClient + ' >/dev/null') | Out-Null
    $mappers = (Invoke-Idp $idp ('$K get clients/' + $cid + '/protocol-mappers/models -r ' + $NewRealm)) -join "`n" | ConvertFrom-Json
    foreach ($mapper in @($mappers)) {
      $config = $mapper.config
      if ($config -and $config.PSObject.Properties['usermodel.clientRoleMapping.clientId'] -and $config.'usermodel.clientRoleMapping.clientId' -eq $OldClient) {
        $config.'usermodel.clientRoleMapping.clientId' = $NewClient
        Invoke-Idp $idp ('sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-mapper.json; $K update clients/' + $cid + '/protocol-mappers/models/' + $mapper.id + ' -r ' + $NewRealm + ' -f /tmp/aegis-mapper.json >/dev/null; code=$?; rm -f /tmp/aegis-mapper.json; exit $code') ($mapper | ConvertTo-Json -Depth 8 -Compress) | Out-Null
      }
    }
    $after = Get-UserIds $idp $NewRealm
    [IO.File]::WriteAllLines((Join-Path $folder 'user-ids-after.txt'), [string[]]$after, [Text.Encoding]::ASCII)
    if (($before -join ',') -ne ($after -join ',')) { throw 'The account list changed during the rename.' }
    Assert-RoleClaim $idp
  } catch {
    $original = $_.Exception.Message
    Write-Host 'The rename did not complete; restoring the backup now.' -ForegroundColor Yellow
    try { Restore-Backup $folder } catch { throw ('Migration failed: ' + $original + ' | Restore ALSO failed: ' + $_.Exception.Message + ' | Backup kept at ' + $folder) }
    throw ('Migration rolled back: ' + $original)
  }
  if (Test-Path $HoldMarker) { Remove-Item $HoldMarker }
  Say ("Realm renamed $OldRealm -> $NewRealm") 'updated'
  Say ("Web client renamed $OldClient -> $NewClient (roles kept)") 'updated'
  Say ("Accounts before and after: $($before.Count) / $($after.Count), same ids") 'checked'
  Say 'Role claim mapper points at the renamed client' 'checked'
  Write-Host 'Restart with start-windows.ps1 -SignIn (or aegis.cmd start) so the app uses the new address. Everyone signs in again.'
}

# Dot-sourcing (for the scratch tests) defines the functions only.
if ($MyInvocation.InvocationName -ne '.') {
  Invoke-AegisLocalOperation -Name 'migrate-local-idp-address.ps1' -Action {
    Assert-AegisSingleRuntime -RequireRunning | Out-Null
    if ($Rollback) { Invoke-Rollback } else { Invoke-Migration }
  }
}
