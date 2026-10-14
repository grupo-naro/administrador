import type { buildInfra } from "@/domain/analytics/build";
import type { RenewalGroup } from "@/domain/analytics/infra";
import { formatDate } from "@/domain/dates";
import { formatARS } from "@/lib/privacy";
import { ASSET_LABEL } from "@/lib/labels";
import { Block, EmptyNote } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildInfra>;

function RenewalTable({ title, group, tone }: { title: string; group: RenewalGroup; tone?: "alert" }) {
  if (group.items.length === 0) return null;
  return (
    <Block title={`${title} (${group.items.length})`} note={group.costCents > 0 ? `Costo que paga Naro: ${formatARS(group.costCents)}` : undefined}>
      <SimpleTable
        headers={[
          { label: "Activo" },
          { label: "Proyecto" },
          { label: "Lo gestiona" },
          { label: "Renueva", right: true },
          { label: "Costo", right: true },
        ]}
        rows={group.items.map((r) => [
          `${ASSET_LABEL[r.type]} · ${r.identifier}`,
          r.projectName,
          r.managedByNaro ? "Grupo Naro" : "Cliente",
          <span key="d" className={tone === "alert" ? "font-medium text-red-700" : ""}>
            {formatDate(r.renewalDate)}
          </span>,
          r.costCents ? formatARS(r.costCents) : "—",
        ])}
      />
    </Block>
  );
}

export function InfraAnalyticsSection({ d }: { d: Data }) {
  if (d.total === 0) return <EmptyNote>Todavía no hay dominios, hosting ni servidores cargados.</EmptyNote>;
  const { renewals } = d;
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="Costo mensual equivalente" value={formatARS(d.monthlyEquivalentCents)} hint="Hoy · activos que gestiona Naro con costo cargado" />
        <Kpi label="Activos cargados" value={String(d.total)} hint="Hoy" />
        {renewals.expired.items.length > 0 && (
          <Kpi label="Renovaciones vencidas" value={String(renewals.expired.items.length)} hint="Hoy" tone="alert" />
        )}
      </KpiGrid>

      <Block title="Activos por tipo">
        <SimpleTable
          headers={[{ label: "Tipo" }, { label: "Gestiona Naro", right: true }, { label: "Gestiona el cliente", right: true }]}
          rows={d.byType.map((t) => [ASSET_LABEL[t.type], String(t.naro), String(t.client)])}
        />
      </Block>

      <RenewalTable title="Renovaciones vencidas" group={renewals.expired} tone="alert" />
      <RenewalTable title="Vencen en los próximos 30 días" group={renewals.next30} />
      <RenewalTable title="Vencen entre 31 y 60 días" group={renewals.next60} />
      <RenewalTable title="Vencen entre 61 y 90 días" group={renewals.next90} />
    </div>
  );
}
