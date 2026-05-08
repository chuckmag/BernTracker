#!/usr/bin/env bash
# Hourly backup of the local berntracker Postgres DB running in Docker.
# Invoked by ~/Library/LaunchAgents/com.wodalytics.db-backup.plist.
# Keeps the 48 most recent backups (~2 days at hourly cadence).
#
# Setup (one-time, per machine):
#   cp scripts/backup-local-db.sh ~/.wodalytics-backups/backup-local-db.sh
#   chmod +x ~/.wodalytics-backups/backup-local-db.sh
#   cp scripts/com.wodalytics.db-backup.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/com.wodalytics.db-backup.plist
#
# The script must live at ~/.wodalytics-backups/ (not in Documents/) because
# macOS TCC blocks LaunchAgents from executing scripts in ~/Documents.

set -euo pipefail

BACKUP_DIR="$HOME/.wodalytics-backups"
CONTAINER="wodalytics-db"
DB="berntracker"
DB_USER="postgres"
KEEP=48
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILE="$BACKUP_DIR/${DB}_${TIMESTAMP}.sql.gz"
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# Verify the container is running before attempting a dump.
if ! docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  log "SKIP: container $CONTAINER is not running"
  exit 0
fi

log "START: dumping $DB → $FILE"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" --clean --if-exists "$DB" \
  | gzip > "$FILE"
log "OK: $(du -sh "$FILE" | cut -f1) written"

# Rotate: delete oldest backups beyond the retention limit.
EXCESS=$(find "$BACKUP_DIR" -maxdepth 1 -name "${DB}_*.sql.gz" \
  | sort | head -n -"$KEEP" | wc -l | tr -d ' ')
if [ "$EXCESS" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -name "${DB}_*.sql.gz" \
    | sort | head -n -"$KEEP" | xargs rm -f
  log "ROTATED: removed $EXCESS old backup(s), keeping $KEEP"
fi
