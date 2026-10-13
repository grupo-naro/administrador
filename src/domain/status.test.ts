import { describe, it, expect } from "vitest";
import { parseDateInput as d } from "./dates";
import { assertPayable, installmentStatus, remainingCents, serviceStatus, summarize } from "./status";

const today = d("2026-10-13");
const inst = (amountCents: number, paidCents: number, due: string) => ({ amountCents, paidCents, dueDate: d(due) });

describe("installmentStatus", () => {
  it("PAGADO cuando lo pagado cubre el monto", () => {
    expect(installmentStatus(inst(100, 100, "2026-01-01"), today)).toBe("PAGADO");
  });
  it("VENCIDO solo si la fecha ya pasó (hoy no es vencido)", () => {
    expect(installmentStatus(inst(100, 0, "2026-10-12"), today)).toBe("VENCIDO");
    expect(installmentStatus(inst(100, 0, "2026-10-13"), today)).toBe("PENDIENTE");
    expect(installmentStatus(inst(100, 40, "2026-10-12"), today)).toBe("VENCIDO");
  });
});

describe("summarize y remaining", () => {
  it("suma total, pagado y pendiente", () => {
    expect(summarize([inst(100, 100, "2026-01-01"), inst(300, 50, "2026-12-01")])).toEqual({
      totalCents: 400, paidCents: 150, pendingCents: 250,
    });
    expect(remainingCents(inst(100, 40, "2026-12-01"))).toBe(60);
  });
});

describe("serviceStatus", () => {
  it("SUSPENDIDO gana sobre todo", () => {
    expect(serviceStatus({ suspended: true, installments: [] }, today)).toBe("SUSPENDIDO");
  });
  it("VENCIDA con una cuota vencida impaga", () => {
    expect(serviceStatus({ suspended: false, installments: [inst(100, 0, "2026-10-01")] }, today)).toBe("VENCIDA");
  });
  it("ACTIVO si todo está al día", () => {
    expect(serviceStatus({ suspended: false, installments: [inst(100, 100, "2026-10-01"), inst(100, 0, "2026-11-01")] }, today)).toBe("ACTIVO");
  });
});

describe("assertPayable", () => {
  it("acepta un monto dentro del saldo", () => {
    expect(() => assertPayable(100, 100)).not.toThrow();
  });
  it("rechaza monto mayor al saldo, cero, y cuota ya pagada", () => {
    expect(() => assertPayable(100, 101)).toThrow("supera el saldo");
    expect(() => assertPayable(100, 0)).toThrow("mayor a cero");
    expect(() => assertPayable(0, 10)).toThrow("ya está pagada");
  });
});
