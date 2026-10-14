import { ActionForm } from "@/components/action-form";
import { Field, TextAreaField } from "@/components/fields";
import type { ActionState } from "@/lib/form";

type Client = { name: string; phone: string | null; notes: string | null };

export function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  client?: Client;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} className="max-w-lg space-y-3">
      <Field label="Nombre / Razón social" name="name" defaultValue={client?.name} required />
      <Field label="Teléfono" name="phone" defaultValue={client?.phone ?? ""} />
      <TextAreaField label="Notas internas" name="notes" defaultValue={client?.notes ?? ""} />
    </ActionForm>
  );
}
