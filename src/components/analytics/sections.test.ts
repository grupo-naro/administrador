import { describe, expect, it } from "vitest";
import { SECTIONS, parseSectionKey } from "./sections";

describe("parseSectionKey", () => {
  it("usa 'finanzas' por defecto y ante valores inválidos", () => {
    expect(parseSectionKey(undefined)).toBe("finanzas");
    expect(parseSectionKey("otra-cosa")).toBe("finanzas");
  });

  it("acepta las seis pestañas", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(["finanzas", "cobranza", "recurrente", "ventas", "proyectos", "infra"]);
    for (const s of SECTIONS) expect(parseSectionKey(s.key)).toBe(s.key);
  });
});
