# Install AEGIS and load the demo data (Windows)

This is the one place that describes a first install from a fresh clone. It replaces the scattered start-up notes in
the README and is linked from there. Everything runs on one laptop in Docker. It is a **synthetic exercise**: no real
warnings, no dispatch, no real agency data.

Time needed: about 20 minutes, most of it the first Docker build.

## Quickest way: one command

From the cloned folder, double-click `aegis.cmd` and choose **Install**, or run `aegis.cmd install`. It performs steps 1
to 5 below for you (Git and Docker Desktop through winget if missing, `.env`, connector key, private sign-in files,
certificate copy and one Windows confirmation box to trust it, start with `-SignIn -PublicEarth -Proactive`,
`update-local-idp.ps1`, `new-demo-accounts.ps1`). Afterwards use `aegis.cmd start`, `stop`, `status` and `doctor`.
macOS and Linux use `./aegis.sh install`. Ports, repairs and other systems: [DEPLOYMENT.md](DEPLOYMENT.md). The manual
steps below remain valid and are what the installer runs.

## What you need

- Windows 10 or 11 with [Docker Desktop](https://www.docker.com/products/docker-desktop/) (WSL2 backend) running.
- Git and PowerShell (built in).
- About 6 GB of free memory for Docker, and ports 3000, 8000 and 8443 free on the laptop.
- Nothing else. Node.js and Python are only needed if you want to run the code checks.

## Step 1: get the code

```powershell
git clone https://github.com/adityapuppala1/AI-Project-AEGIS.git
cd AI-Project-AEGIS
Copy-Item .env.example .env
```

`.env` holds local-only values and is never committed.

## Step 2: start the app (this also loads the demo data)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1
```

This builds the web and API images and starts the database. **The demo data is loaded automatically on this first
start.** You do not run a separate import. See "What the demo data contains" below.

Open http://localhost:3000. You should see the landing page. Every other page asks you to sign in, so continue with
steps 3 to 5.

## Step 3: create the private sign-in files

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-local-idp.ps1 -GenerateLocalSecrets
```

This writes generated secrets to `%LOCALAPPDATA%\AEGIS\local-idp`, outside the repository. Nothing is printed. It
refuses to overwrite files that already exist.

## Step 4: switch on local sign-in (one time)

AEGIS never handles passwords itself. Locally, a Keycloak container plays the part of the agency's identity provider,
behind a small HTTPS proxy. Run these lines one at a time in the same PowerShell window, from the repository folder.

```powershell
$idp = Join-Path $env:LOCALAPPDATA 'AEGIS\local-idp'
$env:AEGIS_LOCAL_IDP_PRIVATE_DIR = $idp
$c = @('--project-name','ai-project-aegis','--env-file','.env','--env-file',"$idp\app.env",'-f','compose.yaml','-f','compose.local-idp.yaml','--profile','local-idp')

# 4a. Start only the identity provider and its HTTPS proxy. Wait about one minute after this.
docker compose @c up -d local-idp local-idp-tls

# 4b. Copy the proxy's public certificate out (the private key stays inside Docker).
docker compose @c cp local-idp-tls:/data/caddy/pki/authorities/local/root.crt "$idp\root.crt"

# 4c. Let this Windows account's browsers trust that local certificate. Windows shows a confirmation box: choose Yes.
Import-Certificate -FilePath "$idp\root.crt" -CertStoreLocation Cert:\CurrentUser\Root

# 4d. Let the API trust it too (its normal certificate list plus this one).
$roots = docker compose @c exec -T api cat /etc/ssl/certs/ca-certificates.crt
[IO.File]::WriteAllText("$idp\api-ca-bundle.pem", (($roots -join "`n") + "`n" + [IO.File]::ReadAllText("$idp\root.crt")), [Text.Encoding]::ASCII)

# 4e. Restart the app with sign-in switched on.
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -SignIn -NoBuild
```

Notes:

- If 4b says the file does not exist, the proxy has not finished starting. Wait 30 seconds and run 4b again.
- Step 4c changes which HTTPS certificates this Windows account trusts. It is a certificate made on your own laptop
  for `aegis-idp.localhost` only. To undo it later, remove that one certificate ("Caddy Local Authority") from
  *Manage user certificates → Trusted Root Certification Authorities*. Firefox keeps its own list and may still warn.
- More background and the review notes: [LOCAL_IDP_REVIEW.md](LOCAL_IDP_REVIEW.md).

## Step 5: finish the identity provider setup and create the demo accounts

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-local-idp.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\new-demo-accounts.ps1
```

The first script gives the provider's sign-in pages the AEGIS look, sets 15-minute tokens and adds the department
and response-team roles. It is safe to run again, and it is also what brings an older install up to date. The second creates the accounts:

| Account | Shown in the app as | What it can do |
|---|---|---|
| `demo-maker` | Maker | Works cases, drafts proposals and submits them |
| `demo-checker` | Checker | Approves or rejects another person's proposal |
| `demo-auditor` | Auditor | Reads the audit trail |
| `demo-admin` | Administrator | Administration pages |
| `demo-dept-control` | Department desk (control room) | Opens the Department Inbox for that desk |
| `demo-dept-infra` | Department desk (infrastructure) | Opens the Department Inbox for that desk |
| `demo-team-rescue` | Response team (Synthetic rescue team 01) | Answers requests on My Team: accept, en route, on site, completed |
| `demo-team-medical` | Response team (Synthetic medical team 01) | Same, for the medical team |

The passwords are generated on your laptop and saved to
`%LOCALAPPDATA%\AEGIS\local-idp\demo-credentials.txt` (user name, password, role). Open that file in Notepad to read
them. They are never printed or committed. Running the script again leaves existing accounts unchanged.

All accounts belong to the one demo agency. The signed-in user's name and role are shown at the top right of every
page; the full list of what each role may do is under Administration, "Users and access". Accounts are created and
removed in the identity provider, never inside AEGIS.

## Step 6: sign in and look around

1. Open http://localhost:3000 and choose **Operator sign in**.
2. Sign in as `demo-maker`. You land on the Command Center.
3. Good places to start: **Guided exercise** (`/demo`), **Alert Journey** (story and Live Earth), **Approvals**.
4. To see the two-person approval, submit a proposal as `demo-maker`, sign out from the account menu (top right),
   then sign in as `demo-checker` and decide it. A maker can never approve their own proposal.

## What the demo data contains

Loaded into PostgreSQL by the `seed` step each time the stack starts (files in `db/`). Starting again does not
duplicate rows.

| File | Contents |
|---|---|
| `seed.sql` | The demo agency and two synthetic Hyderabad incidents |
| `seed_intelligence.sql` | Timeline events and evidence items for those incidents |
| `seed_sources.sql` | Two fictional data sources with sample readings |
| `seed_geospatial.sql` | Synthetic map assets |
| `seed_agency_sync.sql` | Scripted department tasks and their task events |
| `seed_exposure.sql` | Synthetic exposure features used by the impact and team planning pages |

All of it is invented for rehearsal. None of it is real incident, population or agency data.

Optional extra exercise data, safe to run any time (each adds a little synthetic data and deletes nothing):

```powershell
# Replay the bundled synthetic event feed into the ingestion pages
powershell -ExecutionPolicy Bypass -File .\scripts\replay-windows.ps1
# Add three fictional sensor readings for the tabletop scenario
powershell -ExecutionPolicy Bypass -File .\scripts\run-tabletop-windows.ps1 -ConfirmExercise
```

## Daily use

```powershell
# Start (after the one-time setup above)
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -SignIn -NoBuild
# Stop (data is kept)
powershell -ExecutionPolicy Bypass -File .\scripts\stop-windows.ps1
# Check that everything is up
powershell -ExecutionPolicy Bypass -File .\scripts\check-local-runtime.ps1 -RequireRunning
```

Leave out `-NoBuild` after pulling new code. Use the same switches every time you start, otherwise a feature you had
switched on is switched off again.

## Optional features (all off by default)

| Switch | Adds | Needs |
|---|---|---|
| `-PublicEarth` | Live public reference feeds (USGS, NASA, Open-Meteo) on Live Earth and Earth Watch, display only | Internet |
| `-Proactive` | Exercise-only multi-hazard watch | `AEGIS_CONNECTOR_KEY` in `.env` (`scripts\new-connector-key.ps1`) |
| `-StaffEmail` | Email notices to staff who opt in (fixed rehearsal templates only) | `-Proactive`, a SendGrid key saved on the Connectors page and the Email switch turned on there, see [COMMUNICATION_CHANNELS.md](COMMUNICATION_CHANNELS.md) |
| `-StatisticalForecast` | TimesFM 2.5 statistical river estimate on the Flood tab, display only | A one-time 883 MB model download, see [STATISTICAL_FORECAST.md](STATISTICAL_FORECAST.md) |
| `-LocalCopilot` | Optional local language model for rephrasing cited facts | See [LOCAL_REVIEW_FOCUS.md](LOCAL_REVIEW_FOCUS.md) |

Example with everything used in the recorded demo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1 -SignIn -PublicEarth -Proactive -StatisticalForecast
```

## If something goes wrong

| What you see | What to do |
|---|---|
| "Another AEGIS local operation is active" | A start, build or test is still running. Wait for it to finish. |
| Port 3000, 8000 or 8443 is in use | AEGIS never takes over a port. `aegis.cmd start` moves the web app or API to the next free port and prints the address; with `start-windows.ps1` close the other program. Port 8443 is never moved: close the program holding it. |
| Browser warns about the certificate at `aegis-idp.localhost:8443` | Step 4c was skipped or refused. Run it again and choose Yes. |
| Sign-in returns to the sign-in page with an error | Run step 4d and 4e again, then check `docker compose --project-name ai-project-aegis logs --tail 50 web api`. |
| "Sign-in is not set up yet" from the start script | Finish steps 3 and 4. |
| Pages show no incidents | The first start did not finish seeding. Check `docker compose --project-name ai-project-aegis logs seed migrate`. |

Never run `docker compose down -v`. It deletes the database volume and everything in it.

## What has and has not been tested

- Tested on the project laptop (Windows 11, 11 November 2026): starting with `-SignIn` and the optional switches on
  the existing installation, the demo account script (creating new accounts and leaving existing ones alone), and
  signing in with each demo role.
- Steps 3 and 4 are the same commands that were run by hand when this laptop was first set up on 4 November 2026.
- **Not tested: the whole sequence on a second, clean computer.** The project rules forbid deleting this laptop's
  database or running a second copy beside it, so a clean-machine run still needs to be done once by a person.
