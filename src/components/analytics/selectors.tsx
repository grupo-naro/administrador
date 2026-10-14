import Link from "next/link";
import { PERIOD_KEYS, PERIOD_LABEL, type PeriodKey } from "@/domain/analytics/period";
import { SECTIONS, type SectionKey } from "./sections";

const base = "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";
const on = "bg-primary text-primary-foreground";
const off = "bg-card text-foreground hover:bg-accent border";

export function PeriodSelector({ periodo, seccion }: { periodo: PeriodKey; seccion: SectionKey }) {
  return (
    <nav aria-label="Período" className="flex flex-wrap gap-2">
      {PERIOD_KEYS.map((k) => (
        <Link
          key={k}
          href={`/analytics?periodo=${k}&seccion=${seccion}`}
          aria-current={k === periodo ? "page" : undefined}
          className={`${base} ${k === periodo ? on : off}`}
        >
          {PERIOD_LABEL[k]}
        </Link>
      ))}
    </nav>
  );
}

export function SectionTabs({ periodo, seccion }: { periodo: PeriodKey; seccion: SectionKey }) {
  return (
    <nav aria-label="Sección" className="flex flex-wrap gap-1 border-b">
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={`/analytics?periodo=${periodo}&seccion=${s.key}`}
          aria-current={s.key === seccion ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            s.key === seccion ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
