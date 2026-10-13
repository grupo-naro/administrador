import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { formatARS } from "@/domain/money";
import { PROPOSAL_LABEL } from "@/lib/labels";
import { decToCents } from "@/server/mappers";
import { acceptProposal, setProposalStatus } from "@/server/proposals/actions";
import { getProposal } from "@/server/proposals/queries";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProposal(id);
  if (!p) notFound();
  const oneTime = decToCents(p.oneTimePrice);
  const monthly = decToCents(p.monthlyFee);
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <p className="text-sm text-muted-foreground">
          {p.client.name} · {PROPOSAL_LABEL[p.status]}
        </p>
      </div>
      {p.scope && <p className="whitespace-pre-wrap text-sm">{p.scope}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Opción A — Pago Único</p>
          <p className="text-xl font-semibold">{formatARS(oneTime)}</p>
          <p className="text-xs text-muted-foreground">50% de anticipo + resto en 2 o 3 cuotas</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Opción B — Suscripción</p>
          <p className="text-xl font-semibold">{formatARS(monthly)}/mes</p>
          <p className="text-xs text-muted-foreground">El primer pago se define al aceptar</p>
        </div>
      </div>

      {p.status === "ACEPTADA" ? (
        <p className="text-sm">
          Aceptada.{" "}
          {p.project && (
            <Link className="underline" href={`/projects/${p.project.id}`}>
              Ver proyecto
            </Link>
          )}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <ActionForm action={setProposalStatus.bind(null, id, "ENVIADA")} submitLabel="Marcar enviada" variant="outline" />
            <ActionForm action={setProposalStatus.bind(null, id, "RECHAZADA")} submitLabel="Marcar rechazada" variant="outline" />
          </div>
          <section className="space-y-3 rounded-md border p-4">
            <h2 className="text-lg font-medium">Aceptar y crear proyecto</h2>
            <ActionForm action={acceptProposal.bind(null, id)} submitLabel="Aceptar propuesta">
              <SelectField
                label="Modelo elegido"
                name="model"
                options={[
                  { value: "PAGO_UNICO", label: "Pago Único" },
                  { value: "SUSCRIPCION", label: "Suscripción" },
                ]}
              />
              <Field label="Total Pago Único (ARS)" name="total" type="number" step="0.01" defaultValue={oneTime / 100} />
              <Field label="Abono mensual (ARS)" name="monthlyFee" type="number" step="0.01" defaultValue={monthly / 100} />
              <Field label="Primer pago Suscripción (ARS)" name="firstPayment" type="number" step="0.01" placeholder="ej. 600000" />
            </ActionForm>
          </section>
        </>
      )}
    </div>
  );
}
