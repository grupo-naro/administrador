import { signOut } from "@/auth";
import { Logo } from "@/components/logo";
import { NavLink } from "@/components/nav-link";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/analytics", label: "Analíticas" },
  { href: "/clients", label: "Clientes" },
  { href: "/proposals", label: "Propuestas" },
  { href: "/projects", label: "Proyectos" },
  { href: "/infrastructure", label: "Infraestructura" },
  { href: "/team", label: "Equipo" },
];

export function AdminNav({ email }: { email: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 bg-sidebar px-4 py-3 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:flex-col md:items-stretch md:gap-6 md:border-r md:border-sidebar-border md:px-4 md:py-6">
      <Logo tone="light" className="text-sidebar-foreground md:px-2" />
      <div className="flex flex-wrap gap-1 md:flex-col">
        {links.map((l) => (
          <NavLink key={l.href} href={l.href}>
            {l.label}
          </NavLink>
        ))}
      </div>
      <form
        className="ml-auto md:mt-auto md:ml-0 md:border-t md:border-sidebar-border md:pt-4"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <p className="mb-2 hidden truncate px-2 text-xs text-sidebar-foreground/60 md:block">{email}</p>
        <Button
          variant="outline"
          size="sm"
          type="submit"
          className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:w-full"
        >
          Salir
        </Button>
      </form>
    </nav>
  );
}
