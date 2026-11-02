# Preparation only: never starts containers or modifies certificate trust.
param([switch]$GenerateLocalSecrets)
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not $GenerateLocalSecrets) {
  Write-Output 'Review docs/LOCAL_IDP_REVIEW.md. Use -GenerateLocalSecrets only to create private, untracked local files.'
  exit 0
}
$destination = Join-Path $env:LOCALAPPDATA 'AEGIS/local-idp'
if ((Test-Path (Join-Path $destination 'provider.env')) -or (Test-Path (Join-Path $destination 'app.env')) -or (Test-Path (Join-Path $destination 'realm.json'))) {
  throw 'Existing identity configuration found. Nothing was overwritten.'
}
function New-LocalSecret([int]$Count) {
  $bytes = New-Object byte[] $Count
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes)
}
New-Item -ItemType Directory -Force $destination | Out-Null
$makerPassword = New-LocalSecret 32
$checkerPassword = New-LocalSecret 32
$adminPassword = New-LocalSecret 32
$provider = @(
  'KC_BOOTSTRAP_ADMIN_USERNAME=aegis-local-bootstrap',
  ('KC_BOOTSTRAP_ADMIN_PASSWORD=' + (New-LocalSecret 32)),
  ('AEGIS_MAKER_PASSWORD=' + $makerPassword),
  ('AEGIS_CHECKER_PASSWORD=' + $checkerPassword),
  ('AEGIS_ADMIN_PASSWORD=' + $adminPassword)
)
$app = @(('AEGIS_LOCAL_IDP_PRIVATE_DIR=' + $destination.Replace('\','/')), 'APP_ORIGIN=http://localhost:3000', ('BFF_SESSION_KEY_BASE64=' + (New-LocalSecret 32)))
# Render the private realm explicitly; never rely on provider placeholder substitution.
$realm = Get-Content (Join-Path $repo 'ops/local-idp/realm.json') -Raw | ConvertFrom-Json
foreach ($operator in $realm.users) {
  if ($operator.username -eq 'exercise-maker') { $operator.credentials[0].value = $makerPassword }
  elseif ($operator.username -eq 'exercise-checker') { $operator.credentials[0].value = $checkerPassword }
  elseif ($operator.username -eq 'exercise-admin') { $operator.credentials[0].value = $adminPassword }
  else { throw 'Unexpected realm account; no credentials files were written.' }
}
[IO.File]::WriteAllText((Join-Path $destination 'realm.json'), ($realm | ConvertTo-Json -Depth 32), [Text.Encoding]::UTF8)
[IO.File]::WriteAllLines((Join-Path $destination 'provider.env'), $provider, [Text.Encoding]::ASCII)
[IO.File]::WriteAllLines((Join-Path $destination 'app.env'), $app, [Text.Encoding]::ASCII)
Write-Output 'Private files created under your LocalAppData/AEGIS/local-idp directory, outside the XAMPP web root. Contents were not printed. No provider, account, login or trust change has been activated.'
