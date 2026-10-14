import { diffDays } from "../dates";
import { inRange } from "./common";

export type Stage = "COTIZACION" | "EN_DESARROLLO" | "ENTREGADO" | "EN_MANTENIMIENTO";
export const STAGES: Stage[] = ["COTIZACION", "EN_DESARROLLO", "ENTREGADO", "EN_MANTENIMIENTO"];

export interface PortfolioProject {
  clientId: string;
  stage: Stage;
  contractType: "PAGO_UNICO" | "SUSCRIPCION";
  totalCents: number | null;
  monthlyFeeCents: number | null;
  createdAt: Date;
  startedAt: Date | null;
  deliveredAt: Date | null;
  /** Tiene una suscripción activa o un mantenimiento activo. */
  activeRecurring: boolean;
}

export interface PortfolioClient {
  id: string;
  name: string;
  createdAt: Date;
  /** Cobrado acumulado histórico del cliente. */
  collectedCents: number;
}

export function projectsSummary(projects: PortfolioProject[], from: Date, to: Date) {
  const byStage = STAGES.map((stage) => {
    const ps = projects.filter((p) => p.stage === stage);
    return {
      stage,
      count: ps.length,
      contractedCents: ps.filter((p) => p.contractType === "PAGO_UNICO").reduce((s, p) => s + (p.totalCents ?? 0), 0),
      monthlyCents: ps.filter((p) => p.contractType === "SUSCRIPCION").reduce((s, p) => s + (p.monthlyFeeCents ?? 0), 0),
    };
  });
  const delivered = projects.filter((p) => p.deliveredAt !== null && inRange(p.deliveredAt, from, to));
  const withDuration = delivered.filter((p) => p.startedAt !== null);
  const totalDays = withDuration.reduce((s, p) => s + diffDays(p.deliveredAt as Date, p.startedAt as Date), 0);
  return {
    byStage,
    created: projects.filter((p) => inRange(p.createdAt, from, to)).length,
    delivered: delivered.length,
    avgDevDays: withDuration.length === 0 ? null : totalDays / withDuration.length,
  };
}

export function clientsSummary(clients: PortfolioClient[], projects: PortfolioProject[], from: Date, to: Date) {
  const active = new Set(
    projects
      .filter((p) => p.stage === "EN_DESARROLLO" || p.stage === "EN_MANTENIMIENTO" || p.activeRecurring)
      .map((p) => p.clientId),
  );
  return {
    total: clients.length,
    newInPeriod: clients.filter((c) => inRange(c.createdAt, from, to)).length,
    withActiveWork: clients.filter((c) => active.has(c.id)).length,
    top: clients
      .filter((c) => c.collectedCents > 0)
      .sort((a, b) => b.collectedCents - a.collectedCents || a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((c) => ({ id: c.id, name: c.name, cents: c.collectedCents })),
  };
}
