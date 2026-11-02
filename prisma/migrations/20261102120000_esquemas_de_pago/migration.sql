-- CreateEnum
CREATE TYPE "DevelopmentScheme" AS ENUM ('ANTICIPO_CUOTAS', 'CONTADO', 'MITAD_ENTREGA');

-- AlterEnum
-- Cada ADD VALUE va en su propia sentencia. Los valores nuevos no se usan en esta migración
-- (PostgreSQL 12+ permite ADD VALUE dentro de la transacción mientras no se use el valor en ella).
ALTER TYPE "InstallmentType" ADD VALUE 'PAGO_TOTAL';
ALTER TYPE "InstallmentType" ADD VALUE 'SALDO_ENTREGA';

-- AlterTable
ALTER TABLE "InstallmentPlan" ADD COLUMN     "scheme" "DevelopmentScheme";

-- Backfill: los planes de desarrollo existentes son "50% anticipo + cuotas" (sin cambios en cuotas ni pagos).
UPDATE "InstallmentPlan" SET "scheme" = 'ANTICIPO_CUOTAS' WHERE "kind" = 'DESARROLLO';
