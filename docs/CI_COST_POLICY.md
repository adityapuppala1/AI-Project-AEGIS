# AEGIS — GitHub Actions budget-first policy

**Milestone:** `chore/opt-in-ci-and-gates` · **Mode:** synthetic-only developer project.

## No automatic CI on routine work

CI is no longer triggered by creating, updating or marking a pull request
ready for review. There are **no** `push` triggers. The workflow now responds
only when you deliberately add one of these PR labels:

| PR label | Jobs launched | Relative cost |
|---|---|---|
| `ci:api` | Python unit tests, model-report reproducibility, Compose config | Low |
| `ci:web` | TypeScript typecheck and Next.js production build | Medium |
| `ci:all` | Both jobs above | Higher |

Remove and reapply the same label if you want another run. Labels are
manual opt-in triggers, not automated review requirements. **Do not add any
of them unless a failing local test, release gate or final review justifies
a GitHub Actions run.**

The manual Actions workflow also supports `suite=api|web|all` and a
separate `run_compose=true` switch for **expensive** full Docker integration.
GitHub's `workflow_dispatch` UI generally requires the workflow to be on
the repository default branch; until the CI policy is merged to `main`,
the PR labels are the deliberate trigger supported on this feature stack.
No automatic full Docker builds are enabled.

## Check locally first on Windows

From your local AEGIS repository (with dependencies already installed):

```powershell
git fetch origin
git switch chore/opt-in-ci-and-gates
powershell -ExecutionPolicy Bypass -File .\scripts\verify-code-local.ps1 -Suite api
powershell -ExecutionPolicy Bypass -File .\scripts\verify-code-local.ps1 -Suite web
```

To verify the frontend production build intentionally:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-code-local.ps1 -Suite web -ProductionBuild
```

The script does **not** install dependencies, reset databases, execute
Docker containers, deploy clouds, send alerts or trigger any GitHub workflow.
It optionally validates the local Compose manifest if Docker CLI exists.

Before the first API check install Python dependencies locally from
`services/api/requirements.txt`. Before a web check run
`npm ci --no-audit --no-fund` once inside `apps/web`.

The full database smoke remains separate and nondestructive:
`scripts/verify-windows.ps1`, which requires the local Compose stack running.
Those checks are not replaced by static Python/npm validation.

## Cost and safety constraints

- Never spend CI minutes on every intermediate commit or documentation edit.
- Prefer local API unit tests and TypeScript typechecks during development.
- Prefer one `ci:api` or `ci:web` label per relevant change.
- Use `ci:all` only before consolidated review; full Docker only for
  a decisive release gate with a disposable CI volume.
- Draft PRs remain unmerged unless the user authorizes an actual merge.
- The public exercise interfaces remain synthetic only, with no real
  flood forecasts or live emergency dispatch.
