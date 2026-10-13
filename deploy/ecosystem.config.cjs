// pm2: `pm2 start deploy/ecosystem.config.cjs` (desde la raíz del repo, después de `pnpm build`
// y de copiar public/ y .next/static/ dentro de .next/standalone/).
//
// NO poner secretos aquí. DATABASE_URL, AUTH_SECRET, AUTH_URL, AUTH_TRUST_HOST y APP_URL
// deben estar en el entorno del servicio (o en un .env junto a server.js, fuera de git).
const path = require("path");

module.exports = {
  apps: [
    {
      name: "grupo-naro",
      cwd: path.join(__dirname, "..", ".next", "standalone"),
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        // Solo loopback: únicamente el túnel de Cloudflare debe poder llegar a la app.
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
