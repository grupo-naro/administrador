import { notFound } from "next/navigation";
import { BillingSection } from "@/components/project/billing-section";
import { InfraSection } from "@/components/project/infra-section";
import { PortalSection } from "@/components/project/portal-section";
import { ProjectHeader } from "@/components/project/project-header";
import { getProjectBilling } from "@/server/billing/queries";
import { getProject } from "@/server/projects/queries";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const plans = await getProjectBilling(id);
  return (
    <div className="space-y-8">
      <ProjectHeader project={project} />
      <BillingSection
        project={{
          id: project.id,
          contractType: project.contractType,
          stage: project.stage,
          totalCents: project.totalCents,
          monthlyFeeCents: project.monthlyFeeCents,
          firstPaymentCents: project.firstPaymentCents,
          maintenanceActive: plans.some((p) => p.kind === "MANTENIMIENTO") && !project.maintenanceEndedAt,
          maintenanceEnded: plans.some((p) => p.kind === "MANTENIMIENTO") && !!project.maintenanceEndedAt,
          maintenanceFeeCents: project.maintenanceFeeCents,
          serviceSuspended: project.serviceSuspended,
        }}
        plans={plans}
      />
      <InfraSection projectId={project.id} assets={project.assets} />
      <PortalSection projectId={project.id} 
        tokens={project.tokens.map((t) => ({ id: t.id, createdAt: t.createdAt, lastViewedAt: t.lastViewedAt }))}
      />
    </div>
  );
}
