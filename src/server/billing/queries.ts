import "server-only";
import { todayAR } from "@/domain/dates";
import type { InstallmentType } from "@/domain/installments";
import type { PlanKind } from "@/domain/portal";
import { installmentStatus, summarize, type ComputedStatus } from "@/domain/status";
import { prisma } from "@/lib/prisma";
import { decToCents } from "@/server/mappers";

export interface PaymentRow {
  id: string;
  amountCents: number;
  paidAt: Date;
  method: string;
  receiptNote: string | null;
}
export interface InstallmentRow {
  id: string;
  planId: string;
  type: InstallmentType;
  sequence: number;
  amountCents: number;
  dueDate: Date;
  paidCents: number;
  status: ComputedStatus;
  payments: PaymentRow[];
}
export interface PlanRow {
  id: string;
  kind: PlanKind;
  installments: InstallmentRow[];
  summary: { totalCents: number; paidCents: number; pendingCents: number };
}

export async function getProjectBilling(projectId: string, today = todayAR()): Promise<PlanRow[]> {
  const plans = await prisma.installmentPlan.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: {
      installments: {
        orderBy: { sequence: "asc" },
        include: { payments: { orderBy: { paidAt: "asc" } } },
      },
    },
  });
  return plans.map((plan) => {
    const installments = plan.installments.map((i): InstallmentRow => {
      const amountCents = decToCents(i.amount);
      const payments = i.payments.map((p) => ({
        id: p.id,
        amountCents: decToCents(p.amount),
        paidAt: p.paidAt,
        method: p.method,
        receiptNote: p.receiptNote,
      }));
      const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
      return {
        id: i.id,
        planId: plan.id,
        type: i.type,
        sequence: i.sequence,
        amountCents,
        dueDate: i.dueDate,
        paidCents,
        status: installmentStatus({ amountCents, paidCents, dueDate: i.dueDate }, today),
        payments,
      };
    });
    return { id: plan.id, kind: plan.kind, installments, summary: summarize(installments) };
  });
}
