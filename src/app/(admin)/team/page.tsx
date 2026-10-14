import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { formatDate } from "@/domain/dates";
import { requireAdmin } from "@/lib/auth-guard";
import { changeOwnPassword, createAdminUser } from "@/server/team/actions";
import { listAdmins } from "@/server/team/queries";

export default async function TeamPage() {
  const me = await requireAdmin();
  const admins = await listAdmins();
  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Equipo</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Administradores</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <span>
                <span className="font-medium">{a.name}</span>{" "}
                <span className="text-muted-foreground">{a.email}</span>
                {a.email === me.email?.toLowerCase() && (
                  <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Vos</span>
                )}
              </span>
              <span className="text-muted-foreground">Alta {formatDate(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-medium">Agregar administrador</h2>
        <p className="text-sm text-muted-foreground">
          Tendrá los mismos permisos que vos. Se crea con una contraseña inicial que le pasás por un canal seguro; después
          puede cambiarla desde esta misma pantalla.
        </p>
        <ActionForm action={createAdminUser} submitLabel="Crear usuario" className="max-w-sm space-y-3">
          <Field label="Nombre" name="name" required />
          <Field label="Email" name="email" type="email" required />
          <Field label="Contraseña inicial (mínimo 10 caracteres)" name="password" type="password" required />
          <Field label="Repetir contraseña" name="passwordConfirm" type="password" required />
        </ActionForm>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-medium">Cambiar mi contraseña</h2>
        <ActionForm action={changeOwnPassword} submitLabel="Cambiar contraseña" className="max-w-sm space-y-3">
          <Field label="Contraseña actual" name="currentPassword" type="password" required />
          <Field label="Contraseña nueva (mínimo 10 caracteres)" name="newPassword" type="password" required />
          <Field label="Repetir contraseña nueva" name="newPasswordConfirm" type="password" required />
        </ActionForm>
      </section>
    </div>
  );
}
