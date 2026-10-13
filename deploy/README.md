# Despliegue de Grupo Naro en el VPS

App Next.js (`output: "standalone"`) + PostgreSQL local, expuesta a internet solo mediante Cloudflare Tunnel.
Guía válida para Windows y Linux; donde difieren se indican ambos.

## Requisitos

- Node.js >= 20.6 (LTS recomendado; se usa `node --env-file`) y pnpm 10 (`corepack enable`).
- PostgreSQL con una base `grupo_naro` (en Windows: `C:\Program Files\PostgreSQL\17\bin`; ajustar a la versión instalada).
- Un dominio en Cloudflare (ej. `panel.tudominio.com`).

## 1. Variables de producción

El servidor standalone **no incluye tu `.env`**, y `.next/` se regenera en cada `next build`, así que nada que se guarde
dentro de `.next/standalone` sobrevive a una actualización. Las variables van en un archivo persistente **fuera de `.next`**
que se carga explícitamente al arrancar el proceso con `node --env-file=<archivo>`:

- Por defecto `<repo>/.env.production` (ya ignorado por git: `.env*` está en `.gitignore`).
- Otra ubicación: variable `GRUPO_NARO_ENV_FILE` con ruta absoluta al iniciar pm2
  (Linux `/etc/grupo-naro/env`, Windows `C:\grupo-naro\env`). Restringir permisos de lectura al usuario del servicio.

**Nunca** subir ese archivo ni `.env` al repositorio. No escribir secretos en `ecosystem.config.cjs`.

```
DATABASE_URL=postgresql://postgres:<CLAVE>@localhost:5432/grupo_naro
AUTH_SECRET=<nuevo, distinto al de desarrollo>   # p. ej. openssl rand -base64 32
AUTH_URL=https://panel.tudominio.com
APP_URL=https://panel.tudominio.com
AUTH_TRUST_HOST=true
```

Formato `KEY=valor`, sin `export`. Para `prisma migrate deploy` y `pnpm db:seed` (que corren desde la raíz del repo)
estas variables y `ADMIN_EMAIL` / `ADMIN_PASSWORD` van en el `.env` de la raíz del repo (fuera de git).

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
- El servidor standalone no copia `public/` ni `.next/static/`; sin ese paso los CSS/JS dan 404. Repetirlo en **cada** build.
- `pnpm install` necesita las devDependencies (prisma, tsx) para migrar y sembrar; no usar `--prod`.
- Usuario administrador: el seed crea (o actualiza) al admin con `ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env`.
  **Cambiar la contraseña de ejemplo** antes del primer seed en producción. Para rotar la contraseña o crear otro admin:
  editar esos dos valores y volver a ejecutar `pnpm db:seed`.

Prueba local rápida (sin pm2):

```bash
PORT=3000 HOSTNAME=127.0.0.1 node --env-file=.env.production .next/standalone/server.js
# PowerShell: $env:PORT="3000"; $env:HOSTNAME="127.0.0.1"; node --env-file=.env.production .next\standalone\server.js
```

## 3. Arranque persistente (pm2)

```bash
# 2. Arranque persistente
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save                               # + pm2-windows-startup / "pm2 startup" en Linux
```

- `ecosystem.config.cjs` usa `.next/standalone` como `cwd` (relativo al repo), fija `NODE_ENV`, `PORT=3000`,
  `HOSTNAME=127.0.0.1` y pasa `node_args: --env-file=<GRUPO_NARO_ENV_FILE o <repo>/.env.production>`.
- pm2 conserva el entorno del daemon: tras cambiar variables (o el archivo de entorno) ejecutar
  `pm2 restart grupo-naro --update-env`. Si usás `GRUPO_NARO_ENV_FILE`, definila en el entorno antes de ese comando.
- Windows: `npm i -g pm2-windows-startup && pm2-startup install`, luego `pm2 save`.
  Alternativa con NSSM: `nssm install grupo-naro "C:\Program Files\nodejs\node.exe" "--env-file=C:\grupo-naro\env server.js"`,
  directorio de arranque `<repo>\.next\standalone`, y en "Environment" `HOSTNAME=127.0.0.1` y `PORT=3000`
  (las demás variables vienen del `--env-file`).
- Linux: `pm2 startup` imprime un comando para ejecutar con sudo; luego `pm2 save`. El unit generado por pm2 **no** lee
  `/etc/environment`; las variables llegan por `--env-file` desde el ecosystem.
- Linux, alternativa con systemd puro (`/etc/systemd/system/grupo-naro.service`):

```ini
[Unit]
Description=Grupo Naro
After=network.target postgresql.service

[Service]
WorkingDirectory=/ruta/al/repo/.next/standalone
EnvironmentFile=/etc/grupo-naro/env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node server.js
Restart=always
User=grupo-naro

[Install]
WantedBy=multi-user.target
```

  (`EnvironmentFile` usa `KEY=valor`, sin `export`.) Luego `systemctl enable --now grupo-naro`.

## 4. Cloudflare Tunnel

```bash
# 3. Túnel
cloudflared tunnel login
cloudflared tunnel create grupo-naro
cloudflared tunnel route dns grupo-naro panel.tudominio.com
cloudflared service install            # corre el túnel como servicio
```

Antes de `service install`, copiar `deploy/cloudflared-config.example.yml` a la ubicación de config de cloudflared y completar el
ID del túnel y la ruta del JSON de credenciales:

- Linux: `cloudflared service install` lee `/etc/cloudflared/config.yml`; `credentials-file` debe ser una ruta **absoluta**
  (p. ej. `/etc/cloudflared/<ID>.json`) legible por el servicio.
- Windows: `%USERPROFILE%\.cloudflared\config.yml`; para el servicio puede requerirse copiarlo (y el JSON) también a
  `C:\Windows\System32\config\systemprofile\.cloudflared\` y usar rutas absolutas.

## 5. Seguridad (obligatorio)

- **Escuchar solo en loopback**: `HOSTNAME=127.0.0.1`. El límite de intentos del portal confía en `cf-connecting-ip` /
  `x-forwarded-for`, que un cliente puede falsificar si llega directo a la app. Solo el túnel debe poder alcanzarla;
  no abrir el puerto 3000 en el firewall ni en el router.
- **PostgreSQL no debe exponerse**: puerto 5432 cerrado hacia afuera (`listen_addresses = 'localhost'` en `postgresql.conf`,
  y/o regla de firewall de Windows / `ufw`). No reenviar el puerto en el router.
- `AUTH_SECRET` de producción distinto al de desarrollo; `AUTH_URL` y `APP_URL` con la URL pública `https`; `AUTH_TRUST_HOST=true`.
- Cambiar la contraseña de administrador de ejemplo (ver punto 2). No versionar `.env` ni `.env.production`.
- En producción usar siempre `prisma migrate deploy`, nunca `migrate dev`.
- **Límite de intentos de login**: la app limita el formulario de `/login` a 10 intentos cada 15 minutos por IP. Ese
  límite vive **en memoria y por proceso** (se reinicia con `pm2 restart` y no se comparte entre instancias), y no cubre
  un POST directo a `/api/auth/callback/credentials`. Como defensa en profundidad, crear en Cloudflare
  (Security → WAF → Rate limiting rules) una regla como:
  - Expresión: `(http.request.method eq "POST" and (starts_with(http.request.uri.path, "/login") or starts_with(http.request.uri.path, "/api/auth")))`
  - Contar por IP; umbral 10 solicitudes cada 1 minuto (o el más estricto que permita el plan); acción **Block**
    (o Managed Challenge) durante 10 minutos.

## 6. Respaldos diarios

La contraseña no se escribe en los scripts. Proveerla con la variable `PGPASSWORD` (entorno de la tarea/cron) o con un archivo
`pgpass` (Linux: `~/.pgpass` con `chmod 600`; Windows: `%APPDATA%\postgresql\pgpass.conf`), formato `localhost:5432:grupo_naro:postgres:<CLAVE>`.

Ambos scripts generan `grupo_naro_AAAAMMDD_HHMM.dump` (formato custom `-Fc`), fallan (y borran el archivo parcial) si `pg_dump` falla o
el archivo queda vacío, y eliminan solo los `grupo_naro_*.dump` de más de 30 días.

**Windows** (`deploy/backup.ps1`; parámetros opcionales `-Dir`, `-PgBin`, `-Database`, o variables `BACKUP_DIR` y `PG_BIN`;
por defecto `D:\backups\grupo-naro` y `C:\Program Files\PostgreSQL\17\bin`, ajustar a la versión instalada):

```powershell
$a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\ruta\al\repo\deploy\backup.ps1"
$t = New-ScheduledTaskTrigger -Daily -At 3am
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName "grupo-naro-backup" -Action $a -Trigger $t -Settings $s
```

`-StartWhenAvailable` ejecuta la tarea apenas se pueda si el equipo estaba apagado a las 3:00.
Para que corra **con o sin sesión iniciada**, registrarla con usuario y contraseña
(`Register-ScheduledTask ... -User <usuario> -Password <clave>`) o, en la GUI del Programador de tareas, marcar
"Ejecutar tanto si el usuario inició sesión como si no". Definir `PGPASSWORD` para ese usuario, o usar su `pgpass.conf`.

**Linux** (`crontab -e`; `chmod +x deploy/backup.sh`):

```
0 3 * * * /ruta/deploy/backup.sh
```

Copiar además la carpeta de respaldos fuera del servidor (otro disco / nube).

### Restauración

> **ADVERTENCIA: `pg_restore --clean` borra y sobrescribe los datos vivos de la base.** No ejecutarlo directo sobre producción.
> Todos estos comandos necesitan `PGPASSWORD` o `pgpass` (ver arriba).

```bash
# a) Detener la app
pm2 stop grupo-naro
# b) Respaldo fresco del estado actual (por si la restauración falla)
pg_dump -U postgres -h localhost -Fc -f pre_restore.dump grupo_naro
# c) Probar el respaldo en una base de pruebas e inspeccionarla
createdb -U postgres -h localhost grupo_naro_restore_test
pg_restore -U postgres -h localhost -d grupo_naro_restore_test --no-owner <archivo>.dump
psql -U postgres -h localhost -d grupo_naro_restore_test -c "\dt"      # revisar tablas y datos
dropdb -U postgres -h localhost grupo_naro_restore_test
# d) Recién entonces, restaurar en producción
pg_restore -U postgres -h localhost --clean --if-exists --no-owner -d grupo_naro <archivo>.dump
# e) Iniciar la app
pm2 start grupo-naro
```

En Windows, usar los mismos comandos con los ejecutables de `C:\Program Files\PostgreSQL\17\bin`.
Para solo listar el contenido de un respaldo: `pg_restore --list <archivo>.dump`.

## 7. Actualización y reversión

Actualizar:

```bash
git pull                                  # o: git checkout <tag>
pnpm install --frozen-lockfile
pg_dump -U postgres -h localhost -Fc -f pre_update_$(date +%Y%m%d_%H%M).dump grupo_naro   # respaldo ANTES de migrar
pnpm exec prisma migrate deploy
pnpm build
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
pm2 restart grupo-naro --update-env
```

Reversión (con honestidad): **las migraciones de Prisma no son reversibles.**

- Datos/esquema: restaurar el respaldo tomado antes de la actualización siguiendo el procedimiento de restauración de arriba.
- Código: `git checkout <tag-o-commit-anterior>`, `pnpm install --frozen-lockfile`, `pnpm build`, copiar `public` y `.next/static`,
  `pm2 restart grupo-naro --update-env`. Código viejo sobre un esquema ya migrado puede fallar: restaurar también el dump.

## 8. Verificación de punta a punta

Prueba local (en el servidor) con la app arrancada:

- `curl -i http://127.0.0.1:3000/login` devuelve `200`.
- `curl -i http://127.0.0.1:3000/dashboard` (sin sesión) devuelve `307` hacia `/login`.
- `curl -i http://127.0.0.1:3000/client/view/<43 caracteres aleatorios>` devuelve `404`.
- Un archivo `/_next/static/...` referenciado por el HTML de `/login` devuelve `200` (confirma la copia de `.next/static`).

Con el túnel activo, desde otra red (datos móviles):

1. `https://panel.tudominio.com/dashboard` redirige a `/login`; el login funciona y la cookie de sesión es `Secure`.
2. Un enlace de portal generado en producción abre sin login desde el celular del cliente.
3. El puerto 5432 **no** es accesible desde fuera (`Test-NetConnection <ip-publica> -Port 5432` falla).
4. El puerto 3000 **no** es accesible desde otros equipos de la red (`Test-NetConnection <ip-del-vps> -Port 3000` falla; solo responde en `127.0.0.1`).
5. Ejecutar el script de respaldo, confirmar que genera un `.dump` no vacío y probar `pg_restore --list <archivo>`.
