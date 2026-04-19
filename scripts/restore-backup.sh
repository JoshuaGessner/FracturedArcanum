#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="Fractured Arcanum"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$REPO_ROOT/backups}"
DOCKER_VOLUME_NAME="${DOCKER_VOLUME_NAME:-fractured-arcanum-data}"
BACKUP_DIR=""
FORCE=0
DRY_RUN=0
LIST_ONLY=0
DATA_ONLY=0
REPO_ONLY=0

usage() {
  cat <<'EOF'
Restore helper for Fractured Arcanum backups.

Usage:
  bash scripts/restore-backup.sh [options]

Options:
  --latest                 Restore the newest backup (default behavior).
  --backup-dir <path|id>   Restore a specific backup directory or backup name.
  --list                   List all available backups and exit.
  --data-only              Restore only data/.env/docker volume.
  --repo-only              Restore only the repository snapshot.
  --force                  Skip the interactive confirmation prompt.
  --dry-run                Show what would be restored without making changes.
  -h, --help               Show this help.

Examples:
  bash scripts/restore-backup.sh --latest
  bash scripts/restore-backup.sh --backup-dir update-20260419-120000
  bash scripts/restore-backup.sh --backup-dir /full/path/to/backups/update-20260419-120000 --force
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --latest)
      shift
      ;;
    --backup-dir)
      BACKUP_DIR="${2:-}"
      shift 2
      ;;
    --list)
      LIST_ONLY=1
      shift
      ;;
    --data-only)
      DATA_ONLY=1
      shift
      ;;
    --repo-only)
      REPO_ONLY=1
      shift
      ;;
    --force)
      FORCE=1
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

if [[ "$DATA_ONLY" -eq 1 && "$REPO_ONLY" -eq 1 ]]; then
  die "Use either --data-only or --repo-only, not both."
fi

list_backups() {
  [[ -d "$BACKUP_ROOT" ]] || {
    warn "No backups directory found at $BACKUP_ROOT"
    return 0
  }

  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | sort
}

resolve_backup_dir() {
  if [[ -n "$BACKUP_DIR" ]]; then
    if [[ -d "$BACKUP_DIR" ]]; then
      return 0
    fi

    if [[ -d "$BACKUP_ROOT/$BACKUP_DIR" ]]; then
      BACKUP_DIR="$BACKUP_ROOT/$BACKUP_DIR"
      return 0
    fi

    die "Backup directory not found: $BACKUP_DIR"
  fi

  [[ -d "$BACKUP_ROOT" ]] || die "No backups directory found at $BACKUP_ROOT"

  BACKUP_DIR="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
  [[ -n "$BACKUP_DIR" ]] || die "No backups were found in $BACKUP_ROOT"
}

confirm_restore() {
  if [[ "$FORCE" -eq 1 || "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  printf '\nAbout to restore backup from:\n  %s\n' "$BACKUP_DIR"
  printf 'This can overwrite files in the current checkout. Continue? [y/N] '
  read -r reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    die "Restore cancelled."
  fi
}

restore_repo_snapshot() {
  local snapshot="$BACKUP_DIR/repo-snapshot.tar.gz"
  [[ -f "$snapshot" ]] || {
    warn "No repository snapshot found in this backup; skipping repo restore."
    return 0
  }

  log "Restoring repository snapshot..."

  if command_exists rsync; then
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "Would extract $snapshot into a temporary directory and rsync it back into $REPO_ROOT"
      rmdir "$tmp_dir"
      return 0
    fi

    tar -xzf "$snapshot" -C "$tmp_dir"
    rsync -a --delete --exclude 'backups/' "$tmp_dir/" "$REPO_ROOT/"
    rm -rf "$tmp_dir"
  else
    warn "rsync is not installed; restoring by overlay only. Extra files added after the backup may remain."
    run tar -xzf "$snapshot" -C "$REPO_ROOT"
  fi
}

restore_local_data() {
  local data_archive="$BACKUP_DIR/local-data.tar.gz"
  if [[ -f "$data_archive" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "Would restore local data archive $data_archive"
    else
      rm -rf "$REPO_ROOT/data"
      tar -xzf "$data_archive" -C "$REPO_ROOT"
    fi
  fi

  if [[ -f "$BACKUP_DIR/.env.backup" ]]; then
    run cp "$BACKUP_DIR/.env.backup" "$REPO_ROOT/.env"
  fi
}

restore_docker_volume() {
  local volume_archive="$BACKUP_DIR/docker-volume-data.tar.gz"
  [[ -f "$volume_archive" ]] || return 0

  if ! command_exists docker; then
    warn "Docker is not installed; skipping Docker volume restore."
    return 0
  fi

  run docker volume create "$DOCKER_VOLUME_NAME"
  run docker run --rm \
    -v "$DOCKER_VOLUME_NAME:/volume" \
    -v "$BACKUP_DIR:/backup:ro" \
    busybox sh -c "rm -rf /volume/* /volume/.[!.]* /volume/..?* 2>/dev/null || true; tar -xzf /backup/docker-volume-data.tar.gz -C /volume"
}

main() {
  if [[ "$LIST_ONLY" -eq 1 ]]; then
    list_backups
    exit 0
  fi

  resolve_backup_dir
  confirm_restore

  log "Restoring $APP_NAME from $BACKUP_DIR"

  if [[ "$DATA_ONLY" -eq 0 ]]; then
    restore_repo_snapshot
  fi

  if [[ "$REPO_ONLY" -eq 0 ]]; then
    restore_local_data
    restore_docker_volume
  fi

  log "Restore completed. Review the app state and restart services if needed."
}

main "$@"
