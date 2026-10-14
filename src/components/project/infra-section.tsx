import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { formatDate } from "@/domain/dates";
import { ASSET_LABEL } from "@/lib/labels";
import { createAsset, deleteAsset } from "@/server/infrastructure/actions";

export function InfraSection({
  projectId,
  assets,
}: {
  projectId: string;
  assets: { id: string; type: keyof typeof ASSET_LABEL; provider: string; identifier: string; renewalDate: Date; managedByNaro: boolean }[];
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Infraestructura</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {assets.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin dominios ni hosting cargados.</li>}
        {assets.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>
              {ASSET_LABEL[a.type]} · {a.identifier} · {a.provider} · {a.managedByNaro ? "Gestiona Naro" : "Gestiona el cliente"}
            </span>
            <span className="flex items-center gap-3">
              Renueva {formatDate(a.renewalDate)}
              <ActionForm action={deleteAsset.bind(null, a.id)} submitLabel="Quitar" variant="outline" className="" />
            </span>
          </li>
        ))}
      </ul>
      <details className="max-w-md">
        <summary className="cursor-pointer text-sm underline">Agregar dominio / hosting / servidor</summary>
        <ActionForm action={createAsset.bind(null, projectId)} submitLabel="Agregar" className="mt-2 space-y-2">
          <SelectField label="Tipo" name="type" options={Object.entries(ASSET_LABEL).map(([value, label]) => ({ value, label }))} />
          <Field label="Proveedor" name="provider" required />
          <Field label="Identificador (dominio, plan…)" name="identifier" required />
          <Field label="Renovación" name="renewalDate" type="date" required />
          <SelectField
            label="Lo gestiona"
            name="managedByNaro"
            options={[{ value: "true", label: "Grupo Naro" }, { value: "false", label: "Cliente" }]}
          />
          <Field label="Costo (ARS, opcional)" name="cost" type="number" step="0.01" />
        </ActionForm>
      </details>
    </section>
  );
}
