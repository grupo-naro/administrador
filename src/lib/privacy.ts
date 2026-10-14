import { cache } from "react";
import { cookies } from "next/headers";
import { formatARS as formatPlainARS } from "@/domain/money";
import { formatCompactARS as formatPlainCompactARS } from "@/lib/format";

/** Cookie que recuerda si los montos están ocultos (como el "ojito" de las apps de banco). */
export const HIDE_AMOUNTS_COOKIE = "ocultar-montos";

const MASK = "$ ••••••";

// Estado por pedido: cada pantalla lo inicializa una vez y los componentes de abajo lo leen al dar formato.
const state = cache(() => ({ hidden: false }));

/** Lee la cookie y deja el estado listo para este pedido. Devuelve si los montos están ocultos. */
export async function initPrivacy(): Promise<boolean> {
  const hidden = (await cookies()).get(HIDE_AMOUNTS_COOKIE)?.value === "1";
  state().hidden = hidden;
  return hidden;
}

export const formatARS = (cents: number): string => (state().hidden ? MASK : formatPlainARS(cents));

export const formatCompactARS = (cents: number): string => (state().hidden ? "••••" : formatPlainCompactARS(cents));

export function formatSignedARS(cents: number): string {
  if (state().hidden) return MASK;
  if (cents === 0) return formatPlainARS(0);
  return `${cents > 0 ? "+" : "−"}${formatPlainARS(Math.abs(cents))}`;
}
