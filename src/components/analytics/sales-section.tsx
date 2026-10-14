import type { buildSales } from "@/domain/analytics/build";
import { formatARS } from "@/lib/privacy";
import { PROPOSAL_LABEL } from "@/lib/labels";
import { formatDays, formatPct } from "@/lib/format";
import { Block } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildSales>;

export function SalesSection({ d }: { d: Data }) {
  const { cur, prev } = d;
  const statuses = (["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA"] as const).filter((s) => cur.byStatus[s] > 0);
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="Propuestas creadas" value={String(cur.created)} hint={`Período anterior: ${prev.created}`} />
        <Kpi
          label="Conversión"
          value={formatPct(cur.conversionPct)}
          hint={`Aceptadas ÷ creadas del período · sobre decididas: ${formatPct(cur.decidedConversionPct)}`}
        />
        <Kpi label="Valor propuesto" value={formatARS(cur.proposedValueCents)} hint="Suma del precio de Pago Único de las creadas" />
        <Kpi
          label="Cierres del período"
          value={String(cur.closedCount)}
          hint={`Propuestas aceptadas en el período · antes: ${prev.closedCount}`}
        />
        {cur.mix.oneTime > 0 && <Kpi label="Valor aceptado (Pago Único)" value={formatARS(cur.acceptedOneTimeValueCents)} />}
        {cur.mix.subscription > 0 && (
          <Kpi label="Abono mensual aceptado" value={formatARS(cur.acceptedMonthlyFeeCents)} hint="Suma del abono de las suscripciones aceptadas" />
        )}
        {cur.avgTicketCents !== null && <Kpi label="Ticket promedio (Pago Único)" value={formatARS(cur.avgTicketCents)} />}
        {cur.avgDaysToClose !== null && (
          <Kpi label="Días hasta el cierre" value={formatDays(cur.avgDaysToClose)} hint="Desde que se crea la propuesta hasta que se acepta" />
        )}
      </KpiGrid>

      {statuses.length > 0 && (
        <Block title="Propuestas creadas en el período, por estado actual">
          <SimpleTable
            headers={[{ label: "Estado" }, { label: "Propuestas", right: true }]}
            rows={statuses.map((s) => [PROPOSAL_LABEL[s], String(cur.byStatus[s])])}
          />
        </Block>
      )}

      {cur.closedCount > 0 && (
        <Block title="Modelos elegidos en los cierres">
          <SimpleTable
            headers={[{ label: "Modelo" }, { label: "Cierres", right: true }]}
            rows={[
              ["Pago Único", String(cur.mix.oneTime)],
              ["Suscripción", String(cur.mix.subscription)],
            ]}
          />
        </Block>
      )}

      <Block title="Pipeline abierto" note="Hoy. Propuestas en borrador o enviadas que todavía no se decidieron.">
        <KpiGrid>
          <Kpi label="Propuestas abiertas" value={String(cur.pipeline.count)} />
          <Kpi label="Valor potencial" value={formatARS(cur.pipeline.valueCents)} hint="Precio de Pago Único" />
          {cur.pipeline.expiredCount > 0 && (
            <Kpi label="Con validez vencida" value={String(cur.pipeline.expiredCount)} hint="Pasó la fecha 'válida hasta'" tone="alert" />
          )}
        </KpiGrid>
      </Block>
    </div>
  );
}
