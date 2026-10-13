"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, type ActionState } from "@/lib/form";
import { generateToken, hashToken } from "@/lib/tokens";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generatePortalToken(projectId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail("Proyecto no encontrado");
  const token = generateToken();
  await prisma.$transaction([
    prisma.clientAccessToken.updateMany({ where: { projectId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.clientAccessToken.create({ data: { projectId, tokenHash: hashToken(token) } }),
  ]);
  revalidatePath(`/projects/${projectId}`);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return { message: `Copiá el enlace ahora, no se vuelve a mostrar: ${base}/client/view/${token}` };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function revokePortalToken(tokenId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const existing = await prisma.clientAccessToken.findUnique({ where: { id: tokenId }, select: { projectId: true } });
  if (!existing) return fail("Enlace no encontrado");
  await prisma.clientAccessToken.updateMany({
    where: { id: tokenId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath(`/projects/${existing.projectId}`);
  return { message: "Enlace revocado" };
}
