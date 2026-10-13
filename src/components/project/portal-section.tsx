import { ActionForm } from "@/components/action-form";
import { formatDate } from "@/domain/dates";
import { generatePortalToken, revokePortalToken } from "@/server/portal/actions";

export function PortalSection({
  projectId,
  tokens,
}: {
  projectId: string;
  tokens: { id: string; createdAt: Date; lastViewedAt: Date | null }[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Enlace para el cliente</h2>
      {tokens.length === 0 && <p className="text-sm text-muted-foreground">No hay un enlace activo.</p>}
      {tokens.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span>
            Activo desde {formatDate(t.createdAt)} ·{" "}
            {t.lastViewedAt ? `visto por última vez ${formatDate(t.lastViewedAt)}` : "nunca visto"}
          </span>
          <ActionForm action={revokePortalToken.bind(null, t.id)} submitLabel="Revocar" variant="outline" className="" />
        </div>
      ))}
      <ActionForm
        action={generatePortalToken.bind(null, projectId)}
        submitLabel={tokens.length ? "Regenerar enlace (revoca el anterior)" : "Generar enlace"}
      />
    </section>
  );
}
