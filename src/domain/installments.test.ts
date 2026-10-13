import { describe, it, expect } from "vitest";
import { parseDateInput as d, toDateInput } from "./dates";
import {
  BATCH_SIZE,
  needsExtension,
  planOneTime,
  planRecurring,
  planSubscription,
  repriceInstallments,
} from "./installments";

const dates = (xs: { dueDate: Date }[]) => xs.map((x) => toDateInput(x.dueDate));
const sum = (xs: { amountCents: number }[]) => xs.reduce((s, x) => s + x.amountCents, 0);

describe("planOneTime", () => {
  it("anticipo 50% y 3 cuotas con sobrante en la última", () => {
    const plan = planOneTime({ totalCents: 100_000, count: 3, startDate: d("2026-11-10") });
    expect(plan.map((p) => p.type)).toEqual(["ANTICIPO", "CUOTA", "CUOTA", "CUOTA"]);
    expect(plan.map((p) => p.sequence)).toEqual([1, 2, 3, 4]);
    expect(plan.map((p) => p.amountCents)).toEqual([50_000, 16_666, 16_666, 16_668]);
    expect(dates(plan)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(sum(plan)).toBe(100_000);
  });

  it("2 cuotas con total impar suma exacto", () => {
    const plan = planOneTime({ totalCents: 100_001, count: 2, startDate: d("2026-11-10") });
    expect(sum(plan)).toBe(100_001);
    expect(plan[0].amountCents).toBe(50_001);
  });

  it("inicio el día 31 no deriva", () => {
    const plan = planOneTime({ totalCents: 90_000, count: 3, startDate: d("2027-01-31") });
    expect(dates(plan)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("rechaza cantidades y totales inválidos", () => {
    expect(() => planOneTime({ totalCents: 100_000, count: 4, startDate: d("2026-11-10") })).toThrow("2 o 3");
    expect(() => planOneTime({ totalCents: 0, count: 2, startDate: d("2026-11-10") })).toThrow("mayor a cero");
  });
});

describe("planSubscription", () => {
  it("primer pago manual + 5 mensuales", () => {
    const plan = planSubscription({
      monthlyFeeCents: 40_000_000,
      firstPaymentCents: 60_000_000,
      firstDueDate: d("2026-11-15"),
    });
    expect(plan).toHaveLength(BATCH_SIZE);
    expect(plan[0]).toMatchObject({ type: "PRIMER_PAGO", sequence: 1, amountCents: 60_000_000 });
    expect(plan.slice(1).every((p) => p.type === "MENSUAL" && p.amountCents === 40_000_000)).toBe(true);
    expect(dates(plan)).toEqual([
      "2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15", "2027-04-15",
    ]);
  });

  it("primer cobro el 31 no deriva", () => {
    const plan = planSubscription({ monthlyFeeCents: 100, firstPaymentCents: 100, firstDueDate: d("2027-01-31") });
    expect(dates(plan).slice(0, 4)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });
});

describe("planRecurring", () => {
  it("extiende desde la secuencia indicada anclando en la fecha base", () => {
    const more = planRecurring({
      type: "MENSUAL", feeCents: 500, baseDate: d("2027-01-31"), startSequence: 3, count: 2,
    });
    expect(more.map((m) => m.sequence)).toEqual([3, 4]);
    expect(dates(more)).toEqual(["2027-03-31", "2027-04-30"]);
  });

  it("rechaza abono no positivo", () => {
    expect(() =>
      planRecurring({ type: "MANTENIMIENTO", feeCents: 0, baseDate: d("2026-11-01"), startSequence: 1, count: 6 }),
    ).toThrow("mayor a cero");
  });
});

describe("repriceInstallments", () => {
  const base = (over: object) => ({
    id: "x", type: "MENSUAL" as const, dueDate: d("2027-03-15"), amountCents: 100, paidCents: 0, ...over,
  });

  it("solo toca recurrentes futuras, sin pagos, con monto distinto", () => {
    const res = repriceInstallments(
      [
        base({ id: "ok-mensual" }),
        base({ id: "ok-mant", type: "MANTENIMIENTO" }),
        base({ id: "antes", dueDate: d("2027-01-15") }),
        base({ id: "pago-parcial", paidCents: 10 }),
        base({ id: "primer-pago", type: "PRIMER_PAGO" }),
        base({ id: "anticipo", type: "ANTICIPO" }),
        base({ id: "cuota", type: "CUOTA" }),
        base({ id: "mismo-monto", amountCents: 150 }),
      ],
      d("2027-02-01"),
      150,
    );
    expect(res).toEqual([
      { id: "ok-mensual", amountCents: 150 },
      { id: "ok-mant", amountCents: 150 },
    ]);
  });
});

describe("needsExtension", () => {
  it("pide más cuotas cuando quedan menos de 2 pendientes", () => {
    expect(needsExtension(1)).toBe(true);
    expect(needsExtension(2)).toBe(false);
  });
});
