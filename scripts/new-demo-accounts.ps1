# Creates local demo sign-in accounts in the LOCAL exercise identity provider (Keycloak container) only.
# One account per role: <prefix>-maker, <prefix>-checker, <prefix>-auditor, <prefix>-admin, plus two department
# accounts for the Department Inbox: <prefix>-dept-control (control room) and <prefix>-dept-infra (infrastructure).
# Two synthetic response-team accounts for My Team: <prefix>-team-rescue (syn-team-rescue-01) and
# <prefix>-team-medical (syn-team-health-01). Exercise only: nobody is contacted outside IndTrana.
# Department and team accounts need scripts/update-local-idp.ps1 to have been run once (it adds their roles).
# - Existing accounts are left exactly as they are (no password reset, no deletion).
# - Passwords are generated here, never printed, and saved only to a private file outside the repository:
#     %LOCALAPPDATA%\AEGIS\local-idp\demo-credentials.txt   (username, password, role; tab-separated)
# - The owner's exercise-* accounts are never touched.
# These accounts prove local sign-in only. They are not agency accreditation and not real two-person approval.
# Run:  powershell -ExecutionPolicy Bypass -File .\scripts\new-demo-accounts.ps1
param([string]$Prefix = 'demo')
$ErrorActionPreference = 'Stop'
if ($Prefix -notmatch '^[a-z][a-z0-9]{1,15}$' -or $Prefix -eq 'exercise') { throw 'Prefix must be 2-16 lowercase letters or digits, and not "exercise".' }
. (Join-Path $PSScriptRoot 'local-runtime-common.ps1')

function New-DemoPassword {
  $bytes = New-Object byte[] 18
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  # URL-safe base64: 24 characters, no quoting problems, longer than the realm's 12-character minimum.
  return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_')
}

Invoke-AegisLocalOperation -Name 'new-demo-accounts.ps1' -Action {
  Assert-AegisSingleRuntime -RequireRunning
  $container = @(& docker ps --filter 'label=com.docker.compose.project=ai-project-aegis' --filter 'label=com.docker.compose.service=local-idp' --format '{{.ID}}')
  if ($container.Count -ne 1) { throw 'The local identity provider is not running. Finish the sign-in setup in docs/INSTALL.md first.' }

  $roles = [ordered]@{ maker = 'incident_operator'; checker = 'incident_checker'; auditor = 'incident_auditor'; admin = 'platform_admin' }
  $wanted = @(); foreach ($name in $roles.Keys) { $wanted += [PSCustomObject]@{ User = "$Prefix-$name"; Password = (New-DemoPassword); Role = $roles[$name]; Department = ''; Team = '' } }
  foreach ($desk in @(@('dept-control', 'control_room'), @('dept-infra', 'infrastructure'))) {
    $wanted += [PSCustomObject]@{ User = "$Prefix-$($desk[0])"; Password = (New-DemoPassword); Role = 'department_operator'; Department = $desk[1]; Team = '' }
  }
  foreach ($crew in @(@('team-rescue', 'syn-team-rescue-01'), @('team-medical', 'syn-team-health-01'))) {
    $wanted += [PSCustomObject]@{ User = "$Prefix-$($crew[0])"; Password = (New-DemoPassword); Role = 'response_team'; Department = ''; Team = $crew[1] }
  }

  # The shell script deliberately contains no double quotes (Windows PowerShell 5.1 mangles them in native
  # arguments). Every value it handles is letters, digits, '-', '_', '+', '/' or '=', so unquoted use is safe.
  $remote = @'
K=/opt/keycloak/bin/kcadm.sh
$K config credentials --server http://localhost:8080 --realm master --user $KC_BOOTSTRAP_ADMIN_USERNAME --password $KC_BOOTSTRAP_ADMIN_PASSWORD >/dev/null 2>&1 || { echo ADMIN_LOGIN_FAILED; exit 0; }
tr -d '\r' | while IFS=, read -r u p r d t; do
  case $u in '') continue ;; esac
  dept=; case $d in control_room|infrastructure|communications) dept='-s attributes.aegis_department_id='$d ;; esac
  team=; case $t in syn-team-rescue-01|syn-team-rescue-02|syn-team-health-01|syn-team-fire-01|syn-team-municipal-01) team='-s attributes.aegis_team_id='$t ;; esac
  found=$($K get users -r indtrana-exercise -q username=$u -q exact=true --fields username --format csv --noquotes 2>/dev/null)
  case $found in *$u*) echo EXISTS,$u; continue ;; esac
  if $K create users -r indtrana-exercise -s username=$u -s enabled=true -s emailVerified=true -s firstName=Demo -s lastName=$u -s email=$u@example.invalid $dept $team >/dev/null 2>&1 &&
     $K set-password -r indtrana-exercise --username $u --new-password $p >/dev/null 2>&1 &&
     $K add-roles -r indtrana-exercise --uusername $u --cclientid indtrana-local-web --rolename $r >/dev/null 2>&1
  then echo CREATED,$u; else echo FAILED,$u; fi
done
'@
  $lines = @($wanted | ForEach-Object { '{0},{1},{2},{3},{4}' -f $_.User, $_.Password, $_.Role, $_.Department, $_.Team })
  $result = @($lines | & docker exec -i $container[0] sh -c $remote)
  if ($LASTEXITCODE -ne 0) { throw 'Could not run the account tool inside the identity provider container.' }
  if ($result -contains 'ADMIN_LOGIN_FAILED') { throw 'The identity provider rejected its local bootstrap administrator. No account was created.' }

  $created = @($wanted | Where-Object { $result -contains ('CREATED,' + $_.User) })
  $failed = @($result | Where-Object { $_ -like 'FAILED,*' })
  $file = Join-Path $env:LOCALAPPDATA 'AEGIS\local-idp\demo-credentials.txt'
  if ($created.Count -gt 0) {
    if (-not (Test-Path $file)) {
      [IO.File]::WriteAllText($file, "IndTrana local demo sign-ins (synthetic exercise only). Keep this file private.`n", [Text.Encoding]::ASCII)
    }
    [IO.File]::AppendAllText($file, (($created | ForEach-Object { "{0}`t{1}`t{2}" -f $_.User, $_.Password, $(if ($_.Department) { "$($_.Role) ($($_.Department))" } elseif ($_.Team) { "$($_.Role) ($($_.Team))" } else { $_.Role }) }) -join "`n") + "`n", [Text.Encoding]::ASCII)
  }
  foreach ($item in $wanted) {
    $state = if ($result -contains ('CREATED,' + $item.User)) { 'created' } elseif ($result -contains ('EXISTS,' + $item.User)) { 'already existed, left unchanged' } else { 'FAILED' }
    Write-Host ("{0,-22} {1,-20} {2}" -f $item.User, $item.Role, $state)
  }
  if ($created.Count -gt 0) { Write-Host "Passwords for new accounts were saved to: $file (not printed here)." }
  if ($failed.Count -gt 0) { throw "$($failed.Count) account(s) could not be created completely. If they are department or team accounts, run scripts\update-local-idp.ps1 first; otherwise inspect them in the identity provider before retrying." }
}
