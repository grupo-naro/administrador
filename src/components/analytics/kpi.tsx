import { formatSignedARS, formatSignedPct } from "@/lib/format";

export interface Delta {
  diffCents: number;
  pct: number | null;
}

function DeltaLine({ delta, positiveIsGood }: { delta: Delta; positiveIsGood: boolean }) {
  if (delta.diffCents === 0) {
    return <p className="mt-1 text-xs text-muted-foreground">Sin cambios vs. período anterior</p>;
  }
  const good = delta.diffCents > 0 === positiveIsGood;
  return (
    <p className={`mt-1 text-xs ${good ? "text-emerald-700" : "text-red-700"}`}>
      {formatSignedARS(delta.diffCents)}
      {delta.pct !== null && ` (${formatSignedPct(delta.pct)})`} vs. período anterior
    </p>
  );
}

/** Tarjeta de indicador. `tone="alert"` pinta el valor en rojo (por ejemplo un balance negativo). */
export function Kpi({
  label,
  value,
  hint,
  delta,
  positiveIsGood = true,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: Delta;
  positiveIsGood?: boolean;
  tone?: "alert";
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${tone === "alert" ? "text-red-700" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {delta && <DeltaLine delta={delta} positiveIsGood={positiveIsGood} />}
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
