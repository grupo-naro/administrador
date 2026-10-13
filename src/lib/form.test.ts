import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_MONEY_CENTS, money, optMoney, parseForm } from "./form";

const fd = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  return f;
};

describe("money / optMoney", () => {
  const schema = z.object({ a: money(), b: optMoney });

  it("acepta el máximo de Decimal(14,2)", () => {
    expect(parseForm(schema, fd({ a: "999999999999.99" }))).toEqual({ ok: true, data: { a: MAX_MONEY_CENTS, b: undefined } });
  });

  it("rechaza montos por encima de Decimal(14,2) con un mensaje amable", () => {
    expect(parseForm(schema, fd({ a: "1e14" }))).toEqual({ ok: false, error: "Monto demasiado grande" });
    expect(parseForm(schema, fd({ a: "1", b: "1000000000000" }))).toEqual({ ok: false, error: "Monto demasiado grande" });
  });

  it("sigue rechazando montos inválidos", () => {
    expect(parseForm(schema, fd({ a: "abc" }))).toEqual({ ok: false, error: "Monto inválido" });
    expect(parseForm(schema, fd({ a: "0" }))).toEqual({ ok: false, error: "Monto inválido" });
  });
});
