export const SECTIONS = [
  { key: "finanzas", label: "Finanzas" },
  { key: "cobranza", label: "Cobranza" },
  { key: "recurrente", label: "Recurrente" },
  { key: "ventas", label: "Ventas" },
  { key: "proyectos", label: "Proyectos y clientes" },
  { key: "infra", label: "Infraestructura" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export const parseSectionKey = (value: string | undefined): SectionKey =>
  SECTIONS.find((s) => s.key === value)?.key ?? "finanzas";
