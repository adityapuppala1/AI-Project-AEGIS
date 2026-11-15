# Brings the LOCAL exercise identity provider (Keycloak container) up to what the current IndTrana code expects.
# Safe to run again: every step checks first and changes nothing that is already right.
#   1. Access tokens last 15 minutes (the IndTrana session cap), not 5.
#   2. The department_operator role exists.
#   3. A department can be recorded on an account (administrators only) and is signed into the access token.
#   4. The provider's own sign-in pages use the IndTrana look (ops/local-idp/theme; styles only).
#   5-7. The response_team role, an aegis_team_id account attribute (administrators only) and its access-token mapper.
#   8. Only an administrator can change an account's email address (staff email notices trust the verified address).
#   9. The provider's own pages show the product name IndTrana (realm and web client display names; ids unchanged).
#  10. The web client requires PKCE (S256) and accepts the app address as its sign-out return address. A file update
#      without merge had dropped both; sign-out then ended on the provider's "Invalid redirect uri" page.
#  11. The user administration service client indtrana-user-admin (docs/USER_MANAGEMENT.md): service account only,
#      realm-management view-users, query-users and manage-users; its secret goes only to the private user-admin.env.
# It never creates, changes or deletes a person's account and never prints a secret.
# Run:  powershell -ExecutionPolicy Bypass -File .\scripts\update-local-idp.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-runtime-common.ps1')
# Display names the provider shows; must match ops/local-idp/realm.json (used for a fresh install).
$IdpDisplayName = 'IndTrana LOCAL SYNTHETIC EXERCISE'
$IdpDisplayNameHtml = 'IndTrana'
$IdpClientName = 'IndTrana'
# The default app address; must match ops/local-idp/realm.json. A moved web port is added by aegis.cmd / aegis.sh.
$IdpAppOrigin = 'http://localhost:3000'

Invoke-AegisLocalOperation -Name 'update-local-idp.ps1' -Action {
  Assert-AegisSingleRuntime -RequireRunning
  $container = @(& docker ps --filter 'label=com.docker.compose.project=ai-project-aegis' --filter 'label=com.docker.compose.service=local-idp' --format '{{.ID}}')
  if ($container.Count -ne 1) { throw 'The local identity provider is not running. Finish the sign-in setup in docs/INSTALL.md first.' }
  $id = $container[0]
  # Windows PowerShell may put a byte-order mark in front of JSON piped into the container, and the provider rejects
  # it, so every write below strips one with sed before saving the file.

  # Shell snippets contain no double quotes: Windows PowerShell 5.1 mangles them in native arguments.
  $login = 'K=/opt/keycloak/bin/kcadm.sh; $K config credentials --server http://localhost:8080 --realm master --user $KC_BOOTSTRAP_ADMIN_USERNAME --password $KC_BOOTSTRAP_ADMIN_PASSWORD >/dev/null 2>&1 || { echo ADMIN_LOGIN_FAILED; exit 0; }; '
  $client = 'CID=$($K get clients -r indtrana-exercise -q clientId=indtrana-local-web --fields id --format csv --noquotes | head -1); '
  function Invoke-Idp([string]$Script, [string]$Stdin = $null) {
    $output = if ($Stdin) { $Stdin | & docker exec -i $id sh -c ($login + $client + $Script) } else { & docker exec $id sh -c ($login + $client + $Script) }
    if ($LASTEXITCODE -ne 0) { throw 'A command inside the identity provider container failed.' }
    if (@($output) -contains 'ADMIN_LOGIN_FAILED') { throw 'The identity provider rejected its local bootstrap administrator. Nothing was changed.' }
    return @($output)
  }
  function Say([string]$What, [bool]$Changed) { Write-Host ("{0,-58} {1}" -f $What, $(if ($Changed) { 'updated' } else { 'already set' })) }

  # 1. Token lifetime and 4. sign-in page look
  $realm = (Invoke-Idp '$K get realms/indtrana-exercise --fields accessTokenLifespan,loginTheme') -join "`n" | ConvertFrom-Json
  $needLife = $realm.accessTokenLifespan -ne 900
  if ($needLife) { Invoke-Idp '$K update realms/indtrana-exercise -s accessTokenLifespan=900 >/dev/null' | Out-Null }
  Say 'Access tokens last 15 minutes' $needLife
  $themeThere = (Invoke-Idp 'test -f /opt/keycloak/themes/aegis/login/theme.properties && echo THEME_OK || echo THEME_MISSING') -contains 'THEME_OK'
  if (-not $themeThere) {
    Write-Host 'Sign-in page look: the theme folder is not mounted yet. Restart with start-windows.ps1 -SignIn, then run this again.' -ForegroundColor Yellow
  } else {
    $needTheme = $realm.loginTheme -ne 'aegis'
    if ($needTheme) { Invoke-Idp '$K update realms/indtrana-exercise -s loginTheme=aegis >/dev/null' | Out-Null }
    Say 'Provider sign-in pages use the IndTrana look' $needTheme
  }

  # 2. Department role
  $roles = Invoke-Idp '$K get clients/$CID/roles -r indtrana-exercise --fields name --format csv --noquotes'
  $needRole = -not ($roles -contains 'department_operator')
  if ($needRole) { Invoke-Idp '$K create clients/$CID/roles -r indtrana-exercise -s name=department_operator >/dev/null 2>&1' | Out-Null }
  Say 'Role department_operator exists' $needRole

  # 3a. Department attribute on accounts: visible to and editable by administrators only, three fixed values.
  $profile = (Invoke-Idp '$K get users/profile -r indtrana-exercise') -join "`n" | ConvertFrom-Json
  $needAttribute = -not (@($profile.attributes | ForEach-Object { $_.name }) -contains 'aegis_department_id')
  if ($needAttribute) {
    $attribute = [PSCustomObject]@{
      name = 'aegis_department_id'; displayName = 'IndTrana department'; multivalued = $false
      validations = [PSCustomObject]@{ options = [PSCustomObject]@{ options = @('control_room', 'infrastructure', 'communications') } }
      permissions = [PSCustomObject]@{ view = @('admin'); edit = @('admin') }
    }
    $profile.attributes = @($profile.attributes) + $attribute
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-profile.json; $K update users/profile -r indtrana-exercise -f /tmp/aegis-profile.json >/dev/null; code=$?; rm -f /tmp/aegis-profile.json; exit $code' ($profile | ConvertTo-Json -Depth 32 -Compress) | Out-Null
  }
  Say 'Accounts can carry a department (administrators only)' $needAttribute

  # 3b. Sign the department into the access token, never the ID token.
  $mappers = Invoke-Idp '$K get clients/$CID/protocol-mappers/models -r indtrana-exercise --fields name --format csv --noquotes'
  $needMapper = -not ($mappers -contains 'signed-department')
  if ($needMapper) {
    $mapper = [PSCustomObject]@{
      name = 'signed-department'; protocol = 'openid-connect'; protocolMapper = 'oidc-usermodel-attribute-mapper'
      config = [PSCustomObject]@{ 'user.attribute' = 'aegis_department_id'; 'claim.name' = 'aegis_department_id'; 'jsonType.label' = 'String'
        'access.token.claim' = 'true'; 'id.token.claim' = 'false'; 'userinfo.token.claim' = 'false' }
    }
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-mapper.json; $K create clients/$CID/protocol-mappers/models -r indtrana-exercise -f /tmp/aegis-mapper.json >/dev/null 2>&1; code=$?; rm -f /tmp/aegis-mapper.json; exit $code' ($mapper | ConvertTo-Json -Depth 8 -Compress) | Out-Null
  }
  Say 'Department is signed into the access token' $needMapper

  # 5. Response team role (docs/RESPONSE_LOOP.md). Exercise only: teams answer inside IndTrana, nobody is contacted.
  $needTeamRole = -not ($roles -contains 'response_team')
  if ($needTeamRole) { Invoke-Idp '$K create clients/$CID/roles -r indtrana-exercise -s name=response_team >/dev/null 2>&1' | Out-Null }
  Say 'Role response_team exists' $needTeamRole

  # 6. Team attribute on accounts: administrators only, the five fixture team ids. Re-read the profile (step 3a may have changed it).
  $profile = (Invoke-Idp '$K get users/profile -r indtrana-exercise') -join "`n" | ConvertFrom-Json
  $needTeamAttribute = -not (@($profile.attributes | ForEach-Object { $_.name }) -contains 'aegis_team_id')
  if ($needTeamAttribute) {
    $attribute = [PSCustomObject]@{
      name = 'aegis_team_id'; displayName = 'IndTrana synthetic response team'; multivalued = $false
      validations = [PSCustomObject]@{ options = [PSCustomObject]@{ options = @('syn-team-rescue-01', 'syn-team-rescue-02', 'syn-team-health-01', 'syn-team-fire-01', 'syn-team-municipal-01') } }
      permissions = [PSCustomObject]@{ view = @('admin'); edit = @('admin') }
    }
    $profile.attributes = @($profile.attributes) + $attribute
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-profile.json; $K update users/profile -r indtrana-exercise -f /tmp/aegis-profile.json >/dev/null; code=$?; rm -f /tmp/aegis-profile.json; exit $code' ($profile | ConvertTo-Json -Depth 32 -Compress) | Out-Null
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
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-mapper.json; $K create clients/$CID/protocol-mappers/models -r indtrana-exercise -f /tmp/aegis-mapper.json >/dev/null 2>&1; code=$?; rm -f /tmp/aegis-mapper.json; exit $code' ($mapper | ConvertTo-Json -Depth 8 -Compress) | Out-Null
  }
  Say 'Response team is signed into the access token' $needTeamMapper

  # 8. Email address: only an administrator may change it. Staff email notices (docs/COMMUNICATION_CHANNELS.md) trust the
  #    verified address in the sign-in, so a person must not be able to replace it themselves and keep it marked verified.
  $profile = (Invoke-Idp '$K get users/profile -r indtrana-exercise') -join "`n" | ConvertFrom-Json
  $emailRule = @($profile.attributes | Where-Object { $_.name -eq 'email' })[0]
  $needEmailLock = $null -ne $emailRule -and (@($emailRule.permissions.edit) -join ',') -ne 'admin'
  if ($needEmailLock) {
    $emailRule.permissions.edit = @('admin')
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-profile.json; $K update users/profile -r indtrana-exercise -f /tmp/aegis-profile.json >/dev/null; code=$?; rm -f /tmp/aegis-profile.json; exit $code' ($profile | ConvertTo-Json -Depth 32 -Compress) | Out-Null
  }
  Say 'Only an administrator can change an email address' $needEmailLock

  # 9. Product name on the provider's own pages. The realm file is imported only when the realm is first created, so a
  #    provider set up before the rename keeps the old display names until this step sets them. Display text only: the
  #    realm id, client id and hostname stay as they are (docs/BRANDING.md).
  $names = (Invoke-Idp '$K get realms/indtrana-exercise --fields displayName,displayNameHtml') -join "`n" | ConvertFrom-Json
  $needRealmName = $names.displayName -ne $IdpDisplayName -or $names.displayNameHtml -ne $IdpDisplayNameHtml
  if ($needRealmName) {
    $update = [PSCustomObject]@{ displayName = $IdpDisplayName; displayNameHtml = $IdpDisplayNameHtml }
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-realm-names.json; $K update realms/indtrana-exercise -m -f /tmp/aegis-realm-names.json >/dev/null; code=$?; rm -f /tmp/aegis-realm-names.json; exit $code' ($update | ConvertTo-Json -Compress) | Out-Null
  }
  Say 'Provider pages show the name IndTrana' $needRealmName
  $clientName = ((Invoke-Idp '$K get clients/$CID -r indtrana-exercise --fields name') -join "`n" | ConvertFrom-Json).name
  $needClientName = $clientName -ne $IdpClientName
  if ($needClientName) {
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-client-name.json; $K update clients/$CID -r indtrana-exercise -m -f /tmp/aegis-client-name.json >/dev/null; code=$?; rm -f /tmp/aegis-client-name.json; exit $code' ([PSCustomObject]@{ name = $IdpClientName } | ConvertTo-Json -Compress) | Out-Null
  }
  Say 'The web client is shown as IndTrana' $needClientName

  # 10. Web client attributes. A client update from a file replaces the attribute map unless it is merged (-m), so the
  #     whole map is read, the two required values are set in it, and it is written back merged. Other values are kept.
  #     The whole client is read: with --fields attributes the admin tool prints an empty map and hides the values.
  $settings = (Invoke-Idp '$K get clients/$CID -r indtrana-exercise') -join "`n" | ConvertFrom-Json
  $attributes = [ordered]@{}
  if ($settings.attributes) { foreach ($property in $settings.attributes.PSObject.Properties) { $attributes[$property.Name] = $property.Value } }
  $logout = @(([string]$attributes['post.logout.redirect.uris']) -split '##' | Where-Object { $_ })
  $needClientSettings = $attributes['pkce.code.challenge.method'] -ne 'S256' -or $logout -notcontains $IdpAppOrigin
  if ($needClientSettings) {
    if ($logout -notcontains $IdpAppOrigin) { $logout = @($IdpAppOrigin) + $logout }
    $attributes['pkce.code.challenge.method'] = 'S256'
    $attributes['post.logout.redirect.uris'] = ($logout -join '##')
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-client-settings.json; $K update clients/$CID -r indtrana-exercise -m -f /tmp/aegis-client-settings.json >/dev/null; code=$?; rm -f /tmp/aegis-client-settings.json; exit $code' ([PSCustomObject]@{ attributes = [PSCustomObject]$attributes } | ConvertTo-Json -Depth 4 -Compress) | Out-Null
    $check = ((Invoke-Idp '$K get clients/$CID -r indtrana-exercise') -join "`n" | ConvertFrom-Json).attributes
    if ($check.'pkce.code.challenge.method' -ne 'S256' -or (([string]$check.'post.logout.redirect.uris') -split '##') -notcontains $IdpAppOrigin) { throw 'The web client settings did not read back as written.' }
  }
  Say 'Web client requires PKCE and sign-out returns to the app' $needClientSettings

  # 11. User administration service client (docs/USER_MANAGEMENT.md). A confidential client with only a service account:
  #     no browser sign-in, no password grant, no redirect address. Its service account holds exactly the realm-management
  #     roles view-users, query-users and manage-users, and none of the realm's default roles. IndTrana's API uses it (never the
  #     bootstrap administrator) to create, change, enable, disable and sign out accounts. Its secret is read inside the
  #     container and written only to the private user-admin.env file next to the other private files; it is never printed.
  $userAdminClient = 'indtrana-user-admin'
  $uaFind = 'UA=$($K get clients -r indtrana-exercise -q clientId=' + $userAdminClient + ' --fields id --format csv --noquotes | head -1); '
  $uaId = @(Invoke-Idp ($uaFind + 'echo UA_ID=$UA') | Where-Object { $_ -like 'UA_ID=*' })[0] -replace '^UA_ID=', ''
  $needUaClient = -not $uaId
  if ($needUaClient) {
    $definition = [PSCustomObject]@{
      clientId = $userAdminClient; name = 'IndTrana user administration'; protocol = 'openid-connect'; enabled = $true
      publicClient = $false; clientAuthenticatorType = 'client-secret'; serviceAccountsEnabled = $true
      standardFlowEnabled = $false; implicitFlowEnabled = $false; directAccessGrantsEnabled = $false; frontchannelLogout = $false
      redirectUris = @(); webOrigins = @()
      # The admin API reads the roles from the token, so the token must carry them; the account holds only the three.
      fullScopeAllowed = $true
      attributes = [PSCustomObject]@{ 'oauth2.device.authorization.grant.enabled' = 'false'; 'oidc.ciba.grant.enabled' = 'false' }
    }
    Invoke-Idp 'sed 1s/^\\xEF\\xBB\\xBF// > /tmp/aegis-user-admin.json; $K create clients -r indtrana-exercise -f /tmp/aegis-user-admin.json >/dev/null 2>&1; code=$?; rm -f /tmp/aegis-user-admin.json; exit $code' ($definition | ConvertTo-Json -Depth 4 -Compress) | Out-Null
  }
  Say 'User administration service client exists (no browser sign-in)' $needUaClient
  # Service-account roles: exactly the three user roles of realm-management; the default realm roles are removed.
  $uaUser = 'service-account-' + $userAdminClient
  $held = Invoke-Idp ('$K get-roles -r indtrana-exercise --uusername ' + $uaUser + ' --cclientid realm-management --format csv --fields name --noquotes; echo ROLES_END; $K get-roles -r indtrana-exercise --uusername ' + $uaUser + ' --format csv --fields name --noquotes')
  $split = [array]::IndexOf($held, 'ROLES_END')
  $clientHeld = @($held[0..([Math]::Max(0, $split - 1))] | Where-Object { $_ -and $_ -ne 'ROLES_END' })
  if ($split -eq 0) { $clientHeld = @() }
  $realmHeld = @($held[($split + 1)..($held.Count)] | Where-Object { $_ })
  $wantedUa = @('view-users', 'query-users', 'manage-users')
  $missingUa = @($wantedUa | Where-Object { $clientHeld -notcontains $_ })
  $extraUa = @($clientHeld | Where-Object { $wantedUa -notcontains $_ })
  $needUaRoles = $missingUa.Count -gt 0 -or $extraUa.Count -gt 0 -or $realmHeld.Count -gt 0
  if ($needUaRoles) {
    $script = ''
    if ($missingUa.Count -gt 0) { $script += '$K add-roles -r indtrana-exercise --uusername ' + $uaUser + ' --cclientid realm-management' + (($missingUa | ForEach-Object { ' --rolename ' + $_ }) -join '') + ' >/dev/null || exit 1; ' }
    if ($extraUa.Count -gt 0) { $script += '$K remove-roles -r indtrana-exercise --uusername ' + $uaUser + ' --cclientid realm-management' + (($extraUa | ForEach-Object { ' --rolename ' + $_ }) -join '') + ' >/dev/null || exit 1; ' }
    if ($realmHeld.Count -gt 0) { $script += '$K remove-roles -r indtrana-exercise --uusername ' + $uaUser + (($realmHeld | ForEach-Object { ' --rolename ' + $_ }) -join '') + ' >/dev/null || exit 1; ' }
    Invoke-Idp $script | Out-Null
  }
  Say 'Service client holds only view-, query- and manage-users' $needUaRoles
  # The secret goes straight from the provider into the private file; it is compared, never shown.
  $secretJson = (Invoke-Idp ($uaFind + '$K get clients/$UA/client-secret -r indtrana-exercise')) -join "`n" | ConvertFrom-Json
  $secret = [string]$secretJson.value
  if ($secret -notmatch '^[A-Za-z0-9_-]{16,128}$') { throw 'The user administration client secret could not be read. Nothing was written.' }
  $envFile = Join-Path $env:LOCALAPPDATA 'AEGIS\local-idp\user-admin.env'
  $line = 'AEGIS_USER_ADMIN_CLIENT_SECRET=' + $secret
  $current = if (Test-Path $envFile -PathType Leaf) { [IO.File]::ReadAllText($envFile).Trim() } else { '' }
  $needEnv = $current -ne $line
  if ($needEnv) { [IO.File]::WriteAllText($envFile, $line + "`n", (New-Object Text.UTF8Encoding($false))) }
  $secret = $null; $line = $null; $current = $null; $secretJson = $null
  Say 'Private user-admin.env holds the service client secret' $needEnv
  if ($needEnv) { Write-Host 'Restart IndTrana (aegis.cmd start) so the API reads the new private file. The secret was not printed.' }
  Write-Host 'Done. Sign out and in again to pick up the changes.'
}
