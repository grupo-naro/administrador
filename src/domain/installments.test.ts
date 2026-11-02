import { describe, it, expect } from "vitest";
import { parseDateInput as d, toDateInput } from "./dates";
import {
  BATCH_SIZE,
  addInterval,
  deliveryDueUpdates,
  needsExtension,
  planDevelopment,
  planOneTime,
  planRecurring,
  planReschedule,
  planSchemeChange,
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

describe("planDevelopment", () => {
  const start = d("2026-11-10");

  it("ANTICIPO_CUOTAS es igual a planOneTime", () => {
    const interval = { every: 15, unit: "dias" } as const;
    expect(planDevelopment({ scheme: "ANTICIPO_CUOTAS", totalCents: 100_001, startDate: start, count: 3, interval })).toEqual(
      planOneTime({ totalCents: 100_001, count: 3, startDate: start, interval }),
    );
  });

  it("CONTADO: un único pago total en la fecha de pago", () => {
    const plan = planDevelopment({ scheme: "CONTADO", totalCents: 100_001, startDate: start, count: 9 });
    expect(plan).toEqual([{ type: "PAGO_TOTAL", sequence: 1, amountCents: 100_001, dueDate: start }]);
  });

  it("MITAD_ENTREGA: anticipo + saldo al entregar, centavo impar al anticipo", () => {
    const plan = planDevelopment({
      scheme: "MITAD_ENTREGA",
      totalCents: 100_001,
      startDate: start,
      deliveryDate: d("2027-01-15"),
      count: 9,
    });
    expect(plan.map((p) => [p.type, p.sequence, p.amountCents])).toEqual([
      ["ANTICIPO", 1, 50_001],
      ["SALDO_ENTREGA", 2, 50_000],
    ]);
    expect(dates(plan)).toEqual(["2026-11-10", "2027-01-15"]);
    expect(sum(plan)).toBe(100_001);
  });

  it("MITAD_ENTREGA acepta la entrega el mismo día del anticipo", () => {
    const plan = planDevelopment({ scheme: "MITAD_ENTREGA", totalCents: 1_000, startDate: start, deliveryDate: start });
    expect(dates(plan)).toEqual(["2026-11-10", "2026-11-10"]);
  });

  it("rechaza entrega anterior al anticipo, falta de entrega y cantidades inválidas", () => {
    expect(() =>
      planDevelopment({ scheme: "MITAD_ENTREGA", totalCents: 1_000, startDate: start, deliveryDate: d("2026-11-09") }),
    ).toThrow("La entrega estimada no puede ser anterior al anticipo");
    expect(() => planDevelopment({ scheme: "MITAD_ENTREGA", totalCents: 1_000, startDate: start })).toThrow(
      "fecha estimada de entrega",
    );
    expect(() => planDevelopment({ scheme: "ANTICIPO_CUOTAS", totalCents: 1_000, startDate: start, count: 4 })).toThrow("2 o 3");
    expect(() => planDevelopment({ scheme: "ANTICIPO_CUOTAS", totalCents: 1_000, startDate: start })).toThrow("2 o 3");
    expect(() => planDevelopment({ scheme: "CONTADO", totalCents: 0, startDate: start })).toThrow("mayor a cero");
  });
});

describe("planSchemeChange", () => {
  const start = d("2026-12-01");
  const current = (paid: Partial<Record<number, number>> = {}) => [
    { type: "ANTICIPO" as const, sequence: 1, amountCents: 50_000, paidCents: paid[1] ?? 0 },
    { type: "CUOTA" as const, sequence: 2, amountCents: 25_000, paidCents: paid[2] ?? 0 },
    { type: "CUOTA" as const, sequence: 3, amountCents: 25_000, paidCents: paid[3] ?? 0 },
  ];

  it("sin pagos rehace el plan completo con el nuevo total", () => {
    const r = planSchemeChange({ current: current(), scheme: "CONTADO", totalCents: 120_000, startDate: start });
    expect(r.keepAnticipo).toBe(false);
    expect(r.drafts).toEqual([{ type: "PAGO_TOTAL", sequence: 1, amountCents: 120_000, dueDate: start }]);
  });

  it("anticipo pagado: se conserva y las cuotas se arman sobre total − anticipo desde la secuencia 2", () => {
    const r = planSchemeChange({
      current: current({ 1: 50_000 }),
      scheme: "ANTICIPO_CUOTAS",
      totalCents: 110_000,
      startDate: start,
      count: 3,
    });
    expect(r.keepAnticipo).toBe(true);
    expect(r.drafts.map((x) => [x.type, x.sequence, x.amountCents])).toEqual([
      ["CUOTA", 2, 20_000],
      ["CUOTA", 3, 20_000],
      ["CUOTA", 4, 20_000],
    ]);
    expect(dates(r.drafts)).toEqual(["2027-01-01", "2027-02-01", "2027-03-01"]);
  });

  it("anticipo con pago parcial: se conserva y el saldo al entregar es total − anticipo completo", () => {
    const r = planSchemeChange({
      current: current({ 1: 10_000 }),
      scheme: "MITAD_ENTREGA",
      totalCents: 100_001,
      startDate: start,
      deliveryDate: d("2027-02-01"),
    });
    expect(r.keepAnticipo).toBe(true);
    expect(r.drafts).toEqual([{ type: "SALDO_ENTREGA", sequence: 2, amountCents: 50_001, dueDate: d("2027-02-01") }]);
  });

  it("rechaza si hay pagos en cuotas que se reemplazarían", () => {
    const blocked = "No se puede cambiar la forma de pago";
    expect(() =>
      planSchemeChange({ current: current({ 2: 100 }), scheme: "ANTICIPO_CUOTAS", totalCents: 100_000, startDate: start, count: 2 }),
    ).toThrow(blocked);
    expect(() =>
      planSchemeChange({
        current: [
          { type: "ANTICIPO", sequence: 1, amountCents: 50_000, paidCents: 50_000 },
          { type: "SALDO_ENTREGA", sequence: 2, amountCents: 50_000, paidCents: 1 },
        ],
        scheme: "ANTICIPO_CUOTAS",
        totalCents: 100_000,
        startDate: start,
        count: 2,
      }),
    ).toThrow(blocked);
    expect(() =>
      planSchemeChange({
        current: [{ type: "PAGO_TOTAL", sequence: 1, amountCents: 100_000, paidCents: 100 }],
        scheme: "MITAD_ENTREGA",
        totalCents: 100_000,
        startDate: start,
        deliveryDate: start,
      }),
    ).toThrow(blocked);
  });

  it("rechaza pasar a Todo junto con el anticipo pagado", () => {
    expect(() =>
      planSchemeChange({ current: current({ 1: 50_000 }), scheme: "CONTADO", totalCents: 100_000, startDate: start }),
    ).toThrow("No se puede cambiar la forma de pago");
  });

  it("rechaza un total que no supera al anticipo conservado", () => {
    expect(() =>
      planSchemeChange({ current: current({ 1: 50_000 }), scheme: "ANTICIPO_CUOTAS", totalCents: 50_000, startDate: start, count: 2 }),
    ).toThrow("mayor al anticipo");
  });

  it("valida la nueva forma de pago aunque se conserve el anticipo", () => {
    expect(() =>
      planSchemeChange({ current: current({ 1: 50_000 }), scheme: "MITAD_ENTREGA", totalCents: 100_000, startDate: start }),
    ).toThrow("fecha estimada de entrega");
    expect(() =>
      planSchemeChange({
        current: current({ 1: 50_000 }),
        scheme: "MITAD_ENTREGA",
        totalCents: 100_000,
        startDate: start,
        deliveryDate: d("2026-11-30"),
      }),
    ).toThrow("anterior al anticipo");
  });
});

describe("deliveryDueUpdates", () => {
  it("mueve solo los saldos al entregar sin pagos", () => {
    const delivered = d("2026-12-20");
    const items = [
      { id: "a", type: "ANTICIPO" as const, paidCents: 0 },
      { id: "s1", type: "SALDO_ENTREGA" as const, paidCents: 0 },
      { id: "s2", type: "SALDO_ENTREGA" as const, paidCents: 100 },
      { id: "c", type: "CUOTA" as const, paidCents: 0 },
      { id: "t", type: "PAGO_TOTAL" as const, paidCents: 0 },
    ];
    expect(deliveryDueUpdates(items, delivered)).toEqual([{ id: "s1", dueDate: delivered }]);
  });
});
