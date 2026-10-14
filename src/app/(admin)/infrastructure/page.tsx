import Link from "next/link";
import { formatDate, todayAR } from "@/domain/dates";
import { renewalAlerts } from "@/domain/metrics";
import { formatARS } from "@/domain/money";
import { ASSET_LABEL } from "@/lib/labels";
import { listAssets } from "@/server/infrastructure/queries";
import { decToCents } from "@/server/mappers";

export default async function InfrastructurePage() {
  const assets = await listAssets();
  const today = todayAR();
  const { expired } = renewalAlerts(assets, today, 30);
  const expiredIds = new Set(expired.map((a) => a.id));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Infraestructura</h1>
      <p className="text-sm text-muted-foreground">Los activos se agregan desde la ficha de cada proyecto.</p>
      <ul className="divide-y rounded-xl border bg-card">
        {assets.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin activos.</li>}
        {assets.map((a) => (
          <li key={a.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
            <span>
              {ASSET_LABEL[a.type]} · {a.identifier} ·{" "}
              <Link className="underline" href={`/projects/${a.project.id}`}>
                {a.project.name} ({a.project.client.name})
              </Link>{" "}
              · {a.managedByNaro ? "Gestiona Naro" : "Gestiona el cliente"}
            </span>
            <span className={expiredIds.has(a.id) ? "font-medium text-red-600" : ""}>Renueva {formatDate(a.renewalDate)}
              {a.costAmount ? ` · ${formatARS(decToCents(a.costAmount))} ${a.costEveryMonths === 1 ? "por mes" : `cada ${a.costEveryMonths} meses`}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
