# One local IndTrana stack and one managed operation

Use the existing Compose project **`ai-project-aegis`**. `compose.yaml` now pins
that name, preserving the current `ai-project-aegis_pgdata` volume. Do not use
another project name, replicas, another checkout or a native `next`/`uvicorn`
server alongside it. The intended long-running core is one API, one web and
one PostgreSQL container. Completed migrate/seed containers are not running
duplicates. An explicitly invoked ephemeral pytest container is a verification
job, not another listening API service.

On Windows, from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-local-runtime.ps1 -RequireRunning
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-windows.ps1 -NoBuild
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-code-local.ps1 -Suite all
```

Omit `-NoBuild` when an image rebuild is needed. Use `-LocalCopilot` only to
retain/select the reviewed optional local-model API profile; this flag does not
launch a model runtime or download weights. The IdP/trust setup stays inactive.
`stop-windows.ps1` now uses `docker compose stop`: it retains containers and
volumes and never resets the database.

Startup, stop, native verification, Windows smoke/security checks and replay
helpers share one exclusive OS file handle at
`%LOCALAPPDATA%\AEGIS\local-operation.lock`. A competing managed operation fails
immediately. Exception/normal process exit releases the handle; the file may
remain and must not be deleted to bypass a live owner. It coordinates processes
for the same Windows account across repository copies. It is not a global
multi-user service manager or a job queue.

Custom build/database/benchmark/browser batches must hold the same lease:

```powershell
. .\scripts\local-runtime-common.ps1
Invoke-AegisLocalOperation -Name 'local verification batch' -Action {
  Assert-AegisSingleRuntime -RequireRunning
  # Run the single intended command/batch here; check every native exit code.
}
```

Run the lock regression **separately**, outside any held lease:
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/test-local-runtime.ps1`.
It tests real cross-process exclusion and exception recovery, plus inventory
refusal cases; it starts/stops no services and changes no database data.

Preflight recognizes IndTrana by its canonical project, checkout directory name or
API/web image name. It inspects running Docker metadata, rejects duplicate core services,
active IndTrana one-off jobs, conflicting IndTrana Compose projects and containers
owned by another checkout. Windows also checks explicitly repo-owned native
server commands and ports 3000/8000 occupied without their managed container.
It does not print raw process arguments, environment values or credentials.
Unknown port owners and ambiguous processes cause refusal, not automatic kills.

If duplicates are found, inspect container labels, checkout, command identity,
port ownership and any active operation first. Stop only the confirmed extra
IndTrana container/PID and recheck. Never stop Docker Desktop, shared Ollama,
unrelated applications, every node/python process, or remove volumes as cleanup.
One Node server may have several worker/helper processes; that alone does not
prove duplicate application instances.

These restrictions govern the supplied Windows helpers and documented agent
workflow. Direct Docker/npm/python commands can bypass them; they are not an
OS security boundary. If a parent is forcibly killed, inspect for surviving
children/builds before restarting. On Linux, inspect Compose/process state and
run sequentially; PowerShell helpers were verified on Windows, not claimed as
a Linux-wide supervisor. Actual laptop inventory, tests, branch and source are
recorded in [the handoff](LOCAL_DEMO_HANDOFF.md).
