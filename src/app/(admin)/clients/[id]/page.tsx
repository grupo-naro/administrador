import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ClientForm } from "@/components/client-form";
import { CONTRACT_LABEL, PROPOSAL_LABEL, STAGE_LABEL } from "@/lib/labels";
import { deleteClient, updateClient } from "@/server/clients/actions";
import { getClient } from "@/server/clients/queries";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{client.name}</h1>
      <ClientForm action={updateClient.bind(null, id)} client={client} submitLabel="Guardar cambios" />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Proyectos</h2>
        <ul className="divide-y rounded-md border">
          {client.projects.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin proyectos.</li>}
          {client.projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="flex justify-between p-3 hover:bg-muted">
                <span>{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {CONTRACT_LABEL[p.contractType]} · {STAGE_LABEL[p.stage]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Propuestas</h2>
        <ul className="divide-y rounded-md border">
          {client.proposals.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin propuestas.</li>}
          {client.proposals.map((p) => (
            <li key={p.id}>
              <Link href={`/proposals/${p.id}`} className="flex justify-between p-3 hover:bg-muted">
                <span>{p.title}</span>
                <span className="text-sm text-muted-foreground">{PROPOSAL_LABEL[p.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ActionForm action={deleteClient.bind(null, id)} submitLabel="Eliminar cliente" variant="destructive" />
    </div>
  );
}
