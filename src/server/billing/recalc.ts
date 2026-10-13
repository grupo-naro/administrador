import "server-only";
import type { Prisma } from "@prisma/client";
import { decToCents } from "@/server/mappers";

/** Deja `status` en PAGADO si la suma de pagos cubre el monto; si no, PENDIENTE. */
export async function recalcInstallment(tx: Prisma.TransactionClient, installmentId: string) {
  const inst = await tx.installment.findUniqueOrThrow({
    where: { id: installmentId },
    include: { payments: true },
  });
  const paid = inst.payments.reduce((s, p) => s + decToCents(p.amount), 0);
  const status = paid >= decToCents(inst.amount) ? "PAGADO" : "PENDIENTE";
  if (status !== inst.status) await tx.installment.update({ where: { id: installmentId }, data: { status } });
}
