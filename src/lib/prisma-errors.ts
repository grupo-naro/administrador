const code = (e: unknown) => (e as { code?: string } | null)?.code;

/** Violación de restricción única (Prisma P2002). */
export const isUniqueViolation = (e: unknown) => code(e) === "P2002";

/** El registro a actualizar/eliminar no existe (Prisma P2025). */
export const isRecordNotFound = (e: unknown) => code(e) === "P2025";
