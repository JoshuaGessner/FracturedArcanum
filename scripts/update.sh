#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="Fractured Arcanum"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${UPDATE_MODE:-auto}"
BRANCH="${UPDATE_BRANCH:-}"
SKIP_BACKUP=0
SKIP_PULL=0
SKIP_BUILD=0
FORCE=0
DRY_RUN=0
DID_RESTART=0
SERVICE_STOPPED_FOR_BACKUP=0
NO_CACHE=1
QUIESCE_BACKUP="${QUIESCE_BACKUP:-1}"
SYSTEMD_DOCKER=0
COMPOSE_SERVICE="${COMPOSE_SERVICE:-fractured-arcanum}"
SYSTEM_SERVICE_NAME="${SYSTEM_SERVICE_NAME:-fractured-arcanum}"
DOCKER_VOLUME_NAME="${DOCKER_VOLUME_NAME:-fractured-arcanum-data}"
PORT="${PORT:-43173}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/api/health}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-90}"
HEALTH_POLL_INTERVAL="${HEALTH_POLL_INTERVAL:-3}"
RESTART_SETTLE_SECONDS="${RESTART_SETTLE_SECONDS:-45}"
BACKUP_ROOT="${BACKUP_ROOT:-$REPO_ROOT/backups}"
CURRENT_BACKUP_DIR=""
COMPOSE_CMD=()

usage() {
  cat <<'EOF'
Safe updater for Fractured Arcanum.

Usage:
  bash scripts/update.sh [options]

Options:
  --mode auto|docker|node   Update mode. Auto-detect by default.
  --branch <name>           Branch to pull before updating.
  --skip-backup             Skip the pre-update hard backup.
  --no-quiesce-backup       Do not pause the managed service while backing up data.
  --skip-pull               Skip git fetch/pull and only rebuild/restart.
  --skip-build              Skip the build step in node mode.
  --force                   Continue even if the repo has local changes.
  --no-cache                Force a Docker rebuild without using cache (default).
  --allow-cache             Allow Docker to reuse build cache.
  --dry-run                 Print actions without executing them.
  -h, --help                Show this help.

Environment overrides:
  UPDATE_MODE, UPDATE_BRANCH, COMPOSE_SERVICE, DOCKER_VOLUME_NAME,
  SYSTEM_SERVICE_NAME, BACKUP_ROOT, PORT, HEALTH_URL,
  HEALTH_WAIT_SECONDS, HEALTH_POLL_INTERVAL, QUIESCE_BACKUP

Docker + systemd:
  When SYSTEM_SERVICE_NAME matches an active systemd unit the script will
  rebuild the image via Docker Compose then restart the stack through
  systemctl, preserving the systemd service lifecycle.
  Auto-detected; override with SYSTEM_SERVICE_NAME=<unit> as needed.
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

warn() {
  log "WARN: $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

run() {
  log "+ $*"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  "$@"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

restart_service_after_failed_update() {
  if [[ "$SERVICE_STOPPED_FOR_BACKUP" -ne 1 || "$DID_RESTART" -eq 1 || "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  warn "Attempting to restart the service that was paused for backup."

  if [[ "$MODE" == "docker" ]]; then
    if [[ "$SYSTEMD_DOCKER" -eq 1 ]] && command_exists systemctl; then
      systemctl start "$SYSTEM_SERVICE_NAME" || return 1
      return 0
    fi

    if command_exists docker && docker compose version >/dev/null 2>&1; then
      docker compose start "$COMPOSE_SERVICE" || docker compose up -d "$COMPOSE_SERVICE" || return 1
      return 0
    fi

    if command_exists docker-compose; then
      docker-compose start "$COMPOSE_SERVICE" || docker-compose up -d "$COMPOSE_SERVICE" || return 1
      return 0
    fi
  fi

  if command_exists pm2 && pm2 describe "$SYSTEM_SERVICE_NAME" >/dev/null 2>&1; then
    pm2 start "$SYSTEM_SERVICE_NAME" || return 1
    return 0
  fi

  if command_exists systemctl; then
    systemctl start "$SYSTEM_SERVICE_NAME" || return 1
    return 0
  fi

  return 1
}

on_error() {
  local exit_code=$?
  if [[ "$exit_code" -ne 0 ]]; then
    warn "Update failed."
    if [[ -n "$CURRENT_BACKUP_DIR" && -d "$CURRENT_BACKUP_DIR" ]]; then
      warn "A pre-update backup is available at: $CURRENT_BACKUP_DIR"
    fi
    if ! restart_service_after_failed_update; then
      warn "Automatic service restart after failure was not possible. Start the service manually after reviewing the logs."
    fi
    warn "Your user data was not intentionally removed. Review the logs above before retrying."
  fi
  exit "$exit_code"
}

trap on_error ERR

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --skip-backup)
      SKIP_BACKUP=1
      shift
      ;;
    --no-quiesce-backup)
      QUIESCE_BACKUP=0
      shift
      ;;
    --skip-pull)
      SKIP_PULL=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --no-cache)
      NO_CACHE=1
      shift
      ;;
    --allow-cache)
      NO_CACHE=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

ensure_requirements() {
  command_exists git || die "git is required for updates."
  command_exists tar || die "tar is required for backups."
  [[ -d "$REPO_ROOT/.git" ]] || die "Run this updater from a git clone of the project."
}

detect_compose() {
  if command_exists docker && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi

  if command_exists docker-compose; then
    COMPOSE_CMD=(docker-compose)
    return 0
  fi

  return 1
}

detect_docker_manager() {
  # Auto-detect whether the Docker stack is managed by a systemd unit.
  # Silently skips on systems without systemctl (macOS, containers, etc.).
  if ! command_exists systemctl; then
    return 0
  fi

  if systemctl list-unit-files --type=service 2>/dev/null \
      | grep -q "^${SYSTEM_SERVICE_NAME}\.service"; then
    SYSTEMD_DOCKER=1
    log "Detected systemd service '${SYSTEM_SERVICE_NAME}' — will restart via systemctl."
    return 0
  fi

  log "No systemd service '${SYSTEM_SERVICE_NAME}' found — will restart via Docker Compose directly."
}

detect_mode() {
  case "$MODE" in
    docker|node)
      if [[ "$MODE" == "docker" ]]; then
        detect_docker_manager
      fi
      return 0
      ;;
    auto)
      if [[ -f "$REPO_ROOT/docker-compose.yml" ]] && detect_compose && docker info >/dev/null 2>&1; then
        MODE="docker"
        detect_docker_manager
      else
        MODE="node"
      fi
      ;;
    *)
      die "Invalid mode: $MODE"
      ;;
  esac
}

stop_service_for_backup() {
  if [[ "$QUIESCE_BACKUP" != "1" ]]; then
    warn "Service quiesce for backup is disabled. SQLite backups may include live WAL writes."
    return 0
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would pause the managed service before data backup."
    return 0
  fi

  if [[ "$MODE" == "docker" ]]; then
    if [[ "$SYSTEMD_DOCKER" -eq 1 ]] && command_exists systemctl; then
      if systemctl is-active --quiet "$SYSTEM_SERVICE_NAME"; then
        log "Pausing systemd-managed Docker service for a consistent data backup..."
        run systemctl stop "$SYSTEM_SERVICE_NAME"
        SERVICE_STOPPED_FOR_BACKUP=1
      fi
      return 0
    fi

    if detect_compose 2>/dev/null; then
      log "Pausing Docker Compose service for a consistent data backup..."
      if run "${COMPOSE_CMD[@]}" stop "$COMPOSE_SERVICE"; then
        SERVICE_STOPPED_FOR_BACKUP=1
      else
        warn "Docker Compose service was not running or could not be paused; continuing with backup."
      fi
    fi
    return 0
  fi

  if command_exists pm2 && pm2 describe "$SYSTEM_SERVICE_NAME" >/dev/null 2>&1; then
    log "Pausing PM2 service for a consistent data backup..."
    run pm2 stop "$SYSTEM_SERVICE_NAME"
    SERVICE_STOPPED_FOR_BACKUP=1
    return 0
  fi

  if command_exists systemctl && systemctl is-active --quiet "$SYSTEM_SERVICE_NAME"; then
    log "Pausing systemd service for a consistent data backup..."
    run systemctl stop "$SYSTEM_SERVICE_NAME"
    SERVICE_STOPPED_FOR_BACKUP=1
    return 0
  fi

  warn "No managed running service was found to pause before backup."
}

ensure_clean_repo() {
  cd "$REPO_ROOT"
  if [[ "$FORCE" -eq 0 ]] && [[ -n "$(git status --porcelain)" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      warn "Repository has uncommitted changes. Showing a preview only; use --force if you intentionally want to update this checkout."
      return 0
    fi
    die "Repository has uncommitted changes. Commit or stash them first, or rerun with --force."
  fi
}

resolve_branch() {
  cd "$REPO_ROOT"
  if [[ -n "$BRANCH" ]]; then
    return 0
  fi

  local current_branch
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" == "HEAD" ]]; then
    warn "Detached HEAD detected; skipping automatic pull."
    SKIP_PULL=1
    return 0
  fi

  BRANCH="$current_branch"
}

write_backup_metadata() {
  {
    printf 'app=%s\n' "$APP_NAME"
    printf 'timestamp=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'mode=%s\n' "$MODE"
    printf 'branch=%s\n' "${BRANCH:-unknown}"
    printf 'commit=%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
    printf 'quiesced_service=%s\n' "$SERVICE_STOPPED_FOR_BACKUP"
    printf 'restore_command=%s\n' "bash scripts/restore-backup.sh --backup-dir $CURRENT_BACKUP_DIR"
  } > "$CURRENT_BACKUP_DIR/metadata.txt"
}

backup_repo_snapshot() {
  log "Creating full repository snapshot..."
  run tar \
    --exclude='./backups' \
    --exclude='./node_modules' \
    --exclude='./dist' \
    --exclude='./coverage' \
    -czf "$CURRENT_BACKUP_DIR/repo-snapshot.tar.gz" \
    -C "$REPO_ROOT" .

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would capture git status and diff artifacts."
    return 0
  fi

  git -C "$REPO_ROOT" status --short > "$CURRENT_BACKUP_DIR/git-status.txt" || true
  git -C "$REPO_ROOT" diff --binary > "$CURRENT_BACKUP_DIR/git-diff.patch" || true
  git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD > "$CURRENT_BACKUP_DIR/git-branch.txt" || true

  cat > "$CURRENT_BACKUP_DIR/RESTORE.txt" <<EOF
Restore helper:
  bash scripts/restore-backup.sh --backup-dir "$CURRENT_BACKUP_DIR"

Quick options:
  --latest     restore the newest backup
  --data-only  restore only data/.env/docker volume
  --force      skip the confirmation prompt
EOF
}

backup_local_data() {
  if [[ -d "$REPO_ROOT/data" ]]; then
    run tar -czf "$CURRENT_BACKUP_DIR/local-data.tar.gz" -C "$REPO_ROOT" data
  else
    warn "No local data directory found; skipping local data backup."
  fi

  if [[ -f "$REPO_ROOT/.env" ]]; then
    run cp "$REPO_ROOT/.env" "$CURRENT_BACKUP_DIR/.env.backup"
  fi
}

backup_docker_volume() {
  if ! command_exists docker; then
    warn "Docker is not available; skipping Docker volume backup."
    return 0
  fi

  if ! docker volume inspect "$DOCKER_VOLUME_NAME" >/dev/null 2>&1; then
    warn "Docker volume $DOCKER_VOLUME_NAME was not found; skipping volume backup."
    return 0
  fi

  run docker run --rm \
    -v "$DOCKER_VOLUME_NAME:/volume:ro" \
    -v "$CURRENT_BACKUP_DIR:/backup" \
    busybox sh -c 'cd /volume && tar -czf /backup/docker-volume-data.tar.gz .'
}

verify_backup_artifact() {
  local archive="$1"
  if [[ ! -f "$archive" ]]; then
    die "Expected backup artifact was not created: $archive"
  fi

  if [[ ! -s "$archive" ]]; then
    die "Backup artifact is empty: $archive"
  fi

  run tar -tzf "$archive" >/dev/null
}

verify_backup_artifacts() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  verify_backup_artifact "$CURRENT_BACKUP_DIR/repo-snapshot.tar.gz"

  if [[ -d "$REPO_ROOT/data" ]]; then
    verify_backup_artifact "$CURRENT_BACKUP_DIR/local-data.tar.gz"
  fi

  if [[ "$MODE" == "docker" && -f "$CURRENT_BACKUP_DIR/docker-volume-data.tar.gz" ]]; then
    verify_backup_artifact "$CURRENT_BACKUP_DIR/docker-volume-data.tar.gz"
  fi
}

create_backup() {
  if [[ "$SKIP_BACKUP" -eq 1 ]]; then
    warn "Skipping pre-update hard backup by request."
    return 0
  fi

  CURRENT_BACKUP_DIR="$BACKUP_ROOT/update-$(date '+%Y%m%d-%H%M%S')"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "Would create hard backup at $CURRENT_BACKUP_DIR"
    return 0
  fi

  run mkdir -p "$BACKUP_ROOT"
  run mkdir -p "$CURRENT_BACKUP_DIR"
  stop_service_for_backup
  write_backup_metadata
  backup_repo_snapshot
  backup_local_data

  if [[ "$MODE" == "docker" ]]; then
    backup_docker_volume
  fi

  verify_backup_artifacts

  log "Hard backup created at $CURRENT_BACKUP_DIR"
  log "Restore with: bash scripts/restore-backup.sh --backup-dir \"$CURRENT_BACKUP_DIR\""
}

update_git_checkout() {
  if [[ "$SKIP_PULL" -eq 1 ]]; then
    warn "Skipping git pull by request."
    return 0
  fi

  cd "$REPO_ROOT"
  run git fetch --prune --tags origin

  if [[ -n "$BRANCH" ]]; then
    run git pull --ff-only origin "$BRANCH"
  else
    run git pull --ff-only
  fi
}

# `systemctl restart` enqueues the job, then blocks on a D-Bus method call
# waiting for the result. libdbus gives that call a 25 second default timeout,
# and anything human-paced inside the window blows straight through it — most
# often an interactive polkit password prompt, which is what you get when the
# updater runs as a non-root user. The client then dies with
#
#   D-Bus connection terminated while waiting for jobs
#   Failed to wait for response: Connection reset by peer
#
# while systemd goes on to run the job the moment authorization lands. The
# journal for one such run showed the unit reaching "Starting" in the very same
# second the client gave up, exactly 25s after the command was issued.
#
# Treating that as fatal aborts a deploy that succeeds moments later, and skips
# run_health_check, the one step that could have settled it either way.
#
# So: record the attempt, then poll the unit instead of trusting the client's
# exit code. Polling is the part that matters — at the instant of the timeout
# the job may genuinely not have started yet, so firing another systemctl right
# away would only raise a second password prompt and re-run the same race.
#
# See docs/deployment-permissions.md for removing the prompt altogether, which
# fixes the cause rather than tolerating it.
restart_systemd_unit() {
  local rc=0
  DID_RESTART=1
  run systemctl restart "$SYSTEM_SERVICE_NAME" || rc=$?
  if (( rc == 0 )); then
    return 0
  fi

  warn "systemctl restart exited ${rc}. That is usually the client's D-Bus call"
  warn "timing out, not a failed restart — systemd may still be acting on it."

  local waited=0
  while (( waited < RESTART_SETTLE_SECONDS )); do
    if systemctl is-active --quiet "$SYSTEM_SERVICE_NAME"; then
      warn "Unit became active after ${waited}s. Continuing to the health check."
      return 0
    fi
    sleep "$HEALTH_POLL_INTERVAL"
    waited=$((waited + HEALTH_POLL_INTERVAL))
  done

  warn "Unit still inactive after ${RESTART_SETTLE_SECONDS}s; attempting one explicit start."
  run systemctl start "$SYSTEM_SERVICE_NAME" \
    || warn "Explicit start also failed. The health check will confirm the state."
  return 0
}

restart_node_service() {
  if command_exists pm2 && pm2 describe "$SYSTEM_SERVICE_NAME" >/dev/null 2>&1; then
    run pm2 restart "$SYSTEM_SERVICE_NAME" --update-env
    DID_RESTART=1
    return 0
  fi

  if command_exists systemctl && systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${SYSTEM_SERVICE_NAME}\.service"; then
    restart_systemd_unit
    return 0
  fi

  warn "No PM2 or systemd service named $SYSTEM_SERVICE_NAME was found. Restart the app manually if needed."
}

run_node_update() {
  cd "$REPO_ROOT"

  if [[ -f package-lock.json ]]; then
    if ! run npm ci; then
      warn "npm ci failed; falling back to npm install for compatibility."
      run npm install
    fi
  else
    warn "No package-lock.json found; using npm install."
    run npm install
  fi

  if [[ "$SKIP_BUILD" -eq 0 ]]; then
    run npm run build
  else
    warn "Skipping build by request."
  fi

  restart_node_service
}

run_docker_update() {
  detect_compose || die "Docker Compose is required for docker mode."
  cd "$REPO_ROOT"

  run "${COMPOSE_CMD[@]}" config -q

  # Build phase — always via Docker Compose regardless of restart manager.
  if [[ "$NO_CACHE" -eq 1 ]]; then
    run "${COMPOSE_CMD[@]}" build --no-cache
  else
    run "${COMPOSE_CMD[@]}" build
  fi

  # Restart phase — honour systemd lifecycle when the unit is registered,
  # otherwise bring the stack up directly through Compose.
  if [[ "$SYSTEMD_DOCKER" -eq 1 ]]; then
    restart_systemd_unit
  else
    run "${COMPOSE_CMD[@]}" up -d --remove-orphans
    DID_RESTART=1
  fi
}

probe_health_once() {
  if command_exists curl; then
    curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "$HEALTH_URL" >/dev/null
    return 0
  fi

  if command_exists wget; then
    wget -qO- --timeout=10 "$HEALTH_URL" >/dev/null
    return 0
  fi

  return 2
}

dump_runtime_diagnostics() {
  if [[ "$MODE" == "docker" ]]; then
    if [[ "$SYSTEMD_DOCKER" -eq 1 ]] && command_exists systemctl; then
      warn "systemd service status:"
      systemctl status "$SYSTEM_SERVICE_NAME" --no-pager --lines=40 || true
    fi

    if detect_compose 2>/dev/null; then
      warn "Docker Compose service status:"
      "${COMPOSE_CMD[@]}" ps || true
      warn "Recent Docker logs (last 80 lines):"
      "${COMPOSE_CMD[@]}" logs --tail=80 || true
    fi
    return 0
  fi

  if command_exists pm2 && pm2 describe "$SYSTEM_SERVICE_NAME" >/dev/null 2>&1; then
    warn "PM2 service status:"
    pm2 status "$SYSTEM_SERVICE_NAME" || true
    return 0
  fi
}

run_health_check() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  if [[ "$DID_RESTART" -eq 0 ]]; then
    warn "Skipping health check because no managed restart occurred."
    return 0
  fi

  if ! command_exists curl && ! command_exists wget; then
    warn "Neither curl nor wget is installed, so the health check was skipped."
    return 0
  fi

  local started_at
  started_at=$(date +%s)
  local attempt=1

  while true; do
    if probe_health_once; then
      log "Health check passed at $HEALTH_URL"
      return 0
    fi

    local now
    now=$(date +%s)
    if (( now - started_at >= HEALTH_WAIT_SECONDS )); then
      warn "Health endpoint stayed unavailable for ${HEALTH_WAIT_SECONDS}s."
      dump_runtime_diagnostics
      return 1
    fi

    warn "Service is still starting (attempt ${attempt}); retrying in ${HEALTH_POLL_INTERVAL}s..."
    attempt=$((attempt + 1))
    sleep "$HEALTH_POLL_INTERVAL"
  done
}

main() {
  ensure_requirements
  detect_mode
  resolve_branch
  ensure_clean_repo

  log "Starting safe update in $MODE mode from $REPO_ROOT"

  create_backup
  update_git_checkout

  if [[ "$MODE" == "docker" ]]; then
    run_docker_update
  else
    run_node_update
  fi

  run_health_check
  log "Update completed successfully."
}

main "$@"
