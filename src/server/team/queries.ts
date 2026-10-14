import "server-only";
import { prisma } from "@/lib/prisma";

/** Administradores del panel. Nunca se selecciona passwordHash. */
export const listAdmins = () =>
  prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
  });
