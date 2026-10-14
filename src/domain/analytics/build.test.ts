import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { buildCollections, buildFinance, buildInfra, buildPortfolio, buildRecurring, buildSales } from "./build";
import type { Facts } from "./facts";

const facts: Facts = {
  today: d("2026-10-14"),
  payments: [
    { amountCents: 100, paidAt: d("2026-10-05"), method: "Transferencia", kind: "DESARROLLO", clientId: "c1", clientName: "Ana", projectId: "p1", projectName: "Web" },
    { amountCents: 40, paidAt: d("2026-09-10"), method: "Efectivo", kind: "SUSCRIPCION", clientId: "c1", clientName: "Ana", projectId: "p1", projectName: "Web" },
    { amountCents: 60, paidAt: d("2026-07-01"), method: "Efectivo", kind: "MANTENIMIENTO", clientId: "c2", clientName: "Beto", projectId: "p2", projectName: "App" },
  ],
  installments: [
    { amountCents: 300, paidCents: 100, dueDate: d("2026-10-02"), lastPaidAt: d("2026-10-05"), clientId: "c1", clientName: "Ana" },
    { amountCents: 100, paidCents: 100, dueDate: d("2026-10-01"), lastPaidAt: d("2026-10-01"), clientId: "c2", clientName: "Beto" },
  ],
  contracts: [{ kind: "SUSCRIPCION", feeCents: 400, status: "ACTIVO", startedAt: d("2026-10-02"), endedAt: null }],
  proposals: [
    { status: "ACEPTADA", createdAt: d("2026-10-01"), validUntil: null, oneTimePriceCents: 1000, project: { createdAt: d("2026-10-04"), contractType: "PAGO_UNICO", totalCents: 900, monthlyFeeCents: null } },
    { status: "ENVIADA", createdAt: d("2026-09-20"), validUntil: null, oneTimePriceCents: 500, project: null },
  ],
  projects: [{ clientId: "c1", stage: "EN_DESARROLLO", contractType: "PAGO_UNICO", totalCents: 900, monthlyFeeCents: null, createdAt: d("2026-10-04"), startedAt: d("2026-10-05"), deliveredAt: null, activeRecurring: false }],
  clients: [{ id: "c1", name: "Ana", createdAt: d("2026-10-03"), collectedCents: 140 }],
  assets: [{ id: "a1", type: "DOMINIO", identifier: "ana.com", projectName: "Web", managedByNaro: true, costCents: 3_652_500, costEveryMonths: 12, renewalDate: d("2026-10-20") }],
};

describe("buildFinance", () => {
  it("compara el período en curso con el anterior (mes)", () => {
    const r = buildFinance(facts, "mes");
    expect(r.cur.collectedCents).toBe(100);
    expect(r.prev.collectedCents).toBe(40);
    expect(r.variations.collected).toEqual({ diffCents: 60, pct: 1.5 });
    expect(r.series).toHaveLength(31);
    expect(r.topClients[0]).toMatchObject({ id: "c1", cents: 100 });
    expect(r.concentrationPct).toBeCloseTo(1, 6);
  });

  it("6 meses abarca los cobros de julio a octubre", () => {
    const r = buildFinance(facts, "6m");
    expect(r.cur.collectedCents).toBe(200);
    expect(r.series).toHaveLength(6);
  });
});

describe("buildCollections", () => {
  it("antigüedad, deuda y puntualidad del período", () => {
    const r = buildCollections(facts, "mes");
    expect(r.debt.totalCents).toBe(200);
    expect(r.aging.find((b) => b.key === "8-30")?.cents).toBe(200);
    expect(r.punctuality.count).toBe(1); // la cuota de 100 pagada el 01/10
    expect(r.punctuality.onTimePct).toBe(1);
    expect(r.debtors[0]).toMatchObject({ clientId: "c1", overdueCents: 200 });
  });
});

describe("buildRecurring", () => {
  it("MRR, altas y serie de los últimos 12 meses", () => {
    const r = buildRecurring(facts, "mes");
    expect(r.cur.mrr.totalCents).toBe(400);
    expect(r.cur.signups).toBe(1);
    expect(r.series).toHaveLength(12);
    expect(r.series.reduce((s, x) => s + x.cents, 0)).toBe(100); // 40 (sep) + 60 (jul); el de DESARROLLO no cuenta
    expect(r.hasAny).toBe(true);
  });
});

describe("buildSales / buildPortfolio / buildInfra", () => {
  it("ventas del mes y del anterior", () => {
    const r = buildSales(facts, "mes");
    expect(r.cur.created).toBe(1);
    expect(r.prev.created).toBe(1);
    expect(r.cur.pipeline.count).toBe(1);
  });

  it("proyectos y clientes del período", () => {
    const r = buildPortfolio(facts, "mes");
    expect(r.projects.created).toBe(1);
    expect(r.clients.newInPeriod).toBe(1);
    expect(r.clients.withActiveWork).toBe(1);
  });

  it("infraestructura", () => {
    const r = buildInfra(facts);
    expect(r.monthlyEquivalentCents).toBe(Math.round(3_652_500 / 12));
    expect(r.renewals.next30.items).toHaveLength(1);
  });
});
