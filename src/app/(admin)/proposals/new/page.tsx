import { ActionForm } from "@/components/action-form";
import { Field, SelectField, TextAreaField } from "@/components/fields";
import { createProposal } from "@/server/proposals/actions";
import { listClients } from "@/server/clients/queries";

export default async function NewProposalPage() {
  const clients = await listClients();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nueva propuesta</h1>
      <ActionForm action={createProposal} submitLabel="Crear propuesta" className="max-w-lg space-y-3">
        <SelectField
          label="Cliente"
          name="clientId"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Field label="Título" name="title" required />
        <TextAreaField label="Alcance" name="scope" />
        <Field label="Precio Pago Único (ARS)" name="oneTimePrice" type="number" step="0.01" required />
        <Field label="Abono mensual Suscripción (ARS)" name="monthlyFee" type="number" step="0.01" required />
        <Field label="Válida hasta" name="validUntil" type="date" />
      </ActionForm>
      {clients.length === 0 && <p className="text-sm text-red-600">Primero creá un cliente.</p>}
    </div>
  );
}
