import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("permite hasta el límite dentro de la ventana y luego bloquea", () => {
    const allow = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([allow("ip", 0), allow("ip", 100), allow("ip", 200)]).toEqual([true, true, true]);
    expect(allow("ip", 300)).toBe(false);
  });

  it("libera cuando pasa la ventana y separa por clave", () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(allow("a", 0)).toBe(true);
    expect(allow("b", 0)).toBe(true);
    expect(allow("a", 500)).toBe(false);
    expect(allow("a", 1001)).toBe(true);
  });
});
