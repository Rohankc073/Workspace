#!/usr/bin/env bash
#
# Atlas Workspace — server snapshot backup.
# Files + database, timestamped snapshots, hard-link dedup.
#
# The Linux counterpart to backup-mac.sh. Meant to be run from root's cron;
# see the notes at the bottom of this file.
#
set -euo pipefail

# ================================ CONFIG ===================================
STORAGE_DIR="/home/atlas/atlas-app/storage"
BACKUP_ROOT="/home/atlas/atlas-backups"
KEEP_SNAPSHOTS=150   # ~2 weeks at 11 runs/day
MIN_FREE_GB=5

# Docker Postgres
DB_CONTAINER="atlas-db"
DB_USER="atlas"
DB_NAME="atlas"

LOG_FILE="$BACKUP_ROOT/backup.log"
LOCK_FILE="/var/lock/atlas-backup.lock"
# ===========================================================================

TS="$(date +%Y-%m-%d_%H-%M-%S)"
SNAP_DIR="$BACKUP_ROOT/snapshots/$TS"
FILES_DIR="$SNAP_DIR/files"

log() { echo "[backup $TS] $*"; }

# --- Only one run at a time -------------------------------------------------
# A slow snapshot must not have the next cron run start on top of it: two
# rsyncs writing the same tree would corrupt the dedup chain.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[backup $TS] another run is in progress; skipping." >&2
  exit 0
fi

# Everything from here on is logged as well as printed.
mkdir -p "$BACKUP_ROOT/snapshots"
exec > >(tee -a "$LOG_FILE") 2>&1

if [ ! -d "$STORAGE_DIR" ]; then
  echo "[backup] ERROR: STORAGE_DIR '$STORAGE_DIR' not found." >&2
  exit 1
fi

if ! docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true; then
  echo "[backup] ERROR: container '$DB_CONTAINER' is not running." >&2
  exit 1
fi

# A snapshot without a database dump is worse than no snapshot — it looks
# complete. Any failure below removes the half-written directory.
cleanup_on_fail() {
  local code=$?
  if [ $code -ne 0 ] && [ -d "$SNAP_DIR" ]; then
    echo "[backup] failed (exit $code); removing incomplete snapshot." >&2
    rm -rf "$SNAP_DIR"
  fi
}
trap cleanup_on_fail EXIT

# --- Disk-space guard -------------------------------------------------------
# -P forces single-line output; without it a long device name wraps and the
# awk column lands on the wrong field.
FREE_MB="$(df -Pm "$BACKUP_ROOT" | awk 'NR==2 {print $4}')"
FREE_GB=$(( FREE_MB / 1024 ))
if [ "$FREE_GB" -lt "$MIN_FREE_GB" ]; then
  echo "[backup] ERROR: only ${FREE_GB}GB free (< ${MIN_FREE_GB}GB). Aborting." >&2
  exit 1
fi

mkdir -p "$FILES_DIR"

# --- Find previous snapshot for hard-link dedup -----------------------------
PREV_FILES=""
PREV="$(find "$BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d ! -name "$TS" | sort | tail -n 1 || true)"
if [ -n "$PREV" ] && [ -d "$PREV/files" ]; then
  PREV_FILES="$PREV/files"
fi

# --- 1) Files ---------------------------------------------------------------
if [ -n "$PREV_FILES" ]; then
  log "files: rsync (dedup against $(basename "$(dirname "$PREV_FILES")"))"
  rsync -a --numeric-ids --delete --link-dest="$PREV_FILES" "$STORAGE_DIR"/ "$FILES_DIR"/
else
  log "files: first full copy"
  rsync -a --numeric-ids --delete "$STORAGE_DIR"/ "$FILES_DIR"/
fi

# --- 2) Database ------------------------------------------------------------
log "database: dumping from container '$DB_CONTAINER'"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$SNAP_DIR/database.sql.gz"

# gzip of an empty stream is still ~20 bytes, so an empty-ish file means
# pg_dump wrote nothing useful even though the pipe "succeeded".
DUMP_BYTES="$(stat -c%s "$SNAP_DIR/database.sql.gz")"
if [ "$DUMP_BYTES" -lt 1000 ]; then
  echo "[backup] ERROR: database dump is only ${DUMP_BYTES} bytes — treating as failed." >&2
  exit 1
fi

# --- 3) Manifest ------------------------------------------------------------
{
  echo "timestamp=$TS"
  echo "host=$(hostname)"
  echo "storage_source=$STORAGE_DIR"
  echo "files_size=$(du -sh "$FILES_DIR" | cut -f1)"
  echo "files_count=$(find "$FILES_DIR" -type f | wc -l)"
  echo "database=database.sql.gz"
  echo "database_bytes=$DUMP_BYTES"
} > "$SNAP_DIR/manifest.txt"

# --- 4) Retention -----------------------------------------------------------
log "pruning (keep newest $KEEP_SNAPSHOTS)"
COUNT="$(find "$BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
if [ "$COUNT" -gt "$KEEP_SNAPSHOTS" ]; then
  REMOVE=$((COUNT - KEEP_SNAPSHOTS))
  find "$BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d | sort | head -n "$REMOVE" | while read -r old; do
    log "removing old snapshot: $(basename "$old")"
    rm -rf "$old"
  done
fi

trap - EXIT
log "done -> $SNAP_DIR ($(du -sh "$SNAP_DIR" | cut -f1) apparent, dedup'd)"

# ===========================================================================
# SETUP
#
#   sudo mkdir -p /home/atlas/atlas-backups
#   sudo cp backup.sh /usr/local/bin/atlas-backup.sh
#   sudo chown root:root /usr/local/bin/atlas-backup.sh
#   sudo chmod 700 /usr/local/bin/atlas-backup.sh
#
# Run it once by hand first:
#   sudo /usr/local/bin/atlas-backup.sh
#
# Then schedule it in root's crontab (sudo crontab -e):
#
#   0 9-18 * * 1-5 /usr/local/bin/atlas-backup.sh
#   15 2 * * *     /usr/local/bin/atlas-backup.sh
#
# Hourly through the working day, plus one overnight to catch anything
# changed out of hours. Worst case a person loses an hour's work. The
# hard-linking means unchanged files cost nothing, so eleven runs a day is
# barely more disk than one.
#
# Root owns this because the backups contain every document in the system;
# they should not be readable by an ordinary account:
#   sudo chmod 700 /home/atlas/atlas-backups
#
# RESTORE — test this before trusting any of it.
#
#   Files:
#     rsync -a /home/atlas/atlas-backups/snapshots/<TS>/files/ /tmp/restore-test/
#
#   Database (into a scratch DB, never straight over the live one):
#     docker exec -i atlas-db createdb -U atlas atlas_restore_test
#     gunzip -c /home/atlas/atlas-backups/snapshots/<TS>/database.sql.gz \
#       | docker exec -i atlas-db psql -U atlas -d atlas_restore_test
#     docker exec -it atlas-db psql -U atlas -d atlas_restore_test -c '\dt'
#     docker exec -i atlas-db dropdb -U atlas atlas_restore_test
# ===========================================================================