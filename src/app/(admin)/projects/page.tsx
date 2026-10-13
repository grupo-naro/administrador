import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CONTRACT_LABEL, STAGE_LABEL } from "@/lib/labels";
import { listProjects } from "@/server/projects/queries";

const STAGES = Object.keys(STAGE_LABEL) as (keyof typeof STAGE_LABEL)[];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const { stage } = await searchParams;
  const active = STAGES.find((s) => s === stage);
  const projects = await listProjects(active);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Proyectos</h1>
        <Button render={<Link href="/projects/new" />}>Nuevo proyecto</Button>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/projects" className={!active ? "font-semibold underline" : ""}>Todos</Link>
        {STAGES.map((s) => (
          <Link key={s} href={`/projects?stage=${s}`} className={active === s ? "font-semibold underline" : ""}>
            {STAGE_LABEL[s]}
          </Link>
        ))}
      </div>
      <ul className="divide-y rounded-md border">
        {projects.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin proyectos.</li>}
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="flex flex-wrap justify-between gap-2 p-4 hover:bg-muted">
              <span>
                {p.name} <span className="text-sm text-muted-foreground">— {p.client.name}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {CONTRACT_LABEL[p.contractType]} · {STAGE_LABEL[p.stage]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
