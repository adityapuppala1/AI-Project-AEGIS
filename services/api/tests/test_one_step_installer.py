"""Static wiring checks for the one-step installers (aegis.cmd / scripts/aegis.ps1 / aegis.sh)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_compose_ports_default_to_the_documented_values():
    compose = (ROOT / "compose.yaml").read_text()
    assert '"127.0.0.1:${AEGIS_WEB_PORT:-3000}:3000"' in compose
    assert '"127.0.0.1:${AEGIS_API_PORT:-8000}:8000"' in compose
    # CORS follows the web address so a moved web port stays consistent.
    assert "CORS_ORIGIN: ${APP_ORIGIN:-http://localhost:3000}" in compose


def test_sign_in_port_is_never_remapped():
    idp = (ROOT / "compose.local-idp.yaml").read_text()
    assert "'127.0.0.1:8443:8443'" in idp
    assert "AEGIS_IDP_PORT" not in idp


def test_installers_exist_and_keep_the_single_project():
    windows = (ROOT / "scripts/aegis.ps1").read_text()
    posix = (ROOT / "aegis.sh").read_text()
    assert (ROOT / "aegis.cmd").exists()
    assert "Invoke-AegisLocalOperation" in windows and "start-windows.ps1" in windows
    assert "PROJECT=ai-project-aegis" in posix
    for script in (windows, posix):
        assert "down -v" not in script and "volume rm" not in script
        assert "runtime-ports.env" in script


def test_shell_scripts_stay_lf():
    attributes = (ROOT / ".gitattributes").read_text()
    assert "*.sh text eol=lf" in attributes
    assert b"\r\n" not in (ROOT / "aegis.sh").read_bytes()
    assert b"\r\n" not in (ROOT / "scripts/migrate-local-idp-address.sh").read_bytes()


def test_posix_address_migration_keeps_every_safeguard():
    script = (ROOT / "scripts/migrate-local-idp-address.sh").read_text()
    # Never removes a volume or the stack, never prints or creates accounts.
    for forbidden in ("down -v", "volume rm", "prune", "create users", "delete users", "reset-password"):
        assert forbidden not in script
    # Exactly one container per service of this project, volumes found from the mounts.
    assert 'label=com.docker.compose.project=$IDPMIG_PROJECT' in script and "Expected exactly one" in script
    assert "{{json .Mounts}}" in script
    # Verified backups: tar exit status, required store file, entry count equal to the source.
    assert "./h2/keycloakdb.mv.db" in script and "./caddy/pki/authorities/local/root.crt" in script
    assert "tar tzf /backup/$2.tgz > /backup/$2.list" in script and "the source had" in script
    # Private backups, provider restarted even after a failure, restore swaps only after a complete extract.
    assert "umask 077" in script and "chmod 700" in script and "chmod 600" in script
    assert 'idpmig_trap_set "idpmig_start_containers' in script and "--sig-proxy=false" in script
    assert "Restore interrupted; the provider data may be incomplete." in script and "realm.json.pre-fix" in script
    assert ".indtrana-restore" in script and ".indtrana-previous" in script
    # Refusals and restore-on-failure reporting both errors.
    for text in ("Both $IDPMIG_OLD_REALM and $IDPMIG_NEW_REALM exist", "The exercise realm was not found",
                 "IDPMIG_MAX_ACCOUNTS=999", "No accounts were listed", "Restore ALSO failed",
                 "Private realm file matched to the provider again", "already migrated", "address-migration.hold", "-before-rollback", "Rollback not confirmed"):
        assert text.lower() in script.lower()
    # Mapper JSON travels on stdin into a private file, never on a command line; role claim asserted read-only.
    assert "cat > /tmp/aegis-mapper.json" in script and "aegis_roles" in script
    # Sourcing defines functions only; the entry point reuses aegis.sh (lock, ownership, single runtime).
    assert 'if [ "${BASH_SOURCE[0]}" = "$0" ]; then' in script
    assert "take_lock" in script and "assert_single 1" in script


def test_posix_installer_offers_the_move_like_windows():
    posix = (ROOT / "aegis.sh").read_text()
    assert "scripts/migrate-local-idp-address.sh" in posix and "confirm_idp_address" in posix
    assert "address-migration.hold" in posix and "idpmig_write_hold 'automatic attempt failed'" in posix
    # --ci or no terminal never moves the address; doctor reports the state when stopped.
    assert '[ "$CI_MODE" = 1 ] || [ ! -t 0 ]' in posix
    assert "confirm_idp_address 0" in posix and "confirm_idp_address 1" in posix
    # Library mode for the migration script; ownership is still checked before any sign-in step.
    assert 'if [ "${BASH_SOURCE[0]}" != "$0" ]; then return 0; fi' in posix
    assert "assert_single 0; ensure_env_file; ensure_signin_files" in posix
    assert "Move it with the steps in docs/LOCAL_IDP_ADDRESS.md" not in posix


# ---------- behavioural checks of scripts/migrate-local-idp-address.sh with a fake docker (no real docker at all) ----------
import os
import shutil
import subprocess
import sys

import pytest


def _find_bash():
    if os.name == "nt":
        # Git Bash only: C:\Windows\System32\bash.exe is WSL, which shares the real Docker daemon.
        for candidate in (r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files (x86)\Git\bin\bash.exe"):
            if os.path.exists(candidate):
                return candidate
        git = shutil.which("git")
        if git:
            guess = Path(git).resolve().parents[1] / "bin" / "bash.exe"
            if guess.exists():
                return str(guess)
        return None
    return shutil.which("bash")


FAKE_PRELUDE = r'''
set -u
. "$IDPMIG_SCRIPT"
T="$(mktemp -d)"; LOG="$T/docker.log"; : > "$LOG"
python3() { # Git Bash: the native Windows Python needs Windows paths for files under $T
  local a args=()
  for a in "$@"; do case "$a" in "$T"/*) a="$(cygpath -m "$a" 2>/dev/null || printf '%s' "$a")" ;; esac; args+=("$a"); done
  "$IDPMIG_PY" "${args[@]}"
}
trap 'rm -rf "$T"' EXIT
idpmig_bind fake-proj "$T/idp" "$T/private" "$IDPMIG_REPO"
mkdir -p "$T/idp" "$T/private"
printf '{"realm": "aegis-exercise", "clientId": "aegis-local-web"}' > "$T/idp/realm.json"
REALMS='aegis-exercise
master'
COUNT_MISMATCH=0; RESTORE_FAILS=0; INT_ON_STOP=0; CLIENT_ID=6f1c2d3e-0000-4000-8000-00000000c1d0
MAPPER_ID=7a1c2d3e-0000-4000-8000-00000000a1b0
sleep() { :; }
fake_docker() {
  local a cmd folder name
  case "$1" in
    ps) case "$*" in *service=local-idp-tls*) echo id-tls ;; *) echo id-idp ;; esac ;;
    inspect) echo '[{"Destination":"/opt/keycloak/data","Type":"volume","Name":"v-data"},{"Destination":"/data","Type":"volume","Name":"v-tls"}]' ;;
    stop|start) echo "$1 $2" >> "$LOG"
                [ "$1" = stop ] && [ "$INT_ON_STOP" = 1 ] && kill -INT "$BASHPID" ;;
    exec)
      cmd="${*: -1}"
      case "$cmd" in
        *'echo READY'*) echo READY ;;
        *'get realms'*) printf '%s\n' "$REALMS" ;;
        *'get users'*) echo 0f8fad5b-d9cb-469f-a165-70867728950e ;;
        *'get clients -r'*) echo "$CLIENT_ID" ;;
        *'update clients/'*'/protocol-mappers/'*) cat > /dev/null; : > "$T/mapper-updated" ;;
        *'protocol-mappers/models -r'*)
          if [ -e "$T/mapper-updated" ]; then c=indtrana-local-web; else c=aegis-local-web; fi
          printf '[{"id":"%s","name":"signed-app-roles","protocolMapper":"oidc-usermodel-client-role-mapper","config":{"claim.name":"aegis_roles","access.token.claim":"true","usermodel.clientRoleMapping.clientId":"%s"}}]' "$MAPPER_ID" "$c" ;;
      esac
      case "$cmd" in *'x;rm'*) echo LEAK >> "$LOG" ;; esac ;;
    run)
      echo "run" >> "$LOG"
      folder=''; for a in "$@"; do case "$a" in *:/backup*) folder="${a%%:/backup*}" ;; esac; done
      cmd="${*: -1}"
      case "$cmd" in
        *'tar czf'*) name="$(printf '%s' "$cmd" | sed 's#.*tar czf /backup/\([a-z-]*\)\.tgz.*#\1#')"
                     echo 2 > "$folder/$name.source-count"; : > "$folder/$name.tgz" ;;
        *'tar tzf'*) name="$(printf '%s' "$cmd" | sed 's#.*tar tzf /backup/\([a-z-]*\)\.tgz.*#\1#')"
                     if [ "$name" = keycloak-data ]; then printf './\n./h2/\n./h2/keycloakdb.mv.db\n' > "$folder/$name.list"
                     else printf './\n./caddy/\n./caddy/pki/authorities/local/root.crt\n' > "$folder/$name.list"; fi
                     [ "$COUNT_MISMATCH" = 1 ] && echo ./extra >> "$folder/$name.list"
                     : ;;
        *'tar xzf'*) [ "$RESTORE_FAILS" = 1 ] && return 1 ;;
      esac ;;
  esac
  return 0
}
DOCKER=(fake_docker)
report() { echo "RC=$1"; echo "ERR=$IDPMIG_ERR"; echo "LOG=$(tr '\n' ',' < "$LOG")"; }
'''


def _run_fake(body):
    bash = _find_bash()
    if not bash:
        pytest.skip("no bash found (Git Bash on Windows)")
    env = dict(os.environ)
    env.update({
        "IDPMIG_SCRIPT": (ROOT / "scripts/migrate-local-idp-address.sh").as_posix(),
        "IDPMIG_REPO": ROOT.as_posix(),
        "IDPMIG_PY": Path(sys.executable).as_posix(),
        # Git Bash would otherwise rewrite /opt/... arguments into Windows paths for the native Python.
        "MSYS2_ARG_CONV_EXCL": "*",
    })
    result = subprocess.run([bash, "-c", FAKE_PRELUDE + body], capture_output=True, text=True, env=env, timeout=120)
    return result.stdout + result.stderr


def test_migration_backup_count_mismatch_fails_and_restarts_the_provider():
    out = _run_fake('COUNT_MISMATCH=1; idpmig_backup_all "$T/private/local-idp-backups/b1"; report $?')
    assert "RC=1" in out
    assert "the source had 2" in out
    assert "stop id-idp" in out and out.index("stop id-idp") < out.index("start id-idp")


def test_migration_refuses_when_both_realms_exist_and_changes_nothing():
    out = _run_fake(
        'REALMS="aegis-exercise\nindtrana-exercise\nmaster"; before="$(cat "$T/idp/realm.json")"; '
        'idpmig_migrate; rc=$?; [ "$before" = "$(cat "$T/idp/realm.json")" ] && echo FILE_SAME; '
        '[ -e "$T/private/local-idp-backups" ] || echo NO_BACKUP; report $rc'
    )
    assert "RC=1" in out and "Both aegis-exercise and indtrana-exercise exist" in out
    assert "FILE_SAME" in out and "NO_BACKUP" in out
    assert "stop " not in out and "run" not in out.split("LOG=")[1]


def test_migration_failing_restore_reports_both_errors():
    out = _run_fake(
        'RESTORE_FAILS=1; idpmig_rename() { idpmig_fail "rename broke"; return 1; }; idpmig_migrate; report $?'
    )
    assert "RC=1" in out
    assert "Migration failed: rename broke" in out and "Restore ALSO failed: The backup tool container failed." in out
    assert "Backup kept at" in out
    assert "start id-tls" in out and out.rstrip().endswith("start id-idp,")


def test_rollback_without_terminal_or_backup_refuses():
    out = _run_fake('mkdir -p "$T/private/local-idp-backups/20260101-000000"; idpmig_rollback "" < /dev/null; report $?')
    assert "RC=1" in out and "Rollback needs --backup <folder> or a terminal" in out
    assert "LOG=\n" in out or out.rstrip().endswith("LOG=")


@pytest.mark.parametrize("path, message", [
    ("C:/backups/x", "must not contain a colon"),
    ("/tmp/a:b", "must not contain a colon"),
    ("no-such-bare-name", "could not be resolved"),
])
def test_rollback_backup_path_is_resolved_and_checked(path, message):
    out = _run_fake(f'idpmig_rollback "{path}" < /dev/null; report $?')
    assert "RC=1" in out and message in out
    assert out.rstrip().endswith("LOG=")


def test_interrupt_during_backup_stop_restarts_the_provider_and_leaves_no_trap():
    # The fake stop sends INT to the shell running the backup (BASHPID: the subshell, so this test's shell survives).
    out = _run_fake(
        'export TMPDIR="$T"; INT_ON_STOP=1; ( idpmig_backup_all "$T/private/local-idp-backups/b1" ); rc=$?; '
        'echo "TRAPS=[$(trap -p INT TERM)]"; ls -d "$T"/idpmig-traps.* >/dev/null 2>&1 && echo TRAP_FILES_LEFT; report $rc'
    )
    assert "RC=130" in out
    assert "stop id-idp" in out and out.index("stop id-idp") < out.index("start id-idp")
    assert "TRAPS=[]" in out and "TRAP_FILES_LEFT" not in out


def test_non_uuid_client_id_stops_before_any_shell_use():
    out = _run_fake('CLIENT_ID="x;rm"; idpmig_rename id-idp "$T" "id1"; report $?')
    assert "RC=1" in out and "Unexpected client id" in out
    assert "LEAK" not in out


def test_migration_through_the_fake_renames_realm_json_in_place():
    out = _run_fake(
        'mkdir -p "$T/private"; i1="$(stat -c %i "$T/idp/realm.json")"; idpmig_migrate; rc=$?; '
        'i2="$(stat -c %i "$T/idp/realm.json")"; [ "$i1" = "$i2" ] && echo INODE_SAME; '
        'grep -q "\\"indtrana-exercise\\"" "$T/idp/realm.json" && grep -q "\\"indtrana-local-web\\"" "$T/idp/realm.json" && echo NAMES_NEW; '
        'report $rc'
    )
    assert "RC=0" in out, out
    assert "INODE_SAME" in out and "NAMES_NEW" in out


def test_sign_in_client_updates_never_drop_its_settings():
    """The admin tool prints an empty attribute map for `--fields ...attributes`; an update built from that dropped the
    PKCE requirement and the sign-out return address. Reads take the whole client and file updates are merged."""
    import json
    import re

    scripts = [ROOT / "aegis.sh", *sorted((ROOT / "scripts").glob("*.ps1")), *sorted((ROOT / "scripts").glob("*.sh"))]
    for script in scripts:
        for line in script.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.lstrip().startswith("#"):
                continue
            assert not re.search(r"--fields[^\n]*(attributes|config)", line), f"{script.name}: {line.strip()[:120]}"
            if re.search(r"update (clients|realms)/\S+ ", line) and " -f " in line and "protocol-mappers" not in line:
                assert " -m " in line, f"{script.name}: unmerged file update: {line.strip()[:120]}"

    posix = (ROOT / "aegis.sh").read_text(encoding="utf-8")
    program = re.search(r"python3 -c '\n(import json, os, sys\n.*?)\n'\)\"", posix, re.S)
    assert program, "sign-in address program not found in aegis.sh"
    damaged = {"redirectUris": ["http://localhost:3000/api/auth/callback"], "webOrigins": ["http://localhost:3000"],
               "attributes": {"realm_client": "false"}}
    healthy = {**damaged, "attributes": {"realm_client": "false", "pkce.code.challenge.method": "S256",
                                         "post.logout.redirect.uris": "http://localhost:3000"}}

    def run(client, add="", drop=""):
        env = {**os.environ, "ADD": add, "DROP": drop, "DEFAULT": "http://localhost:3000"}
        done = subprocess.run([sys.executable, "-c", program.group(1)], input=json.dumps(client), env=env,
                              capture_output=True, text=True, check=True)
        return json.loads(done.stdout) if done.stdout.strip() else None

    repaired = run(damaged)
    assert repaired["attributes"] == healthy["attributes"]
    assert run(healthy) is None
    moved = run(healthy, add="http://localhost:3001")
    assert moved["attributes"]["post.logout.redirect.uris"] == "http://localhost:3000##http://localhost:3001"
    assert moved["attributes"]["pkce.code.challenge.method"] == "S256" and moved["attributes"]["realm_client"] == "false"
    assert "http://localhost:3001/api/auth/callback" in moved["redirectUris"]
    back = run({**healthy, "redirectUris": moved["redirectUris"], "webOrigins": moved["webOrigins"],
                "attributes": moved["attributes"]}, drop="http://localhost:3001")
    assert back["attributes"] == healthy["attributes"] and back["redirectUris"] == healthy["redirectUris"]
