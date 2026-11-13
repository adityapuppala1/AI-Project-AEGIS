# Recovery drill: back up the running IndTrana database, restore it into a separate throwaway database, run the
# schema audits against the copy, compare row counts, then drop only the throwaway database.
# The application database and its volume are only read. The backup file is kept under .git/backups/ (untracked).
#   powershell -ExecutionPolicy Bypass -File .\scripts\verify-backup-restore.ps1
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "local-runtime-common.ps1")
Invoke-AegisLocalOperation -Name "verify-backup-restore.ps1" -Action {
  Assert-AegisSingleRuntime -RequireRunning
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
  $stamp = Get-Date -Format yyyyMMddHHmmss
  $drill = "aegis_restore_drill_$stamp"
  $compose = @("compose", "--project-name", "ai-project-aegis", "-f", "compose.yaml")
  $backup = ".git/backups/aegis-$stamp.dump"
  $failures = @()
  function Step([string]$Name, [bool]$Ok) {
    if ($Ok) { Write-Host "PASS: $Name" -ForegroundColor Green } else { $script:failures += $Name; Write-Host "FAIL: $Name" -ForegroundColor Red }
  }
  New-Item -ItemType Directory -Force .git/backups | Out-Null
  $created = $false
  try {
    docker @compose exec -T db sh -c "pg_dump -U aegis -Fc -d aegis -f /tmp/backup.dump"
    Step "pg_dump of the running database" ($LASTEXITCODE -eq 0)
    docker @compose cp db:/tmp/backup.dump $backup | Out-Null
    Step "backup copied to $backup" ($LASTEXITCODE -eq 0 -and (Test-Path $backup) -and (Get-Item $backup).Length -gt 1024)

    docker @compose exec -T db psql -U aegis -d aegis -v ON_ERROR_STOP=1 -c "CREATE DATABASE $drill" | Out-Null
    $created = ($LASTEXITCODE -eq 0)
    Step "separate drill database $drill created" $created
    if ($created) {
      docker @compose exec -T db pg_restore -U aegis -d $drill --exit-on-error --no-owner --no-privileges /tmp/backup.dump
      Step "pg_restore into the drill database" ($LASTEXITCODE -eq 0)
      docker @compose run --rm --no-deps -T -e "DATABASE_URL=postgresql://aegis:aegis_local_only@db:5432/$drill" api sh -c "python -m app.doctor && python -m app.migration_audit" | Out-Null
      Step "doctor and migration audit pass on the restored copy" ($LASTEXITCODE -eq 0)
      $query = "SELECT (SELECT count(*) FROM incidents)||'/'||(SELECT count(*) FROM exercise_data_sources)||'/'||(SELECT count(*) FROM exercise_agency_tasks)||'/'||(SELECT count(*) FROM exercise_agency_task_events)"
      $original = (docker @compose exec -T db psql -U aegis -d aegis -At -c $query).Trim()
      $restored = (docker @compose exec -T db psql -U aegis -d $drill -At -c $query).Trim()
      Write-Host "INFO: incidents/sources/tasks/task events original=$original restored=$restored"
      Step "restored row counts equal the original" ($original -eq $restored -and $original.Length -gt 0)
    }
  } finally {
    if ($created) {
      docker @compose exec -T db psql -U aegis -d aegis -c "DROP DATABASE $drill" | Out-Null
      Step "throwaway database dropped (only $drill)" ($LASTEXITCODE -eq 0)
    }
  }
  if ($failures.Count -gt 0) { Write-Host "RECOVERY DRILL FAILED ($($failures.Count) step(s))" -ForegroundColor Red; exit 1 }
  Write-Host "RECOVERY DRILL PASSED. Backup kept at $backup; the application database was not modified." -ForegroundColor Green
}
