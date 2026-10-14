import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { salesSummary, type SalesProposal } from "./sales";

const from = d("2026-10-01");
const to = d("2026-11-01");
const today = d("2026-10-14");

const prop = (over: Partial<SalesProposal> & Pick<SalesProposal, "status" | "createdAt" | "oneTimePriceCents">): SalesProposal => ({
  validUntil: null,
  project: null,
  ...over,
});

const proposals: SalesProposal[] = [
  prop({ status: "ACEPTADA", createdAt: d("2026-10-02"), oneTimePriceCents: 1000, project: { createdAt: d("2026-10-06"), contractType: "PAGO_UNICO", totalCents: 900, monthlyFeeCents: null } }),
  prop({ status: "ACEPTADA", createdAt: d("2026-10-03"), oneTimePriceCents: 800, project: { createdAt: d("2026-10-13"), contractType: "SUSCRIPCION", totalCents: null, monthlyFeeCents: 40 } }),
  prop({ status: "RECHAZADA", createdAt: d("2026-10-04"), oneTimePriceCents: 500 }),
  prop({ status: "ENVIADA", createdAt: d("2026-10-05"), oneTimePriceCents: 600, validUntil: d("2026-10-10") }),
  prop({ status: "BORRADOR", createdAt: d("2026-10-06"), oneTimePriceCents: 100 }),
  // creada en septiembre pero cerrada en octubre: cuenta como cierre del período, no como creada
  prop({ status: "ACEPTADA", createdAt: d("2026-09-15"), oneTimePriceCents: 2000, project: { createdAt: d("2026-10-01"), contractType: "PAGO_UNICO", totalCents: 1800, monthlyFeeCents: null } }),
];

describe("salesSummary", () => {
  it("propuestas creadas, estado actual y conversión", () => {
    const s = salesSummary(proposals, from, to, today);
    expect(s.created).toBe(5);
    expect(s.byStatus).toEqual({ BORRADOR: 1, ENVIADA: 1, ACEPTADA: 2, RECHAZADA: 1 });
    expect(s.conversionPct).toBeCloseTo(2 / 5, 6);
    expect(s.decidedConversionPct).toBeCloseTo(2 / 3, 6);
    expect(s.proposedValueCents).toBe(3000);
  });

  it("valores aceptados, mix, ticket y días hasta el cierre (por fecha del proyecto)", () => {
    const s = salesSummary(proposals, from, to, today);
    expect(s.closedCount).toBe(3);
    expect(s.acceptedOneTimeValueCents).toBe(2700);
    expect(s.acceptedMonthlyFeeCents).toBe(40);
    expect(s.mix).toEqual({ oneTime: 2, subscription: 1 });
    expect(s.avgTicketCents).toBe(1350);
    expect(s.avgDaysToClose).toBe(10); // (4 + 10 + 16) / 3
  });

  it("pipeline abierto (no depende del período): borradores y enviadas", () => {
    const s = salesSummary(proposals, from, to, today);
    expect(s.pipeline).toEqual({ count: 2, valueCents: 700, expiredCount: 1 });
    const empty = salesSummary(proposals, d("2025-01-01"), d("2025-02-01"), today);
    expect(empty.pipeline).toEqual({ count: 2, valueCents: 700, expiredCount: 1 });
  });

  it("una propuesta creada el día `hasta` no entra en el período", () => {
    const s = salesSummary([prop({ status: "BORRADOR", createdAt: d("2026-11-01"), oneTimePriceCents: 5 })], from, to, today);
    expect(s.created).toBe(0);
  });

  it("sin propuestas: ceros y null (nunca NaN)", () => {
    const s = salesSummary([], from, to, today);
    expect(s).toEqual({
      created: 0,
      byStatus: { BORRADOR: 0, ENVIADA: 0, ACEPTADA: 0, RECHAZADA: 0 },
      conversionPct: null,
      decidedConversionPct: null,
      proposedValueCents: 0,
      closedCount: 0,
      acceptedOneTimeValueCents: 0,
      acceptedMonthlyFeeCents: 0,
      avgDaysToClose: null,
      mix: { oneTime: 0, subscription: 0 },
      avgTicketCents: null,
      pipeline: { count: 0, valueCents: 0, expiredCount: 0 },
    });
  });
});
