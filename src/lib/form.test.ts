import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_MONEY_CENTS, emailField, money, optMoney, parseForm, passwordField } from "./form";

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

describe("passwordField / emailField", () => {
  const schema = z.object({ email: emailField, password: passwordField });

  it("acepta una contraseña de 10 caracteres y normaliza el email a minúsculas", () => {
    const r = parseForm(schema, fd({ email: "  Ana@Gruponaro.COM ", password: "1234567890" }));
    expect(r).toEqual({ ok: true, data: { email: "ana@gruponaro.com", password: "1234567890" } });
  });

  it("rechaza contraseñas cortas con un mensaje claro", () => {
    const r = parseForm(schema, fd({ email: "a@b.com", password: "123456789" }));
    expect(r).toEqual({ ok: false, error: "La contraseña debe tener al menos 10 caracteres" });
  });

  it("rechaza contraseñas de más de 72 bytes (límite de bcrypt)", () => {
    expect(parseForm(schema, fd({ email: "a@b.com", password: "a".repeat(72) })).ok).toBe(true);
    const long = parseForm(schema, fd({ email: "a@b.com", password: "a".repeat(73) }));
    expect(long).toEqual({ ok: false, error: "La contraseña no puede superar los 72 bytes" });
    // 40 caracteres "ñ" = 80 bytes en UTF-8
    expect(parseForm(schema, fd({ email: "a@b.com", password: "ñ".repeat(40) })).ok).toBe(false);
  });

  it("rechaza emails inválidos", () => {
    expect(parseForm(schema, fd({ email: "no-es-email", password: "1234567890" }))).toEqual({
      ok: false,
      error: "Email inválido",
    });
  });
});
