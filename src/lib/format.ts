import { formatARS } from "@/domain/money";

export function formatPct(fraction: number | null, maxDigits = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: maxDigits }).format(fraction);
}

export const formatSignedPct = (fraction: number): string => `${fraction > 0 ? "+" : ""}${formatPct(fraction)}`;

export function formatSignedARS(cents: number): string {
  if (cents === 0) return formatARS(0);
  return `${cents > 0 ? "+" : "−"}${formatARS(Math.abs(cents))}`;
}

/** Monto abreviado para los ejes de los gráficos (p. ej. "$ 1,5 M"). */
export const formatCompactARS = (cents: number): string =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", notation: "compact", maximumFractionDigits: 1 }).format(
    cents / 100,
  );

export function formatDays(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return "—";
  const rounded = Math.round(days * 10) / 10;
  return `${rounded.toLocaleString("es-AR")} ${rounded === 1 ? "día" : "días"}`;
}
