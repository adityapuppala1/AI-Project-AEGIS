#!/usr/bin/env bash
# macOS/Linux port of scripts/migrate-local-idp-address.ps1. Moves an existing LOCAL exercise identity provider from
# the old sign-in address to the IndTrana one:
#   https://aegis-idp.localhost:8443/realms/aegis-exercise  ->  https://indtrana-idp.localhost:8443/realms/indtrana-exercise
#   web client aegis-local-web                             ->  indtrana-local-web
# The realm and client are renamed in place with the provider's admin tool, so every account, its id, password, roles
# and attributes stay exactly as they are. Nothing is deleted and no volume is removed or recreated.
# Before any change it backs up the provider data volume (provider stopped, so the copy is consistent), the HTTPS proxy
# volume (its local certificate authority) and the five private files, and verifies the archives: tar must read them
# (its own exit status, no pipe), the provider's database file (h2/keycloakdb.mv.db) and the proxy's root certificate
# must be in them, and the entry count must equal the number of files in the source. Backups hold password hashes, the
# bootstrap admin password and the local CA private key: folders are mode 700 and files 600 (docs/LOCAL_IDP_ADDRESS.md).
# Safe to run again: an install already on the new address reports "already migrated" and changes nothing.
# Existing sign-in sessions end (the token issuer changes); people sign in again.
#   Migrate:   bash scripts/migrate-local-idp-address.sh
#   Roll back: bash scripts/migrate-local-idp-address.sh --rollback --backup <folder>
#              (without --backup it shows the newest backup and asks you to type its time stamp). A safety backup of
#              the current state is taken first, and a hold marker stops ./aegis.sh from migrating again automatically.
# It never prints a secret and never creates, changes or deletes an account.
# Sourcing this file only defines functions (aegis.sh and the scratch tests do that). The low-level functions take
# container ids, volume names and folders as arguments. Runs under bash 3.2 (macOS) and Linux bash.

IDPMIG_OLD_REALM=aegis-exercise; IDPMIG_NEW_REALM=indtrana-exercise
IDPMIG_OLD_CLIENT=aegis-local-web; IDPMIG_NEW_CLIENT=indtrana-local-web
IDPMIG_PRIVATE_FILES='provider.env app.env realm.json root.crt api-ca-bundle.pem'
IDPMIG_PROVIDER_STORE=./h2/keycloakdb.mv.db
IDPMIG_PROXY_STORE=./caddy/pki/authorities/local/root.crt
IDPMIG_MAX_ACCOUNTS=999
IDPMIG_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# Bound by idpmig_bind from aegis.sh's own values (project, private folder); the scratch tests set throwaway ones.
IDPMIG_PROJECT=''; IDPMIG_IDP_DIR=''; IDPMIG_BACKUP_ROOT=''; IDPMIG_ROOT="$(dirname "$IDPMIG_SCRIPT_DIR")"
IDPMIG_ERR=''; IDPMIG_OUT=''; IDPMIG_CHANGED=0; IDPMIG_COUNT=0
declare -p DOCKER >/dev/null 2>&1 || DOCKER=(docker)
# Residual risk (same as the reviewed .ps1 and update-local-idp.ps1): kcadm has no stdin password option, so the
# provider's local bootstrap password is briefly on a command line inside the provider container only.
# shellcheck disable=SC2016
IDPMIG_KC_LOGIN='K=/opt/keycloak/bin/kcadm.sh; $K config credentials --server http://localhost:8080 --realm master --user $KC_BOOTSTRAP_ADMIN_USERNAME --password $KC_BOOTSTRAP_ADMIN_PASSWORD >/dev/null 2>&1 || { echo ADMIN_LOGIN_FAILED; exit 0; }; '

idpmig_say() { # status message
  if declare -F say >/dev/null 2>&1; then say "$1" "$2"; else printf '%-10s %s\n' "$1" "$2"; fi
}
idpmig_fail() { IDPMIG_ERR="$1"; return 1; }
# INT/TERM traps: a small stack. Each guarded step pushes the traps in place and pops them back afterwards, so nested
# steps (a restore inside the rename's handler, a backup inside a rollback) never clobber each other or a caller's traps
# (aegis.sh only uses EXIT). `trap -p` writes to a private file, not into a command substitution: bash 3.2 reports the
# traps of the subshell there, not ours.
IDPMIG_TRAP_DIR=''; IDPMIG_TRAP_DEPTH=0
idpmig_trap_set() { # handler
  if [ -z "$IDPMIG_TRAP_DIR" ] || [ ! -d "$IDPMIG_TRAP_DIR" ]; then
    IDPMIG_TRAP_DIR="$(umask 077; mktemp -d "${TMPDIR:-/tmp}/idpmig-traps.XXXXXX")" || IDPMIG_TRAP_DIR=''
  fi
  IDPMIG_TRAP_DEPTH=$((IDPMIG_TRAP_DEPTH + 1))
  [ -z "$IDPMIG_TRAP_DIR" ] || trap -p INT TERM > "$IDPMIG_TRAP_DIR/$IDPMIG_TRAP_DEPTH"
  # shellcheck disable=SC2064 # the handler text is built (with printf %q) by the caller on purpose
  trap "$1" INT TERM
}
idpmig_trap_restore() {
  trap - INT TERM
  if [ "$IDPMIG_TRAP_DEPTH" -gt 0 ]; then
    if [ -n "$IDPMIG_TRAP_DIR" ] && [ -f "$IDPMIG_TRAP_DIR/$IDPMIG_TRAP_DEPTH" ]; then
      # shellcheck source=/dev/null
      . "$IDPMIG_TRAP_DIR/$IDPMIG_TRAP_DEPTH"; rm -f "$IDPMIG_TRAP_DIR/$IDPMIG_TRAP_DEPTH"
    fi
    IDPMIG_TRAP_DEPTH=$((IDPMIG_TRAP_DEPTH - 1))
  fi
  [ "$IDPMIG_TRAP_DEPTH" -gt 0 ] || idpmig_trap_cleanup
}
idpmig_trap_cleanup() { [ -z "$IDPMIG_TRAP_DIR" ] || rm -rf "$IDPMIG_TRAP_DIR"; IDPMIG_TRAP_DIR=''; IDPMIG_TRAP_DEPTH=0; }
idpmig_uuid() { # value what: only a plain UUID may be placed in a shell command inside the container
  printf '%s\n' "$1" | grep -Eqx '[0-9a-f-]{36}' || { idpmig_fail "Unexpected $2 id from the provider; nothing more was changed."; return 1; }
}
idpmig_check_folder() { # folder: absolute, no colon (it is passed to docker run -v)
  case "$1" in /*) ;; *) idpmig_fail "Backup folder must be an absolute path: $1"; return 1 ;; esac
  case "$1" in *:*) idpmig_fail "Backup folder must not contain a colon: $1"; return 1 ;; esac
}
idpmig_resolve_folder() { # path -> IDPMIG_OUT absolute physical path
  case "$1" in *:*) idpmig_fail "Backup folder must not contain a colon: $1. Nothing was changed."; return 1 ;; esac
  IDPMIG_OUT="$(CDPATH='' cd -- "$1" 2>/dev/null && pwd -P)" && [ -n "$IDPMIG_OUT" ] ||
    { idpmig_fail "Backup folder could not be resolved: $1. Nothing was changed."; return 1; }
  case "$IDPMIG_OUT" in *'
'*) idpmig_fail 'Backup folder must not contain a line break. Nothing was changed.'; return 1 ;; esac
  idpmig_check_folder "$IDPMIG_OUT"
}
idpmig_bind() { # project idp-dir private-folder repo-root
  IDPMIG_PROJECT="$1"; IDPMIG_IDP_DIR="$2"; IDPMIG_BACKUP_ROOT="$3/local-idp-backups"; IDPMIG_ROOT="$4"
}
idpmig_tool_image() {
  sed -n 's/^[[:space:]]*image:[[:space:]]*\(caddy:[^[:space:]]*\).*/\1/p' "$IDPMIG_ROOT/compose.local-idp.yaml" | head -1
}
idpmig_service_container() { # service -> IDPMIG_OUT = the one container id of this project
  [ -n "$IDPMIG_PROJECT" ] || { idpmig_fail 'No Compose project bound. Nothing was changed.'; return 1; }
  local ids n
  ids="$("${DOCKER[@]}" ps -a --filter "label=com.docker.compose.project=$IDPMIG_PROJECT" --filter "label=com.docker.compose.service=$1" --format '{{.ID}}')" ||
    { idpmig_fail 'Docker inventory failed. Nothing was changed.'; return 1; }
  n="$(printf '%s\n' "$ids" | grep -c .)"
  [ "$n" = 1 ] || { idpmig_fail "Expected exactly one $1 container of this project; found $n. Nothing was changed."; return 1; }
  IDPMIG_OUT="$ids"
}
idpmig_volume_name() { # container destination -> IDPMIG_OUT = named volume mounted there
  local mounts name
  mounts="$("${DOCKER[@]}" inspect -f '{{json .Mounts}}' "$1")" || { idpmig_fail "Could not inspect $1. Nothing was changed."; return 1; }
  name="$(printf '%s' "$mounts" | python3 -c '
import json, sys
for m in json.load(sys.stdin) or []:
    if m.get("Destination") == sys.argv[1] and m.get("Type") == "volume":
        print(m.get("Name", "")); break
' "$2")"
  [ -n "$name" ] || { idpmig_fail "Could not find the volume mounted at $2. Nothing was changed."; return 1; }
  IDPMIG_OUT="$name"
}
idpmig_protect() { # folder: owner only (700 folders, 600 files)
  chmod 700 "$1" || { idpmig_fail "Could not restrict the permissions of $1."; return 1; }
  if ! find "$1" -mindepth 1 -type d -exec chmod 700 {} + || ! find "$1" -mindepth 1 -type f -exec chmod 600 {} +; then
    idpmig_fail "Could not restrict the permissions inside $1."; return 1
  fi
}
idpmig_tool() { # volume folder volume-mode folder-mode command  (set -e: any failing step fails the tool)
  idpmig_check_folder "$2" || return 1
  local image; image="$(idpmig_tool_image)"
  [ -n "$image" ] || { idpmig_fail 'Could not read the HTTPS proxy image from compose.local-idp.yaml.'; return 1; }
  # --sig-proxy=false: a Ctrl-C is not passed on to the container, so a started swap finishes inside it (the
  # container is removed by the daemon when it ends) instead of stopping between the two moves.
  "${DOCKER[@]}" run --rm --sig-proxy=false -e "IDPMIG_UID=$(id -u)" -e "IDPMIG_GID=$(id -g)" -v "$1:/data$3" -v "$2:/backup$4" \
    --entrypoint sh "$image" -c "set -e; umask 077; $5" || { idpmig_fail 'The backup tool container failed.'; return 1; }
}
idpmig_test_archive() { # folder name required [expected] -> IDPMIG_COUNT
  local image list count
  idpmig_check_folder "$1" || return 1
  image="$(idpmig_tool_image)"
  [ -n "$image" ] || { idpmig_fail 'Could not read the HTTPS proxy image from compose.local-idp.yaml.'; return 1; }
  # tar must read the whole archive on its own (exit status checked, no pipe).
  "${DOCKER[@]}" run --rm -e "IDPMIG_UID=$(id -u)" -e "IDPMIG_GID=$(id -g)" -v "$1:/backup" --entrypoint sh "$image" -c \
    "set -e; umask 077; tar tzf /backup/$2.tgz > /backup/$2.list; chown \$IDPMIG_UID:\$IDPMIG_GID /backup/$2.list 2>/dev/null || true" ||
    { idpmig_fail "The $2 archive cannot be read."; return 1; }
  list="$1/$2.list"
  grep -Fxq -- "$3" "$list" || { idpmig_fail "The $2 archive does not contain $3."; return 1; }
  count="$(grep -v -x -e '' -e './' "$list" | grep -c .)"
  if [ -n "${4:-}" ] && [ "$count" != "$4" ]; then idpmig_fail "The $2 archive has $count entries; the source had $4."; return 1; fi
  IDPMIG_COUNT="$count"
}
idpmig_backup_volume() { # volume folder name required -> IDPMIG_COUNT
  idpmig_tool "$1" "$2" ':ro' '' "find /data -mindepth 1 | wc -l > /backup/$3.source-count; tar czf /backup/$3.tgz -C /data .; chown \$IDPMIG_UID:\$IDPMIG_GID /backup/$3.source-count /backup/$3.tgz 2>/dev/null || true" || return 1
  local expected; expected="$(tr -dc '0-9' < "$2/$3.source-count")"
  [ -n "$expected" ] || { idpmig_fail "The $3 source count could not be read."; return 1; }
  idpmig_test_archive "$2" "$3" "$4" "$expected"
}
idpmig_restore_volume() { # volume folder name required: check first; extract beside the live data; swap only after a complete extract
  idpmig_test_archive "$2" "$3" "$4" || return 1
  local check="${4#./}"
  idpmig_tool "$1" "$2" '' ':ro' "rm -rf /data/.indtrana-restore /data/.indtrana-previous; mkdir /data/.indtrana-restore; \
tar xzf /backup/$3.tgz -C /data/.indtrana-restore; test -e /data/.indtrana-restore/$check; \
mkdir /data/.indtrana-previous; \
find /data -mindepth 1 -maxdepth 1 ! -name .indtrana-restore ! -name .indtrana-previous -exec mv {} /data/.indtrana-previous/ \\;; \
find /data/.indtrana-restore -mindepth 1 -maxdepth 1 -exec mv {} /data/ \\;; \
rm -rf /data/.indtrana-restore /data/.indtrana-previous"
}
idpmig_kc() { # container script [stdin-text] -> IDPMIG_OUT. JSON goes on stdin, never on a command line.
  local rc
  if [ $# -ge 3 ]; then IDPMIG_OUT="$("${DOCKER[@]}" exec -i "$1" sh -c "$IDPMIG_KC_LOGIN$2" <<< "$3")"; rc=$?
  else IDPMIG_OUT="$("${DOCKER[@]}" exec "$1" sh -c "$IDPMIG_KC_LOGIN$2" < /dev/null)"; rc=$?; fi
  [ "$rc" = 0 ] || { idpmig_fail 'A command inside the identity provider container failed.'; return 1; }
  if printf '%s\n' "$IDPMIG_OUT" | grep -qx ADMIN_LOGIN_FAILED; then idpmig_fail ADMIN_LOGIN_FAILED; return 1; fi
  return 0
}
idpmig_wait() { # container
  local i=0
  while [ "$i" -lt 90 ]; do idpmig_kc "$1" 'echo READY' 2>/dev/null && return 0; sleep 2; i=$((i + 1)); done
  idpmig_fail 'The identity provider did not answer its admin tool within three minutes.'
}
idpmig_realms() { # container -> IDPMIG_OUT lines
  # shellcheck disable=SC2016
  idpmig_kc "$1" '$K get realms --fields realm --format csv --noquotes'
}
idpmig_user_ids() { # container realm -> IDPMIG_OUT sorted ids, IDPMIG_COUNT
  # One page of up to 1000; the comparison is only trusted below that, so more accounts stop the run.
  idpmig_kc "$1" "\$K get users -r $2 --limit 1000 --fields id --format csv --noquotes" || return 1
  IDPMIG_OUT="$(printf '%s\n' "$IDPMIG_OUT" | grep . | LC_ALL=C sort)"
  IDPMIG_COUNT="$(printf '%s\n' "$IDPMIG_OUT" | grep -c .)"
  [ "$IDPMIG_COUNT" -le "$IDPMIG_MAX_ACCOUNTS" ] || { idpmig_fail "More than $IDPMIG_MAX_ACCOUNTS accounts: the id comparison would be incomplete. Nothing was changed."; return 1; }
}
# Kept in a variable so no here-document sits inside a command substitution (bash 3.2).
IDPMIG_PY_SWAP='import os, sys
path, fr, tr, fc, tc = sys.argv[1:6]
Q = chr(34)
with open(path, "rb") as handle:
    data = handle.read()
new = data.replace((Q + fr + Q).encode(), (Q + tr + Q).encode()).replace((Q + fc + Q).encode(), (Q + tc + Q).encode())
if new == data:
    print("same"); sys.exit(0)
# In place (same file, same mode), like the .ps1: the provider container bind-mounts this file, and on Linux a
# replaced file (new inode) would stay invisible to a restarted container, which could re-import the old realm.
with open(path, "r+b") as handle:
    handle.write(new)
    handle.truncate()
print("changed")
'
idpmig_set_realm_names() { # file from-realm to-realm from-client to-client -> IDPMIG_CHANGED
  # Exact quoted names only, bytes otherwise preserved; the rest of the file (credentials) is never read out or printed.
  local result
  result="$(python3 -c "$IDPMIG_PY_SWAP" "$@")" || { idpmig_fail 'Could not update the private realm file.'; return 1; }
  if [ "$result" = changed ]; then IDPMIG_CHANGED=1; else IDPMIG_CHANGED=0; fi
}
idpmig_client_id() { # container realm clientId -> IDPMIG_OUT internal id
  idpmig_kc "$1" "\$K get clients -r $2 -q clientId=$3 --fields id --format csv --noquotes" || return 1
  IDPMIG_OUT="$(printf '%s\n' "$IDPMIG_OUT" | grep . | head -1)"
}
idpmig_assert_role_claim() { # container: read-only; the web client still signs its client roles as aegis_roles
  idpmig_client_id "$1" "$IDPMIG_NEW_REALM" "$IDPMIG_NEW_CLIENT" || return 1
  local cid="$IDPMIG_OUT"
  [ -n "$cid" ] || { idpmig_fail 'The renamed web client was not found.'; return 1; }
  idpmig_uuid "$cid" client || return 1
  idpmig_kc "$1" "\$K get clients/$cid/protocol-mappers/models -r $IDPMIG_NEW_REALM" || return 1
  printf '%s' "$IDPMIG_OUT" | python3 -c '
import json, sys
roles = [m for m in json.load(sys.stdin) if m.get("protocolMapper") == "oidc-usermodel-client-role-mapper" and (m.get("config") or {}).get("claim.name") == "aegis_roles"]
ok = len(roles) == 1 and roles[0]["config"].get("usermodel.clientRoleMapping.clientId") == sys.argv[1] and roles[0]["config"].get("access.token.claim") == "true"
sys.exit(0 if ok else 1)
' "$IDPMIG_NEW_CLIENT" || { idpmig_fail 'The role claim mapper does not point at the renamed web client.'; return 1; }
}
idpmig_copy_private() { # from-folder to-folder: the five private files that exist
  local f
  for f in $IDPMIG_PRIVATE_FILES; do
    [ -f "$1/$f" ] || continue
    if ! (umask 077; cp "$1/$f" "$2/$f") || ! chmod 600 "$2/$f"; then idpmig_fail "Could not copy the private file $f."; return 1; fi
  done
}
idpmig_start_containers() { # ids...: started even after a failure; a start failure is reported
  local id ok=0
  for id in "$@"; do "${DOCKER[@]}" start "$id" >/dev/null || { idpmig_say FAIL "Could not start container $id again; start it with docker start $id"; ok=1; }; done
  return $ok
}
idpmig_backup_all() { # folder
  local folder="$1" idp tls data_volume tls_volume rc=0 err='' data_count proxy_count
  idpmig_service_container local-idp || return 1; idp="$IDPMIG_OUT"
  idpmig_service_container local-idp-tls || return 1; tls="$IDPMIG_OUT"
  idpmig_volume_name "$idp" /opt/keycloak/data || return 1; data_volume="$IDPMIG_OUT"
  idpmig_volume_name "$tls" /data || return 1; tls_volume="$IDPMIG_OUT"
  (umask 077; mkdir -p "$IDPMIG_BACKUP_ROOT" && mkdir "$folder") || { idpmig_fail "Could not create the backup folder $folder. Nothing was changed."; return 1; }
  idpmig_protect "$IDPMIG_BACKUP_ROOT" || return 1
  if ! idpmig_copy_private "$IDPMIG_IDP_DIR" "$folder"; then err="$IDPMIG_ERR"; idpmig_protect "$folder"; idpmig_fail "$err"; return 1; fi
  # finally: the provider is started again even if a step fails or the run is interrupted (trap set before the stop).
  local qi qf; printf -v qi '%q' "$idp"; printf -v qf '%q' "$folder"
  idpmig_trap_set "idpmig_start_containers $qi; idpmig_protect $qf; idpmig_trap_cleanup; exit 130"
  if ! "${DOCKER[@]}" stop "$idp" >/dev/null; then
    idpmig_start_containers "$idp"; idpmig_trap_restore; idpmig_protect "$folder"
    idpmig_fail 'Could not stop the identity provider for the backup. Nothing was changed.'; return 1
  fi
  if idpmig_backup_volume "$data_volume" "$folder" keycloak-data "$IDPMIG_PROVIDER_STORE"; then
    data_count="$IDPMIG_COUNT"
    if idpmig_backup_volume "$tls_volume" "$folder" proxy-data "$IDPMIG_PROXY_STORE"; then proxy_count="$IDPMIG_COUNT"; else rc=1; err="$IDPMIG_ERR"; fi
  else rc=1; err="$IDPMIG_ERR"; fi
  idpmig_start_containers "$idp"
  idpmig_trap_restore
  if [ "$rc" != 0 ]; then idpmig_protect "$folder"; idpmig_fail "$err"; return 1; fi
  idpmig_protect "$folder" || return 1
  idpmig_say 'done' "Backup verified ($data_count provider entries, $proxy_count proxy entries, private files)"
  idpmig_say info "Backup folder: $folder"
}
idpmig_restore_backup() { # folder
  local folder="$1" idp tls data_volume tls_volume rc=0 err=''
  idpmig_service_container local-idp || return 1; idp="$IDPMIG_OUT"
  idpmig_service_container local-idp-tls || return 1; tls="$IDPMIG_OUT"
  idpmig_volume_name "$idp" /opt/keycloak/data || return 1; data_volume="$IDPMIG_OUT"
  idpmig_volume_name "$tls" /data || return 1; tls_volume="$IDPMIG_OUT"
  local qt qi qf qm
  printf -v qt '%q' "$tls"; printf -v qi '%q' "$idp"; printf -v qf '%q' "$folder"
  printf -v qm '%q' "Restore interrupted; the provider data may be incomplete. Run ./scripts/migrate-local-idp-address.sh --rollback --backup $qf"
  idpmig_trap_set "idpmig_start_containers $qt $qi; printf '%s\\n' $qm; idpmig_trap_cleanup; exit 130"
  if ! "${DOCKER[@]}" stop "$idp" >/dev/null || ! "${DOCKER[@]}" stop "$tls" >/dev/null; then rc=1; err='Could not stop the identity provider containers for the restore.'; fi
  if [ "$rc" = 0 ]; then
    if ! { idpmig_restore_volume "$data_volume" "$folder" keycloak-data "$IDPMIG_PROVIDER_STORE" &&
           idpmig_restore_volume "$tls_volume" "$folder" proxy-data "$IDPMIG_PROXY_STORE" &&
           idpmig_copy_private "$folder" "$IDPMIG_IDP_DIR"; }; then rc=1; err="$IDPMIG_ERR"; fi
  fi
  idpmig_start_containers "$tls" "$idp" || { [ "$rc" = 0 ] && { rc=1; err='A container did not start again after the restore.'; }; }
  idpmig_trap_restore
  [ "$rc" = 0 ] || { idpmig_fail "$err"; return 1; }
  idpmig_wait "$idp"
}
idpmig_write_hold() { # reason
  (umask 077; printf '%s %s\n' "$1" "$(date +%Y-%m-%dT%H:%M:%S)" > "$IDPMIG_IDP_DIR/address-migration.hold") ||
    { idpmig_fail "Could not write the hold marker $IDPMIG_IDP_DIR/address-migration.hold."; return 1; }
}
idpmig_rollback() { # [folder]
  local folder="${1:-}" newest typed
  if [ -z "$folder" ]; then
    newest="$(find "$IDPMIG_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '*-before-rollback' -exec basename {} \; 2>/dev/null | LC_ALL=C sort | tail -1)"
    [ -n "$newest" ] || { idpmig_fail 'No backup found to roll back to. Nothing was changed.'; return 1; }
    [ -t 0 ] || { idpmig_fail 'Rollback needs --backup <folder> or a terminal to type the time stamp. Nothing was changed.'; return 1; }
    printf 'Newest backup: %s\n' "$newest"
    printf 'Accounts and passwords changed after that time are lost by a rollback.\n'
    typed=''; read -r -p "Type $newest to restore it, anything else to stop: " typed || typed=''
    [ "$typed" = "$newest" ] || { idpmig_fail 'Rollback not confirmed. Nothing was changed.'; return 1; }
    folder="$IDPMIG_BACKUP_ROOT/$newest"
  fi
  idpmig_resolve_folder "$folder" || return 1; folder="$IDPMIG_OUT"
  [ -f "$folder/keycloak-data.tgz" ] || { idpmig_fail 'That folder is not a provider backup. Nothing was changed.'; return 1; }
  idpmig_test_archive "$folder" keycloak-data "$IDPMIG_PROVIDER_STORE" || return 1
  idpmig_test_archive "$folder" proxy-data "$IDPMIG_PROXY_STORE" || return 1
  idpmig_backup_all "$IDPMIG_BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)-before-rollback" || return 1
  idpmig_restore_backup "$folder" || return 1
  idpmig_write_hold 'rolled back' || { idpmig_fail "Restored, but $IDPMIG_ERR Create it by hand so ./aegis.sh does not move the address again."; return 1; }
  idpmig_say 'rolled back' 'Provider data and private files restored from the backup'
  printf '%s\n' './aegis.sh will not move the address again until you run this script without --rollback.'
  printf '%s\n' 'The old address only works with code at a commit that still uses it (aegis-idp.localhost / aegis-exercise).'
}
idpmig_rename() { # container folder before-ids: the in-place rename; any failure returns 1 with IDPMIG_ERR
  local idp="$1" folder="$2" before="$3" cid line mid json after
  # The private file first: the provider only reads it at start, and a restore puts it back.
  idpmig_set_realm_names "$IDPMIG_IDP_DIR/realm.json" "$IDPMIG_OLD_REALM" "$IDPMIG_NEW_REALM" "$IDPMIG_OLD_CLIENT" "$IDPMIG_NEW_CLIENT" || return 1
  idpmig_kc "$idp" "\$K update realms/$IDPMIG_OLD_REALM -s realm=$IDPMIG_NEW_REALM >/dev/null" || return 1
  idpmig_client_id "$idp" "$IDPMIG_NEW_REALM" "$IDPMIG_OLD_CLIENT" || return 1; cid="$IDPMIG_OUT"
  [ -n "$cid" ] || { idpmig_fail 'The web client was not found after the realm rename.'; return 1; }
  idpmig_uuid "$cid" client || return 1
  idpmig_kc "$idp" "\$K update clients/$cid -r $IDPMIG_NEW_REALM -s clientId=$IDPMIG_NEW_CLIENT >/dev/null" || return 1
  idpmig_kc "$idp" "\$K get clients/$cid/protocol-mappers/models -r $IDPMIG_NEW_REALM" || return 1
  local edits
  edits="$(printf '%s' "$IDPMIG_OUT" | python3 -c '
import json, sys
for m in json.load(sys.stdin):
    c = m.get("config") or {}
    if c.get("usermodel.clientRoleMapping.clientId") == sys.argv[1]:
        c["usermodel.clientRoleMapping.clientId"] = sys.argv[2]
        print(m["id"] + "\t" + json.dumps(m, separators=(",", ":")))
' "$IDPMIG_OLD_CLIENT" "$IDPMIG_NEW_CLIENT")" || { idpmig_fail 'Could not read the client mappers.'; return 1; }
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    mid="${line%%	*}"; json="${line#*	}"
    idpmig_uuid "$mid" mapper || return 1
    idpmig_kc "$idp" "umask 077; cat > /tmp/aegis-mapper.json; \$K update clients/$cid/protocol-mappers/models/$mid -r $IDPMIG_NEW_REALM -f /tmp/aegis-mapper.json >/dev/null; code=\$?; rm -f /tmp/aegis-mapper.json; exit \$code" "$json" || return 1
  done <<< "$edits"
  idpmig_user_ids "$idp" "$IDPMIG_NEW_REALM" || return 1; after="$IDPMIG_OUT"
  (umask 077; printf '%s\n' "$after" > "$folder/user-ids-after.txt") || { idpmig_fail 'Could not write user-ids-after.txt.'; return 1; }
  [ "$before" = "$after" ] || { idpmig_fail 'The account list changed during the rename.'; return 1; }
  idpmig_assert_role_claim "$idp"
}
idpmig_migrate() {
  local idp realms kc_old=0 kc_new=0 before count folder original hold="$IDPMIG_IDP_DIR/address-migration.hold"
  idpmig_service_container local-idp || return 1; idp="$IDPMIG_OUT"
  idpmig_wait "$idp" || return 1
  idpmig_realms "$idp" || return 1; realms="$IDPMIG_OUT"
  printf '%s\n' "$realms" | grep -qx "$IDPMIG_OLD_REALM" && kc_old=1
  printf '%s\n' "$realms" | grep -qx "$IDPMIG_NEW_REALM" && kc_new=1
  [ "$kc_old$kc_new" = 11 ] && { idpmig_fail "Both $IDPMIG_OLD_REALM and $IDPMIG_NEW_REALM exist in the provider. Stop and inspect; nothing was changed."; return 1; }
  [ "$kc_old$kc_new" = 00 ] && { idpmig_fail 'The exercise realm was not found in the provider. Nothing was changed.'; return 1; }
  if [ "$kc_new" = 1 ]; then
    idpmig_set_realm_names "$IDPMIG_IDP_DIR/realm.json" "$IDPMIG_OLD_REALM" "$IDPMIG_NEW_REALM" "$IDPMIG_OLD_CLIENT" "$IDPMIG_NEW_CLIENT" || return 1
    [ "$IDPMIG_CHANGED" = 1 ] && idpmig_say updated 'Private realm file names the new realm'
    idpmig_assert_role_claim "$idp" || return 1
    rm -f "$hold"
    idpmig_say 'already migrated' 'Sign-in address is indtrana-idp.localhost / indtrana-exercise'
    return 0
  fi
  # An earlier run that stopped after updating the file but before the rename: put the file back to match. No backup
  # exists yet, so a private copy (mode 600, never printed) is kept beside it first.
  if grep -Fq "\"$IDPMIG_NEW_REALM\"" "$IDPMIG_IDP_DIR/realm.json" || grep -Fq "\"$IDPMIG_NEW_CLIENT\"" "$IDPMIG_IDP_DIR/realm.json"; then
    if ! (umask 077; cp "$IDPMIG_IDP_DIR/realm.json" "$IDPMIG_IDP_DIR/realm.json.pre-fix") || ! chmod 600 "$IDPMIG_IDP_DIR/realm.json.pre-fix"; then
      idpmig_fail 'Could not keep a copy of the private realm file before matching it. Nothing was changed.'; return 1
    fi
  fi
  idpmig_set_realm_names "$IDPMIG_IDP_DIR/realm.json" "$IDPMIG_NEW_REALM" "$IDPMIG_OLD_REALM" "$IDPMIG_NEW_CLIENT" "$IDPMIG_OLD_CLIENT" || return 1
  [ "$IDPMIG_CHANGED" = 1 ] && idpmig_say fixed 'Private realm file matched to the provider again'

  idpmig_user_ids "$idp" "$IDPMIG_OLD_REALM" || return 1; before="$IDPMIG_OUT"; count="$IDPMIG_COUNT"
  [ "$count" -ge 1 ] || { idpmig_fail 'No accounts were listed in the old realm; refusing to continue. Nothing was changed.'; return 1; }
  folder="$IDPMIG_BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
  idpmig_backup_all "$folder" || return 1
  (umask 077; printf '%s\n' "$before" > "$folder/user-ids-before.txt") || { idpmig_fail "Could not write user-ids-before.txt; backup kept at $folder. Nothing was changed."; return 1; }
  idpmig_wait "$idp" || return 1

  # An interrupt during the rename restores the backup, then stops with 130.
  local qf; printf -v qf '%q' "$folder"
  idpmig_trap_set "idpmig_say 'needs you' 'Interrupted during the rename; restoring the backup now.'; idpmig_restore_backup $qf || idpmig_say FAIL \"Restore ALSO failed: \$IDPMIG_ERR | Backup kept at \"$qf; idpmig_trap_cleanup; exit 130"
  if ! idpmig_rename "$idp" "$folder" "$before"; then
    idpmig_trap_restore
    original="$IDPMIG_ERR"
    idpmig_say 'needs you' 'The rename did not complete; restoring the backup now.'
    idpmig_restore_backup "$folder" || { idpmig_fail "Migration failed: $original | Restore ALSO failed: $IDPMIG_ERR | Backup kept at $folder"; return 1; }
    idpmig_fail "Migration rolled back: $original"; return 1
  fi
  idpmig_trap_restore
  rm -f "$hold"
  idpmig_say updated "Realm renamed $IDPMIG_OLD_REALM -> $IDPMIG_NEW_REALM"
  idpmig_say updated "Web client renamed $IDPMIG_OLD_CLIENT -> $IDPMIG_NEW_CLIENT (roles kept)"
  idpmig_say checked "Accounts before and after: $count / $count, same ids"
  idpmig_say checked 'Role claim mapper points at the renamed client'
  printf '%s\n' 'Restart with ./aegis.sh start so the app uses the new address. Everyone signs in again.'
}
idpmig_main() { # standalone entry point: same lock, ownership and single-runtime checks as aegis.sh
  local rollback=0 backup=''
  while [ $# -gt 0 ]; do
    case "$1" in
      --rollback) rollback=1 ;;
      --backup) [ $# -ge 2 ] || { echo 'Missing folder after --backup'; return 2; }; backup="$2"; shift ;;
      -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; return 0 ;;
      *) echo "Unknown option: $1"; return 2 ;;
    esac
    shift
  done
  # aegis.sh in library mode: its private folder, DOCKER array, lock and ownership checks are the one source of truth.
  set --
  # shellcheck source=/dev/null # aegis.sh is checked on its own; following it here hides its library-mode return
  . "$IDPMIG_ROOT/aegis.sh"
  command -v python3 >/dev/null 2>&1 || die 'python3 is required. Run ./aegis.sh install first.'
  command -v docker >/dev/null 2>&1 || die 'Docker is required.'
  if ! docker_ok && docker info 2>&1 | grep -qi 'permission denied' && command -v sudo >/dev/null 2>&1; then DOCKER=("${SUDO_DOCKER[@]}"); fi
  docker_ok || die 'Docker is not running. Start it, then run this again.'
  take_lock
  assert_single 1
  idpmig_bind "$PROJECT" "$IDP_DIR" "$PRIVATE" "$ROOT"
  [ -f "$IDPMIG_IDP_DIR/realm.json" ] || die "No private sign-in files in $IDPMIG_IDP_DIR. Nothing was changed."
  if [ "$rollback" = 1 ]; then idpmig_rollback "$backup" || die "$IDPMIG_ERR"
  else idpmig_migrate || die "$IDPMIG_ERR"; fi
}

# Sourcing defines the functions only.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -u
  set -o pipefail
  idpmig_main "$@"
  exit $?
fi
