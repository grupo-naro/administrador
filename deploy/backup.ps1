# Respaldo diario de PostgreSQL (Windows). La contraseña NO va en este archivo:
# definir la variable de entorno PGPASSWORD (del usuario/tarea) o un archivo
# %APPDATA%\postgresql\pgpass.conf  (formato: host:puerto:base:usuario:contraseña).
param(
  [string]$Dir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "D:\backups\grupo-naro" }),
  [string]$PgBin = $(if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }),
  [string]$Database = $(if ($env:PGDATABASE_BACKUP) { $env:PGDATABASE_BACKUP } else { "grupo_naro" }),
  [int]$RetentionDays = 30
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Dir | Out-Null
$file = Join-Path $Dir ("grupo_naro_{0:yyyyMMdd_HHmm}.dump" -f (Get-Date))
try {
  & (Join-Path $PgBin "pg_dump.exe") -U postgres -h localhost -Fc -f $file $Database
  if ($LASTEXITCODE -ne 0) { throw "pg_dump falló (código $LASTEXITCODE)" }
  if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) { throw "El respaldo quedó vacío: $file" }
} catch {
  if (Test-Path $file) { Remove-Item $file -Force }
  Write-Error $_
  exit 1
}
Get-ChildItem $Dir -Filter "grupo_naro_*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } | Remove-Item
