import { connection } from "next/server";
import { buildFinance } from "@/domain/analytics/build";
import { parsePeriodKey } from "@/domain/analytics/period";
import { loadFacts } from "@/server/analytics/queries";
import { FinanceSection } from "@/components/analytics/finance-section";
import { EmptyNote } from "@/components/analytics/block";
import { PeriodSelector, SectionTabs } from "@/components/analytics/selectors";
import { parseSectionKey } from "@/components/analytics/sections";

// Lee la base y la hora en cada visita: la ruta bloquea en el servidor (opt-out documentado de Next 16).
export const instant = false;
export const metadata = { title: "Analíticas — Grupo Naro" };

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
      {seccion === "finanzas" ? (
        <FinanceSection d={buildFinance(facts, periodo)} />
      ) : (
        <EmptyNote>Esta pestaña todavía no está disponible.</EmptyNote>
      )}
    </div>
  );
}
