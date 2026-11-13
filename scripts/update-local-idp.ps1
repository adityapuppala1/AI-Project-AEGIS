# Brings the LOCAL exercise identity provider (Keycloak container) up to what the current AEGIS code expects.
# Safe to run again: every step checks first and changes nothing that is already right.
#   1. Access tokens last 15 minutes (the AEGIS session cap), not 5.
#   2. The department_operator role exists.
#   3. A department can be recorded on an account (administrators only) and is signed into the access token.
#   4. The provider's own sign-in pages use the AEGIS look (ops/local-idp/theme; styles only).
#   5-7. The response_team role, an aegis_team_id account attribute (administrators only) and its access-token mapper.
#   8. Only an administrator can change an account's email address (staff email notices trust the verified address).
# It never creates, changes or deletes an account and never prints a secret.
# Run:  powershell -ExecutionPolicy Bypass -File .\scripts\update-local-idp.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-runtime-common.ps1')

Invoke-AegisLocalOperation -Name 'update-local-idp.ps1' -Action {
  Assert-AegisSingleRuntime -RequireRunning
  $container = @(& docker ps --filter 'label=com.docker.compose.project=ai-project-aegis' --filter 'label=com.docker.compose.service=local-idp' --format '{{.ID}}')
  if ($container.Count -ne 1) { throw 'The local identity provider is not running. Finish the sign-in setup in docs/INSTALL.md first.' }
  $id = $container[0]
  # Windows PowerShell may put a byte-order mark in front of JSON piped into the container, and the provider rejects
  # it, so every write below strips one with sed before saving the file.

  # Shell snippets contain no double quotes: Windows PowerShell 5.1 mangles them in native arguments.
  $login = 'K=/opt/keycloak/bin/kcadm.sh; $K config credentials --server http://localhost:8080 --realm master --user $KC_BOOTSTRAP_ADMIN_USERNAME --password $KC_BOOTSTRAP_ADMIN_PASSWORD >/dev/null 2>&1 || { echo ADMIN_LOGIN_FAILED; exit 0; }; '
  $client = 'CID=$($K get clients -r aegis-exercise -q clientId=aegis-local-web --fields id --format csv --noquotes | head -1); '
  function Invoke-Idp([string]$Script, [string]$Stdin = $null) {
    $output = if ($Stdin) { $Stdin | & docker exec -i $id sh -c ($login + $client + $Script) } else { & docker exec $id sh -c ($login + $client + $Script) }
    if ($LASTEXITCODE -ne 0) { throw 'A command inside the identity provider container failed.' }
    if (@($output) -contains 'ADMIN_LOGIN_FAILED') { throw 'The identity provider rejected its local bootstrap administrator. Nothing was changed.' }
    return @($output)
  }
  function Say([string]$What, [bool]$Changed) { Write-Host ("{0,-58} {1}" -f $What, $(if ($Changed) { 'updated' } else { 'already set' })) }

  # 1. Token lifetime and 4. sign-in page look
  $realm = (Invoke-Idp '$K get realms/aegis-exercise --fields accessTokenLifespan,loginTheme') -join "`n" | ConvertFrom-Json
  $needLife = $realm.accessTokenLifespan -ne 900
  if ($needLife) { Invoke-Idp '$K update realms/aegis-exercise -s accessTokenLifespan=900 >/dev/null' | Out-Null }
  Say 'Access tokens last 15 minutes' $needLife
  $themeThere = (Invoke-Idp 'test -f /opt/keycloak/themes/aegis/login/theme.properties && echo THEME_OK || echo THEME_MISSING') -contains 'THEME_OK'
  if (-not $themeThere) {
    Write-Host 'Sign-in page look: the theme folder is not mounted yet. Restart with start-windows.ps1 -SignIn, then run this again.' -ForegroundColor Yellow
  } else {
    $needTheme = $realm.loginTheme -ne 'aegis'
    if ($needTheme) { Invoke-Idp '$K update realms/aegis-exercise -s loginTheme=aegis >/dev/null' | Out-Null }
    Say 'Provider sign-in pages use the AEGIS look' $needTheme
  }

  # 2. Department role
  $roles = Invoke-Idp '$K get clients/$CID/roles -r aegis-exercise --fields name --format csv --noquotes'
  $needRole = -not ($roles -contains 'department_operator')
  if ($needRole) { Invoke-Idp '$K create clients/$CID/roles -r aegis-exercise -s name=department_operator >/dev/null 2>&1' | Out-Null }
  Say 'Role department_operator exists' $needRole

  # 3a. Department attribute on accounts: visible to and editable by administrators only, three fixed values.
  $profile = (Invoke-Idp '$K get users/profile -r aegis-exercise') -join "`n" | ConvertFrom-Json
  $needAttribute = -not (@($profile.attributes | ForEach-Object { $_.name }) -contains 'aegis_department_id')
  if ($needAttribute) {
    $attribute = [PSCustomObject]@{
      name = 'aegis_department_id'; displayName = 'AEGIS department'; multivalued = $false
      validations = [PSCustomObject]@{ options = [PSCustomObject]@{ options = @('control_room', 'infrastructure', 'communications') } }
      permissions = [PSCustomObject]@{ view = @('admin'); edit = @('admin') }
    }
    $profile.attributes = @($profile.attributes) + $attribute
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-profile.json; $K update users/profile -r aegis-exercise -f /tmp/aegis-profile.json >/dev/null; code=$?; rm -f /tmp/aegis-profile.json; exit $code' ($profile | ConvertTo-Json -Depth 32 -Compress) | Out-Null
  }
  Say 'Accounts can carry a department (administrators only)' $needAttribute

  # 3b. Sign the department into the access token, never the ID token.
  $mappers = Invoke-Idp '$K get clients/$CID/protocol-mappers/models -r aegis-exercise --fields name --format csv --noquotes'
  $needMapper = -not ($mappers -contains 'signed-department')
  if ($needMapper) {
    $mapper = [PSCustomObject]@{
      name = 'signed-department'; protocol = 'openid-connect'; protocolMapper = 'oidc-usermodel-attribute-mapper'
      config = [PSCustomObject]@{ 'user.attribute' = 'aegis_department_id'; 'claim.name' = 'aegis_department_id'; 'jsonType.label' = 'String'
        'access.token.claim' = 'true'; 'id.token.claim' = 'false'; 'userinfo.token.claim' = 'false' }
    }
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-mapper.json; $K create clients/$CID/protocol-mappers/models -r aegis-exercise -f /tmp/aegis-mapper.json >/dev/null 2>&1; code=$?; rm -f /tmp/aegis-mapper.json; exit $code' ($mapper | ConvertTo-Json -Depth 8 -Compress) | Out-Null
  }
  Say 'Department is signed into the access token' $needMapper

  # 5. Response team role (docs/RESPONSE_LOOP.md). Exercise only: teams answer inside AEGIS, nobody is contacted.
  $needTeamRole = -not ($roles -contains 'response_team')
  if ($needTeamRole) { Invoke-Idp '$K create clients/$CID/roles -r aegis-exercise -s name=response_team >/dev/null 2>&1' | Out-Null }
  Say 'Role response_team exists' $needTeamRole

  # 6. Team attribute on accounts: administrators only, the five fixture team ids. Re-read the profile (step 3a may have changed it).
  $profile = (Invoke-Idp '$K get users/profile -r aegis-exercise') -join "`n" | ConvertFrom-Json
  $needTeamAttribute = -not (@($profile.attributes | ForEach-Object { $_.name }) -contains 'aegis_team_id')
  if ($needTeamAttribute) {
    $attribute = [PSCustomObject]@{
      name = 'aegis_team_id'; displayName = 'AEGIS synthetic response team'; multivalued = $false
      validations = [PSCustomObject]@{ options = [PSCustomObject]@{ options = @('syn-team-rescue-01', 'syn-team-rescue-02', 'syn-team-health-01', 'syn-team-fire-01', 'syn-team-municipal-01') } }
      permissions = [PSCustomObject]@{ view = @('admin'); edit = @('admin') }
    }
    $profile.attributes = @($profile.attributes) + $attribute
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-profile.json; $K update users/profile -r aegis-exercise -f /tmp/aegis-profile.json >/dev/null; code=$?; rm -f /tmp/aegis-profile.json; exit $code' ($profile | ConvertTo-Json -Depth 32 -Compress) | Out-Null
  }
  Say 'Accounts can carry a response team (administrators only)' $needTeamAttribute

  # 7. Sign the team into the access token, never the ID token.
  $needTeamMapper = -not ($mappers -contains 'signed-team')
  if ($needTeamMapper) {
    $mapper = [PSCustomObject]@{
      name = 'signed-team'; protocol = 'openid-connect'; protocolMapper = 'oidc-usermodel-attribute-mapper'
      config = [PSCustomObject]@{ 'user.attribute' = 'aegis_team_id'; 'claim.name' = 'aegis_team_id'; 'jsonType.label' = 'String'
        'access.token.claim' = 'true'; 'id.token.claim' = 'false'; 'userinfo.token.claim' = 'false' }
    }
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-mapper.json; $K create clients/$CID/protocol-mappers/models -r aegis-exercise -f /tmp/aegis-mapper.json >/dev/null 2>&1; code=$?; rm -f /tmp/aegis-mapper.json; exit $code' ($mapper | ConvertTo-Json -Depth 8 -Compress) | Out-Null
  }
  Say 'Response team is signed into the access token' $needTeamMapper

  # 8. Email address: only an administrator may change it. Staff email notices (docs/COMMUNICATION_CHANNELS.md) trust the
  #    verified address in the sign-in, so a person must not be able to replace it themselves and keep it marked verified.
  $profile = (Invoke-Idp '$K get users/profile -r aegis-exercise') -join "`n" | ConvertFrom-Json
  $emailRule = @($profile.attributes | Where-Object { $_.name -eq 'email' })[0]
  $needEmailLock = $null -ne $emailRule -and (@($emailRule.permissions.edit) -join ',') -ne 'admin'
  if ($needEmailLock) {
    $emailRule.permissions.edit = @('admin')
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-profile.json; $K update users/profile -r aegis-exercise -f /tmp/aegis-profile.json >/dev/null; code=$?; rm -f /tmp/aegis-profile.json; exit $code' ($profile | ConvertTo-Json -Depth 32 -Compress) | Out-Null
  }
  Say 'Only an administrator can change an email address' $needEmailLock
  Write-Host 'Done. Sign out and in again to pick up the changes.'
}
