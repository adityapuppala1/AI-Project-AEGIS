# Release process

How a version of IndTrana is cut in this repository. A release is a local, synthetic-exercise milestone: it marks a
commit on the integration branch, not a deployment. Nothing here triggers GitHub Actions (pushes do not run them in
this repository, see [CI_COST_POLICY.md](CI_COST_POLICY.md)), and nothing here allows a force-push or a merge to `main`
without the owner's explicit instruction.

## Where the version lives

- **One source:** `"version"` in `apps/web/package.json`. `apps/web/lib/version.ts` imports it, so the sidebar footer, the
  What's new page and the account menu marker cannot disagree. Do not write a version number anywhere else in the interface.
- `apps/web/lib/version.ts` shows `NEXT_PUBLIC_APP_VERSION`, which `apps/web/next.config.ts` copies from `package.json` at
  build time (so the dependency list is never sent to the browser), and has a `FALLBACK_VERSION` constant for tests and
  tooling. Bump that constant too; `release-notes.test.cjs` fails if it differs from `package.json`.
- `apps/web/package-lock.json` has two copies of the project's own version (the top `version` and `packages[""].version`).
  Change those two by hand to match. Do not run `npm install` for a release.
- The API (`services/api/app/main.py`, FastAPI `version`) has its own number, `0.1.0`, which is not the product version and is
  left alone unless an API-only change needs it.

## History

0.3.0 is the first tagged release. `package.json` said 0.2.0 from the first commit and no tag existed, so 0.1.0 and 0.2.0 in
`lib/release-notes.ts` and `CHANGELOG.md` are marked `tagged: false` and carry a period instead of a release date. A new
release has `tagged: true` and an ISO `date`, and is tagged in step 7. Do not add tags for the earlier versions.

## Tours and the browser

Tour flags are per browser, not per account, by design: no identity is stored. A second role signing in on the same browser
therefore does not get the automatic Welcome tour (it starts at most once per browser) and uses **Restart welcome tour** in the
account menu. A dialog that opens during a tour sits behind the tour until the tour is closed with Skip tour or Escape.

## What every user-visible change carries

In the same commit as the change:

1. An entry in `apps/web/lib/release-notes.ts` (plain, end-user wording, grouped as New, Improved, Fixed or Security; no commit
   hashes; no claim of real warnings, dispatch or forecast accuracy).
2. An entry in `CHANGELOG.md` (developer wording, may link docs), under the same version heading.
3. For a new page or tab: a tour in `apps/web/lib/tours.ts` and the `data-tour` hooks it points at.
4. If interface text was added: `node scripts/list-pending-translations.cjs` from `apps/web` to refresh
   `lib/translations-pending.ts` (never machine-translate).

## Cutting a version

1. Pick the number (0.x while the product is an exercise: minor for new features, patch for fixes only).
2. Bump `apps/web/package.json` and the two fields in `apps/web/package-lock.json`.
3. Add the release at the top of `RELEASES` in `apps/web/lib/release-notes.ts` (newest first, ISO date, one-line summary,
   at least one item) and a `## [X.Y.Z] - YYYY-MM-DD` section at the top of `CHANGELOG.md`, plus its link line at the bottom.
4. Update `docs/LOCAL_DEMO_HANDOFF.md` with the round, the commands you ran and their results, the branch and the SHA. Mark a
   check verified only after it was executed, and say whether it ran on the Windows laptop or a Linux runner.
5. Run the checks (Windows, from the repository root, one IndTrana operation at a time):

   ```powershell
   . .\scripts\local-runtime-common.ps1
   Invoke-AegisLocalOperation -Name 'release-checks' -Action {
     Assert-AegisSingleRuntime -RequireRunning | Out-Null
     Set-Location apps\web
     npm run typecheck
     node --test (Get-ChildItem scripts\tests\*.test.cjs | % FullName)
   }
   ```

   `tours.test.cjs` and `release-notes.test.cjs` are part of that run: the newest release must equal `package.json`, versions
   must descend, every version needs a `CHANGELOG.md` heading, every page and tab needs a tour whose targets exist, and the
   copy must make no forbidden claim. Also run the API checks (`python -m pytest -q`, `python -m app.model_lab --check` in
   `services/api`) and `npm run build` when interface code changed.
6. Commit everything for the release together. Message form: `release: vX.Y.Z` followed by a one-line summary.
7. Tag the release commit with an annotated tag: `git tag -a vX.Y.Z -m "IndTrana vX.Y.Z"` (on that commit, not later).
8. Push the branch and the tag: `git push origin <branch>` then `git push origin vX.Y.Z`. No force, no `--tags` sweep of
   unrelated tags, no merge of `main`.

## Fixing a mistake after tagging

Do not move or delete a pushed tag and do not force-push. Make a new commit that corrects it and release the next patch
version with its own entry.

## Related

- [LOCAL_DEMO_HANDOFF.md](LOCAL_DEMO_HANDOFF.md): status, commands and results per round.
- [../CHANGELOG.md](../CHANGELOG.md): the developer-facing history.
- The signed-in What's new page (`/whats-new`): the user-facing history.
