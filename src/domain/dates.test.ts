import { describe, it, expect } from "vitest";
import { addMonths, diffDays, formatDate, parseDateInput, toDateInput, todayAR } from "./dates";

const d = parseDateInput;

describe("dates", () => {
  it("parsea y rechaza fechas", () => {
    expect(toDateInput(d("2026-11-15"))).toBe("2026-11-15");
    expect(() => d("2026-02-30")).toThrow("Fecha inválida");
    expect(() => d("15/11/2026")).toThrow("Fecha inválida");
  });

  it("addMonths recorta fin de mes y no deriva", () => {
    expect(toDateInput(addMonths(d("2027-01-31"), 1))).toBe("2027-02-28");
    expect(toDateInput(addMonths(d("2028-01-31"), 1))).toBe("2028-02-29");
    expect(toDateInput(addMonths(d("2027-01-31"), 2))).toBe("2027-03-31");
    expect(toDateInput(addMonths(d("2026-12-15"), 1))).toBe("2027-01-15");
  });

  it("todayAR usa la zona horaria de Argentina", () => {
    // 02:30 UTC del 13 = 23:30 del 12 en Buenos Aires
    expect(toDateInput(todayAR(new Date("2026-10-13T02:30:00Z")))).toBe("2026-10-12");
    expect(toDateInput(todayAR(new Date("2026-10-13T12:00:00Z")))).toBe("2026-10-13");
  });

  it("diffDays y formatDate", () => {
    expect(diffDays(d("2026-10-20"), d("2026-10-13"))).toBe(7);
    expect(formatDate(d("2026-10-13"))).toBe("13/10/2026");
  });
});
