// pm2: `pm2 start deploy/ecosystem.config.cjs` (desde la raíz del repo, después de `pnpm build`
// y de copiar public/ y .next/static/ dentro de .next/standalone/).
//
// NO poner secretos aquí. Las variables (DATABASE_URL, AUTH_SECRET, AUTH_URL, AUTH_TRUST_HOST, APP_URL)
// viven en un archivo FUERA de .next (que `next build` regenera) y se cargan con `node --env-file`.
// Ruta del archivo: variable GRUPO_NARO_ENV_FILE; por defecto <repo>/.env.production.
// Requiere Node >= 20.6.
const path = require("path");

const envFile =
  process.env.GRUPO_NARO_ENV_FILE ||
  path.join(__dirname, "..", ".env.production");

module.exports = {
  apps: [
    {
      name: "grupo-naro",
      cwd: path.join(__dirname, "..", ".next", "standalone"),
      script: "server.js",
      node_args: `--env-file=${envFile}`,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        // Solo loopback: únicamente el túnel de Cloudflare debe poder llegar a la app.
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
