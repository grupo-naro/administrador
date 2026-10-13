import "server-only";
import { prisma } from "@/lib/prisma";

export const listClients = () =>
  prisma.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true } } } });

export const getClient = (id: string) =>
  prisma.client.findUnique({
    where: { id },
    include: {
      projects: { orderBy: { createdAt: "desc" } },
      proposals: { orderBy: { createdAt: "desc" } },
    },
  });
