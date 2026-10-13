import { notFound } from "next/navigation";
import { ProjectHeader } from "@/components/project/project-header";
import { getProject } from "@/server/projects/queries";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return (
    <div className="space-y-8">
      <ProjectHeader project={project} />
      {/* BillingSection (Task 11) · InfraSection (Task 13) · PortalSection (Task 15) */}
    </div>
  );
}
