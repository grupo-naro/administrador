import "server-only";
import type { Prisma } from "@prisma/client";
import { toCents } from "@/domain/money";

export const decToCents = (d: Prisma.Decimal): number => toCents(d.toString());
export const centsToDec = (cents: number): string => (cents / 100).toFixed(2);
