#!/usr/bin/env bash
# Respaldo diario de PostgreSQL (Linux). La contraseña NO va en este archivo:
# exportar PGPASSWORD o usar ~/.pgpass (chmod 600).
set -euo pipefail
DIR="${BACKUP_DIR:-/var/backups/grupo-naro}"
DB="${BACKUP_DB:-grupo_naro}"
mkdir -p "$DIR"
FILE="$DIR/grupo_naro_$(date +%Y%m%d_%H%M).dump"
trap 'rm -f "$FILE"' ERR
pg_dump -U postgres -h localhost -Fc -f "$FILE" "$DB"
[ -s "$FILE" ] || { echo "El respaldo quedó vacío: $FILE" >&2; exit 1; }
find "$DIR" -name 'grupo_naro_*.dump' -mtime +30 -delete
