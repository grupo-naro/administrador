import type { CollectionInstallment } from "./collections";
import type { FinancePayment } from "./finance";
import type { InfraAsset } from "./infra";
import type { PortfolioClient, PortfolioProject } from "./portfolio";
import type { RecurringContract } from "./recurring";
import type { SalesProposal } from "./sales";

/** Todo lo que necesitan las analíticas, ya en centavos y con fechas; la carga la hace `src/server/analytics/queries.ts`. */
export interface Facts {
  today: Date;
  payments: FinancePayment[];
  installments: CollectionInstallment[];
  contracts: RecurringContract[];
  proposals: SalesProposal[];
  projects: PortfolioProject[];
  clients: PortfolioClient[];
  assets: InfraAsset[];
}
