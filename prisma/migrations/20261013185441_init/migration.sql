-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PAGO_UNICO', 'SUSCRIPCION');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('COTIZACION', 'EN_DESARROLLO', 'ENTREGADO', 'EN_MANTENIMIENTO');

-- CreateEnum
CREATE TYPE "CodeOwner" AS ENUM ('CLIENTE', 'NARO');

-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('DESARROLLO', 'SUSCRIPCION', 'MANTENIMIENTO');

-- CreateEnum
CREATE TYPE "InstallmentType" AS ENUM ('ANTICIPO', 'CUOTA', 'PRIMER_PAGO', 'MENSUAL', 'MANTENIMIENTO');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDIENTE', 'PAGADO');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('DOMINIO', 'HOSTING', 'SERVIDOR');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "oneTimePrice" DECIMAL(14,2) NOT NULL,
    "monthlyFee" DECIMAL(14,2) NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'BORRADOR',
    "acceptedModel" "ContractType",
    "validUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "proposalId" TEXT,
    "name" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL DEFAULT 'COTIZACION',
    "contractType" "ContractType" NOT NULL,
    "totalAmount" DECIMAL(14,2),
    "monthlyFee" DECIMAL(14,2),
    "firstPaymentAmount" DECIMAL(14,2),
    "serviceSuspended" BOOLEAN NOT NULL DEFAULT false,
    "codeOwner" "CodeOwner" NOT NULL,
    "maintenanceFee" DECIMAL(14,2),
    "maintenanceStartsAt" DATE,
    "maintenanceEndedAt" DATE,
    "startedAt" DATE,
    "deliveredAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "PlanKind" NOT NULL,
    "totalAmount" DECIMAL(14,2),
    "installmentCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" "InstallmentType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "receiptNote" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "provider" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "renewalDate" DATE NOT NULL,
    "managedByNaro" BOOLEAN NOT NULL DEFAULT true,
    "costAmount" DECIMAL(14,2),

    CONSTRAINT "InfrastructureAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAccessToken" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),

    CONSTRAINT "ClientAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "Proposal_clientId_idx" ON "Proposal"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_proposalId_key" ON "Project"("proposalId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPlan_projectId_kind_key" ON "InstallmentPlan"("projectId", "kind");

-- CreateIndex
CREATE INDEX "Installment_dueDate_status_idx" ON "Installment"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_planId_sequence_key" ON "Installment"("planId", "sequence");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "InfrastructureAsset_renewalDate_idx" ON "InfrastructureAsset"("renewalDate");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAccessToken_tokenHash_key" ON "ClientAccessToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfrastructureAsset" ADD CONSTRAINT "InfrastructureAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAccessToken" ADD CONSTRAINT "ClientAccessToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
