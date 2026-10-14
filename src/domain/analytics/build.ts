import { agingBuckets, debtSummary, debtorsByClient, punctuality } from "./collections";
import type { Facts } from "./facts";
import { financeSeries, financeSummary, topCollected, topShare } from "./finance";
import { infraSummary } from "./infra";
import { clientsSummary, projectsSummary } from "./portfolio";
import { bucketsOf, resolvePeriod, variation, type PeriodKey } from "./period";
import { recurringCollectedSeries, recurringSummary } from "./recurring";
import { salesSummary } from "./sales";

export function buildFinance(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  const input = { payments: f.payments, installments: f.installments, assets: f.assets };
  const cur = financeSummary(input, current.from, current.to, f.today);
  const prev = financeSummary(input, previous.from, previous.to, f.today);
  return {
    current,
    previous,
    cur,
    prev,
    variations: {
      collected: variation(cur.collectedCents, prev.collectedCents),
      projected: variation(cur.projectedCents, prev.projectedCents),
      infraCost: variation(cur.infraCostCents, prev.infraCostCents),
      net: variation(cur.netCents, prev.netCents),
    },
    series: financeSeries(input, bucketsOf(current), f.today),
    topClients: topCollected(f.payments, current.from, current.to, "client"),
    topProjects: topCollected(f.payments, current.from, current.to, "project"),
    concentrationPct: topShare(f.payments, current.from, current.to, 3),
  };
}

export function buildCollections(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  return {
    current,
    previous,
    aging: agingBuckets(f.installments, f.today),
    punctuality: punctuality(f.installments, current.from, current.to),
    previousPunctuality: punctuality(f.installments, previous.from, previous.to),
    debt: debtSummary(f.installments, f.today),
    debtors: debtorsByClient(f.installments, f.today),
  };
}

export function buildRecurring(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  const lastYear = resolvePeriod("1a", f.today).current;
  return {
    current,
    previous,
    cur: recurringSummary(f.contracts, current.from, current.to),
    prev: recurringSummary(f.contracts, previous.from, previous.to),
    series: recurringCollectedSeries(f.payments, bucketsOf(lastYear)),
    hasAny: f.contracts.length > 0,
  };
}

export function buildSales(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  return {
    current,
    previous,
    cur: salesSummary(f.proposals, current.from, current.to, f.today),
    prev: salesSummary(f.proposals, previous.from, previous.to, f.today),
  };
}

export function buildPortfolio(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  return {
    current,
    previous,
    projects: projectsSummary(f.projects, current.from, current.to),
    previousProjects: projectsSummary(f.projects, previous.from, previous.to),
    clients: clientsSummary(f.clients, f.projects, current.from, current.to),
  };
}

export const buildInfra = (f: Facts) => infraSummary(f.assets, f.today);
