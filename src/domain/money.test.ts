import { describe, it, expect } from "vitest";
import { toCents, fromCents, formatARS } from "./money";

describe("money", () => {
  it("convierte a centavos sin error de punto flotante", () => {
    expect(toCents("10.05")).toBe(1005);
    expect(toCents("400000")).toBe(40_000_000);
    expect(toCents("400000,50")).toBe(40_000_050);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("rechaza texto inválido", () => {
    expect(() => toCents("abc")).toThrow("Monto inválido");
    expect(() => toCents("1.234,56")).toThrow("Monto inválido");
  });

  it("fromCents invierte toCents", () => {
    expect(fromCents(40_000_050)).toBe(400000.5);
  });

  it("formatARS muestra pesos argentinos", () => {
    const s = formatARS(40_000_000).replace(/\s/g, " ");
    expect(s).toContain("$");
    expect(s).toContain("400.000,00");
  });
});
