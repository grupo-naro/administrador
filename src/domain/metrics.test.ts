import { describe, it, expect } from "vitest";
import { parseDateInput as d } from "./dates";
import { installmentAlerts, mrrCents, realVsProjected, renewalAlerts } from "./metrics";

const today = d("2026-10-13");

describe("mrrCents", () => {
  it("suma solo activos y separa por origen", () => {
    expect(
      mrrCents([
        { kind: "SUSCRIPCION", feeCents: 400, active: true },
        { kind: "SUSCRIPCION", feeCents: 999, active: false },
        { kind: "MANTENIMIENTO", feeCents: 100, active: true },
      ]),
    ).toEqual({ subscriptionCents: 400, maintenanceCents: 100, totalCents: 500 });
  });
});

describe("realVsProjected", () => {
  it("usa el rango [from, to)", () => {
    const res = realVsProjected(
      {
        payments: [
          { amountCents: 100, paidAt: d("2026-10-01") },
          { amountCents: 50, paidAt: d("2026-11-01") },
        ],
        installments: [
          { amountCents: 300, dueDate: d("2026-10-31") },
          { amountCents: 700, dueDate: d("2026-11-01") },
        ],
      },
      d("2026-10-01"),
      d("2026-11-01"),
    );
    expect(res).toEqual({ realCents: 100, projectedCents: 300 });
  });
});

describe("installmentAlerts", () => {
  const mk = (id: string, due: string, paid = 0) => ({ id, amountCents: 100, paidCents: paid, dueDate: d(due) });
  it("separa vencidas y próximas a 7 días, ignora pagadas, ordena por fecha", () => {
    const res = installmentAlerts(
      [
        mk("vencida-b", "2026-10-10"),
        mk("vencida-a", "2026-10-01"),
        mk("hoy", "2026-10-13"),
        mk("en-7", "2026-10-20"),
        mk("en-8", "2026-10-21"),
        mk("pagada", "2026-10-01", 100),
      ],
      today,
    );
    expect(res.overdue.map((x) => x.id)).toEqual(["vencida-a", "vencida-b"]);
    expect(res.upcoming.map((x) => x.id)).toEqual(["hoy", "en-7"]);
  });
});

describe("renewalAlerts", () => {
  it("separa vencidas y próximas a 30 días", () => {
    const mk = (id: string, due: string) => ({ id, renewalDate: d(due) });
    const res = renewalAlerts(
      [mk("vencido", "2026-10-01"), mk("en-30", "2026-11-12"), mk("en-31", "2026-11-13")],
      today,
    );
    expect(res.expired.map((x) => x.id)).toEqual(["vencido"]);
    expect(res.upcoming.map((x) => x.id)).toEqual(["en-30"]);
  });
});
