import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { Logo } from "@/components/logo";
import { loginAction } from "./actions";

export const metadata = { title: "Ingresar — Grupo Naro", robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="brand-glow flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Logo className="text-xl" />
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Ingresar al panel</h1>
          <p className="text-sm text-muted-foreground">Acceso solo para el equipo de Grupo Naro.</p>
        </div>
        <ActionForm action={loginAction} submitLabel="Ingresar" className="space-y-4" submitClassName="h-10 w-full text-sm">
          <Field label="Email" name="email" type="email" required />
          <Field label="Contraseña" name="password" type="password" required />
        </ActionForm>
      </div>
    </main>
  );
}
