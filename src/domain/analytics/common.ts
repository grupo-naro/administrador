export type PlanKind = "DESARROLLO" | "SUSCRIPCION" | "MANTENIMIENTO";

export const DAY_MS = 86_400_000;

/** `true` si `d` cae en el rango `[from, to)`. */
export const inRange = (d: Date, from: Date, to: Date): boolean =>
  d.getTime() >= from.getTime() && d.getTime() < to.getTime();

/** Días enteros entre dos fechas (UTC medianoche). */
export const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);
