import type { buildCollections } from "@/domain/analytics/build";
import { periodRangeLabel } from "@/domain/analytics/period";
import { formatARS } from "@/domain/money";
import { formatDays, formatPct } from "@/lib/format";
import { Block } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildCollections>;

export function CollectionsSection({ d }: { d: Data }) {
  const overdueTotal = d.aging.reduce((s, b) => s + b.cents, 0);
  const overdueCount = d.aging.reduce((s, b) => s + b.count, 0);
  const p = d.punctuality;
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="Deuda total de clientes" value={formatARS(d.debt.totalCents)} hint="Hoy · saldo de todas las cuotas" />
        <Kpi label="Vence en los próximos 30 días" value={formatARS(d.debt.dueNext30Cents)} hint="Hoy · incluye lo que vence hoy" />
        <Kpi
          label="Vencido sin cobrar"
          value={formatARS(overdueTotal)}
          hint={`Hoy · ${overdueCount} ${overdueCount === 1 ? "cuota" : "cuotas"}`}
          tone={overdueTotal > 0 ? "alert" : undefined}
        />
        <Kpi
          label="Pagadas a tiempo"
          value={formatPct(p.onTimePct)}
          hint={
            p.count === 0
              ? `Sin cuotas pagadas en ${periodRangeLabel(d.current)}`
              : `${p.count} ${p.count === 1 ? "cuota pagada" : "cuotas pagadas"} en el período · antes: ${formatPct(d.previousPunctuality.onTimePct)}`
          }
        />
        {p.avgLateDays !== null && (
          <Kpi label="Demora promedio" value={formatDays(p.avgLateDays)} hint="Solo de las cuotas que se pagaron tarde" />
        )}
      </KpiGrid>

      <Block title="Antigüedad de lo vencido" note="Hoy. Los días se cuentan desde el vencimiento de cada cuota con saldo.">
        <SimpleTable
          headers={[{ label: "Atraso" }, { label: "Cuotas", right: true }, { label: "Saldo vencido", right: true }]}
          rows={d.aging.map((b) => [b.label, String(b.count), formatARS(b.cents)])}
        />
      </Block>

      <Block title="Clientes con deuda vencida" note="Ordenados por saldo vencido.">
        <SimpleTable
          headers={[
            { label: "Cliente" },
            { label: "Cuotas vencidas", right: true },
            { label: "Saldo vencido", right: true },
            { label: "Mayor atraso", right: true },
          ]}
          rows={d.debtors.map((c) => [c.clientName, String(c.overdueCount), formatARS(c.overdueCents), formatDays(c.maxDaysLate)])}
          empty="No hay clientes con deuda vencida."
        />
      </Block>
    </div>
  );
}
