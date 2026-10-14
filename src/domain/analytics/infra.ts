import { diffDays } from "../dates";

export type AssetType = "DOMINIO" | "HOSTING" | "SERVIDOR";
const TYPES: AssetType[] = ["DOMINIO", "HOSTING", "SERVIDOR"];

export interface InfraAsset {
  id: string;
  type: AssetType;
  identifier: string;
  projectName: string;
  managedByNaro: boolean;
  costCents: number | null;
  costEveryMonths: number;
  renewalDate: Date;
}

export interface Renewal {
  id: string;
  type: AssetType;
  identifier: string;
  projectName: string;
  renewalDate: Date;
  managedByNaro: boolean;
  costCents: number | null;
}

export interface RenewalGroup {
  items: Renewal[];
  /** Costo de las renovaciones que paga Naro. */
  costCents: number;
}

const toRenewal = (a: InfraAsset): Renewal => ({
  id: a.id,
  type: a.type,
  identifier: a.identifier,
  projectName: a.projectName,
  renewalDate: a.renewalDate,
  managedByNaro: a.managedByNaro,
  costCents: a.costCents,
});

function group(assets: InfraAsset[]): RenewalGroup {
  const items = [...assets].sort((a, b) => a.renewalDate.getTime() - b.renewalDate.getTime()).map(toRenewal);
  const costCents = items.reduce((s, r) => s + (r.managedByNaro && r.costCents ? r.costCents : 0), 0);
  return { items, costCents };
}

export function infraSummary(assets: InfraAsset[], today: Date) {
  const monthlyEquivalentCents = assets.reduce(
    (s, a) =>
      a.managedByNaro && a.costCents && a.costCents > 0 && Number.isFinite(a.costEveryMonths) && a.costEveryMonths >= 1
        ? s + Math.round(a.costCents / a.costEveryMonths)
        : s,
    0,
  );
  const daysTo = (a: InfraAsset) => diffDays(a.renewalDate, today);
  return {
    monthlyEquivalentCents,
    total: assets.length,
    byType: TYPES.map((type) => ({
      type,
      naro: assets.filter((a) => a.type === type && a.managedByNaro).length,
      client: assets.filter((a) => a.type === type && !a.managedByNaro).length,
    })),
    renewals: {
      expired: group(assets.filter((a) => daysTo(a) < 0)),
      next30: group(assets.filter((a) => daysTo(a) >= 0 && daysTo(a) <= 30)),
      next60: group(assets.filter((a) => daysTo(a) >= 31 && daysTo(a) <= 60)),
      next90: group(assets.filter((a) => daysTo(a) >= 61 && daysTo(a) <= 90)),
    },
  };
}
