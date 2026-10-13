import { z } from "zod";
import { parseDateInput } from "@/domain/dates";
import { toCents } from "@/domain/money";

export type ActionState = { error?: string; message?: string } | undefined;

export const fail = (error: string): ActionState => ({ error });

export function parseForm<S extends z.ZodType>(
  schema: S,
  fd: FormData,
): { ok: true; data: z.infer<S> } | { ok: false; error: string } {
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Datos inválidos" };
  return { ok: true, data: result.data };
}

export const text = (msg: string) => z.string().trim().min(1, msg);
export const optText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

const centsOrNull = (v: string): number | null => {
  try {
    const c = toCents(v);
    return c > 0 ? c : null;
  } catch {
    return null;
  }
};

export const money = (msg = "Monto inválido") =>
  z
    .string()
    .trim()
    .refine((v) => centsOrNull(v) !== null, msg)
    .transform((v) => centsOrNull(v) as number);

export const optMoney = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || centsOrNull(v) !== null, "Monto inválido")
  .transform((v) => (v ? (centsOrNull(v) as number) : undefined));

const dateOrNull = (v: string): Date | null => {
  try {
    return parseDateInput(v);
  } catch {
    return null;
  }
};

export const dateField = (msg = "Fecha inválida") =>
  z
    .string()
    .refine((v) => dateOrNull(v) !== null, msg)
    .transform((v) => dateOrNull(v) as Date);

export const optDateField = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || dateOrNull(v) !== null, "Fecha inválida")
  .transform((v) => (v ? (dateOrNull(v) as Date) : null));
