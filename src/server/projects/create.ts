import "server-only";
import type { PrismaClient } from "@prisma/client";
import { centsToDec } from "@/server/mappers";

export interface NewProject {
  clientId: string;
  proposalId?: string;
  name: string;
  contractType: "PAGO_UNICO" | "SUSCRIPCION";
  totalCents?: number;
  monthlyFeeCents?: number;
  firstPaymentCents?: number;
}

export function validateNewProject(i: NewProject): string | null {
  if (i.contractType === "PAGO_UNICO" && !i.totalCents) return "El Pago Único requiere un monto total";
  if (i.contractType === "SUSCRIPCION" && (!i.monthlyFeeCents || !i.firstPaymentCents)) {
    return "La Suscripción requiere abono mensual y primer pago";
  }
  return null;
}

export function createProjectRecord(db: Pick<PrismaClient, "project">, i: NewProject) {
  const dec = (c?: number) => (c ? centsToDec(c) : undefined);
  return db.project.create({
    data: {
      clientId: i.clientId,
      proposalId: i.proposalId,
      name: i.name,
      contractType: i.contractType,
      codeOwner: i.contractType === "PAGO_UNICO" ? "CLIENTE" : "NARO",
      totalAmount: i.contractType === "PAGO_UNICO" ? dec(i.totalCents) : undefined,
      monthlyFee: i.contractType === "SUSCRIPCION" ? dec(i.monthlyFeeCents) : undefined,
      firstPaymentAmount: i.contractType === "SUSCRIPCION" ? dec(i.firstPaymentCents) : undefined,
    },
  });
}
