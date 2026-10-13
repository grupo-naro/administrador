# Despliegue de Grupo Naro en el VPS

App Next.js (`output: "standalone"`) + PostgreSQL local, expuesta a internet solo mediante Cloudflare Tunnel.
Guía válida para Windows y Linux; donde difieren se indican ambos.

## Requisitos

- Node.js (LTS) y pnpm 10 (`corepack enable`).
- PostgreSQL con una base `grupo_naro` (en Windows: `C:\Program Files\PostgreSQL\17\bin`; ajustar a la versión instalada).
- Un dominio en Cloudflare (ej. `panel.tudominio.com`).

## 1. Variables de producción

El servidor standalone **no incluye tu `.env`** (la carpeta `.next/standalone` no lo contiene). Hay que entregarlas al proceso:
en el entorno del servicio (recomendado) o con un `.env` colocado junto a `server.js` (`.next/standalone/.env`, fuera de git).
**Nunca** subir `.env` al repositorio. No escribir secretos en `ecosystem.config.cjs`.

```
DATABASE_URL=postgresql://postgres:<CLAVE>@localhost:5432/grupo_naro
AUTH_SECRET=<nuevo, distinto al de desarrollo>   # p. ej. openssl rand -base64 32
AUTH_URL=https://panel.tudominio.com
APP_URL=https://panel.tudominio.com
AUTH_TRUST_HOST=true
```

Para `prisma migrate deploy` y `pnpm db:seed` (que corren desde la raíz del repo) estas variables y
`ADMIN_EMAIL` / `ADMIN_PASSWORD` van en el `.env` de la raíz del repo (también fuera de git).

## 2. Build

```bash
# 1. Build (en el servidor)
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy        # aplica migraciones, nunca "migrate dev" en producción
pnpm db:seed                           # solo la primera vez
pnpm build
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
```

Notas:

- `cp -r` funciona en Linux y en Git Bash; en PowerShell usar
  `Copy-Item -Recurse public .next\standalone\public` y `Copy-Item -Recurse .next\static .next\standalone\.next\static`.
- El servidor standalone no copia `public/` ni `.next/static/`; sin ese paso los CSS/JS dan 404. Hay que repetirlo en **cada** build.
- `pnpm install` necesita las devDependencies (prisma, tsx) para migrar y sembrar; no usar `--prod`.
- Usuario administrador: el seed crea (o actualiza) al admin con `ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env`.
  **Cambiar la contraseña de ejemplo** antes del primer seed en producción. Para rotar la contraseña o crear otro admin:
  editar esos dos valores y volver a ejecutar `pnpm db:seed`.

Prueba local rápida (sin pm2), con las variables ya cargadas en el entorno:

```bash
PORT=3000 HOSTNAME=127.0.0.1 node .next/standalone/server.js
# PowerShell: $env:PORT="3000"; $env:HOSTNAME="127.0.0.1"; node .next/standalone/server.js
```

## 3. Arranque persistente (pm2)

```bash
# 2. Arranque persistente
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save                               # + pm2-windows-startup / "pm2 startup" en Linux
```

- `ecosystem.config.cjs` usa `.next/standalone` como `cwd` (relativo al repo) y fija `NODE_ENV`, `PORT=3000` y `HOSTNAME=127.0.0.1`.
- Los secretos del punto 1 deben estar definidos en el entorno desde el que arranca pm2 (variables de usuario/sistema en Windows,
  `/etc/environment` o el unit de systemd en Linux) o en `.next/standalone/.env`.
- Windows: instalar `pm2-windows-startup` (`npm i -g pm2-windows-startup && pm2-startup install`) y luego `pm2 save`;
  alternativa: registrar `node .next\standalone\server.js` como servicio con NSSM.
- Linux: `pm2 startup` imprime un comando para ejecutar con sudo; luego `pm2 save`. Alternativa: unit de systemd con
  `EnvironmentFile=/etc/grupo-naro.env` y `ExecStart=/usr/bin/node .next/standalone/server.js`.
- Actualizar versión: `git pull`, repetir el punto 2 (sin seed) y `pm2 restart grupo-naro`.

## 4. Cloudflare Tunnel

```bash
# 3. Túnel
cloudflared tunnel login
cloudflared tunnel create grupo-naro
cloudflared tunnel route dns grupo-naro panel.tudominio.com
cloudflared service install            # corre el túnel como servicio
```

Antes de `service install`, copiar `deploy/cloudflared-config.example.yml` a `config.yml` de cloudflared
(`~/.cloudflared/` en Linux, `%USERPROFILE%\.cloudflared\` en Windows; para el servicio de Windows puede requerirse
copiarlo también a `C:\Windows\System32\config\systemprofile\.cloudflared\`) y completar el ID del túnel y la ruta del JSON de credenciales.

## 5. Seguridad (obligatorio)

- **Escuchar solo en loopback**: `HOSTNAME=127.0.0.1`. El límite de intentos del portal confía en `cf-connecting-ip` /
  `x-forwarded-for`, que un cliente puede falsificar si llega directo a la app. Solo el túnel debe poder alcanzarla;
  no abrir el puerto 3000 en el firewall ni en el router.
- **PostgreSQL no debe exponerse**: puerto 5432 cerrado hacia afuera (`listen_addresses = 'localhost'` en `postgresql.conf`,
  y/o regla de firewall de Windows / `ufw`). No reenviar el puerto en el router.
- `AUTH_SECRET` de producción distinto al de desarrollo; `AUTH_URL` y `APP_URL` con la URL pública `https`; `AUTH_TRUST_HOST=true`.
- Cambiar la contraseña de administrador de ejemplo (ver punto 2). No versionar `.env`.
- En producción usar siempre `prisma migrate deploy`, nunca `migrate dev`.

## 6. Respaldos diarios

La contraseña no se escribe en los scripts. Proveerla con la variable `PGPASSWORD` (entorno de la tarea/cron) o con un archivo
`pgpass` (Linux: `~/.pgpass` con `chmod 600`; Windows: `%APPDATA%\postgresql\pgpass.conf`), formato `localhost:5432:grupo_naro:postgres:<CLAVE>`.

Ambos scripts generan `grupo_naro_AAAAMMDD_HHMM.dump` (formato custom `-Fc`), fallan si el archivo queda vacío y borran los de más de 30 días.

**Windows** (`deploy/backup.ps1`; parámetros opcionales `-Dir` y `-PgBin`, o variables `BACKUP_DIR` y `PG_BIN`;
por defecto `D:\backups\grupo-naro` y `C:\Program Files\PostgreSQL\17\bin`, ajustar a la versión instalada):

```powershell
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\ruta\al\repo\deploy\backup.ps1"
$t = New-ScheduledTaskTrigger -Daily -At 3am
Register-ScheduledTask -TaskName "grupo-naro-backup" -Action $a -Trigger $t
```

Definir `PGPASSWORD` para el usuario que ejecuta la tarea, o usar `pgpass.conf` de ese usuario.

**Linux** (`crontab -e`; `chmod +x deploy/backup.sh`):

```
0 3 * * * /ruta/deploy/backup.sh
```

Copiar además la carpeta de respaldos fuera del servidor (otro disco / nube).

**Restauración**:

```bash
pg_restore -U postgres -h localhost -d grupo_naro --clean <archivo>.dump
# Comprobar el contenido de un respaldo sin restaurar:
pg_restore --list <archivo>.dump
```

## 7. Verificación de punta a punta

Con el túnel activo, desde otra red (datos móviles):

1. `https://panel.tudominio.com/dashboard` redirige a `/login`; el login funciona y la cookie de sesión es `Secure`.
2. Un enlace de portal generado en producción abre sin login desde el celular del cliente.
3. El puerto 5432 **no** es accesible desde fuera (`Test-NetConnection <ip-publica> -Port 5432` falla).
4. Ejecutar el script de respaldo, confirmar que genera un `.dump` no vacío y probar `pg_restore --list <archivo>`.
