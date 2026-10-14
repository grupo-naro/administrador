import type { buildPortfolio } from "@/domain/analytics/build";
import { formatARS } from "@/domain/money";
import { STAGE_LABEL } from "@/lib/labels";
import { formatDays } from "@/lib/format";
import { Block } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildPortfolio>;

export function PortfolioSection({ d }: { d: Data }) {
  const { projects: p, previousProjects: pp, clients: c } = d;
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="Proyectos nuevos" value={String(p.created)} hint={`Período anterior: ${pp.created}`} />
        <Kpi label="Proyectos entregados" value={String(p.delivered)} hint={`Período anterior: ${pp.delivered}`} />
        {p.avgDevDays !== null && <Kpi label="Duración del desarrollo" value={formatDays(p.avgDevDays)} hint="Promedio de los entregados en el período" />}
        <Kpi label="Clientes" value={String(c.total)} hint="Hoy" />
        <Kpi label="Clientes nuevos" value={String(c.newInPeriod)} hint="Dados de alta en el período" />
        <Kpi label="Clientes con trabajo en curso" value={String(c.withActiveWork)} hint="Hoy · en desarrollo, mantenimiento o suscripción activa" />
      </KpiGrid>

      <Block title="Proyectos por etapa" note="Hoy. El contratado suma los Pagos Únicos; el abono mensual, las suscripciones.">
        <SimpleTable
          headers={[
            { label: "Etapa" },
            { label: "Proyectos", right: true },
            { label: "Contratado (únicos)", right: true },
            { label: "Abono mensual", right: true },
          ]}
          rows={p.byStage.map((s) => [
            STAGE_LABEL[s.stage],
            String(s.count),
            s.contractedCents > 0 ? formatARS(s.contractedCents) : "—",
            s.monthlyCents > 0 ? formatARS(s.monthlyCents) : "—",
          ])}
        />
      </Block>

      <Block title="Clientes que más aportaron" note="Cobrado acumulado histórico (top 10).">
        <SimpleTable
          headers={[{ label: "Cliente" }, { label: "Cobrado acumulado", right: true }]}
          rows={c.top.map((t) => [t.name, formatARS(t.cents)])}
          empty="Todavía no hay cobros registrados."
        />
      </Block>
    </div>
  );
}
