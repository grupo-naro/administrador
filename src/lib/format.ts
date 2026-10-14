import { formatARS } from "@/domain/money";

export function formatPct(fraction: number | null, maxDigits = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  if (fraction > 0 && fraction < 0.001) return "<0,1%";
  return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: maxDigits }).format(fraction);
}

/** Variación con signo explícito (+ / − real). Topa en 999 % para que no se lea como un número absurdo. */
export function formatSignedPct(fraction: number): string {
  if (fraction === 0 || !Number.isFinite(fraction)) return formatPct(Number.isFinite(fraction) ? fraction : null);
  const sign = fraction > 0 ? "+" : "−";
  if (Math.abs(fraction) > 9.99) return `${sign}999% o más`;
  return `${sign}${formatPct(Math.abs(fraction))}`;
}

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
