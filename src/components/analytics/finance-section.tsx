import type { buildFinance } from "@/domain/analytics/build";
import { periodRangeLabel } from "@/domain/analytics/period";
import { formatARS } from "@/domain/money";
import { formatPct } from "@/lib/format";
import { BarChart } from "./bar-chart";
import { Block } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildFinance>;

export function FinanceSection({ d }: { d: Data }) {
  const { cur, variations: v, series } = d;
  const origins = [
    { label: "Proyectos únicos", cents: cur.byKind.oneTimeCents },
    { label: "Suscripciones", cents: cur.byKind.subscriptionCents },
    { label: "Mantenimiento", cents: cur.byKind.maintenanceCents },
  ].filter((o) => o.cents > 0);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {periodRangeLabel(d.current)} · período en curso: se compara contra el período anterior completo ({periodRangeLabel(d.previous)}).
      </p>

      <KpiGrid>
        <Kpi label="Cobrado" value={formatARS(cur.collectedCents)} hint="Dinero que entró en el período" delta={v.collected} />
        <Kpi label="Proyectado" value={formatARS(cur.projectedCents)} hint="Cuotas que vencían en el período" delta={v.projected} />
        <Kpi label="Cumplimiento" value={formatPct(cur.fulfillmentPct)} hint="De lo proyectado, cuánto ya está cobrado" />
        <Kpi label="Por cobrar" value={formatARS(cur.upcomingCents)} hint="Cuotas del período que todavía no vencen" />
        <Kpi label="Vencido sin cobrar" value={formatARS(cur.overdueCents)} hint="Cuotas del período ya vencidas" tone={cur.overdueCents > 0 ? "alert" : undefined} />
        <Kpi label="Costos de infraestructura" value={formatARS(cur.infraCostCents)} hint="Repartidos en el tiempo" delta={v.infraCost} positiveIsGood={false} />
        <Kpi
          label="Balance neto"
          value={formatARS(cur.netCents)}
          hint="Cobrado menos costos de infraestructura"
          delta={v.net}
          tone={cur.netCents < 0 ? "alert" : undefined}
        />
      </KpiGrid>

      <Block title="Cobrado vs. proyectado" note="Cada tramo muestra lo cobrado y lo que vencía en él; el detalle completo está en la tabla.">
        <BarChart
          data={series.map((s) => ({ label: s.label, a: s.collectedCents, b: s.projectedCents }))}
          labelA="Cobrado"
          labelB="Proyectado"
          ariaLabel={`Cobrado y proyectado, ${periodRangeLabel(d.current)}`}
        />
        <SimpleTable
          headers={[
            { label: "Tramo" },
            { label: "Cobrado", right: true },
            { label: "Proyectado", right: true },
            { label: "Costos", right: true },
            { label: "Neto", right: true },
          ]}
          rows={series.map((s) => [
            s.label,
            formatARS(s.collectedCents),
            formatARS(s.projectedCents),
            formatARS(s.costCents),
            <span key="n" className={s.netCents < 0 ? "text-red-700" : ""}>
              {formatARS(s.netCents)}
            </span>,
          ])}
        />
      </Block>

      {origins.length > 0 && (
        <Block title="Cobrado por origen">
          <SimpleTable
            headers={[{ label: "Origen" }, { label: "Cobrado", right: true }, { label: "% del total", right: true }]}
            rows={origins.map((o) => [o.label, formatARS(o.cents), formatPct(o.cents / cur.collectedCents)])}
          />
        </Block>
      )}

      {cur.byMethod.length > 0 && (
        <Block title="Cobrado por método de pago">
          <SimpleTable
            headers={[{ label: "Método" }, { label: "Cobrado", right: true }, { label: "% del total", right: true }]}
            rows={cur.byMethod.map((m) => [m.method, formatARS(m.cents), formatPct(m.cents / cur.collectedCents)])}
          />
        </Block>
      )}

      <Block
        title="Quiénes aportan más"
        note={
          d.concentrationPct === null
            ? undefined
            : `Los 3 primeros clientes concentran el ${formatPct(d.concentrationPct)} de lo cobrado.`
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SimpleTable
            headers={[{ label: "Cliente" }, { label: "Cobrado", right: true }, { label: "%", right: true }]}
            rows={d.topClients.map((t) => [t.name, formatARS(t.cents), formatPct(t.sharePct)])}
            empty="Sin cobros en el período."
          />
          <SimpleTable
            headers={[{ label: "Proyecto" }, { label: "Cobrado", right: true }, { label: "%", right: true }]}
            rows={d.topProjects.map((t) => [t.name, formatARS(t.cents), formatPct(t.sharePct)])}
            empty="Sin cobros en el período."
          />
        </div>
      </Block>
    </div>
  );
}
