import Link from "next/link";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clientes" },
  { href: "/proposals", label: "Propuestas" },
  { href: "/projects", label: "Proyectos" },
  { href: "/infrastructure", label: "Infraestructura" },
];

export function AdminNav({ email }: { email: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-4 border-b p-4 md:h-screen md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0">
      <span className="text-lg font-semibold">Grupo Naro</span>
      <div className="flex flex-wrap gap-3 md:flex-col">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm hover:underline">
            {l.label}
          </Link>
        ))}
      </div>
      <form
        className="ml-auto md:mt-auto md:ml-0"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <p className="mb-2 hidden truncate text-xs text-muted-foreground md:block">{email}</p>
        <Button variant="outline" size="sm" type="submit">
          Salir
        </Button>
      </form>
    </nav>
  );
}
