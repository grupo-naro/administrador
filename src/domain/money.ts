export function toCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value.trim().replace(",", ".")) : value;
  if (!Number.isFinite(n)) throw new Error("Monto inválido");
  return Math.round(n * 100);
}

export const fromCents = (cents: number): number => cents / 100;

export function formatARS(cents: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(cents / 100);
}
