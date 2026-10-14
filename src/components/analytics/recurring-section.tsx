import type { buildRecurring } from "@/domain/analytics/build";
import { formatARS } from "@/domain/money";
import { BarChart } from "./bar-chart";
import { Block, EmptyNote } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildRecurring>;

export function RecurringSection({ d }: { d: Data }) {
  if (!d.hasAny) {
    return <EmptyNote>Todavía no hay suscripciones ni mantenimientos. Esta pestaña se completa cuando exista el primero.</EmptyNote>;
  }
  const { cur } = d;
  const origins = [
    { label: "Suscripciones", cents: cur.mrr.subscriptionCents, count: cur.subscriptions.active },
    { label: "Mantenimiento", cents: cur.mrr.maintenanceCents, count: cur.maintenance.active },
  ].filter((o) => o.count > 0);
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="MRR" value={formatARS(cur.mrr.totalCents)} hint="Hoy · ingreso mensual recurrente" />
        <Kpi label="ARR" value={formatARS(cur.arrCents)} hint="Hoy · MRR × 12" />
        <Kpi label="Contratos activos" value={String(cur.activeContracts)} hint="Hoy · suscripciones y mantenimientos" />
        {cur.avgPerContractCents !== null && (
          <Kpi label="Ingreso promedio por contrato" value={formatARS(cur.avgPerContractCents)} hint="Hoy · MRR ÷ contratos activos" />
        )}
        <Kpi label="Altas del período" value={String(cur.signups)} hint={`Período anterior: ${d.prev.signups}`} />
        {(cur.churnedMaintenance > 0 || d.prev.churnedMaintenance > 0) && (
          <Kpi
            label="Mantenimientos dados de baja"
            value={String(cur.churnedMaintenance)}
            hint={`Período anterior: ${d.prev.churnedMaintenance}`}
            tone={cur.churnedMaintenance > 0 ? "alert" : undefined}
          />
        )}
        {cur.subscriptions.overdue > 0 && (
          <Kpi label="Suscripciones vencidas" value={String(cur.subscriptions.overdue)} hint="Hoy · con una cuota vencida sin cobrar" tone="alert" />
        )}
        {cur.subscriptions.suspended > 0 && (
          <Kpi label="Suscripciones suspendidas" value={String(cur.subscriptions.suspended)} hint="Hoy · suspendidas manualmente" tone="alert" />
        )}
      </KpiGrid>

      {origins.length > 0 && (
        <Block title="MRR por origen">
          <SimpleTable
            headers={[{ label: "Origen" }, { label: "Contratos activos", right: true }, { label: "MRR", right: true }]}
            rows={origins.map((o) => [o.label, String(o.count), formatARS(o.cents)])}
          />
        </Block>
      )}

      <Block
        title="Ingreso recurrente cobrado por mes"
        note="Últimos 12 meses, sin importar el período elegido. Es lo cobrado en suscripciones y mantenimientos, no el MRR histórico."
      >
        <BarChart
          data={d.series.map((s) => ({ label: s.label, a: s.cents }))}
          labelA="Cobrado recurrente"
          ariaLabel="Ingreso recurrente cobrado por mes, últimos 12 meses"
        />
        <SimpleTable
          headers={[{ label: "Mes" }, { label: "Cobrado", right: true }]}
          rows={d.series.map((s) => [s.label, formatARS(s.cents)])}
        />
      </Block>
    </div>
  );
}
