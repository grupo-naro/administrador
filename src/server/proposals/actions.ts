"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, money, optDateField, optMoney, optText, parseForm, text, type ActionState } from "@/lib/form";
import { centsToDec } from "@/server/mappers";
import { createProjectRecord, validateNewProject } from "@/server/projects/create";
import { isUniqueViolation } from "@/lib/prisma-errors";

const proposalSchema = z.object({
  clientId: text("Elegí un cliente"),
  title: text("El título es obligatorio"),
  scope: optText,
  oneTimePrice: money("Precio de Pago Único inválido"),
  monthlyFee: money("Abono mensual inválido"),
  validUntil: optDateField,
});

export async function createProposal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(proposalSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const { oneTimePrice, monthlyFee, ...rest } = parsed.data;
  const proposal = await prisma.proposal.create({
    data: { ...rest, oneTimePrice: centsToDec(oneTimePrice), monthlyFee: centsToDec(monthlyFee) },
  });
  revalidatePath("/proposals");
  redirect(`/proposals/${proposal.id}`);
}

export async function setProposalStatus(
  id: string,
  status: "ENVIADA" | "RECHAZADA",
  /* eslint-disable @typescript-eslint/no-unused-vars -- firma requerida por useActionState */
  _prev: ActionState,
  _fd: FormData,
  /* eslint-enable @typescript-eslint/no-unused-vars */
): Promise<ActionState> {
  await requireAdmin();
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal) return fail("Propuesta no encontrada");
  if (proposal.status === "ACEPTADA") return fail("La propuesta ya fue aceptada");
  await prisma.proposal.update({ where: { id }, data: { status } });
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  return { message: "Estado actualizado" };
}

const acceptSchema = z.object({
  model: z.enum(["PAGO_UNICO", "SUSCRIPCION"]),
  total: optMoney,
  monthlyFee: optMoney,
  firstPayment: optMoney,
});

export async function acceptProposal(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(acceptSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal) return fail("Propuesta no encontrada");
  if (proposal.status === "ACEPTADA") return fail("La propuesta ya fue aceptada");
  const d = parsed.data;
  const input = {
    clientId: proposal.clientId,
    proposalId: id,
    name: proposal.title,
    contractType: d.model,
    totalCents: d.total,
    monthlyFeeCents: d.monthlyFee,
    firstPaymentCents: d.firstPayment,
  };
  const problem = validateNewProject(input);
  if (problem) return fail(problem);
  let project: { id: string };
  try {
    project = await prisma.$transaction(async (tx) => {
      await tx.proposal.update({ where: { id }, data: { status: "ACEPTADA", acceptedModel: d.model } });
      return createProjectRecord(tx, input);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("La propuesta ya fue aceptada");
    throw e;
  }
  revalidatePath("/proposals");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
