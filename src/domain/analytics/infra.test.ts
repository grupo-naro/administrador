import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { infraSummary, type InfraAsset } from "./infra";

const today = d("2026-10-14");

const asset = (over: Partial<InfraAsset> & Pick<InfraAsset, "id" | "type" | "renewalDate">): InfraAsset => ({
  identifier: over.id,
  projectName: "Proyecto",
  managedByNaro: true,
  costCents: null,
  costEveryMonths: 12,
  ...over,
});

const assets: InfraAsset[] = [
  asset({ id: "d1", type: "DOMINIO", renewalDate: d("2026-10-20"), costCents: 20_000 }), // en 6 días
  asset({ id: "h1", type: "HOSTING", renewalDate: d("2026-11-20"), costCents: 5_000, costEveryMonths: 1 }), // en 37 días
  asset({ id: "s1", type: "SERVIDOR", renewalDate: d("2026-12-30") }), // en 77 días, sin costo
  asset({ id: "d2", type: "DOMINIO", renewalDate: d("2026-10-10"), managedByNaro: false, costCents: 9_999 }), // vencido, del cliente
  asset({ id: "d3", type: "DOMINIO", renewalDate: d("2027-06-01"), costCents: 12_000 }), // lejano
];

describe("infraSummary", () => {
  it("costo mensual equivalente: solo activos de Naro con costo", () => {
    expect(infraSummary(assets, today).monthlyEquivalentCents).toBe(1667 + 5000 + 1000);
    expect(infraSummary(assets, today).total).toBe(5);
  });

  it("activos por tipo, separando Naro y cliente", () => {
    expect(infraSummary(assets, today).byType).toEqual([
      { type: "DOMINIO", naro: 2, client: 1 },
      { type: "HOSTING", naro: 1, client: 0 },
      { type: "SERVIDOR", naro: 1, client: 0 },
    ]);
  });

  it("renovaciones vencidas y a 30, 60 y 90 días con su costo (solo lo que paga Naro)", () => {
    const { renewals } = infraSummary(assets, today);
    expect(renewals.expired.items.map((r) => r.id)).toEqual(["d2"]);
    expect(renewals.expired.costCents).toBe(0);
    expect(renewals.next30.items.map((r) => r.id)).toEqual(["d1"]);
    expect(renewals.next30.costCents).toBe(20_000);
    expect(renewals.next60.items.map((r) => r.id)).toEqual(["h1"]);
    expect(renewals.next60.costCents).toBe(5_000);
    expect(renewals.next90.items.map((r) => r.id)).toEqual(["s1"]);
    expect(renewals.next90.costCents).toBe(0);
  });

  it("los límites: hoy, 30, 31, 60, 61 y 90 días", () => {
    const edge = [
      asset({ id: "a", type: "DOMINIO", renewalDate: d("2026-10-14") }), // 0
      asset({ id: "b", type: "DOMINIO", renewalDate: d("2026-11-13") }), // 30
      asset({ id: "c", type: "DOMINIO", renewalDate: d("2026-11-14") }), // 31
      asset({ id: "e", type: "DOMINIO", renewalDate: d("2026-12-13") }), // 60
      asset({ id: "f", type: "DOMINIO", renewalDate: d("2026-12-14") }), // 61
      asset({ id: "g", type: "DOMINIO", renewalDate: d("2027-01-12") }), // 90
      asset({ id: "h", type: "DOMINIO", renewalDate: d("2027-01-13") }), // 91 (fuera)
    ];
    const r = infraSummary(edge, today).renewals;
    expect(r.next30.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.next60.items.map((x) => x.id)).toEqual(["c", "e"]);
    expect(r.next90.items.map((x) => x.id)).toEqual(["f", "g"]);
  });

  it("periodicidad inválida no suma al costo mensual; sin activos todo en cero", () => {
    const bad = [asset({ id: "x", type: "HOSTING", renewalDate: d("2026-11-01"), costCents: 1000, costEveryMonths: 0 })];
    expect(infraSummary(bad, today).monthlyEquivalentCents).toBe(0);
    const empty = infraSummary([], today);
    expect(empty.monthlyEquivalentCents).toBe(0);
    expect(empty.total).toBe(0);
    expect(empty.renewals.expired.items).toEqual([]);
  });
});
