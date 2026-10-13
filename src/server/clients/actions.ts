"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, optText, parseForm, text, type ActionState } from "@/lib/form";

const schema = z.object({
  name: text("El nombre es obligatorio"),
  contactName: optText,
  email: optText,
  phone: optText,
  taxId: optText,
  notes: optText,
});

export async function createClient(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const client = await prisma.client.create({ data: parsed.data });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return fail(parsed.error);
  await prisma.client.update({ where: { id }, data: parsed.data });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { message: "Cambios guardados" };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteClient(id: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const [projects, proposals] = await Promise.all([
    prisma.project.count({ where: { clientId: id } }),
    prisma.proposal.count({ where: { clientId: id } }),
  ]);
  if (projects + proposals > 0) return fail("No se puede eliminar: tiene proyectos o propuestas");
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
  redirect("/clients");
}
