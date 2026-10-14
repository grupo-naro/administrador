import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatARS } from "@/domain/money";
import { PROPOSAL_LABEL } from "@/lib/labels";
import { decToCents } from "@/server/mappers";
import { listProposals } from "@/server/proposals/queries";

export default async function ProposalsPage() {
  const proposals = await listProposals();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Propuestas</h1>
        <Button nativeButton={false} render={<Link href="/proposals/new" />}>Nueva propuesta</Button>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {proposals.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin propuestas.</li>}
        {proposals.map((p) => (
          <li key={p.id}>
            <Link href={`/proposals/${p.id}`} className="flex flex-wrap justify-between gap-2 p-4 hover:bg-muted">
              <span>
                {p.title} <span className="text-sm text-muted-foreground">— {p.client.name}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {p.monthlyFee
                  ? `${formatARS(decToCents(p.oneTimePrice))} único · ${formatARS(decToCents(p.monthlyFee))}/mes`
                  : `${formatARS(decToCents(p.oneTimePrice))} · Pago Único`}{" "}
                ·{" "}
                {PROPOSAL_LABEL[p.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
