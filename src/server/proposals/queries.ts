import "server-only";
import { prisma } from "@/lib/prisma";

export const listProposals = () =>
  prisma.proposal.findMany({ orderBy: { createdAt: "desc" }, include: { client: { select: { name: true } } } });

export const getProposal = (id: string) =>
  prisma.proposal.findUnique({ where: { id }, include: { client: true, project: { select: { id: true } } } });
