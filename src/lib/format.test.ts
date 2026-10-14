import { describe, expect, it } from "vitest";
import { formatARS } from "@/domain/money";
import { formatCompactARS, formatDays, formatPct, formatSignedARS, formatSignedPct } from "./format";

const norm = (s: string) => s.replace(/ /g, " ");

describe("formatPct", () => {
  it("formatea fracciones y tolera null / no finitos", () => {
    expect(norm(formatPct(0.5333))).toContain("53,3");
    expect(formatPct(0.5333)).toContain("%");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
    expect(formatPct(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formatPct muestra '<0,1%' para fracciones positivas diminutas y 0 normal", () => {
    expect(norm(formatPct(0.0004))).toBe("<0,1%");
    expect(norm(formatPct(0))).toBe("0%");
  });

  it("formatSignedPct usa signo explícito (+ y − real)", () => {
    expect(norm(formatSignedPct(0.25))).toBe("+25%");
    expect(norm(formatSignedPct(-0.25))).toBe("−25%");
    expect(norm(formatSignedPct(0))).toBe("0%");
  });

  it("formatSignedPct topa las variaciones enormes", () => {
    expect(formatSignedPct(10)).toBe("+999% o más");
    expect(formatSignedPct(-10.5)).toBe("−999% o más");
    expect(norm(formatSignedPct(9.99))).toBe("+999%");
  });
});

describe("formatSignedARS", () => {
  it("signo explícito y valor 0 sin signo", () => {
    expect(norm(formatSignedARS(5000))).toBe("+$ 50,00");
    expect(norm(formatSignedARS(-5000))).toBe("−$ 50,00");
    expect(norm(formatSignedARS(0))).toBe("$ 0,00");
  });

  it("los negativos grandes (balance en contra) conservan el formato", () => {
    expect(norm(formatARS(-13_500_000))).toContain("135.000,00");
    expect(norm(formatSignedARS(-13_500_000))).toBe("−$ 135.000,00");
  });
});

describe("formatCompactARS y formatDays", () => {
  it("compacta montos para los ejes del gráfico", () => {
    expect(norm(formatCompactARS(0))).toContain("0");
    expect(formatCompactARS(150_000_000).length).toBeLessThan(14);
  });

  it("días con singular y null", () => {
    expect(formatDays(null)).toBe("—");
    expect(formatDays(1)).toBe("1 día");
    expect(formatDays(2.25)).toBe("2,3 días");
    expect(formatDays(0)).toBe("0 días");
  });
});
