import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { listClients } from "@/server/clients/queries";
import { createProject } from "@/server/projects/actions";

export default async function NewProjectPage() {
  const clients = await listClients();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo proyecto</h1>
      <p className="text-sm text-muted-foreground">
        Para proyectos que vienen de una propuesta, aceptala desde Propuestas.
      </p>
      <ActionForm action={createProject} submitLabel="Crear proyecto" className="max-w-lg space-y-3">
        <SelectField label="Cliente" name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        <Field label="Nombre del proyecto" name="name" required />
        <SelectField
          label="Tipo de contrato"
          name="contractType"
          options={[
            { value: "PAGO_UNICO", label: "Pago Único" },
            { value: "SUSCRIPCION", label: "Suscripción" },
          ]}
        />
        <Field label="Total Pago Único (ARS)" name="total" type="number" step="0.01" />
        <Field label="Abono mensual (ARS)" name="monthlyFee" type="number" step="0.01" />
        <Field label="Primer pago Suscripción (ARS)" name="firstPayment" type="number" step="0.01" />
      </ActionForm>
    </div>
  );
}
