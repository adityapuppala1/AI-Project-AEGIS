# Shared Windows local-operation guard. No credentials, process killing or DB resets.
function Get-AegisOperationLockPath {
  $directory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'AEGIS'
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  return (Join-Path $directory 'local-operation.lock')
}

function Invoke-AegisLocalOperation([string]$Name, [scriptblock]$Action) {
  $lease = $null
  try {
    try {
      # Exclusive OS handle; crash/exit releases it. Never delete a live lock file.
      $lease = [IO.File]::Open((Get-AegisOperationLockPath), [IO.FileMode]::OpenOrCreate,
        [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch [IO.IOException] {
      throw 'Another AEGIS local operation is active. Wait for it to finish; do not launch a second build/start/test job.'
    }
    Write-Host "AEGIS single-operation guard: $Name"
    & $Action
  } finally {
    if ($null -ne $lease) { $lease.Dispose() }
  }
}

function Get-AegisRuntimeContainers {
  $lines = @(& docker ps --format '{{json .}}')
  if ($LASTEXITCODE -ne 0) { throw 'Docker runtime inventory failed; no startup or cleanup attempted.' }
  foreach ($line in $lines) {
    if (-not $line) { continue }
    $item = $line | ConvertFrom-Json
    $labels = @{}
    foreach ($pair in ($item.Labels -split ',')) {
      $parts = $pair -split '=', 2
      if ($parts.Count -eq 2) { $labels[$parts[0]] = $parts[1] }
    }
    $directory = $labels['com.docker.compose.project.working_dir']
    $project = $labels['com.docker.compose.project']
    if ($project -eq 'ai-project-aegis' -or $directory -match '(^|[\\/])AI-Project-AEGIS([\\/])?$' -or
        $item.Image -match '^ai-project-aegis-(api|web)(:|$)') {
      [PSCustomObject]@{
        Id = $item.ID; Name = $item.Names; Project = $project
        Service = $labels['com.docker.compose.service']; WorkingDirectory = $directory
        OneOff = ($labels['com.docker.compose.oneoff'] -eq 'True')
      }
    }
  }
}

function Test-AegisRuntimeInventory([object[]]$Containers, [string]$Root, [switch]$RequireRunning) {
  foreach ($item in $Containers) {
    if ($item.Project -ne 'ai-project-aegis') {
      throw "Another AEGIS Compose project is running: $($item.Name). Inspect ownership before stopping it."
    }
    if (-not $item.WorkingDirectory -or
        [IO.Path]::GetFullPath($item.WorkingDirectory).TrimEnd([char[]]'\/') -ne
        [IO.Path]::GetFullPath($Root).TrimEnd([char[]]'\/')) {
      throw "AEGIS container belongs to another checkout: $($item.Name). Refusing to take over its project/volume."
    }
    if ($item.OneOff) { throw "An AEGIS one-off job is active: $($item.Name). Wait for it to finish." }
  }
  foreach ($role in @('api', 'web', 'db', 'migrate', 'seed')) {
    $count = @($Containers | Where-Object { $_.Service -eq $role }).Count
    if ($count -gt 1) { throw "Duplicate AEGIS service '$role': $count running containers. Inspect and stop only confirmed duplicates." }
    if ($role -in @('api', 'web', 'db') -and $RequireRunning -and $count -ne 1) {
      throw "Expected exactly one running AEGIS '$role'; found $count."
    }
  }
}

function Assert-AegisSingleRuntime([switch]$RequireRunning) {
  if ($env:COMPOSE_PROJECT_NAME -and $env:COMPOSE_PROJECT_NAME -ne 'ai-project-aegis') {
    throw 'COMPOSE_PROJECT_NAME must be ai-project-aegis. Refusing to create a second stack.'
  }
  if ($env:COMPOSE_FILE) { throw 'Unset COMPOSE_FILE; use the reviewed startup profile flags instead.' }
  $root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $containers = @(Get-AegisRuntimeContainers)
  Test-AegisRuntimeInventory -Containers $containers -Root $root -RequireRunning:$RequireRunning
  if ($env:OS -eq 'Windows_NT') {
    # Only classify explicitly owned server commands. Never print raw command
    # lines (which may contain secrets) or kill all node/python processes.
    $native = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      $_.ProcessId -ne $PID -and $_.Name -match '^(node|python|pythonw)(\.exe)?$' -and
      $_.CommandLine -and $_.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
      $_.CommandLine -match 'uvicorn|next-server|next[\\/].*bin[\\/]next|server\.js'
    })
    if ($native.Count -gt 0) {
      throw "Native AEGIS server process detected (PID $($native.ProcessId -join ',')). Use one Compose stack; inspect before stopping."
    }
    foreach ($portRole in @(@(3000, 'web'), @(8000, 'api'))) {
      $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $portRole[0] -ErrorAction SilentlyContinue)
      if ($listeners.Count -gt 0 -and @($containers | Where-Object { $_.Service -eq $portRole[1] }).Count -eq 0) {
        throw "Port $($portRole[0]) is occupied without its AEGIS container. Refusing a competing service; inspect its owner."
      }
    }
  }
  foreach ($item in $containers) { Write-Host "AEGIS running: $($item.Service) / $($item.Name)" }
  Write-Host 'PASS: no duplicate AEGIS core service or conflicting managed job detected.'
}
