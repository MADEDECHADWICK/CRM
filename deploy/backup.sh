#!/usr/bin/env bash
set -euo pipefail

umask 077

BACKUP_DIR=/var/backups/crm
DB_NAME=crm

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
sudo -u postgres pg_dump -Fc -d "$DB_NAME" > "$BACKUP_DIR/crm-$(date +%F).dump"
sudo -u postgres pg_dumpall --globals-only > "$BACKUP_DIR/globals-$(date +%F).sql"
find "$BACKUP_DIR" -name '*.dump' -mtime +14 -delete
find "$BACKUP_DIR" -name 'globals-*.sql' -mtime +14 -delete
