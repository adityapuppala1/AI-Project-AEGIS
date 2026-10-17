# No Pester/install or Docker mutation. Execute separately, not inside a held lease.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../local-runtime-common.ps1')
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
function Expect-Failure([scriptblock]$Action, [string]$Pattern) {
  try { & $Action } catch {
    if ($_.Exception.Message -notmatch $Pattern) { throw }
    return
  }
  throw "Expected refusal: $Pattern"
}
function Fixture([string]$Role, [string]$Name) {
  return [PSCustomObject]@{ Service=$Role; Name=$Name; Project='ai-project-aegis'; WorkingDirectory=$root; OneOff=$false }
}
$healthy = @((Fixture 'api' 'api-1'), (Fixture 'web' 'web-1'), (Fixture 'db' 'db-1'))
Test-AegisRuntimeInventory -Containers $healthy -Root $root -RequireRunning
Expect-Failure { Test-AegisRuntimeInventory -Containers @($healthy + (Fixture 'api' 'api-2')) -Root $root } 'Duplicate AEGIS'
Expect-Failure { Test-AegisRuntimeInventory -Containers @() -Root $root -RequireRunning } 'exactly one'
$other = Fixture 'api' 'other-project-api'
$other.Project = 'another-aegis'
Expect-Failure { Test-AegisRuntimeInventory -Containers @($other) -Root $root } 'Another AEGIS'
$other.Project = 'ai-project-aegis'
$other.WorkingDirectory = Join-Path $root 'another-checkout'
Expect-Failure { Test-AegisRuntimeInventory -Containers @($other) -Root $root } 'another checkout'
$job = Fixture 'api' 'verification-job'
$job.OneOff = $true
Expect-Failure { Test-AegisRuntimeInventory -Containers @($job) -Root $root } 'one-off job'
Write-Host 'PASS: healthy, duplicate, missing, project, checkout and active-job inventory cases'
$ownedJob = [PSCustomObject]@{Name='docker-compose.exe'; CommandLine='docker-compose --project-name ai-project-aegis up -d'}
if (-not (Test-AegisComposeOperation -Process $ownedJob -Root $root)) { throw 'Owned Compose job missed' }
$ownedJob.CommandLine = 'docker-compose --project-name unrelated up -d'
if (Test-AegisComposeOperation -Process $ownedJob -Root $root) { throw 'Unrelated Compose job misclassified' }
$ownedJob.CommandLine = 'docker-compose --project-name ai-project-aegis ps'
if (Test-AegisComposeOperation -Process $ownedJob -Root $root) { throw 'Read-only inspection misclassified' }
Write-Host 'PASS: owned mutating Compose job recognition; unrelated/read-only commands excluded'

# A second OS process must be refused while the first owns the actual lock.
# Validate exception cleanup too; no stale-file deletion or PID guessing.
$temp = Join-Path ([IO.Path]::GetTempPath()) ('aegis-lock-test-' + [Guid]::NewGuid())
[IO.Directory]::CreateDirectory($temp) | Out-Null
$child = Join-Path $temp 'contender.ps1'
$common = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../local-runtime-common.ps1')).Replace("'", "''")
[IO.File]::WriteAllText($child, @"
`$ErrorActionPreference = 'Stop'
. '$common'
try {
  Invoke-AegisLocalOperation -Name 'test contender' -Action { throw 'UNEXPECTED_ACQUIRE' }
  exit 12
} catch {
  if (`$_.Exception.Message -match 'Another AEGIS local operation') { exit 23 }
  Write-Error 'Unexpected lock-test result'
  exit 24
}
"@)
$shell = (Get-Process -Id $PID).Path
try {
  Invoke-AegisLocalOperation -Name 'lock contention regression' -Action {
    & $shell -NoProfile -File $child
    if ($LASTEXITCODE -ne 23) { throw "Contender was not refused: $LASTEXITCODE" }
  }
  Expect-Failure { Invoke-AegisLocalOperation -Name 'exception regression' -Action { throw 'EXPECTED_TEST_FAILURE' } } 'EXPECTED_TEST_FAILURE'
  Invoke-AegisLocalOperation -Name 'lock recovery regression' -Action { Write-Host 'PASS: cross-process exclusion and exception recovery' }
} finally {
  Remove-Item -LiteralPath $child -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temp -ErrorAction SilentlyContinue
}
