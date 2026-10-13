"use client"; // Los error boundaries deben ser Client Components

import { Button } from "@/components/ui/button";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 py-12 text-center">
      <h2 className="text-xl font-semibold">Algo salió mal</h2>
      <p className="text-sm text-muted-foreground">
        No pudimos completar la operación. Probá de nuevo; si el problema sigue, revisá los registros del servidor.
      </p>
      {error.digest && <p className="text-xs text-muted-foreground">Referencia: {error.digest}</p>}
      <Button type="button" onClick={() => retry()}>
        Reintentar
      </Button>
    </div>
  );
}
