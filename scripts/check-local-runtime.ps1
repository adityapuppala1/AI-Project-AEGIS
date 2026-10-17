param([switch]$RequireRunning)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-runtime-common.ps1')
Invoke-AegisLocalOperation -Name 'runtime inventory' -Action {
  Assert-AegisSingleRuntime -RequireRunning:$RequireRunning
}
