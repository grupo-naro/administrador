import "server-only";
import { prisma } from "@/lib/prisma";

export const listAssets = () =>
  prisma.infrastructureAsset.findMany({
    orderBy: { renewalDate: "asc" },
    include: { project: { select: { id: true, name: true, client: { select: { name: true } } } } },
  });
