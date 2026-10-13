import "server-only";
import type { ProjectStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decToCents } from "@/server/mappers";

export const listProjects = (stage?: ProjectStage) =>
  prisma.project.findMany({
    where: stage ? { stage } : undefined,
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, name: true } } },
  });

export async function getProject(id: string) {
  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      plans: { select: { id: true, kind: true } },
      assets: { orderBy: { renewalDate: "asc" } },
      tokens: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) return null;
  const cents = (d: typeof p.totalAmount) => (d ? decToCents(d) : null);
  return {
    ...p,
    totalCents: cents(p.totalAmount),
    monthlyFeeCents: cents(p.monthlyFee),
    firstPaymentCents: cents(p.firstPaymentAmount),
    maintenanceFeeCents: cents(p.maintenanceFee),
  };
}
