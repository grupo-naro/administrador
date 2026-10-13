"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/form";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  submitLabel = "Guardar",
  variant = "default",
  className,
  children,
}: {
  action: Action;
  submitLabel?: string;
  variant?: "default" | "outline" | "destructive";
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="break-all text-sm text-green-700">
          {state.message}
        </p>
      )}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Procesando…" : submitLabel}
      </Button>
    </form>
  );
}
