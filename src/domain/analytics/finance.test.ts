import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { bucketsOf, resolvePeriod } from "./period";
import {
  assetCostForDays,
  financeSeries,
  financeSummary,
  infraCostForDays,
  topCollected,
  topShare,
  type FinancePayment,
} from "./finance";

const today = d("2026-10-14");
const from = d("2026-10-01");
const to = d("2026-11-01");

const pay = (
  amountCents: number,
  paidAt: string,
  over: Partial<FinancePayment> = {},
): FinancePayment => ({
  amountCents,
  paidAt: d(paidAt),
  method: "Transferencia",
  kind: "DESARROLLO",
  clientId: "c1",
  clientName: "Ana",
  projectId: "p1",
  projectName: "Web Ana",
  ...over,
});

describe("assetCostForDays / infraCostForDays", () => {
  it("reparte el costo por día según cada cuántos meses se paga", () => {
    // 3.043.750 centavos por mes de 30,4375 días = 100.000 por día
    expect(assetCostForDays(3_043_750, 1, 10)).toBe(1_000_000);
    // 36.525.000 por 12 meses (365,25 días) = 100.000 por día
    expect(assetCostForDays(36_525_000, 12, 7)).toBe(700_000);
  });

  it("solo suma activos de Naro con costo y periodicidad válida", () => {
    const assets = [
      { managedByNaro: true, costCents: 3_652_500, costEveryMonths: 12 }, // 10.000 por día
      { managedByNaro: false, costCents: 1_000_000, costEveryMonths: 12 }, // del cliente
      { managedByNaro: true, costCents: null, costEveryMonths: 12 }, // sin costo
      { managedByNaro: true, costCents: 0, costEveryMonths: 12 }, // costo cero
      { managedByNaro: true, costCents: 500_000, costEveryMonths: 0 }, // periodicidad inválida
      { managedByNaro: true, costCents: 500_000, costEveryMonths: -3 },
      { managedByNaro: true, costCents: 500_000, costEveryMonths: Number.NaN },
    ];
    expect(infraCostForDays(assets, 31)).toBe(310_000);
    expect(infraCostForDays([], 31)).toBe(0);
  });
});

describe("financeSummary", () => {
  const input = {
    payments: [
      pay(100_000, "2026-10-02"),
      pay(50_000, "2026-10-10", { method: "Efectivo", kind: "SUSCRIPCION", clientId: "c2", clientName: "Beto", projectId: "p2", projectName: "App Beto" }),
      pay(25_000, "2026-10-12", { kind: "MANTENIMIENTO" }),
      pay(999, "2026-09-30"), // mes anterior
      pay(888, "2026-11-01"), // mes siguiente (el límite `hasta` no entra)
    ],
    installments: [
      { amountCents: 500_000, paidCents: 0, dueDate: d("2026-10-20") }, // por cobrar
      { amountCents: 300_000, paidCents: 100_000, dueDate: d("2026-10-05") }, // parcial y ya vencida
      { amountCents: 700_000, paidCents: 700_000, dueDate: d("2026-10-12") }, // pagada
      { amountCents: 999, paidCents: 0, dueDate: d("2026-09-30") }, // fuera del rango
      { amountCents: 888, paidCents: 0, dueDate: d("2026-11-01") }, // el límite `hasta` no entra
    ],
    assets: [{ managedByNaro: true, costCents: 3_652_500, costEveryMonths: 12 }],
  };

  it("cobrado = pagos del mes, por origen y por método", () => {
    const s = financeSummary(input, from, to, today);
    expect(s.collectedCents).toBe(175_000);
    expect(s.byKind).toEqual({ oneTimeCents: 100_000, subscriptionCents: 50_000, maintenanceCents: 25_000 });
    expect(s.byMethod).toEqual([
      { method: "Transferencia", cents: 125_000 },
      { method: "Efectivo", cents: 50_000 },
    ]);
  });

  it("proyectado, cumplimiento, por cobrar y vencido salen de las cuotas que vencen en el rango", () => {
    const s = financeSummary(input, from, to, today);
    expect(s.projectedCents).toBe(1_500_000);
    expect(s.fulfillmentPct).toBeCloseTo(800_000 / 1_500_000, 6);
    expect(s.upcomingCents).toBe(500_000);
    expect(s.overdueCents).toBe(200_000);
  });

  it("costos de infraestructura y balance neto (puede ser negativo)", () => {
    const s = financeSummary(input, from, to, today);
    expect(s.infraCostCents).toBe(310_000);
    expect(s.netCents).toBe(175_000 - 310_000);
    expect(s.netCents).toBeLessThan(0);
  });

  it("un pago el día `desde` entra y el del día `hasta` no", () => {
    const s = financeSummary(
      { payments: [pay(10, "2026-10-01"), pay(20, "2026-11-01")], installments: [], assets: [] },
      from,
      to,
      today,
    );
    expect(s.collectedCents).toBe(10);
  });

  it("el cobrado cuenta el pago por su fecha aunque la cuota sea de otro mes (cumplimiento no)", () => {
    const s = financeSummary(
      {
        payments: [pay(300, "2026-10-03")], // pago de octubre por una cuota de septiembre
        installments: [{ amountCents: 300, paidCents: 300, dueDate: d("2026-09-20") }],
        assets: [],
      },
      from,
      to,
      today,
    );
    expect(s.collectedCents).toBe(300);
    expect(s.projectedCents).toBe(0);
    expect(s.fulfillmentPct).toBeNull();
  });

  it("sin datos todo es 0 o null (nunca NaN)", () => {
    const s = financeSummary({ payments: [], installments: [], assets: [] }, from, to, today);
    expect(s).toEqual({
      collectedCents: 0,
      projectedCents: 0,
      fulfillmentPct: null,
      upcomingCents: 0,
      overdueCents: 0,
      infraCostCents: 0,
      netCents: 0,
      byKind: { oneTimeCents: 0, subscriptionCents: 0, maintenanceCents: 0 },
      byMethod: [],
    });
  });
});

describe("financeSeries", () => {
  it("un punto por tramo con cobrado, proyectado, costo y neto", () => {
    const week = resolvePeriod("semana", today).current; // 12/10 al 18/10
    const series = financeSeries(
      {
        payments: [pay(100, "2026-10-12"), pay(50, "2026-10-14")],
        installments: [{ amountCents: 70, paidCents: 0, dueDate: d("2026-10-15") }],
        assets: [{ managedByNaro: true, costCents: 3_043_750, costEveryMonths: 1 }], // 100.000 por día
      },
      bucketsOf(week),
      today,
    );
    expect(series).toHaveLength(7);
    expect(series.map((s) => s.collectedCents)).toEqual([100, 0, 50, 0, 0, 0, 0]);
    expect(series[3].projectedCents).toBe(70);
    expect(series.every((s) => s.costCents === 100_000)).toBe(true);
    expect(series[0].netCents).toBe(100 - 100_000);
    expect(series.reduce((s, x) => s + x.collectedCents, 0)).toBe(150);
  });

  it("los tramos mensuales suman lo mismo que el resumen del período", () => {
    const half = resolvePeriod("6m", today).current;
    const payments = [pay(10, "2026-05-01"), pay(20, "2026-07-15"), pay(30, "2026-10-31"), pay(99, "2026-04-30")];
    const series = financeSeries({ payments, installments: [], assets: [] }, bucketsOf(half), today);
    expect(series).toHaveLength(6);
    expect(series.reduce((s, x) => s + x.collectedCents, 0)).toBe(
      financeSummary({ payments, installments: [], assets: [] }, half.from, half.to, today).collectedCents,
    );
  });
});

describe("topCollected / topShare", () => {
  const payments = [
    pay(100_000, "2026-10-02"),
    pay(25_000, "2026-10-12"),
    pay(50_000, "2026-10-10", { clientId: "c2", clientName: "Beto", projectId: "p2", projectName: "App Beto" }),
    pay(999, "2026-09-30"),
  ];

  it("ranking por cliente y por proyecto con el porcentaje del total", () => {
    const byClient = topCollected(payments, from, to, "client");
    expect(byClient.map((e) => [e.id, e.cents])).toEqual([["c1", 125_000], ["c2", 50_000]]);
    expect(byClient[0].sharePct).toBeCloseTo(125_000 / 175_000, 6);
    expect(topCollected(payments, from, to, "project").map((e) => e.id)).toEqual(["p1", "p2"]);
  });

  it("respeta el límite", () => {
    expect(topCollected(payments, from, to, "client", 1)).toHaveLength(1);
  });

  it("concentración de los primeros N clientes; null sin cobros", () => {
    expect(topShare(payments, from, to, 1)).toBeCloseTo(125_000 / 175_000, 6);
    expect(topShare(payments, from, to, 3)).toBeCloseTo(1, 6);
    expect(topShare([], from, to)).toBeNull();
    expect(topCollected([], from, to, "client")).toEqual([]);
  });
});
