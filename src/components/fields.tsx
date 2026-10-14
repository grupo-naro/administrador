"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function Field(p: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  placeholder?: string;
  step?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{p.label}</Label>
      <Input
        id={id}
        name={p.name}
        type={p.type ?? "text"}
        defaultValue={p.defaultValue}
        required={p.required}
        placeholder={p.placeholder}
        step={p.step}
      />
    </div>
  );
}

export function SelectField(p: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{p.label}</Label>
      <select
        id={id}
        name={p.name}
        defaultValue={p.defaultValue}
        className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm"
      >
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextAreaField(p: { label: string; name: string; defaultValue?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{p.label}</Label>
      <Textarea id={id} name={p.name} defaultValue={p.defaultValue} rows={3} />
    </div>
  );
}

/** Casilla obligatoria para acciones destructivas: envía confirm=si (el servidor lo vuelve a validar). */
export function ConfirmCheckbox({ warning, label = "Entiendo y quiero continuar" }: { warning: string; label?: string }) {
  const id = useId();
  return (
    <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
      <p>{warning}</p>
      <label htmlFor={id} className="flex items-center gap-2 font-medium">
        <input id={id} type="checkbox" name="confirm" value="si" required />
        {label}
      </label>
    </div>
  );
}

/** "Cada [N] [días | semanas | meses]": frecuencia entre cuotas. Los nombres de campo son `every` y `unit`. */
export function IntervalFields({ legend = "Frecuencia de las cuotas" }: { legend?: string }) {
  const id = useId();
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex items-center gap-2">
        <Label htmlFor={`${id}-every`} className="text-muted-foreground">
          Cada
        </Label>
        <Input id={`${id}-every`} name="every" type="number" min={1} step={1} defaultValue={1} required className="w-20" />
        <select
          name="unit"
          defaultValue="meses"
          aria-label="Unidad de la frecuencia"
          className="h-9 rounded-lg border bg-transparent px-3 text-sm"
        >
          <option value="dias">días</option>
          <option value="semanas">semanas</option>
          <option value="meses">meses</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">Ej.: cada 15 días, cada 1 semana o cada 1 mes.</p>
    </fieldset>
  );
}
