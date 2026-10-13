import Link from "next/link";
import { connection } from "next/server";
import { formatDate } from "@/domain/dates";
import { formatARS } from "@/domain/money";
import { getDashboard } from "@/server/dashboard/queries";

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
    <div className="rounded-md border p-4">
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
  const d = await getDashboard();
  const cuota = (x: (typeof d.overdue)[number]) => ({
    id: x.id, label: x.label, date: x.dueDate, amount: x.amountCents - x.paidCents, href: `/projects/${x.projectId}`,
  });
  const renewal = (x: (typeof d.renewals.expired)[number]) => ({
    id: x.id, label: x.label, date: x.renewalDate, href: `/projects/${x.projectId}`,
  });
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">MRR total</p>
          <p className="text-2xl font-semibold">{formatARS(d.mrr.totalCents)}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Suscripciones activas</p>
          <p className="text-xl font-semibold">{formatARS(d.mrr.subscriptionCents)}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Mantenimientos activos</p>
          <p className="text-xl font-semibold">{formatARS(d.mrr.maintenanceCents)}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Ingresos reales vs. proyectados</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr><th className="p-2">Mes</th><th className="p-2 text-right">Real (cobrado)</th><th className="p-2 text-right">Proyectado (vence)</th></tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.label} className="border-t">
                  <td className="p-2 capitalize">{m.label}</td>
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
