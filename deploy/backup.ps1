# Respaldo diario de PostgreSQL (Windows). La contraseña NO va en este archivo:
# definir la variable de entorno PGPASSWORD (del usuario/tarea) o un archivo
# %APPDATA%\postgresql\pgpass.conf  (formato: host:puerto:base:usuario:contraseña).
param(
  [string]$Dir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "D:\backups\grupo-naro" }),
  [string]$PgBin = $(if ($env:PG_BIN) { $env:PG_BIN } else { "C:\Program Files\PostgreSQL\17\bin" }),
  [int]$RetentionDays = 30
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Dir | Out-Null
$file = Join-Path $Dir ("grupo_naro_{0:yyyyMMdd_HHmm}.dump" -f (Get-Date))
& (Join-Path $PgBin "pg_dump.exe") -U postgres -h localhost -Fc -f $file grupo_naro
if ($LASTEXITCODE -ne 0) { throw "pg_dump falló (código $LASTEXITCODE)" }
if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) { throw "El respaldo quedó vacío: $file" }
Get-ChildItem $Dir -Filter *.dump | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } | Remove-Item
