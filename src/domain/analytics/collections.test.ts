import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { agingBuckets, debtSummary, debtorsByClient, punctuality, type CollectionInstallment } from "./collections";

const today = d("2026-10-14");

const inst = (
  amountCents: number,
  paidCents: number,
  dueDate: string,
  over: Partial<CollectionInstallment> = {},
): CollectionInstallment => ({
  amountCents,
  paidCents,
  dueDate: d(dueDate),
  lastPaidAt: null,
  clientId: "c1",
  clientName: "Ana",
  ...over,
});

const insts: CollectionInstallment[] = [
  inst(100, 0, "2026-10-10"), // 4 días de atraso
  inst(200, 50, "2026-09-20"), // 24 días, saldo 150
  inst(300, 0, "2026-08-20", { clientId: "c2", clientName: "Beto" }), // 55 días
  inst(400, 0, "2026-06-01"), // 135 días
  inst(500, 500, "2026-09-01"), // pagada
  inst(600, 0, "2026-10-14"), // vence hoy: no está vencida
  inst(700, 0, "2026-11-10"), // dentro de 27 días
  inst(800, 0, "2026-12-30"), // fuera de los 30 días
];

describe("agingBuckets", () => {
  it("agrupa el saldo vencido por días de atraso", () => {
    expect(agingBuckets(insts, today).map((b) => [b.key, b.count, b.cents])).toEqual([
      ["1-7", 1, 100],
      ["8-30", 1, 150],
      ["31-60", 1, 300],
      ["60+", 1, 400],
    ]);
  });

  it("los límites de cada tramo (7, 8, 30, 31, 60 y 61 días)", () => {
    const edge = [
      inst(1, 0, "2026-10-07"), // 7
      inst(1, 0, "2026-10-06"), // 8
      inst(1, 0, "2026-09-14"), // 30
      inst(1, 0, "2026-09-13"), // 31
      inst(1, 0, "2026-08-15"), // 60
      inst(1, 0, "2026-08-14"), // 61
    ];
    expect(agingBuckets(edge, today).map((b) => b.count)).toEqual([1, 2, 2, 1]);
  });

  it("sin cuotas devuelve los cuatro tramos en cero", () => {
    const b = agingBuckets([], today);
    expect(b).toHaveLength(4);
    expect(b.every((x) => x.count === 0 && x.cents === 0)).toBe(true);
  });
});

describe("debtSummary", () => {
  it("deuda total y lo que vence en los próximos 30 días (hoy incluido)", () => {
    expect(debtSummary(insts, today)).toEqual({ totalCents: 100 + 150 + 300 + 400 + 600 + 700 + 800, dueNext30Cents: 600 + 700 });
    expect(debtSummary([], today)).toEqual({ totalCents: 0, dueNext30Cents: 0 });
  });
});

describe("debtorsByClient", () => {
  it("clientes con saldo vencido, de mayor a menor, con la mora más antigua", () => {
    expect(debtorsByClient(insts, today)).toEqual([
      { clientId: "c1", clientName: "Ana", overdueCents: 650, overdueCount: 3, maxDaysLate: 135 },
      { clientId: "c2", clientName: "Beto", overdueCents: 300, overdueCount: 1, maxDaysLate: 55 },
    ]);
    expect(debtorsByClient([], today)).toEqual([]);
  });
});

describe("punctuality", () => {
  const from = d("2026-10-01");
  const to = d("2026-11-01");
  const paid = (due: string, last: string | null, amount = 100, paidCents = 100) =>
    inst(amount, paidCents, due, { lastPaidAt: last ? d(last) : null });

  it("porcentaje a tiempo y demora promedio de las que pagaron tarde", () => {
    const r = punctuality(
      [
        paid("2026-10-05", "2026-10-05"), // a tiempo
        paid("2026-10-01", "2026-10-04"), // 3 días tarde
        paid("2026-10-02", "2026-10-09"), // 7 días tarde
        paid("2026-09-01", "2026-09-30"), // último pago fuera del período
        paid("2026-10-01", "2026-10-03", 100, 40), // no está totalmente paga
      ],
      from,
      to,
    );
    expect(r.count).toBe(3);
    expect(r.onTimePct).toBeCloseTo(1 / 3, 6);
    expect(r.avgLateDays).toBe(5);
  });

  it("si nadie pagó tarde no hay demora promedio", () => {
    const r = punctuality([paid("2026-10-05", "2026-10-01")], from, to);
    expect(r).toEqual({ count: 1, onTimePct: 1, avgLateDays: null });
  });

  it("sin cuotas pagadas en el período: sin porcentaje ni demora", () => {
    expect(punctuality([], from, to)).toEqual({ count: 0, onTimePct: null, avgLateDays: null });
  });
});
