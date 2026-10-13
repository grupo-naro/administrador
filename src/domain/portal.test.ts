import { describe, it, expect } from "vitest";
import { parseDateInput as d } from "./dates";
import { installmentLabel } from "./labels";
import { buildPortalView, type PortalInput } from "./portal";

const today = d("2026-10-13");

describe("installmentLabel", () => {
  it("etiqueta cada tipo", () => {
    expect(installmentLabel("ANTICIPO", 1)).toBe("Anticipo (50%)");
    expect(installmentLabel("CUOTA", 2)).toBe("Cuota 1");
    expect(installmentLabel("PRIMER_PAGO", 1)).toBe("Primer pago");
    expect(installmentLabel("MENSUAL", 3)).toBe("Mes 3");
    expect(installmentLabel("MANTENIMIENTO", 2)).toBe("Mantenimiento mes 2");
  });
});

describe("buildPortalView", () => {
  const input = {
    projectName: "Web Acme",
    clientName: "Acme SA",
    stage: "EN_DESARROLLO",
    internalNotes: "NOTA-INTERNA-SECRETA",
    plans: [
      {
        kind: "DESARROLLO",
        installments: [
          {
            type: "ANTICIPO", sequence: 1, amountCents: 50_000, dueDate: d("2026-10-01"), paidCents: 50_000,
            payments: [{ amountCents: 50_000, paidAt: d("2026-10-02"), receiptNote: "COMPROBANTE-SECRETO", method: "Transferencia" }],
          },
          { type: "CUOTA", sequence: 2, amountCents: 25_000, dueDate: d("2026-10-10"), paidCents: 5_000,
            payments: [{ amountCents: 5_000, paidAt: d("2026-10-11"), receiptNote: "OTRO-SECRETO" }] },
          { type: "CUOTA", sequence: 3, amountCents: 25_000, dueDate: d("2026-12-10"), paidCents: 0, payments: [] },
        ],
      },
    ],
  } as unknown as PortalInput;

  const view = buildPortalView(input, today);

  it("calcula totales y cuotas pendientes con estado", () => {
    const plan = view.plans[0];
    expect(plan).toMatchObject({ kind: "DESARROLLO", totalCents: 100_000, paidCents: 55_000, pendingCents: 45_000 });
    expect(plan.pending.map((p) => [p.label, p.remainingCents, p.status])).toEqual([
      ["Cuota 1", 20_000, "VENCIDO"],
      ["Cuota 2", 25_000, "PENDIENTE"],
    ]);
  });

  it("historial de pagos más reciente primero", () => {
    expect(view.plans[0].payments.map((p) => p.label)).toEqual(["Cuota 1", "Anticipo (50%)"]);
  });

  it("no filtra campos internos", () => {
    const json = JSON.stringify(view);
    expect(json).not.toContain("SECRETO");
    expect(json).not.toContain("receiptNote");
    expect(json).not.toContain("internalNotes");
  });
});
