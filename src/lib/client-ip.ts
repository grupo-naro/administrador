/** IP del cliente detrás de Cloudflare Tunnel. Solo es confiable si la app escucha en loopback (ver deploy/README.md §5). */
export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
