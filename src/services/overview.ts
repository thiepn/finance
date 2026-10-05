import type {
  OverviewDashboard,
  OverviewPeriodKind,
} from "../domain/overview.js";

export interface OverviewRequest {
  periodKind?: OverviewPeriodKind;
  anchorDate?: string | null;
  asOf?: string | null;
  recentLimit?: number;
}

export interface FinanceOverviewService {
  getDashboard(request?: OverviewRequest): Promise<OverviewDashboard>;
}
