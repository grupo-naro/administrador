import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { toDateInput, todayAR, formatDate } from "@/domain/dates";
import { installmentLabel } from "@/domain/labels";
import { formatARS } from "@/domain/money";
import { PAYMENT_METHODS, PLAN_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/labels";
import type { InstallmentRow, PlanRow } from "@/server/billing/queries";
import {
  createDevelopmentPlan,
  createSubscriptionPlan,
  deletePayment,
  registerPayment,
  updateInstallment,
} from "@/server/billing/actions";
import { setProjectStage } from "@/server/projects/actions";

export interface BillingProject {
  id: string;
  contractType: "PAGO_UNICO" | "SUSCRIPCION";
  stage: "COTIZACION" | "EN_DESARROLLO" | "ENTREGADO" | "EN_MANTENIMIENTO";
  totalCents: number | null;
  monthlyFeeCents: number | null;
  firstPaymentCents: number | null;
}

const centsToInput = (c: number | null) => (c ? c / 100 : undefined);

function InstallmentRowView({ i }: { i: InstallmentRow }) {
  const remaining = i.amountCents - i.paidCents;
  return (
    <tr className="border-t align-top">
      <td className="p-2">{installmentLabel(i.type, i.sequence)}</td>
      <td className="p-2">{formatDate(i.dueDate)}</td>
      <td className="p-2 text-right">{formatARS(i.amountCents)}</td>
      <td className="p-2 text-right">{formatARS(i.paidCents)}</td>
      <td className="p-2">
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[i.status]}`}>{STATUS_LABEL[i.status]}</span>
      </td>
      <td className="space-y-2 p-2">
        {i.payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
            <span>
              {formatDate(p.paidAt)} · {formatARS(p.amountCents)} · {p.method}
              {p.receiptNote ? ` · ${p.receiptNote}` : ""}
            </span>
            <ActionForm action={deletePayment.bind(null, p.id)} submitLabel="Quitar" variant="outline" className="shrink-0" />
          </div>
        ))}
        {remaining > 0 && (
          <details>
            <summary className="cursor-pointer text-sm underline">Registrar pago</summary>
            <ActionForm action={registerPayment.bind(null, i.id)} submitLabel="Registrar pago" className="mt-2 space-y-2">
              <Field label="Monto (ARS)" name="amount" type="number" step="0.01" defaultValue={remaining / 100} required />
              <Field label="Fecha de pago" name="paidAt" type="date" defaultValue={toDateInput(todayAR())} required />
              <SelectField label="Método" name="method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
              <Field label="Comprobante / nota" name="receiptNote" />
            </ActionForm>
          </details>
        )}
        {i.paidCents === 0 && (
          <details>
            <summary className="cursor-pointer text-sm underline">Editar cuota</summary>
            <ActionForm action={updateInstallment.bind(null, i.id)} submitLabel="Guardar cuota" className="mt-2 space-y-2">
              <Field label="Monto (ARS)" name="amount" type="number" step="0.01" defaultValue={i.amountCents / 100} required />
              <Field label="Vencimiento" name="dueDate" type="date" defaultValue={toDateInput(i.dueDate)} required />
            </ActionForm>
          </details>
        )}
      </td>
    </tr>
  );
}

export function BillingSection({ project, plans }: { project: BillingProject; plans: PlanRow[] }) {
  const hasDev = plans.some((p) => p.kind === "DESARROLLO");
  const hasSub = plans.some((p) => p.kind === "SUSCRIPCION");
  const dev = plans.find((p) => p.kind === "DESARROLLO");
  const anticipoPaid = dev?.installments.find((i) => i.type === "ANTICIPO")?.status === "PAGADO";

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Cobros</h2>

      {project.stage === "COTIZACION" && anticipoPaid && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm">
          <span>Anticipo cobrado: ya se puede iniciar el desarrollo.</span>
          <ActionForm action={setProjectStage.bind(null, project.id)} submitLabel="Pasar a En Desarrollo" className="flex items-center gap-2">
            <input type="hidden" name="stage" value="EN_DESARROLLO" />
          </ActionForm>
        </div>
      )}

      {project.contractType === "PAGO_UNICO" && !hasDev && (
        <div className="max-w-md space-y-2 rounded-md border p-4">
          <h3 className="font-medium">Crear plan de cobros (50% anticipo + cuotas)</h3>
          <ActionForm action={createDevelopmentPlan.bind(null, project.id)} submitLabel="Crear plan">
            <Field label="Total (ARS)" name="total" type="number" step="0.01" defaultValue={centsToInput(project.totalCents)} required />
            <SelectField label="Cuotas del 50% restante" name="count" options={[{ value: "2", label: "2 cuotas" }, { value: "3", label: "3 cuotas" }]} />
            <Field label="Fecha del anticipo" name="startDate" type="date" defaultValue={toDateInput(todayAR())} required />
          </ActionForm>
        </div>
      )}

      {project.contractType === "SUSCRIPCION" && !hasSub && (
        <div className="max-w-md space-y-2 rounded-md border p-4">
          <h3 className="font-medium">Crear plan de suscripción (6 cuotas)</h3>
          <ActionForm action={createSubscriptionPlan.bind(null, project.id)} submitLabel="Crear plan">
            <Field label="Abono mensual (ARS)" name="monthlyFee" type="number" step="0.01" defaultValue={centsToInput(project.monthlyFeeCents)} required />
            <Field label="Primer pago (ARS)" name="firstPayment" type="number" step="0.01" defaultValue={centsToInput(project.firstPaymentCents)} required />
            <Field label="Vencimiento del primer pago" name="firstDueDate" type="date" defaultValue={toDateInput(todayAR())} required />
          </ActionForm>
        </div>
      )}

      {plans.map((plan) => (
        <div key={plan.id} className="space-y-2">
          <h3 className="text-lg font-medium">{PLAN_LABEL[plan.kind]}</h3>
          <p className="text-sm text-muted-foreground">
            Total {formatARS(plan.summary.totalCents)} · Abonado {formatARS(plan.summary.paidCents)} · Saldo{" "}
            {formatARS(plan.summary.pendingCents)}
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2">Cuota</th>
                  <th className="p-2">Vence</th>
                  <th className="p-2 text-right">Monto</th>
                  <th className="p-2 text-right">Pagado</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {plan.installments.map((i) => (
                  <InstallmentRowView key={i.id} i={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
