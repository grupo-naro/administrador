import "server-only";
import type { Prisma } from "@prisma/client";

/** Bloquea todas las cuotas de un plan, en orden estable (mismo orden en todas las rutas => sin deadlocks). */
export const lockPlanInstallments = (tx: Prisma.TransactionClient, planId: string) =>
  tx.$queryRaw`SELECT id FROM "Installment" WHERE "planId" = ${planId} ORDER BY id FOR UPDATE`;
