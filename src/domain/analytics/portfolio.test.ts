import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { clientsSummary, projectsSummary, type PortfolioClient, type PortfolioProject } from "./portfolio";

const from = d("2026-10-01");
const to = d("2026-11-01");

const proj = (over: Partial<PortfolioProject> & Pick<PortfolioProject, "clientId" | "stage" | "createdAt">): PortfolioProject => ({
  contractType: "PAGO_UNICO",
  totalCents: null,
  monthlyFeeCents: null,
  startedAt: null,
  deliveredAt: null,
  activeRecurring: false,
  ...over,
});

const projects: PortfolioProject[] = [
  proj({ clientId: "c1", stage: "EN_DESARROLLO", createdAt: d("2026-10-02"), totalCents: 1000, startedAt: d("2026-10-03") }),
  proj({ clientId: "c1", stage: "ENTREGADO", createdAt: d("2026-08-01"), totalCents: 500, startedAt: d("2026-08-10"), deliveredAt: d("2026-10-05") }),
  proj({ clientId: "c2", stage: "EN_MANTENIMIENTO", createdAt: d("2026-01-01"), totalCents: 300, startedAt: d("2026-01-10"), deliveredAt: d("2026-02-01") }),
  proj({ clientId: "c3", stage: "EN_DESARROLLO", contractType: "SUSCRIPCION", monthlyFeeCents: 40, createdAt: d("2026-10-12"), activeRecurring: true }),
  proj({ clientId: "c4", stage: "COTIZACION", createdAt: d("2026-09-01"), totalCents: 200 }),
];

describe("projectsSummary", () => {
  it("cantidad, contratado y abono mensual por etapa (todas las etapas, en orden)", () => {
    const s = projectsSummary(projects, from, to);
    expect(s.byStage.map((x) => [x.stage, x.count, x.contractedCents, x.monthlyCents])).toEqual([
      ["COTIZACION", 1, 200, 0],
      ["EN_DESARROLLO", 2, 1000, 40],
      ["ENTREGADO", 1, 500, 0],
      ["EN_MANTENIMIENTO", 1, 300, 0],
    ]);
  });

  it("nuevos y entregados del período y duración promedio del desarrollo", () => {
    const s = projectsSummary(projects, from, to);
    expect(s.created).toBe(2);
    expect(s.delivered).toBe(1);
    expect(s.avgDevDays).toBe(56); // 10/08 → 05/10
  });

  it("sin entregas en el período no hay duración promedio; sin proyectos todo en cero", () => {
    expect(projectsSummary(projects, d("2025-01-01"), d("2025-02-01")).avgDevDays).toBeNull();
    const empty = projectsSummary([], from, to);
    expect(empty.created).toBe(0);
    expect(empty.delivered).toBe(0);
    expect(empty.avgDevDays).toBeNull();
    expect(empty.byStage.every((x) => x.count === 0)).toBe(true);
  });
});

describe("clientsSummary", () => {
  const clients: PortfolioClient[] = [
    { id: "c1", name: "Ana", createdAt: d("2026-01-05"), collectedCents: 900 },
    { id: "c2", name: "Beto", createdAt: d("2026-10-03"), collectedCents: 300 },
    { id: "c3", name: "Cami", createdAt: d("2026-10-12"), collectedCents: 0 },
    { id: "c4", name: "Dani", createdAt: d("2026-02-01"), collectedCents: 50 },
    { id: "c5", name: "Eli", createdAt: d("2026-03-01"), collectedCents: 0 },
  ];

  it("totales, nuevos, con trabajo en curso y ranking por cobrado histórico", () => {
    const s = clientsSummary(clients, projects, from, to);
    expect(s.total).toBe(5);
    expect(s.newInPeriod).toBe(2);
    expect(s.withActiveWork).toBe(3); // c1 (desarrollo), c2 (mantenimiento), c3 (suscripción activa)
    expect(s.top).toEqual([
      { id: "c1", name: "Ana", cents: 900 },
      { id: "c2", name: "Beto", cents: 300 },
      { id: "c4", name: "Dani", cents: 50 },
    ]);
  });

  it("sin clientes todo en cero", () => {
    expect(clientsSummary([], [], from, to)).toEqual({ total: 0, newInPeriod: 0, withActiveWork: 0, top: [] });
  });

  it("el ranking se limita a 10", () => {
    const many = Array.from({ length: 12 }, (_, i): PortfolioClient => ({ id: `x${i}`, name: `N${i}`, createdAt: d("2026-01-01"), collectedCents: i + 1 }));
    expect(clientsSummary(many, [], from, to).top).toHaveLength(10);
  });
});
