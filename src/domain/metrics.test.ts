import { describe, it, expect } from "vitest";
import { parseDateInput as d } from "./dates";
import { installmentAlerts, monthSummary, mrrCents, realVsProjected, renewalAlerts } from "./metrics";

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

describe("monthSummary", () => {
  const from = d("2026-10-01");
  const to = d("2026-11-01");
  const pay = (amountCents: number, paidAt: string, kind: "DESARROLLO" | "SUSCRIPCION" | "MANTENIMIENTO") => ({
    amountCents, paidAt: d(paidAt), kind,
  });
  const inst = (amountCents: number, paidCents: number, dueDate: string, kind: "DESARROLLO" | "SUSCRIPCION" | "MANTENIMIENTO") => ({
    amountCents, paidCents, dueDate: d(dueDate), kind,
  });

  it("facturado = pagos del mes, total y por origen (rango [from, to))", () => {
    const s = monthSummary(
      {
        payments: [
          pay(100, "2026-10-01", "DESARROLLO"),
          pay(40, "2026-10-31", "SUSCRIPCION"),
          pay(10, "2026-10-15", "MANTENIMIENTO"),
          pay(999, "2026-09-30", "DESARROLLO"), // mes anterior
          pay(999, "2026-11-01", "SUSCRIPCION"), // mes siguiente
        ],
        installments: [],
      },
      from,
      to,
    );
    expect(s.collected).toEqual({ totalCents: 150, oneTimeCents: 100, subscriptionCents: 40, maintenanceCents: 10 });
  });

  it("estimado = saldo de las cuotas que vencen en el mes, separado en únicos y recurrentes", () => {
    const s = monthSummary(
      {
        payments: [],
        installments: [
          inst(500, 0, "2026-10-20", "DESARROLLO"), // 500 pendiente
          inst(300, 100, "2026-10-05", "DESARROLLO"), // parcial: faltan 200 (vencida dentro del mes, cuenta)
          inst(400, 0, "2026-10-31", "SUSCRIPCION"), // 400
          inst(80, 0, "2026-10-10", "MANTENIMIENTO"), // 80
          inst(700, 700, "2026-10-12", "DESARROLLO"), // pagada: no suma
          inst(999, 0, "2026-09-30", "DESARROLLO"), // vencida de un mes anterior: no suma
          inst(999, 0, "2026-11-01", "SUSCRIPCION"), // mes siguiente: no suma
        ],
      },
      from,
      to,
    );
    expect(s.expected).toEqual({ totalCents: 1180, oneTimeCents: 700, recurringCents: 480 });
  });

  it("sin movimientos todo es cero", () => {
    const s = monthSummary({ payments: [], installments: [] }, from, to);
    expect(s.collected.totalCents).toBe(0);
    expect(s.expected.totalCents).toBe(0);
  });
});
