import type {
  AccountWealthHistory,
  NetWorthDashboard,
  RecordBalanceObservationInput,
  WealthRangeMonths,
} from "../domain/wealth.js";
import type { UUID } from "../domain/finance.js";

export interface FinanceWealthService {
  getDashboard(
    months?: WealthRangeMonths,
    anchorDate?: string | null,
  ): Promise<NetWorthDashboard>;

  getAccountHistory(
    accountId: UUID,
    months?: WealthRangeMonths,
    anchorDate?: string | null,
  ): Promise<AccountWealthHistory>;

  recordBalanceObservation(
    input: RecordBalanceObservationInput,
  ): Promise<UUID>;

  deleteBalanceObservation(observationId: UUID): Promise<void>;

  setNetWorthInclusion(
    accountId: UUID,
    include: boolean,
  ): Promise<void>;
}
