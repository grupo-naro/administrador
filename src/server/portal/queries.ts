import "server-only";
import { todayAR } from "@/domain/dates";
import { buildPortalView, type PortalView } from "@/domain/portal";
import { prisma } from "@/lib/prisma";
import { evaluateToken, hashToken, isWellFormedToken } from "@/lib/tokens";
import { decToCents } from "@/server/mappers";

export async function getPortalViewByToken(rawToken: string): Promise<PortalView | null> {
  if (!isWellFormedToken(rawToken)) return null;
  const row = await prisma.clientAccessToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      project: {
        include: {
          client: { select: { name: true } },
          plans: {
            orderBy: { createdAt: "asc" },
            include: {
              installments: { orderBy: { sequence: "asc" }, include: { payments: { orderBy: { paidAt: "asc" } } } },
            },
          },
        },
      },
    },
  });
  if (!row || evaluateToken(row, new Date()) !== "OK") return null;
  // updateMany: no lanza si el token se borró entre la lectura y la escritura.
  await prisma.clientAccessToken.updateMany({ where: { id: row.id }, data: { lastViewedAt: new Date() } });

  const { project } = row;
  return buildPortalView(
    {
      projectName: project.name,
      clientName: project.client.name,
      stage: project.stage,
      plans: project.plans.map((plan) => ({
        kind: plan.kind,
        installments: plan.installments.map((i) => {
          const payments = i.payments.map((p) => ({ amountCents: decToCents(p.amount), paidAt: p.paidAt }));
          return {
            type: i.type,
            sequence: i.sequence,
            amountCents: decToCents(i.amount),
            dueDate: i.dueDate,
            paidCents: payments.reduce((s, p) => s + p.amountCents, 0),
            payments,
          };
        }),
      })),
    },
    todayAR(),
  );
}
