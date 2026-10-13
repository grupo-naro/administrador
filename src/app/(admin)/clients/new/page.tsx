import { ClientForm } from "@/components/client-form";
import { createClient } from "@/server/clients/actions";

export default function NewClientPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo cliente</h1>
      <ClientForm action={createClient} submitLabel="Crear cliente" />
    </div>
  );
}
