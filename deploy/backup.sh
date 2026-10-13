#!/usr/bin/env bash
# Respaldo diario de PostgreSQL (Linux). La contraseña NO va en este archivo:
# exportar PGPASSWORD o usar ~/.pgpass (chmod 600).
set -euo pipefail
DIR="${BACKUP_DIR:-/var/backups/grupo-naro}"
mkdir -p "$DIR"
FILE="$DIR/grupo_naro_$(date +%Y%m%d_%H%M).dump"
pg_dump -U postgres -h localhost -Fc -f "$FILE" grupo_naro
[ -s "$FILE" ] || { echo "El respaldo quedó vacío: $FILE" >&2; exit 1; }
find "$DIR" -name '*.dump' -mtime +30 -delete
