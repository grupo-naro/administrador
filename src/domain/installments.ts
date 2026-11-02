import { addMonths } from "./dates";

export type InstallmentType =
  | "ANTICIPO"
  | "CUOTA"
  | "PRIMER_PAGO"
  | "MENSUAL"
  | "MANTENIMIENTO"
  | "PAGO_TOTAL"
  | "SALDO_ENTREGA";

/** Forma de pago de un plan de desarrollo (Pago Único). */
export type DevelopmentScheme = "ANTICIPO_CUOTAS" | "CONTADO" | "MITAD_ENTREGA";

export interface InstallmentDraft {
  type: InstallmentType;
  sequence: number;
  amountCents: number;
  dueDate: Date;
}

export const BATCH_SIZE = 6;

const assertPositive = (cents: number, what: string) => {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error(`${what} debe ser mayor a cero`);
};

export type IntervalUnit = "dias" | "semanas" | "meses";

/** Frecuencia entre cuotas: "cada N días / semanas / meses". */
export interface Interval {
  every: number;
  unit: IntervalUnit;
}

export const MONTHLY: Interval = { every: 1, unit: "meses" };

const MAX_EVERY: Record<IntervalUnit, number> = { dias: 365, semanas: 52, meses: 24 };

function assertInterval(interval: Interval) {
  if (!Number.isInteger(interval.every) || interval.every < 1) {
    throw new Error("La frecuencia debe ser un número entero mayor a cero");
  }
  if (interval.every > MAX_EVERY[interval.unit]) throw new Error("La frecuencia es demasiado grande");
}

/** Fecha `n` períodos después de `base` (n = 0 devuelve la base). Los meses recortan fin de mes sin derivar. */
export function addInterval(base: Date, interval: Interval, n: number): Date {
  assertInterval(interval);
  if (interval.unit === "meses") return addMonths(base, interval.every * n);
  const days = interval.unit === "semanas" ? interval.every * 7 : interval.every;
  return new Date(base.getTime() + days * n * 86_400_000);
}

export function planOneTime(a: {
  totalCents: number;
  count: number;
  startDate: Date;
  interval?: Interval;
}): InstallmentDraft[] {
  assertPositive(a.totalCents, "El total");
  assertCount(a.count);
  const anticipo = Math.round(a.totalCents / 2);
  return [
    { type: "ANTICIPO", sequence: 1, amountCents: anticipo, dueDate: a.startDate },
    ...splitCuotas(a.totalCents - anticipo, a.count, a.startDate, a.interval ?? MONTHLY),
  ];
}

function assertCount(count: number | undefined): asserts count is 2 | 3 {
  if (count !== 2 && count !== 3) throw new Error("Las cuotas deben ser 2 o 3");
}

/** `count` cuotas (secuencias 2..count+1) que suman `remaining`; el sobrante va a la última. La cuota i vence i períodos después de `base`. */
function splitCuotas(remaining: number, count: number, base: Date, interval: Interval): InstallmentDraft[] {
  const each = Math.floor(remaining / count);
  return Array.from({ length: count }, (_, k) => {
    const i = k + 1;
    return {
      type: "CUOTA" as const,
      sequence: i + 1,
      amountCents: i === count ? remaining - each * (count - 1) : each,
      dueDate: addInterval(base, interval, i),
    };
  });
}

function saldoEntrega(amountCents: number, startDate: Date, deliveryDate: Date | null | undefined): InstallmentDraft {
  if (!deliveryDate) throw new Error("Ingresá la fecha estimada de entrega");
  if (deliveryDate.getTime() < startDate.getTime()) {
    throw new Error("La entrega estimada no puede ser anterior al anticipo");
  }
  return { type: "SALDO_ENTREGA", sequence: 2, amountCents, dueDate: deliveryDate };
}

export interface DevelopmentInput {
  scheme: DevelopmentScheme;
  totalCents: number;
  /** Fecha del anticipo (o del pago único si es "Todo junto"). */
  startDate: Date;
  /** Solo ANTICIPO_CUOTAS: 2 o 3. */
  count?: number;
  /** Solo ANTICIPO_CUOTAS. */
  interval?: Interval;
  /** Solo MITAD_ENTREGA: fecha estimada de entrega. */
  deliveryDate?: Date | null;
}

/** Cuotas del plan de desarrollo según la forma de pago elegida. */
export function planDevelopment(a: DevelopmentInput): InstallmentDraft[] {
  assertPositive(a.totalCents, "El total");
  switch (a.scheme) {
    case "ANTICIPO_CUOTAS":
      assertCount(a.count);
      return planOneTime({ totalCents: a.totalCents, count: a.count, startDate: a.startDate, interval: a.interval });
    case "CONTADO":
      return [{ type: "PAGO_TOTAL", sequence: 1, amountCents: a.totalCents, dueDate: a.startDate }];
    case "MITAD_ENTREGA": {
      const anticipo = Math.round(a.totalCents / 2);
      return [
        { type: "ANTICIPO", sequence: 1, amountCents: anticipo, dueDate: a.startDate },
        saldoEntrega(a.totalCents - anticipo, a.startDate, a.deliveryDate),
      ];
    }
  }
}

export const SCHEME_CHANGE_BLOCKED =
  "No se puede cambiar la forma de pago: ya hay pagos registrados en cuotas que se reemplazarían. Quitá esos pagos o editá las cuotas a mano.";

/**
 * Cambio de forma de pago de un plan de desarrollo existente.
 * - Sin pagos en ninguna cuota: se rehace el plan completo (`keepAnticipo = false`).
 * - Solo el anticipo (secuencia 1) tiene pagos y la nueva forma conserva anticipo: el anticipo queda igual y
 *   se regenera el resto sobre `total − anticipo` desde la secuencia 2 (`keepAnticipo = true`).
 * - Cualquier otro caso con pagos: error.
 */
export function planSchemeChange(
  a: DevelopmentInput & {
    current: { type: InstallmentType; sequence: number; amountCents: number; paidCents: number }[];
  },
): { keepAnticipo: boolean; drafts: InstallmentDraft[] } {
  assertPositive(a.totalCents, "El total");
  const withPayments = a.current.filter((i) => i.paidCents > 0);
  if (withPayments.length === 0) return { keepAnticipo: false, drafts: planDevelopment(a) };
  const anticipo = withPayments.length === 1 && withPayments[0].type === "ANTICIPO" && withPayments[0].sequence === 1
    ? withPayments[0]
    : null;
  if (!anticipo || a.scheme === "CONTADO") throw new Error(SCHEME_CHANGE_BLOCKED);
  if (a.totalCents <= anticipo.amountCents) {
    throw new Error("El total debe ser mayor al anticipo ya registrado");
  }
  const remaining = a.totalCents - anticipo.amountCents;
  if (a.scheme === "ANTICIPO_CUOTAS") {
    assertCount(a.count);
    return { keepAnticipo: true, drafts: splitCuotas(remaining, a.count, a.startDate, a.interval ?? MONTHLY) };
  }
  return { keepAnticipo: true, drafts: [saldoEntrega(remaining, a.startDate, a.deliveryDate)] };
}

/** Al entregar el proyecto: las cuotas SALDO_ENTREGA sin pagos pasan a vencer en la fecha de entrega. */
export function deliveryDueUpdates(
  items: { id: string; type: InstallmentType; paidCents: number }[],
  deliveredAt: Date,
): { id: string; dueDate: Date }[] {
  return items
    .filter((i) => i.type === "SALDO_ENTREGA" && i.paidCents === 0)
    .map((i) => ({ id: i.id, dueDate: deliveredAt }));
}

/**
 * Nuevos vencimientos para las cuotas (type CUOTA) sin pagos de un plan de Pago Único:
 * la primera elegible vence en `firstDate` y las siguientes cada `interval`. El anticipo y las
 * cuotas con algún pago no se tocan.
 */
export function planReschedule(
  items: { id: string; type: InstallmentType; sequence: number; paidCents: number }[],
  firstDate: Date,
  interval: Interval,
): { id: string; dueDate: Date }[] {
  assertInterval(interval);
  return items
    .filter((i) => i.type === "CUOTA" && i.paidCents === 0)
    .sort((a, b) => a.sequence - b.sequence)
    .map((i, k) => ({ id: i.id, dueDate: addInterval(firstDate, interval, k) }));
}

export function planRecurring(a: {
  type: "MENSUAL" | "MANTENIMIENTO";
  feeCents: number;
  baseDate: Date;
  startSequence: number;
  count: number;
}): InstallmentDraft[] {
  assertPositive(a.feeCents, "El abono");
  return Array.from({ length: a.count }, (_, i) => {
    const sequence = a.startSequence + i;
    return { type: a.type, sequence, amountCents: a.feeCents, dueDate: addMonths(a.baseDate, sequence - 1) };
  });
}

export function planSubscription(a: {
  monthlyFeeCents: number;
  firstPaymentCents: number;
  firstDueDate: Date;
  count?: number;
}): InstallmentDraft[] {
  assertPositive(a.firstPaymentCents, "El primer pago");
  const count = a.count ?? BATCH_SIZE;
  return [
    { type: "PRIMER_PAGO", sequence: 1, amountCents: a.firstPaymentCents, dueDate: a.firstDueDate },
    ...planRecurring({
      type: "MENSUAL",
      feeCents: a.monthlyFeeCents,
      baseDate: a.firstDueDate,
      startSequence: 2,
      count: count - 1,
    }),
  ];
}

export interface RepriceItem {
  id: string;
  type: InstallmentType;
  dueDate: Date;
  amountCents: number;
  paidCents: number;
}

export function repriceInstallments(
  items: RepriceItem[],
  fromDate: Date,
  newFeeCents: number,
): { id: string; amountCents: number }[] {
  assertPositive(newFeeCents, "El abono");
  return items
    .filter(
      (i) =>
        (i.type === "MENSUAL" || i.type === "MANTENIMIENTO") &&
        i.dueDate.getTime() >= fromDate.getTime() &&
        i.paidCents === 0 &&
        i.amountCents !== newFeeCents,
    )
    .map((i) => ({ id: i.id, amountCents: newFeeCents }));
}

export const needsExtension = (pendingRecurringCount: number): boolean => pendingRecurringCount < 2;

/**
 * Reanudación de un plan recurrente: primera secuencia > maxSequence cuyo vencimiento
 * (anclado a baseDate, due = addMonths(base, seq - 1)) no quedó en el pasado. Los huecos son los meses en pausa.
 */
export function resumeStartSequence(baseDate: Date, maxSequence: number, today: Date): number {
  let n = Math.max(maxSequence, 0) + 1;
  while (addMonths(baseDate, n - 1).getTime() < today.getTime()) n++;
  return n;
}
