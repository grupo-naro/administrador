import type { InstallmentType } from "./installments";
import { installmentLabel } from "./labels";
import { installmentStatus, summarize, type ComputedStatus } from "./status";

export type PlanKind = "DESARROLLO" | "SUSCRIPCION" | "MANTENIMIENTO";

export interface PortalInput {
  projectName: string;
  clientName: string;
  stage: string;
  plans: {
    kind: PlanKind;
    installments: {
      type: InstallmentType;
      sequence: number;
      amountCents: number;
      dueDate: Date;
      paidCents: number;
      payments: { amountCents: number; paidAt: Date }[];
    }[];
  }[];
}

export interface PortalPlanView {
  kind: PlanKind;
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  pending: { label: string; amountCents: number; remainingCents: number; dueDate: Date; status: ComputedStatus }[];
  payments: { label: string; amountCents: number; paidAt: Date }[];
}

export interface PortalView {
  projectName: string;
  clientName: string;
  stage: string;
  plans: PortalPlanView[];
}

export function buildPortalView(input: PortalInput, today: Date): PortalView {
  return {
    projectName: input.projectName,
    clientName: input.clientName,
    stage: input.stage,
    plans: input.plans.map((plan) => {
      const { totalCents, paidCents, pendingCents } = summarize(plan.installments);
      const pending = plan.installments
        .filter((i) => i.paidCents < i.amountCents)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
        .map((i) => ({
          label: installmentLabel(i.type, i.sequence),
          amountCents: i.amountCents,
          remainingCents: i.amountCents - i.paidCents,
          dueDate: i.dueDate,
          status: installmentStatus(i, today),
        }));
      const payments = plan.installments
        .flatMap((i) =>
          i.payments.map((p) => ({
            label: installmentLabel(i.type, i.sequence),
            amountCents: p.amountCents,
            paidAt: p.paidAt,
          })),
        )
        .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
      return { kind: plan.kind, totalCents, paidCents, pendingCents, pending, payments };
    }),
  };
}
