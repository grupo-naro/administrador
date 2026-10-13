const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateInput(value: string): Date {
  const m = DATE_RE.exec(value.trim());
  if (!m) throw new Error("Fecha inválida");
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== day) {
    throw new Error("Fecha inválida");
  }
  return date;
}

export const toDateInput = (d: Date): string => d.toISOString().slice(0, 10);

export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)));
}

export function todayAR(now: Date = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(now);
  return parseDateInput(s);
}

export const diffDays = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / 86_400_000);

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
