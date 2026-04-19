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
NO_CACHE=1
COMPOSE_SERVICE="${COMPOSE_SERVICE:-fractured-arcanum}"
SYSTEM_SERVICE_NAME="${SYSTEM_SERVICE_NAME:-fractured-arcanum}"
DOCKER_VOLUME_NAME="${DOCKER_VOLUME_NAME:-fractured-arcanum-data}"
PORT="${PORT:-43173}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/api/health}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-90}"
HEALTH_POLL_INTERVAL="${HEALTH_POLL_INTERVAL:-3}"
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
  HEALTH_WAIT_SECONDS, HEALTH_POLL_INTERVAL
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

on_error() {
  local exit_code=$?
  if [[ "$exit_code" -ne 0 ]]; then
    warn "Update failed."
    if [[ -n "$CURRENT_BACKUP_DIR" && -d "$CURRENT_BACKUP_DIR" ]]; then
      warn "A pre-update backup is available at: $CURRENT_BACKUP_DIR"
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

detect_mode() {
  case "$MODE" in
    docker|node)
      return 0
      ;;
    auto)
      if [[ -f "$REPO_ROOT/docker-compose.yml" ]] && detect_compose && docker info >/dev/null 2>&1; then
        MODE="docker"
      else
        MODE="node"
      fi
      ;;
    *)
      die "Invalid mode: $MODE"
      ;;
  esac
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
  write_backup_metadata
  backup_repo_snapshot
  backup_local_data

  if [[ "$MODE" == "docker" ]]; then
    backup_docker_volume
  fi

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

restart_node_service() {
  if command_exists pm2 && pm2 describe "$SYSTEM_SERVICE_NAME" >/dev/null 2>&1; then
    run pm2 restart "$SYSTEM_SERVICE_NAME" --update-env
    DID_RESTART=1
    return 0
  fi

  if command_exists systemctl && systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${SYSTEM_SERVICE_NAME}\.service"; then
    run systemctl restart "$SYSTEM_SERVICE_NAME"
    DID_RESTART=1
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
  if [[ "$NO_CACHE" -eq 1 ]]; then
    run "${COMPOSE_CMD[@]}" build --no-cache
    run "${COMPOSE_CMD[@]}" up -d --remove-orphans
  else
    run "${COMPOSE_CMD[@]}" up -d --build --remove-orphans
  fi
  DID_RESTART=1
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
  if [[ "$MODE" == "docker" ]] && detect_compose; then
    warn "Docker service status:"
    "${COMPOSE_CMD[@]}" ps || true
    warn "Recent Docker logs (last 80 lines):"
    "${COMPOSE_CMD[@]}" logs --tail=80 || true
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
