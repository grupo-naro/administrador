import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { loginAction } from "./actions";

export const metadata = { title: "Ingresar — Grupo Naro", robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Grupo Naro</h1>
      <ActionForm action={loginAction} submitLabel="Ingresar">
        <Field label="Email" name="email" type="email" required />
        <Field label="Contraseña" name="password" type="password" required />
      </ActionForm>
    </main>
  );
}
