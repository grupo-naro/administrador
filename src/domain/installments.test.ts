import { describe, it, expect } from "vitest";
import { parseDateInput as d, toDateInput } from "./dates";
import {
  BATCH_SIZE,
  addInterval,
  needsExtension,
  planOneTime,
  planRecurring,
  planReschedule,
  planSubscription,
  repriceInstallments,
  resumeStartSequence,
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

describe("resumeStartSequence", () => {
  it("continúa sin huecos si el siguiente vencimiento no pasó", () => {
    expect(resumeStartSequence(d("2026-01-31"), 9, d("2026-09-15"))).toBe(10); // 2026-10-31
  });

  it("salta los meses en pausa manteniendo el ancla original (día 31)", () => {
    const base = d("2026-01-31");
    const n = resumeStartSequence(base, 3, d("2026-10-13")); // última: 2026-03-31
    expect(n).toBe(10);
    expect(dates(planRecurring({ type: "MANTENIMIENTO", feeCents: 1, baseDate: base, startSequence: n, count: 6 }))).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
  });

  it("incluye un vencimiento que cae justo hoy", () => {
    expect(resumeStartSequence(d("2026-01-13"), 2, d("2026-10-13"))).toBe(10);
  });
});

describe("addInterval", () => {
  it("suma días, semanas y meses desde la fecha base", () => {
    expect(toDateInput(addInterval(d("2026-11-10"), { every: 15, unit: "dias" }, 1))).toBe("2026-11-25");
    expect(toDateInput(addInterval(d("2026-11-10"), { every: 20, unit: "dias" }, 3))).toBe("2027-01-09");
    expect(toDateInput(addInterval(d("2026-11-10"), { every: 1, unit: "semanas" }, 2))).toBe("2026-11-24");
    expect(toDateInput(addInterval(d("2026-11-10"), { every: 2, unit: "semanas" }, 1))).toBe("2026-11-24");
    expect(toDateInput(addInterval(d("2027-01-31"), { every: 1, unit: "meses" }, 1))).toBe("2027-02-28");
    expect(toDateInput(addInterval(d("2027-01-31"), { every: 2, unit: "meses" }, 1))).toBe("2027-03-31");
  });

  it("rechaza frecuencias inválidas", () => {
    for (const every of [0, -1, 1.5, Number.NaN]) {
      expect(() => addInterval(d("2026-11-10"), { every, unit: "dias" }, 1)).toThrow("entero mayor a cero");
    }
    expect(() => addInterval(d("2026-11-10"), { every: 400, unit: "dias" }, 1)).toThrow("demasiado grande");
  });
});

describe("planOneTime con frecuencia", () => {
  it("cuotas cada 15 días desde el anticipo", () => {
    const plan = planOneTime({
      totalCents: 90_000, count: 3, startDate: d("2026-11-10"), interval: { every: 15, unit: "dias" },
    });
    expect(plan.map((p) => p.type)).toEqual(["ANTICIPO", "CUOTA", "CUOTA", "CUOTA"]);
    expect(dates(plan)).toEqual(["2026-11-10", "2026-11-25", "2026-12-10", "2026-12-25"]);
    expect(sum(plan)).toBe(90_000);
  });

  it("cuotas semanales", () => {
    const plan = planOneTime({
      totalCents: 100_000, count: 2, startDate: d("2026-11-10"), interval: { every: 1, unit: "semanas" },
    });
    expect(dates(plan)).toEqual(["2026-11-10", "2026-11-17", "2026-11-24"]);
  });

  it("sin frecuencia sigue siendo mensual", () => {
    const plan = planOneTime({ totalCents: 100_000, count: 2, startDate: d("2026-11-10") });
    expect(dates(plan)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
  });
});

describe("planReschedule", () => {
  const item = (id: string, type: "ANTICIPO" | "CUOTA", paidCents: number) => ({ id, type, sequence: 0, paidCents });

  it("reprograma solo cuotas sin pagos, en orden de secuencia", () => {
    const res = planReschedule(
      [
        { id: "c3", type: "CUOTA", sequence: 4, paidCents: 0 },
        { id: "anticipo", type: "ANTICIPO", sequence: 1, paidCents: 0 },
        { id: "c1", type: "CUOTA", sequence: 2, paidCents: 5_000 },
        { id: "c2", type: "CUOTA", sequence: 3, paidCents: 0 },
      ],
      d("2026-12-01"),
      { every: 20, unit: "dias" },
    );
    expect(res.map((r) => [r.id, toDateInput(r.dueDate)])).toEqual([
      ["c2", "2026-12-01"],
      ["c3", "2026-12-21"],
    ]);
  });

  it("no devuelve nada si no hay cuotas elegibles", () => {
    expect(planReschedule([item("a", "ANTICIPO", 0), item("b", "CUOTA", 1)], d("2026-12-01"), { every: 1, unit: "semanas" })).toEqual([]);
  });

  it("valida la frecuencia", () => {
    expect(() => planReschedule([], d("2026-12-01"), { every: 0, unit: "dias" })).toThrow("entero mayor a cero");
  });
});
