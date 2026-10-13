import { ActionForm } from "@/components/action-form";
import { SelectField } from "@/components/fields";
import { formatARS } from "@/domain/money";
import { CONTRACT_LABEL, OWNER_LABEL, STAGE_LABEL } from "@/lib/labels";
import { setProjectStage } from "@/server/projects/actions";

type Props = {
  project: {
    id: string;
    name: string;
    stage: keyof typeof STAGE_LABEL;
    contractType: keyof typeof CONTRACT_LABEL;
    codeOwner: keyof typeof OWNER_LABEL;
    client: { id: string; name: string };
    totalCents: number | null;
    monthlyFeeCents: number | null;
  };
};

export function ProjectHeader({ project }: Props) {
  return (
    <header className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          {project.client.name} · {CONTRACT_LABEL[project.contractType]} · Código de:{" "}
          {OWNER_LABEL[project.codeOwner]}
          {project.totalCents ? ` · Total ${formatARS(project.totalCents)}` : ""}
          {project.monthlyFeeCents ? ` · Abono ${formatARS(project.monthlyFeeCents)}/mes` : ""}
        </p>
      </div>
      <ActionForm
        action={setProjectStage.bind(null, project.id)}
        submitLabel="Cambiar etapa"
        variant="outline"
        className="flex max-w-md items-end gap-3"
      >
        <SelectField
          label="Etapa"
          name="stage"
          defaultValue={project.stage}
          options={Object.entries(STAGE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </ActionForm>
    </header>
  );
}
