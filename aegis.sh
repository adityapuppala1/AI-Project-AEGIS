#!/usr/bin/env bash
# IndTrana one-step installer and service control for macOS and Linux (also Linux virtual machines such as AWS EC2 or
# Azure VMs, and on-premises Linux servers). Ported from the reviewed Windows scripts (start-windows.ps1,
# stop-windows.ps1, prepare-local-idp.ps1, new-connector-key.ps1, new-demo-accounts.ps1, local-runtime-common.ps1).
#   ./aegis.sh install|start|stop|status|doctor|detect|help [--yes] [--ci] [options]
# Never deletes a volume, never touches containers outside Compose project ai-project-aegis or from another checkout,
# never touches the exercise-* accounts and never prints a secret. Local synthetic exercise only.
# shellcheck disable=SC1091 # /etc/os-release exists only on the target system
set -u
set -o pipefail

PROJECT=ai-project-aegis
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_WEB=3000; DEFAULT_API=8000; IDP_PORT=8443

COMMAND=help; YES=0; CI_MODE=0; NO_BUILD=0; SIGN_IN=1; PUBLIC_EARTH=1; PROACTIVE=1
LOCAL_COPILOT=0; PUBLIC_INTAKE=0; STAFF_EMAIL=0; STAT_FORECAST=0; PROACTIVE_SCHEDULER=0

usage() {
  cat <<'EOF'
IndTrana one-step control (macOS and Linux)
  ./aegis.sh install   first-time setup: dependencies, local files, sign-in, start, demo accounts
  ./aegis.sh start     start IndTrana (does nothing if it is already running)
  ./aegis.sh stop      stop IndTrana (data is kept)
  ./aegis.sh status    show whether IndTrana is running and answering (exit 0 running, 3 stopped or not answering)
  ./aegis.sh doctor    find and fix common problems without deleting data
  ./aegis.sh detect    show the detected system, package manager and port situation (changes nothing)
Options: --yes (no questions) --ci (no questions, no colour) --no-build --no-sign-in --no-public-earth
         --no-proactive --local-copilot --public-intake --statistical-forecast --proactive-scheduler
Ports: 3000 web, 8000 API, 8443 sign-in. If 3000 or 8000 is taken by another program, the next free port is used
and saved in the private AEGIS folder (runtime-ports.env). Port 8443 is never moved. See docs/DEPLOYMENT.md.
Not available here yet (Windows only): staff email notices, department and response-team demo accounts.
EOF
}

for arg in "$@"; do
  case "$arg" in
    install|start|stop|status|doctor|detect|help) COMMAND="$arg" ;;
    -h|--help) COMMAND=help ;;
    -y|--yes) YES=1 ;;
    --ci) CI_MODE=1; YES=1 ;;
    --no-build) NO_BUILD=1 ;;
    --no-sign-in) SIGN_IN=0 ;;
    --no-public-earth) PUBLIC_EARTH=0 ;;
    --no-proactive) PROACTIVE=0 ;;
    --local-copilot) LOCAL_COPILOT=1 ;;
    --public-intake) PUBLIC_INTAKE=1 ;;
    --staff-email) STAFF_EMAIL=1 ;;
    --statistical-forecast) STAT_FORECAST=1 ;;
    --proactive-scheduler) PROACTIVE_SCHEDULER=1 ;;
    *) echo "Unknown option: $arg"; usage; exit 2 ;;
  esac
done
if [ -n "${CI:-}${GITHUB_ACTIONS:-}${GITLAB_CI:-}${TF_BUILD:-}${JENKINS_URL:-}${BUILDKITE:-}" ]; then CI_MODE=1; YES=1; fi
PLAIN=0; { [ "$CI_MODE" = 1 ] || [ ! -t 1 ] || [ -n "${NO_COLOR:-}" ]; } && PLAIN=1

say() {
  local status="$1"; shift
  if [ "$PLAIN" = 1 ]; then printf '%-10s %s\n' "$status" "$*"; return; fi
  local c
  case "$status" in OK) c='32' ;; fixed) c='36' ;; 'needs you') c='33' ;; FAIL) c='31' ;; *) c='37' ;; esac
  printf '\033[%sm%-10s\033[0m %s\n' "$c" "$status" "$*"
}
die() { say FAIL "$*"; exit 1; }
confirm() {
  [ "$YES" = 1 ] && return 0
  local answer=''
  read -r -p "$1 [y/N] " answer || return 1
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}
# Every command that needs administrator rights goes through here and is printed first.
as_root() {
  if [ "$(id -u)" = 0 ]; then echo "+ $*"; "$@"; return; fi
  command -v sudo >/dev/null 2>&1 || die 'This step needs administrator rights and sudo is not available. Run it as root, then run this again.'
  echo "+ sudo $*"; sudo "$@"
}

# ---------- 1. detection ----------
OS_KIND=''; DISTRO=''; DISTRO_LIKE=''; PKG=''; IS_WSL=0; ARCH="$(uname -m)"
detect_platform() {
  case "$(uname -s)" in
    Darwin) OS_KIND=macos; PKG=brew; DISTRO="macOS $(sw_vers -productVersion 2>/dev/null)" ;;
    Linux)
      OS_KIND=linux
      if [ -r /etc/os-release ]; then
        # shellcheck disable=SC1091
        DISTRO="$(. /etc/os-release; echo "${ID:-linux}")"; DISTRO_LIKE="$(. /etc/os-release; echo "${ID_LIKE:-}")"
      fi
      grep -qi microsoft /proc/version 2>/dev/null && IS_WSL=1
      if command -v apt-get >/dev/null 2>&1; then PKG=apt
      elif command -v dnf >/dev/null 2>&1; then PKG=dnf
      elif command -v yum >/dev/null 2>&1; then PKG=yum
      elif command -v zypper >/dev/null 2>&1; then PKG=zypper
      elif command -v pacman >/dev/null 2>&1; then PKG=pacman
      else PKG=none; fi ;;
    MINGW*|MSYS*|CYGWIN*) die 'This is Windows. Run aegis.cmd instead.' ;;
    *) die "Unsupported system: $(uname -s). Use plain Docker Compose (docs/DEPLOYMENT.md)." ;;
  esac
  local extra=''
  [ "$IS_WSL" = 1 ] && extra=' inside WSL'
  [ "$CI_MODE" = 1 ] && extra="$extra, running in CI (no prompts)"
  say OK "Detected $OS_KIND ${DISTRO:-unknown} ($ARCH)$extra; package manager: $PKG"
}

if [ "$(uname -s)" = Darwin ]; then PRIVATE="$HOME/Library/Application Support/AEGIS"
else PRIVATE="${XDG_DATA_HOME:-$HOME/.local/share}/AEGIS"; fi
IDP_DIR="$PRIVATE/local-idp"
STATE_FILE="$PRIVATE/runtime-ports.env"
# Sign-in address migration (functions only; the standalone script sources this file in library mode).
# shellcheck source=scripts/migrate-local-idp-address.sh
declare -F idpmig_migrate >/dev/null 2>&1 || . "$ROOT/scripts/migrate-local-idp-address.sh"

# ---------- 2. dependencies ----------
pkg_install() { # label packages...
  local label="$1"; shift
  local how="with $PKG"; [ "$PKG" != brew ] && [ "$(id -u)" != 0 ] && how="$how (sudo, command shown)"
  confirm "Install $label $how?" || die "$label is required. Install it, then run ./aegis.sh install again."
  case "$PKG" in
    brew) echo "+ brew install $*"; brew install "$@" ;;
    apt) as_root apt-get update -y && as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" ;;
    dnf) as_root dnf install -y "$@" ;;
    yum) as_root yum install -y "$@" ;;
    zypper) as_root zypper --non-interactive install "$@" ;;
    pacman) as_root pacman -S --noconfirm --needed "$@" ;;
    *) false ;;
  esac || die "Could not install $label. Install it by hand, then run ./aegis.sh install again."
}
ensure_tool() { # command label package...
  local cmd="$1" label="$2"; shift 2
  if command -v "$cmd" >/dev/null 2>&1; then say OK "$label is installed"; return; fi
  [ "$PKG" = none ] && die "$label is missing and no known package manager was found. Install it, then run this again."
  if [ "$PKG" = brew ] && ! command -v brew >/dev/null 2>&1; then
    die "$label is missing and Homebrew is not installed. Install Homebrew from https://brew.sh (read its script first), then run this again."
  fi
  pkg_install "$label" "$@"
  command -v "$cmd" >/dev/null 2>&1 || die "$label still not found after installing. Open a new terminal, then run this again."
  say fixed "$label installed"
}
install_docker_linux() {
  [ "$IS_WSL" = 1 ] && die 'Docker is not available inside WSL. Install Docker Desktop on Windows and turn on Settings > Resources > WSL integration for this distro (or use aegis.cmd on Windows). Nothing was installed inside WSL.'
  case "$PKG" in
    apt)
      local repo
      case "$DISTRO" in
        ubuntu) repo=ubuntu ;;
        debian) repo=debian ;;
        *) case "$DISTRO_LIKE" in *ubuntu*) repo=ubuntu ;; *debian*) repo=debian ;; *) die "Docker's apt repository does not cover $DISTRO. Install Docker Engine with the Compose plugin by hand, then run this again." ;; esac ;;
      esac
      say info "Docker Engine will be installed from Docker's own apt repository (https://download.docker.com/linux/$repo), as in Docker's documentation. Each sudo command is shown."
      confirm "Add Docker's apt repository and install Docker Engine with the Compose plugin?" || die 'Docker is required. Install Docker Engine, then run this again.'
      ensure_tool curl curl curl ca-certificates
      local codename; codename="$(. /etc/os-release; echo "${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}")"
      [ -n "$codename" ] || die 'Could not read the release codename. Install Docker Engine by hand (docs.docker.com/engine/install), then run this again.'
      as_root install -m 0755 -d /etc/apt/keyrings || die 'Could not create /etc/apt/keyrings.'
      as_root curl -fsSL "https://download.docker.com/linux/$repo/gpg" -o /etc/apt/keyrings/docker.asc || die 'Could not download the Docker signing key.'
      as_root chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$repo $codename stable" |
        as_root tee /etc/apt/sources.list.d/docker.list >/dev/null || die 'Could not add the Docker repository.'
      YES=1 pkg_install 'Docker Engine' docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin ;;
    dnf|yum)
      local repo
      case "$DISTRO" in
        fedora) repo=fedora ;;
        rhel) repo=rhel ;;
        centos|rocky|almalinux) repo=centos ;;
        amzn) die 'Amazon Linux is not handled automatically. Install Docker with "sudo dnf install -y docker" (or yum), install the Docker Compose v2 plugin as described in Docker documentation, run "sudo systemctl enable --now docker", then run this again.' ;;
        *) die "Docker's repository is not known for $DISTRO. Install Docker Engine with the Compose plugin by hand, then run this again." ;;
      esac
      say info "Docker Engine will be installed from Docker's own repository (https://download.docker.com/linux/$repo/docker-ce.repo). Each sudo command is shown."
      confirm 'Add the Docker repository and install Docker Engine with the Compose plugin?' || die 'Docker is required. Install Docker Engine, then run this again.'
      if [ "$PKG" = dnf ]; then
        as_root dnf -y install dnf-plugins-core >/dev/null
        as_root dnf config-manager --add-repo "https://download.docker.com/linux/$repo/docker-ce.repo" ||
          as_root dnf config-manager addrepo --from-repofile="https://download.docker.com/linux/$repo/docker-ce.repo" || die 'Could not add the Docker repository.'
      else
        { as_root yum install -y yum-utils >/dev/null && as_root yum-config-manager --add-repo "https://download.docker.com/linux/$repo/docker-ce.repo"; } || die 'Could not add the Docker repository.'
      fi
      YES=1 pkg_install 'Docker Engine' docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin ;;
    zypper) pkg_install 'Docker' docker docker-compose ;;
    pacman) pkg_install 'Docker' docker docker-compose docker-buildx ;;
    *) die 'Docker is missing and this system has no supported package manager. Install Docker Engine with the Compose plugin, then run this again.' ;;
  esac
  if command -v systemctl >/dev/null 2>&1; then as_root systemctl enable --now docker >/dev/null 2>&1 || true; fi
  if [ "$(id -u)" != 0 ]; then
    if [ "$CI_MODE" = 1 ]; then
      say 'needs you' "To use Docker without sudo, run: sudo usermod -aG docker $(id -un) (then log in again). Not done automatically in CI mode."
    elif confirm "Let your user ($(id -un)) run Docker without sudo (adds it to the docker group; takes effect at next login)?"; then
      as_root usermod -aG docker "$(id -un)" && say fixed 'Added you to the docker group (this run keeps using sudo for docker)'
    fi
  fi
}
DOCKER=(docker)
# sudo resets the environment, so the variables Compose reads must be passed through explicitly.
# shellcheck disable=SC2054 # the commas belong to the sudo option, not the array
SUDO_DOCKER=(sudo --preserve-env=AEGIS_WEB_PORT,AEGIS_API_PORT,APP_ORIGIN,AEGIS_LOCAL_IDP_PRIVATE_DIR,AEGIS_TIMESFM_CACHE docker)
docker_ok() { "${DOCKER[@]}" info >/dev/null 2>&1; }
ensure_dependencies() {
  ensure_tool git git git
  ensure_tool curl curl curl
  ensure_tool python3 python3 python3
  local fixed=0
  if ! command -v docker >/dev/null 2>&1; then
    if [ "$OS_KIND" = macos ]; then
      command -v brew >/dev/null 2>&1 || die 'Docker Desktop is missing. Install it from docker.com (or install Homebrew, then run this again).'
      confirm 'Install Docker Desktop with Homebrew (brew install --cask docker)?' || die 'Docker Desktop is required.'
      echo '+ brew install --cask docker'
      brew install --cask docker || die 'Homebrew could not install Docker Desktop. Install it from docker.com, then run this again.'
    else install_docker_linux; fi
    fixed=1
  fi
  command -v docker >/dev/null 2>&1 || die 'Docker was installed but its command is not found yet. Open a new terminal, then run this again.'
  if [ "$fixed" = 1 ]; then say fixed 'Docker installed'; else say OK 'Docker is installed'; fi
  if ! docker_ok && docker info 2>&1 | grep -qi 'permission denied' && command -v sudo >/dev/null 2>&1; then
    say info 'Your user may not use Docker yet; this run uses sudo for docker commands'
    DOCKER=("${SUDO_DOCKER[@]}")
  fi
  if ! docker_ok; then
    say info 'Docker is not running; starting it (waiting up to 3 minutes)'
    if [ "$OS_KIND" = macos ]; then echo '+ open -a Docker'; open -a Docker >/dev/null 2>&1 || true
    elif [ "$IS_WSL" = 1 ]; then die 'Docker is not reachable from WSL. Start Docker Desktop on Windows and turn on WSL integration for this distro, then run this again.'
    elif command -v systemctl >/dev/null 2>&1; then as_root systemctl start docker || true
    elif command -v service >/dev/null 2>&1; then as_root service docker start || true; fi
    local waited=0
    while ! docker_ok && [ "$waited" -lt 180 ]; do sleep 5; waited=$((waited + 5)); done
    docker_ok || die 'Docker did not start. Start Docker (Docker Desktop on macOS, "sudo systemctl start docker" on Linux), then run this again.'
    say fixed 'Docker engine started'
  else say OK 'Docker engine is running'; fi
  if ! "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    if [ "$OS_KIND" = linux ] && { [ "$PKG" = apt ] || [ "$PKG" = dnf ] || [ "$PKG" = yum ]; }; then pkg_install 'Docker Compose plugin' docker-compose-plugin; fi
    "${DOCKER[@]}" compose version >/dev/null 2>&1 || die 'Docker Compose v2 is missing. Install the docker-compose-plugin package (or update Docker Desktop), then run this again.'
  fi
  say OK 'Docker Compose v2 is available'
}

# ---------- 3. single instance ----------
LOCK_LINK=''
take_lock() {
  mkdir -p "$PRIVATE" && chmod 700 "$PRIVATE"
  if command -v flock >/dev/null 2>&1; then
    # Kernel lock on an open file: released automatically when this process ends.
    exec 9>"$PRIVATE/aegis-control.lock"
    flock -n 9 || die 'Another ./aegis.sh is already running. Wait for it to finish.'
    return
  fi
  # No flock (macOS): a symbolic link whose target is our PID is created atomically in one step.
  LOCK_LINK="$PRIVATE/aegis-control.pid-lock"
  if ! ln -s "$$" "$LOCK_LINK" 2>/dev/null; then
    local holder; holder="$(readlink "$LOCK_LINK" 2>/dev/null || true)"
    if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then die "Another ./aegis.sh is already running (PID $holder). Wait for it to finish."; fi
    rm -f "$LOCK_LINK"   # our own lock left by a run that no longer exists; nothing else is removed
    ln -s "$$" "$LOCK_LINK" 2>/dev/null || die 'Another ./aegis.sh took the lock at the same moment. Wait for it to finish.'
  fi
  trap '[ "$(readlink "$LOCK_LINK" 2>/dev/null)" = "$$" ] && rm -f "$LOCK_LINK"' EXIT
}
# Running containers only: "service|working_dir|oneoff|name|project|image" (by project label or IndTrana image).
inventory() {
  "${DOCKER[@]}" ps --format '{{.Label "com.docker.compose.service"}}|{{.Label "com.docker.compose.project.working_dir"}}|{{.Label "com.docker.compose.oneoff"}}|{{.Names}}|{{.Label "com.docker.compose.project"}}|{{.Image}}' 2>/dev/null |
    awk -F'|' -v p="$PROJECT" '$5 == p || $6 ~ /^ai-project-aegis-(api|web)(:|$)/'
}
assert_ownership() { # every container of the project in ANY state must come from this checkout
  local all name dir
  all="$("${DOCKER[@]}" ps -a --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Names}}|{{.Label "com.docker.compose.project.working_dir"}}')" ||
    die 'Docker inventory failed; nothing was started, stopped or removed.'
  while IFS='|' read -r name dir; do
    [ -z "$name" ] && continue
    [ "$dir" != "$ROOT" ] && die "IndTrana container $name (any state) belongs to another checkout or another system sharing this Docker ($dir). Only one copy may exist; nothing was changed."
  done <<< "$all"
  return 0
}
assert_single() { # $1 = require-running (0/1)
  if [ -n "${COMPOSE_PROJECT_NAME:-}" ] && [ "$COMPOSE_PROJECT_NAME" != "$PROJECT" ]; then die "COMPOSE_PROJECT_NAME must be $PROJECT. Refusing to create a second stack."; fi
  [ -n "${COMPOSE_FILE:-}" ] && die 'Unset COMPOSE_FILE; this script chooses the reviewed Compose files.'
  assert_ownership
  local lines; lines="$(inventory)" || die 'Docker inventory failed; nothing was started or stopped.'
  local svc oneoff name proj
  while IFS='|' read -r svc _ oneoff name proj _; do
    [ -z "$name" ] && continue
    [ "$proj" != "$PROJECT" ] && die "Another IndTrana Compose project is running ($name). Inspect who owns it before doing anything."
    [ "$oneoff" = True ] && die "An IndTrana one-off job is active ($name). Wait for it to finish."
  done <<< "$lines"
  local role count
  for role in api web db migrate seed; do
    count="$(printf '%s\n' "$lines" | awk -F'|' -v r="$role" '$1 == r' | grep -c . || true)"
    [ "$count" -gt 1 ] && die "Duplicate IndTrana service '$role' ($count running). Inspect and stop only confirmed duplicates."
    if [ "$1" = 1 ] && { [ "$role" = api ] || [ "$role" = web ] || [ "$role" = db ]; } && [ "$count" != 1 ]; then
      die "Expected exactly one running IndTrana '$role'; found $count."
    fi
  done
  # Another Compose operation on this project, or a native dev server from this folder (reported, never killed).
  local jobs
  # shellcheck disable=SC2009
  jobs="$(ps -eo pid=,args= 2>/dev/null | grep -E "docker(-compose)? .*(--project-name[ =]$PROJECT|-p $PROJECT).* (up|build|run|stop|down|start|restart|exec)( |$)" | grep -v grep | grep -v "^ *$$ " || true)"
  [ -n "$jobs" ] && die "An IndTrana Compose operation is still running (PID $(echo "$jobs" | awk '{print $1}' | tr '\n' ' ')). Wait for it to finish."
  # shellcheck disable=SC2009
  jobs="$(ps -eo pid=,args= 2>/dev/null | grep -F "$ROOT" | grep -E 'uvicorn|next-server|next/dist/bin/next|server\.js' | grep -v grep || true)"
  [ -n "$jobs" ] && die "A native IndTrana server process from this folder is running (PID $(echo "$jobs" | awk '{print $1}' | tr '\n' ' ')). Use one Compose stack only; stop that process yourself."
  say OK 'Exactly one IndTrana copy (or none) and no competing IndTrana job'
}
is_running() { local l r; l="$(inventory)"; for r in api web db; do printf '%s\n' "$l" | awk -F'|' -v r="$r" '$1 == r' | grep -q . || return 1; done; return 0; }

# ---------- 4. ports ----------
port_in_use() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then ss -Hltn "sport = :$p" 2>/dev/null | grep -q . && return 0
  elif command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 && return 0; fi
  (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && return 0
  return 1
}
port_holder() {
  local p="$1" names
  names="$("${DOCKER[@]}" ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -E ":$p->" | awk '{print $1}' | tr '\n' ' ')"
  [ -n "$names" ] && { echo "Docker container ${names% }"; return; }
  if command -v lsof >/dev/null 2>&1; then
    names="$(lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1" (PID "$2")"}' | sort -u | tr '\n' ' ')"
  elif command -v ss >/dev/null 2>&1; then
    names="$(ss -Hltnp "sport = :$p" 2>/dev/null | grep -o 'users:(([^)]*' | sed 's/users:((//' | tr '\n' ' ')"
  fi
  if [ -n "$names" ]; then echo "${names% }"; else echo 'another program (run with sudo to see which)'; fi
}
own_published_port() { # service inside-port -> host port published by this project's own running container, or empty
  "${DOCKER[@]}" ps --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$1" --format '{{.Ports}}' 2>/dev/null |
    sed -n "s/.*:\([0-9][0-9]*\)->$2\/tcp.*/\1/p" | head -1
}
find_free_port() { # preferred avoid1 avoid2
  local c="$1"
  while [ "$c" -lt $(( $1 + 50 )) ]; do
    if [ "$c" != "$2" ] && [ "$c" != "$3" ] && ! port_in_use "$c"; then echo "$c"; return 0; fi
    c=$((c + 1))
  done
  return 1
}
WEB_PORT=$DEFAULT_WEB; API_PORT=$DEFAULT_API; ADDED_ORIGINS=''
read_state() {
  WEB_PORT=$DEFAULT_WEB; API_PORT=$DEFAULT_API; ADDED_ORIGINS=''
  [ -f "$STATE_FILE" ] || return 0
  local k v o
  while IFS='=' read -r k v; do
    case "$k:$v" in
      AEGIS_WEB_PORT:[0-9]*) WEB_PORT="${v//[!0-9]/}" ;;
      AEGIS_API_PORT:[0-9]*) API_PORT="${v//[!0-9]/}" ;;
      AEGIS_ADDED_ORIGINS:*) for o in $v; do case "$o" in http://localhost:[0-9]*) ADDED_ORIGINS="$ADDED_ORIGINS $o" ;; esac; done ;;
    esac
  done < "$STATE_FILE"
  ADDED_ORIGINS="${ADDED_ORIGINS# }"
}
write_state() {
  mkdir -p "$PRIVATE"
  (umask 077; printf 'AEGIS_WEB_PORT=%s\nAEGIS_API_PORT=%s\nAEGIS_ADDED_ORIGINS=%s\n' "$WEB_PORT" "$API_PORT" "$ADDED_ORIGINS" > "$STATE_FILE")
}
check_idp_port() {
  [ "$SIGN_IN" = 1 ] || return 0
  [ -n "$(own_published_port local-idp-tls 8443)" ] && return 0
  if port_in_use "$IDP_PORT"; then
    die "Port $IDP_PORT (sign-in provider) is used by $(port_holder $IDP_PORT). This port is part of the sign-in address and is not moved automatically. Close that program, then run this again."
  fi
}
resolve_ports() { # prefer the standard ports; keep ports this project's own containers hold; move only foreign conflicts
  local holder own saved_origins
  saved_origins="$ADDED_ORIGINS"; read_state; ADDED_ORIGINS="${ADDED_ORIGINS:-$saved_origins}"
  WEB_PORT=$DEFAULT_WEB; API_PORT=$DEFAULT_API
  own="$(own_published_port web 3000)"
  if [ -n "$own" ]; then WEB_PORT="$own"; say OK "Port $WEB_PORT is already used by this project's web container; kept"
  elif port_in_use "$WEB_PORT"; then holder="$(port_holder "$WEB_PORT")"; WEB_PORT="$(find_free_port $((DEFAULT_WEB + 1)) "$DEFAULT_API" "$IDP_PORT")" || die 'No free port near 3000.'; say fixed "Port $DEFAULT_WEB is used by $holder; the web app will use $WEB_PORT"
  else say OK "Port $WEB_PORT (web) is free"; fi
  own="$(own_published_port api 8000)"
  if [ -n "$own" ]; then API_PORT="$own"; say OK "Port $API_PORT is already used by this project's API container; kept"
  elif port_in_use "$API_PORT"; then holder="$(port_holder "$API_PORT")"; API_PORT="$(find_free_port $((DEFAULT_API + 1)) "$WEB_PORT" "$IDP_PORT")" || die 'No free port near 8000.'; say fixed "Port $DEFAULT_API is used by $holder; the API will use $API_PORT"
  else say OK "Port $API_PORT (API) is free"; fi
  check_idp_port
  [ "$SIGN_IN" = 1 ] && say OK "Port $IDP_PORT (sign-in provider) is available"
  write_state
}
export_ports() { export AEGIS_WEB_PORT="$WEB_PORT" AEGIS_API_PORT="$API_PORT" APP_ORIGIN="http://localhost:$WEB_PORT"; }

# ---------- 5. local files ----------
secret() { head -c "$1" /dev/urandom | base64 | tr -d '\n'; }
ensure_env_file() {
  if [ ! -f "$ROOT/.env" ]; then
    (umask 077; cp "$ROOT/.env.example" "$ROOT/.env") || die 'Could not create .env.'
    say fixed '.env created from .env.example (local-only values, never committed)'
  else say OK '.env exists'; fi
  { [ "$PROACTIVE" = 1 ] || [ "$PROACTIVE_SCHEDULER" = 1 ]; } || return 0
  if grep -Eq '^AEGIS_CONNECTOR_KEY=.+' "$ROOT/.env"; then say OK 'Connector key is set in .env'; return; fi
  local tmp="$ROOT/.env.aegis-tmp"
  { (umask 077; grep -v '^AEGIS_CONNECTOR_KEY=' "$ROOT/.env" > "$tmp"; printf 'AEGIS_CONNECTOR_KEY=%s\n' "$(secret 32)" >> "$tmp") && mv "$tmp" "$ROOT/.env"; } || die 'Could not save the connector key.'
  chmod 600 "$ROOT/.env"
  say fixed 'Connector key generated and saved to .env (not shown)'
}
compose_idp() {
  local args=(compose --project-name "$PROJECT")
  [ -f "$ROOT/.env" ] && args+=(--env-file "$ROOT/.env")
  args+=(--env-file "$IDP_DIR/app.env" --profile local-idp -f "$ROOT/compose.yaml" -f "$ROOT/compose.local-idp.yaml")
  "${DOCKER[@]}" "${args[@]}" "$@"
}
create_signin_secrets() {
  # Port of prepare-local-idp.ps1 -GenerateLocalSecrets. python3 generates every secret and writes the files itself,
  # so no password ever appears on a command line. Refuses to overwrite.
  python3 - "$ROOT/ops/local-idp/realm.json" "$IDP_DIR" <<'PY' || die 'Could not write the private sign-in files; nothing was overwritten.'
import base64, json, os, secrets, sys
source, destination = sys.argv[1], sys.argv[2]
os.umask(0o077)
os.makedirs(destination, mode=0o700, exist_ok=True)
for name in ("provider.env", "app.env", "realm.json"):
    if os.path.exists(os.path.join(destination, name)):
        sys.exit("existing identity configuration found")
def secret(n=32):
    return base64.b64encode(secrets.token_bytes(n)).decode()
passwords = {"exercise-maker": secret(), "exercise-checker": secret(), "exercise-admin": secret()}
realm = json.load(open(source, encoding="utf-8"))
for user in realm["users"]:
    if user["username"] not in passwords:
        sys.exit("unexpected realm account")
    user["credentials"][0]["value"] = passwords[user["username"]]
def write(name, text):
    fd = os.open(os.path.join(destination, name), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
write("realm.json", json.dumps(realm, indent=2))
write("provider.env", "\n".join([
    "KC_BOOTSTRAP_ADMIN_USERNAME=aegis-local-bootstrap", "KC_BOOTSTRAP_ADMIN_PASSWORD=" + secret(),
    "AEGIS_MAKER_PASSWORD=" + passwords["exercise-maker"], "AEGIS_CHECKER_PASSWORD=" + passwords["exercise-checker"],
    "AEGIS_ADMIN_PASSWORD=" + passwords["exercise-admin"]]) + "\n")
write("app.env", "\n".join([
    "AEGIS_LOCAL_IDP_PRIVATE_DIR=" + destination, "APP_ORIGIN=http://localhost:3000",
    "BFF_SESSION_KEY_BASE64=" + secret()]) + "\n")
PY
  chmod 700 "$PRIVATE" "$IDP_DIR"
}
ensure_signin_files() {
  [ "$SIGN_IN" = 1 ] || { say skip 'Sign-in not requested (--no-sign-in)'; return; }
  local present=0 f
  for f in provider.env app.env realm.json; do [ -f "$IDP_DIR/$f" ] && present=$((present + 1)); done
  if [ "$present" = 0 ]; then create_signin_secrets; say fixed "Private sign-in files created in $IDP_DIR (not shown)"
  elif [ "$present" -lt 3 ]; then die "Some private sign-in files are missing in $IDP_DIR. They are never overwritten automatically; move that folder aside only if you are sure, then run install again."
  else say OK 'Private sign-in files exist'; fi
  # An install made before the rename uses the old sign-in address; confirm_idp_address offers to move it once the
  # provider runs (docs/LOCAL_IDP_ADDRESS.md). Fresh installs use the new names from the start.
  export AEGIS_LOCAL_IDP_PRIVATE_DIR="$IDP_DIR"
  if [ -f "$IDP_DIR/root.crt" ] && [ -f "$IDP_DIR/api-ca-bundle.pem" ]; then say OK 'Sign-in certificate files exist'; return; fi
  check_idp_port
  say info 'Setting up the local sign-in certificate (first install only, a few minutes)'
  (cd "$ROOT" && compose_idp up -d local-idp local-idp-tls) || die 'The identity provider did not start. Run ./aegis.sh doctor.'
  local i=0
  until compose_idp cp local-idp-tls:/data/caddy/pki/authorities/local/root.crt "$IDP_DIR/root.crt" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -ge 40 ] && die 'The HTTPS proxy did not create its certificate within two minutes. Run ./aegis.sh install again.'
    sleep 3
  done
  if ! "${DOCKER[@]}" image inspect "$PROJECT-api" >/dev/null 2>&1; then
    (cd "$ROOT" && "${DOCKER[@]}" compose --project-name "$PROJECT" -f compose.yaml build api) || die 'The API image did not build. Run ./aegis.sh doctor.'
  fi
  local roots
  roots="$("${DOCKER[@]}" run --rm --entrypoint cat "$PROJECT-api" /etc/ssl/certs/ca-certificates.crt)" || die 'Could not read the API certificate list.'
  (umask 077; printf '%s\n' "$roots" > "$IDP_DIR/api-ca-bundle.pem"; cat "$IDP_DIR/root.crt" >> "$IDP_DIR/api-ca-bundle.pem")
  say fixed 'Sign-in certificate copied and the API told to trust it'
  if [ "$OS_KIND" = macos ]; then
    say 'needs you' "Let your browser trust the local sign-in certificate: security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db \"$IDP_DIR/root.crt\" (Firefox: import it in its own settings)"
  else
    say 'needs you' "Let your browser trust the local sign-in certificate: import \"$IDP_DIR/root.crt\" as an authority in the browser's certificate settings (not done automatically)"
  fi
}

# ---------- 6. start, health, repair ----------
compose_files() {
  FILES=(compose --project-name "$PROJECT")
  if [ "$SIGN_IN" = 1 ]; then
    [ -f "$ROOT/.env" ] && FILES+=(--env-file "$ROOT/.env")
    FILES+=(--env-file "$IDP_DIR/app.env" --profile local-idp)
  fi
  FILES+=(-f compose.yaml)
  [ "$SIGN_IN" = 1 ] && FILES+=(-f compose.local-idp.yaml)
  [ "$LOCAL_COPILOT" = 1 ] && FILES+=(-f compose.local-copilot.yaml)
  [ "$PUBLIC_EARTH" = 1 ] && FILES+=(-f compose.public-earth.yaml)
  [ "$PUBLIC_INTAKE" = 1 ] && FILES+=(-f compose.public-intake.yaml)
  { [ "$PROACTIVE" = 1 ] || [ "$PROACTIVE_SCHEDULER" = 1 ]; } && FILES+=(-f compose.proactive.yaml)
  BUILD_FILES=(compose --project-name "$PROJECT" -f compose.yaml)
  if [ "$STAT_FORECAST" = 1 ]; then
    export AEGIS_TIMESFM_CACHE="${AEGIS_TIMESFM_CACHE:-$HOME/.cache/huggingface}"
    FILES+=(-f compose.timesfm.yaml); BUILD_FILES+=(-f compose.timesfm.yaml)
  fi
  [ "$PROACTIVE_SCHEDULER" = 1 ] && FILES+=(-f compose.proactive-scheduler.yaml)
  return 0
}
http_ok() { local code; code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null)"; [ -n "$code" ] && [ "$code" != 000 ] && [ "$code" -lt 500 ]; }
wait_http() { local t=0; while [ "$t" -lt "$2" ]; do http_ok "$1" && return 0; sleep 3; t=$((t + 3)); done; return 1; }
confirm_healthy() { # $1 = repair (0/1)
  local svc url pair
  for pair in "api|http://localhost:$API_PORT/health" "web|http://localhost:$WEB_PORT/"; do
    svc="${pair%%|*}"; url="${pair#*|}"
    if wait_http "$url" 120; then say OK "$svc answers at $url"; continue; fi
    [ "$1" = 1 ] || die "$svc does not answer at $url. Run ./aegis.sh doctor."
    say info "$svc does not answer; restarting that one service once"
    (cd "$ROOT" && "${DOCKER[@]}" compose --project-name "$PROJECT" restart "$svc")
    if wait_http "$url" 120; then say fixed "$svc restarted and answers"; continue; fi
    (cd "$ROOT" && "${DOCKER[@]}" compose --project-name "$PROJECT" logs --tail 30 "$svc")
    die "$svc still does not answer after one restart. The last log lines are above; fix the cause, then run ./aegis.sh start."
  done
}
remove_stale() { # call only after assert_ownership: every project container is from this checkout
  local ids id
  ids="$("${DOCKER[@]}" ps -a --filter "label=com.docker.compose.project=$PROJECT" --filter status=dead --filter status=created --format '{{.ID}}')"
  if [ -z "$ids" ]; then say OK 'No broken leftover containers of this project'; return; fi
  # docker rm without -v: named volumes (the database) are never removed.
  for id in $ids; do "${DOCKER[@]}" rm "$id" >/dev/null; done
  say fixed 'Removed broken leftover containers of this project (data volumes kept)'
}
idp_container() { "${DOCKER[@]}" ps --filter "label=com.docker.compose.project=$PROJECT" --filter label=com.docker.compose.service=local-idp --format '{{.ID}}'; }
# Residual risk (same as the reviewed update-local-idp.ps1): kcadm has no stdin password option, so the provider's local
# bootstrap password is briefly on a command line inside the provider container only.
# shellcheck disable=SC2016
KC_LOGIN="$IDPMIG_KC_LOGIN"   # one definition, in scripts/migrate-local-idp-address.sh
# shellcheck disable=SC2016
KC_CLIENT='CID=$($K get clients -r indtrana-exercise -q clientId=indtrana-local-web --fields id --format csv --noquotes | head -1); '
sync_signin_origins() {
  # Adds http://localhost:<web port> when the web port moved; removes origins this script added earlier (recorded in
  # the state file) once they are no longer in use. Never removes anything it did not record. Accounts untouched.
  [ "$SIGN_IN" = 1 ] || return 0
  idp_on_old_address && return 0   # the client has the old name until the address is moved
  local origin="http://localhost:$WEB_PORT" add='' drop='' o id current update
  [ "$WEB_PORT" != "$DEFAULT_WEB" ] && add="$origin"
  for o in $ADDED_ORIGINS; do [ "$o" != "$origin" ] && drop="$drop $o"; done
  # Also a repair: an earlier version of this function could drop the PKCE requirement and the sign-out return address
  # of the default app address, so both are checked on every run and put back when missing.
  id="$(idp_container)"
  if [ "$(printf '%s\n' "$id" | grep -c .)" != 1 ]; then
    [ -z "$add" ] && [ -z "$drop" ] && return 0
    die 'The identity provider is not running, so the sign-in addresses could not be updated.'
  fi
  # shellcheck disable=SC2016
  # The whole client is read: with --fields attributes the admin tool prints an empty map and hides the values.
  current="$("${DOCKER[@]}" exec "$id" sh -c "$KC_LOGIN$KC_CLIENT"'$K get clients/$CID -r indtrana-exercise')" || die 'Could not read the sign-in client settings.'
  case "$current" in *ADMIN_LOGIN_FAILED*) die 'The identity provider refused its local administrator; sign-in addresses were not changed.' ;; esac
  update="$(printf '%s' "$current" | ADD="$add" DROP="$drop" DEFAULT="http://localhost:$DEFAULT_WEB" python3 -c '
import json, os, sys
c = json.load(sys.stdin)
r = list(c.get("redirectUris") or []); w = list(c.get("webOrigins") or [])
l = [x for x in str((c.get("attributes") or {}).get("post.logout.redirect.uris") or "").split("##") if x]
a = dict(c.get("attributes") or {})  # keep every other attribute
before = (list(r), list(w), list(l), a.get("pkce.code.challenge.method"))
for o in os.environ["DROP"].split():
    r = [x for x in r if x != o + "/api/auth/callback"]; w = [x for x in w if x != o]; l = [x for x in l if x != o]
for o in os.environ["ADD"].split():
    for lst, val in ((r, o + "/api/auth/callback"), (w, o), (l, o)):
        if val not in lst: lst.append(val)
if os.environ["DEFAULT"] not in l: l.insert(0, os.environ["DEFAULT"])
a["pkce.code.challenge.method"] = "S256"; a["post.logout.redirect.uris"] = "##".join(l)
print("" if (r, w, l, "S256") == before else json.dumps({"redirectUris": r, "webOrigins": w, "attributes": a}))
')" || die 'Could not prepare the sign-in client update.'
  if [ -n "$update" ]; then
    # shellcheck disable=SC2016
    printf '%s' "$update" | "${DOCKER[@]}" exec -i "$id" sh -c "$KC_LOGIN$KC_CLIENT"'cat > /tmp/aegis-client.json; $K update clients/$CID -r indtrana-exercise -m -f /tmp/aegis-client.json >/dev/null; code=$?; rm -f /tmp/aegis-client.json; exit $code' ||
      die 'Could not update the sign-in addresses in the provider.'
  fi
  ADDED_ORIGINS="$add"; write_state
  [ -n "$add" ] && say fixed "Sign-in also accepts $add (callback, origin and sign-out address)"
  for o in $drop; do say fixed "Removed the earlier extra sign-in address $o (added by this script)"; done
  return 0
}
idp_on_old_address() { [ -f "$IDP_DIR/realm.json" ] && grep -Eq '"realm"[[:space:]]*:[[:space:]]*"aegis-exercise"' "$IDP_DIR/realm.json"; }
IDP_MOVE_HELP='Run: bash scripts/migrate-local-idp-address.sh (see docs/LOCAL_IDP_ADDRESS.md)'
confirm_idp_address() { # $1 = 1 to offer the move (provider running), 0 to report only
  # Port of Confirm-IdpAddress (scripts/aegis.ps1). Moving stops the provider for a backup and signs everyone out, so
  # it is asked once on a terminal; --yes answers yes (like -Yes on Windows); --ci or no terminal never moves it. After a failed attempt or a rollback the hold
  # marker stops further automatic attempts until the owner runs the migration script explicitly.
  [ "$SIGN_IN" = 1 ] && [ -f "$IDP_DIR/realm.json" ] || return 0
  if ! idp_on_old_address; then say OK 'Sign-in provider already on the IndTrana address (indtrana-idp.localhost); nothing to move'; return 0; fi
  if [ -f "$IDP_DIR/address-migration.hold" ]; then say 'needs you' "The sign-in provider still uses the old address and automatic moving is on hold. $IDP_MOVE_HELP"; return 0; fi
  if [ "$1" != 1 ]; then say 'needs you' "The sign-in provider still uses the old address; ./aegis.sh start offers to move it. $IDP_MOVE_HELP"; return 0; fi
  if [ "$CI_MODE" = 1 ] || [ ! -t 0 ]; then say 'needs you' "The sign-in provider still uses the old address (sign-in will not work until it is moved). $IDP_MOVE_HELP"; return 0; fi
  if ! confirm 'Move the sign-in provider to the IndTrana address now? (backup first, accounts kept, everyone signs in again)'; then
    say 'needs you' "Sign-in provider not moved; sign-in will not work until it is. $IDP_MOVE_HELP"; return 0
  fi
  say info 'Moving the sign-in provider to the IndTrana address (backup first; accounts are kept)'
  # Same process: the lock taken by take_lock and the ownership check already cover this step.
  idpmig_bind "$PROJECT" "$IDP_DIR" "$PRIVATE" "$ROOT"
  if ! idpmig_migrate; then
    say FAIL "$IDPMIG_ERR"
    idpmig_write_hold 'automatic attempt failed'
    die "Moving the sign-in provider failed; automatic attempts are now on hold. Read the message above. $IDP_MOVE_HELP"
  fi
  say fixed 'Sign-in provider moved to indtrana-idp.localhost; everyone signs in again'
}
start_stack() {
  if is_running; then
    read_state; export_ports
    say OK 'IndTrana is already running (one copy only; nothing new started)'
    confirm_healthy 1; confirm_idp_address 1; return
  fi
  remove_stale
  resolve_ports; export_ports
  assert_single 0
  compose_files
  if [ "$NO_BUILD" != 1 ]; then
    # Build separately so that only a build failure leads to the one rebuild without cache.
    say info 'Building the images (the first build takes several minutes)'
    if ! (cd "$ROOT" && "${DOCKER[@]}" "${BUILD_FILES[@]}" build); then
      say info 'The build failed; building once more without the build cache'
      (cd "$ROOT" && "${DOCKER[@]}" "${BUILD_FILES[@]}" build --no-cache) || die 'The images still do not build. Read the build output above, fix the cause, then run ./aegis.sh start.'
      say fixed 'Images built without the cache'
    fi
  fi
  say info 'Starting IndTrana'
  (cd "$ROOT" && "${DOCKER[@]}" "${FILES[@]}" up -d) || die 'Start failed. Run ./aegis.sh doctor, then ./aegis.sh start.'
  assert_single 1
  confirm_healthy 1
  confirm_idp_address 1
  sync_signin_origins
}
demo_accounts() { # port of new-demo-accounts.ps1 for the four base roles only
  local id file="$IDP_DIR/demo-credentials.txt" input='' result created=0
  id="$(idp_container)"; [ "$(printf '%s\n' "$id" | grep -c .)" = 1 ] || die 'The local identity provider is not running.'
  # Plain indexed arrays: macOS ships bash 3.2, which has no associative arrays.
  local names=(demo-maker demo-checker demo-auditor demo-admin) roles=(incident_operator incident_checker incident_auditor platform_admin)
  local pass=() i name role
  for i in 0 1 2 3; do
    pass[i]="$(head -c 18 /dev/urandom | base64 | tr '+/' '-_')"
    input="$input${names[i]},${pass[i]},${roles[i]}"$'\n'
  done
  # Passwords travel on stdin and in a private temporary file inside the container (printf is a shell builtin), never on
  # a command line: each account is created from a JSON document that already contains its credential.
  # shellcheck disable=SC2016
  result="$(printf '%s' "$input" | "${DOCKER[@]}" exec -i "$id" sh -c "$KC_LOGIN"'
umask 077
while IFS=, read -r u p r; do
  case $u in demo-maker|demo-checker|demo-auditor|demo-admin) ;; *) continue ;; esac
  found=$($K get users -r indtrana-exercise -q username=$u -q exact=true --fields username --format csv --noquotes 2>/dev/null)
  case $found in *$u*) echo EXISTS,$u; continue ;; esac
  f=/tmp/aegis-user-$$.json
  printf "{\"username\":\"%s\",\"enabled\":true,\"emailVerified\":true,\"firstName\":\"Demo\",\"lastName\":\"%s\",\"email\":\"%s@example.invalid\",\"credentials\":[{\"type\":\"password\",\"value\":\"%s\",\"temporary\":false}]}" "$u" "$u" "$u" "$p" > $f
  if $K create users -r indtrana-exercise -f $f >/dev/null 2>&1 &&
     $K add-roles -r indtrana-exercise --uusername $u --cclientid indtrana-local-web --rolename $r >/dev/null 2>&1
  then echo CREATED,$u; else echo FAILED,$u; fi
  rm -f $f
done')" || die 'Could not run the account tool inside the identity provider container.'
  case "$result" in *ADMIN_LOGIN_FAILED*) die 'The identity provider rejected its local bootstrap administrator. No account was created.' ;; esac
  (umask 077; [ -f "$file" ] || echo 'IndTrana local demo sign-ins (synthetic exercise only). Keep this file private.' > "$file")
  for i in 0 1 2 3; do
    name="${names[i]}"; role="${roles[i]}"
    if printf '%s\n' "$result" | grep -qx "CREATED,$name"; then printf '%s\t%s\t%s\n' "$name" "${pass[i]}" "$role" >> "$file"; created=1; say fixed "$name created ($role)"
    elif printf '%s\n' "$result" | grep -qx "EXISTS,$name"; then say OK "$name already existed, left unchanged"
    else die "$name could not be created completely. Inspect it in the identity provider before retrying."; fi
  done
  chmod 600 "$file"
  [ "$created" = 1 ] && say OK "Passwords for new accounts were saved to $file (not printed)"
  say 'needs you' 'Department-desk and response-team demo accounts (and their provider roles) are created by the Windows scripts only; they are not set up here.'
}
stop_stack() {
  if [ -z "$(inventory)" ]; then say OK 'IndTrana is already stopped'; return; fi
  assert_single 0
  (cd "$ROOT" && "${DOCKER[@]}" compose --project-name "$PROJECT" stop) || die 'Stop failed. Run ./aegis.sh doctor.'
  say OK 'IndTrana stopped; containers and the database volume are kept'
}
status_stack() {
  read_state
  local line svc name
  while IFS='|' read -r svc _ _ name _; do [ -n "$name" ] && say info "running: $svc ($name)"; done <<< "$(inventory)"
  is_running || { say info 'IndTrana is not running. Start it with: ./aegis.sh start'; return 3; }
  local rc=0
  for line in "API|http://localhost:$API_PORT/health" "Web|http://localhost:$WEB_PORT/"; do
    if http_ok "${line#*|}"; then say OK "${line%%|*} answers at ${line#*|}"; else say 'needs you' "${line%%|*} does not answer at ${line#*|}; run ./aegis.sh doctor"; rc=3; fi
  done
  return $rc
}

# ---------- main ----------
# Sourced (scripts/migrate-local-idp-address.sh uses this as a library): define everything, run nothing.
if [ "${BASH_SOURCE[0]}" != "$0" ]; then return 0; fi
case "$COMMAND" in help) usage; exit 0 ;; esac
[ "$STAFF_EMAIL" = 1 ] && die 'Staff email notices need scripts/update-local-idp.ps1 (it locks email changes to administrators), which is not ported to macOS/Linux yet. Start without --staff-email.'
cd "$ROOT" || exit 1
detect_platform
case "$COMMAND" in
  detect)
    for t in git curl python3 docker; do if command -v "$t" >/dev/null 2>&1; then say OK "$t found"; else say 'needs you' "$t missing (install would add it)"; fi; done
    if command -v docker >/dev/null 2>&1 && docker_ok; then
      say OK 'Docker engine reachable'
      if [ -n "$(inventory)" ]; then say info 'IndTrana containers exist on this Docker:'; inventory | awk -F'|' '{print "           " $1 " (" $4 ") from " $2}'; fi
    else say info 'Docker engine not reachable from here'; fi
    for p in $DEFAULT_WEB $DEFAULT_API $IDP_PORT; do if port_in_use "$p"; then say info "port $p in use by $(port_holder "$p")"; else say OK "port $p free"; fi; done
    say info "private folder: $PRIVATE"
    exit 0 ;;
  status)
    if command -v docker >/dev/null 2>&1 && ! docker_ok && docker info 2>&1 | grep -qi 'permission denied' && command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
      DOCKER=("${SUDO_DOCKER[@]}")
    fi
    if ! command -v docker >/dev/null 2>&1 || ! docker_ok; then say info 'Docker is not running here, so IndTrana is not running.'; exit 3; fi
    status_stack; exit $? ;;
esac
take_lock
ensure_dependencies
# Ownership is checked first in every changing command: never touch containers another checkout or system created.
case "$COMMAND" in
  stop) assert_ownership; stop_stack ;;
  doctor)
    assert_single 0; ensure_env_file; ensure_signin_files; remove_stale
    if is_running; then read_state; export_ports; confirm_healthy 1; confirm_idp_address 1; sync_signin_origins
    else say info 'IndTrana is stopped; checking the ports it would use'; resolve_ports; confirm_idp_address 0; fi
    say OK 'Doctor finished' ;;
  install|start)
    assert_single 0; ensure_env_file; ensure_signin_files
    start_stack
    [ "$COMMAND" = install ] && [ "$SIGN_IN" = 1 ] && demo_accounts
    say OK "IndTrana is running: http://localhost:$WEB_PORT" ;;
esac
exit 0
