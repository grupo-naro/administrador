import Link from "next/link";
import { connection } from "next/server";
import { formatDate } from "@/domain/dates";
import { formatARS } from "@/lib/privacy";
import { getDashboard } from "@/server/dashboard/queries";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { initPrivacy } from "@/lib/privacy";

// El panel lee la hora y la base en cada visita: la ruta bloquea en el servidor (opt-out documentado de Next 16).
export const instant = false;

function AlertList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "red" | "amber";
  items: { id: string; label: string; date: Date; amount?: number; href: string }[];
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className={`mb-2 font-medium ${tone === "red" ? "text-red-700" : "text-amber-700"}`}>
        {title} ({items.length})
      </h3>
      <ul className="space-y-1 text-sm">
        {items.length === 0 && <li className="text-muted-foreground">Nada por ahora.</li>}
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <Link href={i.href} className="underline">{i.label}</Link>
            <span>
              {formatDate(i.date)}
              {i.amount !== undefined ? ` · ${formatARS(i.amount)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function DashboardPage() {
  await connection();
  const hidden = await initPrivacy();
  const d = await getDashboard();
  const cuota = (x: (typeof d.overdue)[number]) => ({
    id: x.id, label: x.label, date: x.dueDate, amount: x.amountCents - x.paidCents, href: `/projects/${x.projectId}`,
  });
  const renewal = (x: (typeof d.renewals.expired)[number]) => ({
    id: x.id, label: x.label, date: x.renewalDate, href: `/projects/${x.projectId}`,
  });
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <PrivacyToggle hidden={hidden} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium first-letter:uppercase">{d.months[0].label}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Facturado del mes</p>
            <p className="text-2xl font-semibold">{formatARS(d.thisMonth.collected.totalCents)}</p>
            <p className="text-xs text-muted-foreground">Dinero que ya entró este mes</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Estimado a cobrar</p>
            <p className="text-2xl font-semibold">{formatARS(d.thisMonth.expected.totalCents)}</p>
            <p className="text-xs text-muted-foreground">Cuotas del mes que todavía no entraron</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Proyectos únicos {formatARS(d.thisMonth.expected.oneTimeCents)}
              {d.thisMonth.expected.recurringCents > 0 && (
                <>
                  <br />
                  Recurrentes {formatARS(d.thisMonth.expected.recurringCents)}
                </>
              )}
            </p>
          </div>
          {d.thisMonth.collected.subscriptionCents > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Suscripciones facturadas</p>
              <p className="text-2xl font-semibold">{formatARS(d.thisMonth.collected.subscriptionCents)}</p>
              <p className="text-xs text-muted-foreground">Cobrado este mes en suscripciones</p>
            </div>
          )}
          {d.thisMonth.collected.maintenanceCents > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Mantenimiento facturado</p>
              <p className="text-2xl font-semibold">{formatARS(d.thisMonth.collected.maintenanceCents)}</p>
              <p className="text-xs text-muted-foreground">Cobrado este mes en mantenimientos</p>
            </div>
          )}
        </div>
      </section>

      {d.mrr.totalCents > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Ingreso mensual recurrente (MRR)</p>
          <p className="text-xl font-semibold">{formatARS(d.mrr.totalCents)}</p>
          <p className="text-xs text-muted-foreground">
            {[
              d.mrr.subscriptionCents > 0 && `Suscripciones activas ${formatARS(d.mrr.subscriptionCents)}`,
              d.mrr.maintenanceCents > 0 && `Mantenimientos activos ${formatARS(d.mrr.maintenanceCents)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Ingresos reales vs. proyectados</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr><th className="p-2">Mes</th><th className="p-2 text-right">Real (cobrado)</th><th className="p-2 text-right">Proyectado (vence)</th></tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.label} className="border-t">
                  <td className="p-2 first-letter:uppercase">{m.label}</td>
                  <td className="p-2 text-right">{formatARS(m.realCents)}</td>
                  <td className="p-2 text-right">{formatARS(m.projectedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <AlertList title="Cuotas vencidas" tone="red" items={d.overdue.map(cuota)} />
        <AlertList title="Cuotas por vencer (7 días)" tone="amber" items={d.upcoming.map(cuota)} />
        <AlertList title="Renovaciones vencidas" tone="red" items={d.renewals.expired.map(renewal)} />
        <AlertList title="Renovaciones próximas (30 días)" tone="amber" items={d.renewals.upcoming.map(renewal)} />
      </section>
    </div>
  );
}
