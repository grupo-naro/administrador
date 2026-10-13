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
  return (
    <div className="space-y-1">
      <Label htmlFor={p.name}>{p.label}</Label>
      <Input
        id={p.name}
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
  return (
    <div className="space-y-1">
      <Label htmlFor={p.name}>{p.label}</Label>
      <select
        id={p.name}
        name={p.name}
        defaultValue={p.defaultValue}
        className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
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
  return (
    <div className="space-y-1">
      <Label htmlFor={p.name}>{p.label}</Label>
      <Textarea id={p.name} name={p.name} defaultValue={p.defaultValue} rows={3} />
    </div>
  );
}
