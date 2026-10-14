import { diffDays } from "../dates";
import { inRange } from "./common";

export type ProposalStatus = "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA";

export interface SalesProposal {
  status: ProposalStatus;
  createdAt: Date;
  validUntil: Date | null;
  oneTimePriceCents: number;
  /** Proyecto que nació al aceptarla (su fecha de creación es la fecha de aceptación). */
  project: {
    createdAt: Date;
    contractType: "PAGO_UNICO" | "SUSCRIPCION";
    totalCents: number | null;
    monthlyFeeCents: number | null;
  } | null;
}

export function salesSummary(proposals: SalesProposal[], from: Date, to: Date, today: Date) {
  const created = proposals.filter((p) => inRange(p.createdAt, from, to));
  const byStatus: Record<ProposalStatus, number> = { BORRADOR: 0, ENVIADA: 0, ACEPTADA: 0, RECHAZADA: 0 };
  for (const p of created) byStatus[p.status] += 1;
  const decided = byStatus.ACEPTADA + byStatus.RECHAZADA;

  // Cierres del período: aceptadas cuyo proyecto se creó en el rango (aunque la propuesta sea anterior).
  const closed = proposals.filter((p) => p.status === "ACEPTADA" && p.project && inRange(p.project.createdAt, from, to));
  let acceptedOneTimeValueCents = 0;
  let acceptedMonthlyFeeCents = 0;
  const mix = { oneTime: 0, subscription: 0 };
  let closeDays = 0;
  for (const p of closed) {
    const project = p.project as NonNullable<SalesProposal["project"]>;
    if (project.contractType === "PAGO_UNICO") {
      mix.oneTime += 1;
      acceptedOneTimeValueCents += project.totalCents ?? 0;
    } else {
      mix.subscription += 1;
      acceptedMonthlyFeeCents += project.monthlyFeeCents ?? 0;
    }
    closeDays += diffDays(project.createdAt, p.createdAt);
  }

  const open = proposals.filter((p) => p.status === "BORRADOR" || p.status === "ENVIADA");
  return {
    created: created.length,
    byStatus,
    conversionPct: created.length === 0 ? null : byStatus.ACEPTADA / created.length,
    decidedConversionPct: decided === 0 ? null : byStatus.ACEPTADA / decided,
    proposedValueCents: created.reduce((s, p) => s + p.oneTimePriceCents, 0),
    closedCount: closed.length,
    acceptedOneTimeValueCents,
    acceptedMonthlyFeeCents,
    avgDaysToClose: closed.length === 0 ? null : closeDays / closed.length,
    mix,
    avgTicketCents: mix.oneTime === 0 ? null : Math.round(acceptedOneTimeValueCents / mix.oneTime),
    pipeline: {
      count: open.length,
      valueCents: open.reduce((s, p) => s + p.oneTimePriceCents, 0),
      expiredCount: open.filter((p) => p.validUntil !== null && p.validUntil.getTime() < today.getTime()).length,
    },
  };
}
