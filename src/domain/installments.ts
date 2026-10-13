import { addMonths } from "./dates";

export type InstallmentType = "ANTICIPO" | "CUOTA" | "PRIMER_PAGO" | "MENSUAL" | "MANTENIMIENTO";

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

export function planOneTime(a: { totalCents: number; count: number; startDate: Date }): InstallmentDraft[] {
  assertPositive(a.totalCents, "El total");
  if (a.count !== 2 && a.count !== 3) throw new Error("Las cuotas deben ser 2 o 3");
  const anticipo = Math.round(a.totalCents / 2);
  const remaining = a.totalCents - anticipo;
  const base = Math.floor(remaining / a.count);
  const drafts: InstallmentDraft[] = [
    { type: "ANTICIPO", sequence: 1, amountCents: anticipo, dueDate: a.startDate },
  ];
  for (let i = 1; i <= a.count; i++) {
    drafts.push({
      type: "CUOTA",
      sequence: i + 1,
      amountCents: i === a.count ? remaining - base * (a.count - 1) : base,
      dueDate: addMonths(a.startDate, i),
    });
  }
  return drafts;
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
