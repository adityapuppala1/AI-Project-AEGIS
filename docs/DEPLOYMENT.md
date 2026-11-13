# Installing and running IndTrana on different systems

IndTrana is a **local synthetic exercise**. Whatever the host, it runs as **exactly one copy**: one Docker Compose project
called `ai-project-aegis` with one database. Nothing in this repository creates cloud resources, sends warnings or
dispatches anyone.

## One command per system

| System | Command | Tested |
|---|---|---|
| Windows 10/11 | double-click `aegis.cmd`, or `aegis.cmd install` | Yes, on the project laptop (13 November 2026) |
| Linux (Ubuntu, Debian, Fedora, RHEL, CentOS/Rocky/AlmaLinux, openSUSE, Arch) | `./aegis.sh install` | Partly: syntax, shellcheck, detect and status in WSL2 Ubuntu. The start path has not been run on Linux yet |
| macOS | `./aegis.sh install` | **Written for macOS, not yet run on one** |

Each entry point has the same commands:

| Command | What it does |
|---|---|
| `install` | Checks and installs what is missing, creates the local files, sets up sign-in, starts IndTrana, creates demo accounts |
| `start` | Starts IndTrana. If it is already running, says so and prints the address (nothing new is started) |
| `stop` | Stops IndTrana. Containers and the database are kept |
| `status` | Shows what runs and whether it answers. Exit 0 when running, 3 when stopped or not answering |
| `doctor` | Finds and fixes the common problems below, without deleting data |

Options: `-Yes`/`--yes` answers yes to every question; `-Ci`/`--ci` also turns off colour (set automatically when a
`CI` variable is present). Features stay as in the recorded demo: sign-in, Earth Watch reference feeds and the
proactive watch are on; turn them off with `-NoSignIn`/`--no-sign-in`, `-NoPublicEarth`/`--no-public-earth`,
`-NoProactive`/`--no-proactive`. Everything else stays off unless asked: `-LocalCopilot`, `-PublicIntake`,
`-StaffEmail` (Windows only), `-StatisticalForecast`, `-ProactiveScheduler` (`--local-copilot` and so on in `aegis.sh`).

Every step prints one line: `OK`, `fixed`, `needs you` or `FAIL`, and the last line gives the address.

### What it checks and installs

- **Windows:** Git and Docker Desktop through `winget` (Windows asks for administrator approval). If Docker Desktop is
  installed but not running it is started and given three minutes. A first Docker Desktop install may need a restart
  of Windows; the script then says so.
- **macOS:** Homebrew must already be there (the script never runs a downloaded install script). Git, curl, python3
  and Docker Desktop (`brew install --cask docker`), then `open -a Docker`.
- **Linux:** git, curl and python3 from the distribution. Docker Engine with the Compose plugin from Docker's own
  repository, chosen by distribution: Ubuntu and Debian (apt), Fedora, RHEL, and CentOS/Rocky/AlmaLinux (Docker's
  CentOS repository); the distribution packages on openSUSE and Arch. **Amazon Linux is not handled automatically**:
  the script stops and says how to install Docker by hand. Every command that runs with `sudo` is printed first
  (`+ sudo ...`). Outside CI it offers to add you to the `docker` group; in `--ci` mode it only prints the command.
  Until you log in again, that run uses `sudo docker` and passes the port and folder settings through to it.
- **WSL:** Docker is never installed inside WSL. Use Docker Desktop's WSL integration, or `aegis.cmd` on Windows.

### What `doctor` (and start) repairs automatically

| Problem | Fix |
|---|---|
| IndTrana containers (running or stopped) from another checkout or system | Nothing is touched; the script stops and names the container |
| Docker installed but not running | Starts it, waits up to three minutes |
| No `.env` | Copies `.env.example` |
| No connector key (needed by the proactive watch) | Generates one into `.env`, never shown |
| No private sign-in files | Generates them in the private folder (never overwrites existing ones) |
| No sign-in certificate copies | Starts the sign-in provider, copies its public certificate, builds the API trust list |
| Broken leftover containers of this project (`dead`/`created`) | Removes those containers only; volumes are kept |
| A service does not answer | Restarts that one service once, then shows its last 30 log lines |
| The image build fails | Builds once more without the cache (only a build failure triggers this; a start failure does not) |
| Port 3000 or 8000 taken by another program | Moves IndTrana to the next free port (below) |

Nothing deletes the database volume. Nothing stops or removes a container that does not belong to this project.

### Exactly one copy

- `start` treats a running copy as success and prints its address.
- Two installer runs cannot overlap: Windows holds `%LOCALAPPDATA%\AEGIS\aegis-control.lock` plus the shared
  single-operation lease around every build or start; `aegis.sh` holds a lock folder in its private folder.
- Before changing anything, both check every container of the project **in any state** (running, stopped, created,
  dead) and refuse to go on when one belongs to another checkout or another system sharing the same Docker engine (for
  example WSL and Windows on one Docker Desktop). They also refuse a running one-off job or another project name.
  Leftover `dead`/`created` containers are removed only after that check.

### Ports

| Port | Used by | If another program holds it |
|---|---|---|
| 3000 | Web app | Moved automatically to the next free port (3001, 3002, ...) |
| 8000 | API | Moved automatically to the next free port (8001, ...) |
| 8443 | Sign-in provider (HTTPS) | **Not moved.** The script names the program holding it and stops |

When the web port moves, `APP_ORIGIN` and the API's `CORS_ORIGIN` follow it, and the new address is added to the local
sign-in client (callback, allowed origin and sign-out address) inside the provider container. Accounts are never touched.
A port that this project's own container already publishes (stack partly running) is kept, never moved.

The ports in use are saved in `runtime-ports.env` in the private folder, and `start`, `stop`, `status` and `doctor`
read them from there. **Each start prefers the standard ports again** when they are free, so the address goes back to
http://localhost:3000 once the conflict is gone. The sign-in addresses the script added are recorded in the same file
(`AEGIS_ADDED_ORIGINS`) and removed again from the provider once they are no longer used; it never removes an address
it did not record.

Why 8443 is not moved: the provider's address `https://aegis-idp.localhost:8443` is its fixed hostname setting, the
token issuer that the API and web app check, the JWKS address, and the HTTPS proxy's site address, and the same name
and port are used inside the Docker network. Moving it would mean changing all of them together and invalidating every
signed-in session, so it is left to a person.

The `scripts\verify-*.ps1` checks still assume the standard ports 3000 and 8000.

### Private folder

| System | Folder |
|---|---|
| Windows | `%LOCALAPPDATA%\AEGIS` |
| macOS | `~/Library/Application Support/AEGIS` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/AEGIS` (mode 700, files 600) |

It holds `local-idp/` (sign-in secrets, certificate copies, `demo-credentials.txt`), `runtime-ports.env` and the
lock. It is outside the repository, and nothing in it is printed.

### What `aegis.sh` does not do yet

- It does not run `update-local-idp.ps1`'s steps (department and response-team roles and attributes, the email lock),
  so it creates only `demo-maker`, `demo-checker`, `demo-auditor` and `demo-admin`, and it refuses `--staff-email`.
- It does not add the certificate to the system or browser trust store; it prints the command or setting to use.
- It does not check for native `node`/`python` servers as deeply as the Windows guard (it looks for `uvicorn` and
  Next.js servers started from this folder).

Secrets: `aegis.sh` generates the sign-in secrets inside python3 and creates demo accounts from a private temporary
file inside the provider container, so no password appears on a command line. One residual risk remains on both
systems, as in the reviewed `update-local-idp.ps1`: kcadm has no stdin password option, so the provider's local
bootstrap password is briefly on a command line inside the provider container.

## Plain Docker Compose by hand

For a host where you do not want the installer:

```bash
cp .env.example .env            # then add AEGIS_CONNECTOR_KEY=<32 random bytes, base64> if you use the proactive watch
docker compose --project-name ai-project-aegis -f compose.yaml -f compose.public-earth.yaml up -d --build
docker compose --project-name ai-project-aegis stop      # stop, data kept
```

Always use `--project-name ai-project-aegis`, never start a second project, and never run `docker compose down -v`
(it deletes the database). To move host ports, set `AEGIS_WEB_PORT`, `AEGIS_API_PORT` and
`APP_ORIGIN=http://localhost:<web port>` in the environment first. Sign-in needs the private files described in
[INSTALL.md](INSTALL.md) steps 3 to 5.

## CI/CD pipelines

A pipeline on a Linux runner with Docker can bring up the exercise stack for checks:

```bash
./aegis.sh install --ci --no-sign-in      # or with sign-in, if the runner keeps a private folder between steps
./aegis.sh status --ci
# ... your checks against http://localhost:3000 and http://localhost:8000/health ...
./aegis.sh stop --ci
```

`--ci` never prompts, prints no colour and exits non-zero on any failure. **This repository's own GitHub Actions are
manual-only by policy** (see [CI_COST_POLICY.md](CI_COST_POLICY.md)); this guide does not add or trigger any workflow.

## AWS EC2 and Azure virtual machines

Nothing is provisioned by this repository, and nothing here has been run on a cloud VM. If you create a Linux virtual
machine yourself, use Ubuntu 22.04/24.04 (or another distribution listed above). **Amazon Linux images need Docker
installed by hand first**; the script stops on them with instructions. This cloud-init user data installs and starts
IndTrana for the default user on Ubuntu:

```yaml
#cloud-config
package_update: true
packages: [git, curl, python3]
runcmd:
  - sudo -u ubuntu git clone https://github.com/adityapuppala1/AI-Project-AEGIS.git /home/ubuntu/AI-Project-AEGIS
  - sudo -u ubuntu -H bash -c 'cd /home/ubuntu/AI-Project-AEGIS && ./aegis.sh install --ci --no-sign-in'
```

(On Azure the default user is the admin name you chose, not `ubuntu`.) Then reach it through an SSH tunnel:
`ssh -L 3000:localhost:3000 -L 8000:localhost:8000 ubuntu@<host>`.

- IndTrana publishes its ports on `127.0.0.1` only. **Do not open 3000, 8000 or 8443 in a security group or network
  security group.** Anything beyond a private tunnel needs TLS and a reverse proxy in front, and a proper identity
  provider instead of the local Keycloak.
- Government hosting requirements in [GOVT_DEPLOYMENT_READINESS.md](GOVT_DEPLOYMENT_READINESS.md) still apply. A cloud
  VM running this installer is a rehearsal environment, not an accredited deployment.
- Sign-in on a remote VM needs the browser to reach `aegis-idp.localhost:8443` too (add `-L 8443:localhost:8443`) and
  to trust the generated certificate.

## On-premises server

Same as a Linux virtual machine: clone the repository and run `./aegis.sh install`. Keep the ports on loopback, put a
reviewed reverse proxy with TLS in front if people need to reach it over the network, and keep backups of the database
volume (see `scripts/verify-backup-restore.ps1` for the restore check used on Windows).

## Worker nodes, Kubernetes, Docker Swarm or several replicas: not supported

IndTrana must run as **exactly one instance**, so it is not supported on worker nodes, Kubernetes, Docker Swarm, behind a
load balancer or with more than one replica of any service. The reasons:

- The two-person approval, the department inbox and the response loop rely on row locks, version checks and one
  transaction per write against **one** PostgreSQL database. A second database (or a second stack seeding its own) would
  split the audit trail and break those guarantees.
- The proactive watch and its optional scheduler would run twice and prepare duplicate items.
- Sign-in sessions, the local identity provider and the single-operation guard all assume one host.
- The project rules forbid a second Compose project, replica or overlapping start (see
  [SINGLE_INSTANCE_LOCAL_RUNTIME.md](SINGLE_INSTANCE_LOCAL_RUNTIME.md)).

Scaling out would need a separate design and review first.
