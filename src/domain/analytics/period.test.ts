import { describe, expect, it } from "vitest";
import { parseDateInput as d, toDateInput as iso } from "../dates";
import { bucketsOf, parsePeriodKey, periodRangeLabel, resolvePeriod, variation } from "./period";

const today = d("2026-10-14"); // miércoles

describe("parsePeriodKey", () => {
  it("usa 'mes' por defecto y ante valores inválidos", () => {
    expect(parsePeriodKey(undefined)).toBe("mes");
    expect(parsePeriodKey("foo")).toBe("mes");
    expect(parsePeriodKey("6m")).toBe("6m");
    expect(parsePeriodKey("semana")).toBe("semana");
  });
});

describe("resolvePeriod", () => {
  it("semana: de lunes a domingo, con la anterior completa", () => {
    const { current, previous } = resolvePeriod("semana", today);
    expect([iso(current.from), iso(current.to), current.days]).toEqual(["2026-10-12", "2026-10-19", 7]);
    expect([iso(previous.from), iso(previous.to), previous.days]).toEqual(["2026-10-05", "2026-10-12", 7]);
  });

  it("semana: hoy lunes y hoy domingo caen en la misma semana", () => {
    expect(iso(resolvePeriod("semana", d("2026-10-12")).current.from)).toBe("2026-10-12");
    expect(iso(resolvePeriod("semana", d("2026-10-18")).current.from)).toBe("2026-10-12");
    expect(iso(resolvePeriod("semana", d("2026-10-19")).current.from)).toBe("2026-10-19");
  });

  it("semana que cruza el fin de año", () => {
    const { current } = resolvePeriod("semana", d("2027-01-01")); // viernes
    expect([iso(current.from), iso(current.to)]).toEqual(["2026-12-28", "2027-01-04"]);
  });

  it("mes: mes calendario y el anterior completo", () => {
    const { current, previous } = resolvePeriod("mes", today);
    expect([iso(current.from), iso(current.to), current.days]).toEqual(["2026-10-01", "2026-11-01", 31]);
    expect([iso(previous.from), iso(previous.to), previous.days]).toEqual(["2026-09-01", "2026-10-01", 30]);
  });

  it("mes: cruce de año y febrero bisiesto", () => {
    const jan = resolvePeriod("mes", d("2027-01-05"));
    expect([iso(jan.current.from), iso(jan.previous.from)]).toEqual(["2027-01-01", "2026-12-01"]);
    const feb = resolvePeriod("mes", d("2028-02-10"));
    expect([feb.current.days, feb.previous.days]).toEqual([29, 31]);
  });

  it("6 meses: 6 meses calendario terminando con el actual", () => {
    const { current, previous } = resolvePeriod("6m", today);
    expect([iso(current.from), iso(current.to), current.days]).toEqual(["2026-05-01", "2026-11-01", 184]);
    expect([iso(previous.from), iso(previous.to), previous.days]).toEqual(["2025-11-01", "2026-05-01", 181]);
    expect(iso(resolvePeriod("6m", d("2027-01-05")).current.from)).toBe("2026-08-01");
  });

  it("1 año: 12 meses calendario terminando con el actual", () => {
    const { current, previous } = resolvePeriod("1a", today);
    expect([iso(current.from), iso(current.to), current.days]).toEqual(["2025-11-01", "2026-11-01", 365]);
    expect([iso(previous.from), iso(previous.to)]).toEqual(["2024-11-01", "2025-11-01"]);
  });
});

describe("bucketsOf", () => {
  it("mes: un tramo por día", () => {
    const b = bucketsOf(resolvePeriod("mes", today).current);
    expect(b).toHaveLength(31);
    expect(b[0].label).toBe("1");
    expect(b[30].label).toBe("31");
    expect(iso(b[30].to)).toBe("2026-11-01");
    expect(b.every((x) => x.days === 1)).toBe(true);
  });

  it("semana: 7 tramos de lunes a domingo", () => {
    const b = bucketsOf(resolvePeriod("semana", today).current);
    expect(b).toHaveLength(7);
    expect(iso(b[0].from)).toBe("2026-10-12");
    expect(iso(b[6].to)).toBe("2026-10-19");
  });

  it("6 meses y 1 año: un tramo por mes calendario que cubre el período sin huecos", () => {
    const six = bucketsOf(resolvePeriod("6m", today).current);
    expect(six).toHaveLength(6);
    expect(iso(six[0].from)).toBe("2026-05-01");
    expect(six[0].days).toBe(31);
    expect(iso(six[5].to)).toBe("2026-11-01");
    expect(six.reduce((s, x) => s + x.days, 0)).toBe(184);
    expect(six[5].label).toMatch(/oct/i);
    six.slice(1).forEach((x, i) => expect(x.from.getTime()).toBe(six[i].to.getTime()));
    expect(bucketsOf(resolvePeriod("1a", today).current)).toHaveLength(12);
  });
});

describe("periodRangeLabel", () => {
  it("muestra desde y el último día incluido", () => {
    expect(periodRangeLabel(resolvePeriod("semana", today).current)).toBe("12/10/2026 al 18/10/2026");
    expect(periodRangeLabel(resolvePeriod("mes", today).current)).toBe("01/10/2026 al 31/10/2026");
  });
});

describe("variation", () => {
  it("diferencia y porcentaje (fracción) contra el período anterior", () => {
    expect(variation(150, 100)).toEqual({ diffCents: 50, pct: 0.5 });
    expect(variation(50, 100)).toEqual({ diffCents: -50, pct: -0.5 });
  });

  it("sin porcentaje cuando el anterior es 0", () => {
    expect(variation(10, 0)).toEqual({ diffCents: 10, pct: null });
    expect(variation(0, 0)).toEqual({ diffCents: 0, pct: null });
  });

  it("usa el valor absoluto del anterior (anterior negativo)", () => {
    expect(variation(-50, -100)).toEqual({ diffCents: 50, pct: 0.5 });
  });
});
