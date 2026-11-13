# Local sign-in provider address (IndTrana)

The local exercise sign-in provider is reached at **`https://indtrana-idp.localhost:8443/realms/indtrana-exercise`**, and
the web app signs in as the public client **`indtrana-local-web`**. Port 8443 is unchanged. Installs made before
13 November 2026 used `aegis-idp.localhost`, realm `aegis-exercise` and client `aegis-local-web`.

## Moving an older install (Windows)

`aegis.cmd start` and `aegis.cmd doctor` notice an install that still uses the old realm and **ask once** before
moving it (moving stops the provider briefly and signs everyone out). With `-Ci` they never move it; they print the
command instead. If an automatic attempt fails, or after a rollback, they write the hold marker
`%LOCALAPPDATA%\AEGIS\local-idp\address-migration.hold` and stop trying until you run the script yourself (a
successful run removes the marker). By hand:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -SignIn   # the provider must be running
powershell -ExecutionPolicy Bypass -File .\scripts\migrate-local-idp-address.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -SignIn   # the app picks up the new address
```

What the script does, in order, under the single-operation lease:

1. Lists the account ids in the old realm (ids only). It reads one page of up to 1000 accounts and stops with no
   change above 999, because the before/after comparison would be incomplete.
2. Backs up to `%LOCALAPPDATA%\AEGIS\local-idp-backups\<date-time>\`: the provider data volume (provider stopped for
   a consistent copy), the HTTPS proxy volume and the five private files (`provider.env`, `app.env`, `realm.json`,
   `root.crt`, `api-ca-bundle.pem`). Each archive is verified: `tar` must read it completely on its own, the provider's
   database file `h2/keycloakdb.mv.db` (or the proxy's `caddy/pki/authorities/local/root.crt`) must be listed, and the
   entry count must equal the number of files in the volume. Any failure stops the run before anything is changed.
3. Updates the realm and client names in the private `realm.json` first (exact names only; nothing is printed), then
   renames the realm and the web client **in place** with the provider's admin tool and points the role-claim mapper at
   the renamed client. Accounts, their ids, passwords, roles and attributes are untouched; nothing is deleted or
   re-imported. If a run is interrupted between the file update and the rename, the next run notices the mismatch and
   puts the file back before starting again.
4. Checks that the account ids before and after are identical, and (read-only, no sign-in, no token) that the web
   client still has the mapper that signs its client roles into the access token as `aegis_roles`.

If any rename step fails it restores the backup at once and stops, reporting both the original error and, if the
restore also failed, that error and the backup folder. Run it again at any time: an install already on the new address
prints `already migrated` and changes nothing.

**Certificate.** The HTTPS proxy issues the certificate for the new host from the same local root it already holds,
so a Windows account that trusted `root.crt` keeps trusting it. No new trust step is needed.

**Sessions.** The token issuer changes, so everyone is signed out and signs in again.

## The backups hold secrets: delete them once you are satisfied

Each backup folder contains the provider database (account password hashes), `provider.env` (the provider's
bootstrap administrator password), `app.env` (the web session key), the proxy volume including the **local
certificate authority's private key**, and the exercise account passwords in `realm.json`. The script restricts every
backup folder to your Windows account only (inheritance off, no other user or group). Nothing deletes them
automatically. Once sign-in works and you no longer need a way back, delete them:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\AEGIS\local-idp-backups"
```

## Rolling back

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\migrate-local-idp-address.ps1 -Rollback -Backup "<backup folder>"
powershell -ExecutionPolicy Bypass -File .\scripts\migrate-local-idp-address.ps1 -Rollback   # shows the newest backup and asks you to type its time stamp
```

A rollback replaces the provider's current accounts and passwords with those in the backup, so anything changed since
is lost; that is why it needs the folder named or the time stamp typed. It first takes a safety backup of the current
state (`<date-time>-before-rollback`), checks the chosen archives, extracts each one beside the live data and swaps it
in only after a complete extract, restores the private files, restarts both containers even if a step failed, and
writes the hold marker so `aegis.cmd` does not move the address again by itself. The old address only works with code
that still uses it (a commit before this change).

## macOS and Linux

`./aegis.sh` gives fresh installs the new names from the start. If it finds an install that still uses the old
realm, it stops with an instruction and changes nothing; move that install with the Windows script or by the same
steps by hand (back up the provider data volume with the provider stopped, then `kcadm.sh update realms/aegis-exercise
-s realm=indtrana-exercise`, `kcadm.sh update clients/<id> -r indtrana-exercise -s clientId=indtrana-local-web`, update
the `signed-app-roles` mapper's `usermodel.clientRoleMapping.clientId`, and the two names in the private `realm.json`).
