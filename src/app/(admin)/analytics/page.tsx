import { connection } from "next/server";
import { buildCollections, buildFinance, buildRecurring } from "@/domain/analytics/build";
import type { Facts } from "@/domain/analytics/facts";
import { parsePeriodKey, type PeriodKey } from "@/domain/analytics/period";
import { loadFacts } from "@/server/analytics/queries";
import { CollectionsSection } from "@/components/analytics/collections-section";
import { FinanceSection } from "@/components/analytics/finance-section";
import { RecurringSection } from "@/components/analytics/recurring-section";
import { EmptyNote } from "@/components/analytics/block";
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
    default:
      return <EmptyNote>Esta pestaña todavía no está disponible.</EmptyNote>;
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
  const facts = await loadFacts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Analíticas</h1>
      <PeriodSelector periodo={periodo} seccion={seccion} />
      <SectionTabs periodo={periodo} seccion={seccion} />
      {renderSection(seccion, periodo, facts)}
    </div>
  );
}
