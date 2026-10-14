import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { recurringCollectedSeries, recurringSummary, type RecurringContract } from "./recurring";

const from = d("2026-10-01");
const to = d("2026-11-01");

const c = (over: Partial<RecurringContract>): RecurringContract => ({
  kind: "SUSCRIPCION",
  feeCents: 0,
  status: "ACTIVO",
  startedAt: d("2026-01-01"),
  endedAt: null,
  ...over,
});

const contracts: RecurringContract[] = [
  c({ feeCents: 400, startedAt: d("2026-10-02") }), // activa, alta en octubre
  c({ feeCents: 999, status: "VENCIDA" }), // vencida: no cuenta en el MRR
  c({ feeCents: 888, status: "SUSPENDIDO" }), // suspendida: no cuenta
  c({ kind: "MANTENIMIENTO", feeCents: 80, startedAt: d("2026-10-05") }), // activo, alta en octubre
  c({ kind: "MANTENIMIENTO", feeCents: 70, status: "FINALIZADO", startedAt: d("2026-03-01"), endedAt: d("2026-10-09") }),
];

describe("recurringSummary", () => {
  it("MRR y ARR solo de contratos activos, por origen", () => {
    const s = recurringSummary(contracts, from, to);
    expect(s.mrr).toEqual({ subscriptionCents: 400, maintenanceCents: 80, totalCents: 480 });
    expect(s.arrCents).toBe(5_760);
  });

  it("cuenta contratos por estado y el ingreso promedio por contrato activo", () => {
    const s = recurringSummary(contracts, from, to);
    expect(s.subscriptions).toEqual({ active: 1, overdue: 1, suspended: 1 });
    expect(s.maintenance).toEqual({ active: 1 });
    expect(s.activeContracts).toBe(2);
    expect(s.avgPerContractCents).toBe(240);
    expect(s.hasAny).toBe(true);
  });

  it("altas del período (por fecha del plan) y bajas de mantenimiento (por fecha de baja)", () => {
    const s = recurringSummary(contracts, from, to);
    expect(s.signups).toBe(2);
    expect(s.churnedMaintenance).toBe(1);
    const next = recurringSummary(contracts, to, d("2026-12-01"));
    expect(next.signups).toBe(0);
    expect(next.churnedMaintenance).toBe(0);
  });

  it("sin contratos: ceros, promedio null y hasAny falso", () => {
    const s = recurringSummary([], from, to);
    expect(s.mrr.totalCents).toBe(0);
    expect(s.arrCents).toBe(0);
    expect(s.avgPerContractCents).toBeNull();
    expect(s.activeContracts).toBe(0);
    expect(s.hasAny).toBe(false);
  });
});

describe("recurringCollectedSeries", () => {
  it("suma por mes solo los pagos de suscripción y mantenimiento", () => {
    const buckets = [
      { label: "sep 26", from: d("2026-09-01"), to: d("2026-10-01"), days: 30 },
      { label: "oct 26", from: d("2026-10-01"), to: d("2026-11-01"), days: 31 },
    ];
    const series = recurringCollectedSeries(
      [
        { amountCents: 400, paidAt: d("2026-09-15"), kind: "SUSCRIPCION" },
        { amountCents: 80, paidAt: d("2026-10-05"), kind: "MANTENIMIENTO" },
        { amountCents: 400, paidAt: d("2026-10-15"), kind: "SUSCRIPCION" },
        { amountCents: 5_000, paidAt: d("2026-10-10"), kind: "DESARROLLO" }, // no es recurrente
        { amountCents: 1, paidAt: d("2026-11-01"), kind: "SUSCRIPCION" }, // fuera
      ],
      buckets,
    );
    expect(series.map((s) => [s.label, s.cents])).toEqual([["sep 26", 400], ["oct 26", 480]]);
    expect(recurringCollectedSeries([], buckets).every((s) => s.cents === 0)).toBe(true);
  });
});
