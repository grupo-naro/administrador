import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listClients } from "@/server/clients/queries";

export default async function ClientsPage() {
  const clients = await listClients();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Button render={<Link href="/clients/new" />}>Nuevo cliente</Button>
      </div>
      <ul className="divide-y rounded-md border">
        {clients.length === 0 && <li className="p-4 text-sm text-muted-foreground">Todavía no hay clientes.</li>}
        {clients.map((c) => (
          <li key={c.id}>
            <Link href={`/clients/${c.id}`} className="flex justify-between p-4 hover:bg-muted">
              <span>{c.name}</span>
              <span className="text-sm text-muted-foreground">{c._count.projects} proyecto(s)</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
