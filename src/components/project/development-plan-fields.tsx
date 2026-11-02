"use client";

import { useId, useState } from "react";
import { Field, IntervalFields, SelectField } from "@/components/fields";
import { Label } from "@/components/ui/label";
import type { DevelopmentScheme } from "@/domain/installments";
import { SCHEME_LABEL } from "@/lib/labels";

const SCHEMES = Object.keys(SCHEME_LABEL) as DevelopmentScheme[];

/**
 * Campos del plan de desarrollo según la forma de pago. Solo se muestran (y se envían) los campos que aplican
 * a la forma elegida; el servidor igual ignora los que no corresponden.
 */
export function DevelopmentPlanFields(p: {
  defaultScheme?: DevelopmentScheme;
  defaultTotal?: number;
  defaultStartDate: string;
  defaultDeliveryDate?: string;
  /** Texto de ayuda bajo la fecha del anticipo (p. ej. en el cambio de forma de pago). */
  startDateHint?: string;
}) {
  const id = useId();
  const [scheme, setScheme] = useState<DevelopmentScheme>(p.defaultScheme ?? "ANTICIPO_CUOTAS");
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={id}>Forma de pago</Label>
        <select
          id={id}
          name="scheme"
          value={scheme}
          onChange={(e) => setScheme(e.target.value as DevelopmentScheme)}
          className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm"
        >
          {SCHEMES.map((s) => (
            <option key={s} value={s}>
              {SCHEME_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <Field label="Total (ARS)" name="total" type="number" step="0.01" defaultValue={p.defaultTotal} required />
      <Field
        label={scheme === "CONTADO" ? "Fecha de pago" : "Fecha del anticipo"}
        name="startDate"
        type="date"
        defaultValue={p.defaultStartDate}
        required
      />
      {p.startDateHint && scheme !== "CONTADO" && <p className="text-xs text-muted-foreground">{p.startDateHint}</p>}
      {scheme === "ANTICIPO_CUOTAS" && (
        <>
          <SelectField
            label="Cuotas del 50% restante"
            name="count"
            options={[
              { value: "2", label: "2 cuotas" },
              { value: "3", label: "3 cuotas" },
            ]}
          />
          <IntervalFields legend="Vencimiento de las cuotas" />
        </>
      )}
      {scheme === "MITAD_ENTREGA" && (
        <>
          <Field
            label="Fecha estimada de entrega"
            name="deliveryDate"
            type="date"
            defaultValue={p.defaultDeliveryDate}
            required
          />
          <p className="text-xs text-muted-foreground">
            El saldo vence en esta fecha. Al pasar el proyecto a Entregado, pasa a vencer ese día. Si la entrega se demora,
            actualizá la fecha con Editar cuota.
          </p>
        </>
      )}
    </>
  );
}
