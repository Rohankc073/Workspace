#!/usr/bin/env bash
#
# Atlas Workspace — LOCAL (macOS) snapshot backup for testing.
# Files + database, timestamped snapshots, hard-link dedup.
#
# This is the Mac/localhost version. The server version (backup.sh) is the same
# idea but uses Linux-only tools. Run this from anywhere:  ./backup-mac.sh
#
set -euo pipefail

# ============================ CONFIG (already filled in) ====================
STORAGE_DIR="/Users/sss/Downloads/atlas-app/storage"
BACKUP_ROOT="/Users/sss/Downloads/atlas-backups"   # sibling of atlas-app
KEEP_SNAPSHOTS=30
MIN_FREE_GB=2

# Docker Postgres
DB_CONTAINER="atlas-db"
DB_USER="atlas"
DB_NAME="atlas"
# ===========================================================================

TS="$(date +%Y-%m-%d_%H-%M-%S)"
SNAP_DIR="$BACKUP_ROOT/snapshots/$TS"
FILES_DIR="$SNAP_DIR/files"

log() { echo "[backup $TS] $*"; }

if [ ! -d "$STORAGE_DIR" ]; then
  echo "[backup] ERROR: STORAGE_DIR '$STORAGE_DIR' not found." >&2
  exit 1
fi

mkdir -p "$FILES_DIR"

# --- Disk-space guard (BSD df on macOS) ---
FREE_MB="$(df -m "$BACKUP_ROOT" | awk 'NR==2 {print $4}')"
FREE_GB=$(( FREE_MB / 1024 ))
if [ "$FREE_GB" -lt "$MIN_FREE_GB" ]; then
  echo "[backup] ERROR: only ${FREE_GB}GB free (< ${MIN_FREE_GB}GB). Aborting." >&2
  exit 1
fi

# --- Find previous snapshot for hard-link dedup ---
PREV_FILES=""
if [ -d "$BACKUP_ROOT/snapshots" ]; then
  PREV="$(find "$BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d ! -name "$TS" | sort | tail -n 1 || true)"
  [ -n "$PREV" ] && [ -d "$PREV/files" ] && PREV_FILES="$PREV/files"
fi

# --- 1) Files ---
if [ -n "$PREV_FILES" ]; then
  log "files: rsync (dedup against $(basename "$(dirname "$PREV_FILES")"))"
  rsync -a --delete --link-dest="$PREV_FILES" "$STORAGE_DIR"/ "$FILES_DIR"/
else
  log "files: first full copy"
  rsync -a --delete "$STORAGE_DIR"/ "$FILES_DIR"/
fi

# --- 2) Database (via Docker) ---
log "database: dumping from container '$DB_CONTAINER'"
if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$SNAP_DIR/database.sql.gz"; then
  :
else
  echo "[backup] ERROR: pg_dump failed; removing incomplete snapshot." >&2
  rm -rf "$SNAP_DIR"
  exit 1
fi

# --- 3) Manifest ---
{
  echo "timestamp=$TS"
  echo "storage_source=$STORAGE_DIR"
  echo "files_size=$(du -sh "$FILES_DIR" | cut -f1)"
  echo "database=database.sql.gz"
} > "$SNAP_DIR/manifest.txt"

# --- 4) Retention ---
log "pruning (keep newest $KEEP_SNAPSHOTS)"
COUNT="$(find "$BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
if [ "$COUNT" -gt "$KEEP_SNAPSHOTS" ]; then
  REMOVE=$((COUNT - KEEP_SNAPSHOTS))
  find "$BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d | sort | head -n "$REMOVE" | while read -r old; do
    log "removing old snapshot: $(basename "$old")"
    rm -rf "$old"
  done
fi

log "done -> $SNAP_DIR"
echo
echo "Look inside: $SNAP_DIR"
echo "  files/           (browse your documents)"
echo "  database.sql.gz  (the matching DB dump)"