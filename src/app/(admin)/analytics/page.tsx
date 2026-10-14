import { connection } from "next/server";
import {
  buildCollections,
  buildFinance,
  buildInfra,
  buildPortfolio,
  buildRecurring,
  buildSales,
} from "@/domain/analytics/build";
import type { Facts } from "@/domain/analytics/facts";
import { parsePeriodKey, type PeriodKey } from "@/domain/analytics/period";
import { loadFacts } from "@/server/analytics/queries";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { initPrivacy } from "@/lib/privacy";
import { CollectionsSection } from "@/components/analytics/collections-section";
import { FinanceSection } from "@/components/analytics/finance-section";
import { RecurringSection } from "@/components/analytics/recurring-section";
import { InfraAnalyticsSection } from "@/components/analytics/infra-section";
import { PortfolioSection } from "@/components/analytics/portfolio-section";
import { SalesSection } from "@/components/analytics/sales-section";
import { PeriodSelector, SectionTabs } from "@/components/analytics/selectors";
import { parseSectionKey, type SectionKey } from "@/components/analytics/sections";

// Lee la base y la hora en cada visita: la ruta bloquea en el servidor (opt-out documentado de Next 16).
export const instant = false;
export const metadata = { title: "Analíticas — Grupo Naro" };

function renderSection(seccion: SectionKey, periodo: PeriodKey, facts: Facts) {
  switch (seccion) {
    case "finanzas":
      return <FinanceSection d={buildFinance(facts, periodo)} />;
    case "cobranza":
      return <CollectionsSection d={buildCollections(facts, periodo)} />;
    case "recurrente":
      return <RecurringSection d={buildRecurring(facts, periodo)} />;
    case "ventas":
      return <SalesSection d={buildSales(facts, periodo)} />;
    case "proyectos":
      return <PortfolioSection d={buildPortfolio(facts, periodo)} />;
    case "infra":
      return <InfraAnalyticsSection d={buildInfra(facts)} />;
  }
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; seccion?: string }>;
}) {
  await connection();
  const sp = await searchParams;
  const periodo = parsePeriodKey(sp.periodo);
  const seccion = parseSectionKey(sp.seccion);
  const hidden = await initPrivacy();
  const facts = await loadFacts();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Analíticas</h1>
        <PrivacyToggle hidden={hidden} />
      </div>
      <PeriodSelector periodo={periodo} seccion={seccion} />
      <SectionTabs periodo={periodo} seccion={seccion} />
      {renderSection(seccion, periodo, facts)}
    </div>
  );
}
