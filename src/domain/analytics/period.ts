import { addMonths, formatDate } from "../dates";
import { DAY_MS, daysBetween } from "./common";

export type PeriodKey = "semana" | "mes" | "6m" | "1a";

export const PERIOD_KEYS: PeriodKey[] = ["semana", "mes", "6m", "1a"];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  semana: "Semana",
  mes: "Mes",
  "6m": "6 meses",
  "1a": "1 año",
};

export interface Period {
  key: PeriodKey;
  from: Date;
  to: Date;
  days: number;
}

export interface Bucket {
  label: string;
  from: Date;
  to: Date;
  days: number;
}

export function parsePeriodKey(value: string | undefined): PeriodKey {
  return PERIOD_KEYS.find((k) => k === value) ?? "mes";
}

const firstOfMonth = (d: Date, offsetMonths = 0) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));

const makePeriod = (key: PeriodKey, from: Date, to: Date): Period => ({ key, from, to, days: daysBetween(from, to) });

/** Período en curso y el inmediatamente anterior (completo), en rangos `[from, to)`. */
export function resolvePeriod(key: PeriodKey, today: Date): { current: Period; previous: Period } {
  switch (key) {
    case "semana": {
      const sinceMonday = (today.getUTCDay() + 6) % 7; // lunes = 0
      const from = new Date(today.getTime() - sinceMonday * DAY_MS);
      const to = new Date(from.getTime() + 7 * DAY_MS);
      return { current: makePeriod(key, from, to), previous: makePeriod(key, new Date(from.getTime() - 7 * DAY_MS), from) };
    }
    case "mes": {
      const from = firstOfMonth(today);
      const to = firstOfMonth(today, 1);
      return { current: makePeriod(key, from, to), previous: makePeriod(key, firstOfMonth(today, -1), from) };
    }
    case "6m":
    case "1a": {
      const months = key === "6m" ? 6 : 12;
      const to = firstOfMonth(today, 1);
      const from = firstOfMonth(today, 1 - months);
      return { current: makePeriod(key, from, to), previous: makePeriod(key, firstOfMonth(today, 1 - 2 * months), from) };
    }
  }
}

const WEEKDAY = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric" });
const MONTH = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "short", year: "2-digit" });

/** Tramos para series: un día (semana y mes) o un mes calendario (6 meses y 1 año). */
export function bucketsOf(p: Period): Bucket[] {
  const out: Bucket[] = [];
  if (p.key === "semana" || p.key === "mes") {
    for (let t = p.from.getTime(); t < p.to.getTime(); t += DAY_MS) {
      const from = new Date(t);
      out.push({
        label: p.key === "semana" ? WEEKDAY.format(from) : String(from.getUTCDate()),
        from,
        to: new Date(t + DAY_MS),
        days: 1,
      });
    }
    return out;
  }
  let from = p.from;
  while (from.getTime() < p.to.getTime()) {
    const to = addMonths(from, 1);
    out.push({ label: MONTH.format(from), from, to, days: daysBetween(from, to) });
    from = to;
  }
  return out;
}

/** "12/10/2026 al 18/10/2026" (el último día incluido). */
export const periodRangeLabel = (p: Period): string =>
  `${formatDate(p.from)} al ${formatDate(new Date(p.to.getTime() - DAY_MS))}`;

/** Diferencia y porcentaje (fracción: 0,25 = 25 %) contra el período anterior; sin porcentaje si el anterior es 0. */
export function variation(current: number, previous: number): { diffCents: number; pct: number | null } {
  const diffCents = current - previous;
  return { diffCents, pct: previous === 0 ? null : diffCents / Math.abs(previous) };
}
