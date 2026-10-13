import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate } from "@/domain/dates";
import { formatARS } from "@/domain/money";
import { PLAN_LABEL, STAGE_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/labels";
import { getPortalViewByToken } from "@/server/portal/queries";

export const instant = false;
export const metadata: Metadata = {
  title: "Estado de tu proyecto",
  robots: { index: false, follow: false },
};

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  // El rate limit por IP y el 404 HTTP real ante tokens inválidos se resuelven en src/proxy.ts
  // (server/portal/gate.ts), antes de que empiece el streaming. Esto es la segunda línea de defensa.
  const { token } = await params;

  const view = await getPortalViewByToken(token);
  if (!view) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-8">
      <header>
        <p className="text-sm text-muted-foreground">{view.clientName}</p>
        <h1 className="text-2xl font-semibold">{view.projectName}</h1>
        <p className="mt-1 text-sm">
          Estado del proyecto: <strong>{STAGE_LABEL[view.stage as keyof typeof STAGE_LABEL] ?? view.stage}</strong>
        </p>
      </header>

      {view.plans.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay un plan de pagos cargado.</p>
      )}

      {view.plans.map((plan) => (
        <section key={plan.kind} className="space-y-4">
          <h2 className="text-lg font-semibold">{PLAN_LABEL[plan.kind]}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total abonado</p>
              <p className="font-semibold">{formatARS(plan.paidCents)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Saldo pendiente</p>
              <p className="font-semibold">{formatARS(plan.pendingCents)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold">{formatARS(plan.totalCents)}</p>
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium">Cuotas pendientes</h3>
            <ul className="divide-y rounded-md border text-sm">
              {plan.pending.length === 0 && <li className="p-3 text-muted-foreground">No hay cuotas pendientes.</li>}
              {plan.pending.map((p, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span>
                    {p.label} · vence {formatDate(p.dueDate)}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatARS(p.remainingCents)}
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium">Historial de pagos</h3>
            <ul className="divide-y rounded-md border text-sm">
              {plan.payments.length === 0 && (
                <li className="p-3 text-muted-foreground">Todavía no hay pagos registrados.</li>
              )}
              {plan.payments.map((p, i) => (
                <li key={i} className="flex justify-between gap-2 p-3">
                  <span>
                    {formatDate(p.paidAt)} · {p.label}
                  </span>
                  <span>{formatARS(p.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </main>
  );
}
