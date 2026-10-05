import type {
  ConfirmRecurringCandidateResult,
  RecurringDashboard,
  RecurringDetectionCandidate,
  RecurringDetectionResult,
  RecurringStatus,
  RecurringSyncResult,
} from "../domain/recurring.js";
import type { UUID } from "../domain/finance.js";

export interface FinanceRecurringService {
  syncPatterns(
    patternId?: UUID | null,
    asOf?: string | null,
  ): Promise<RecurringSyncResult>;

  getDashboard(
    anchorDate?: string | null,
    horizonDays?: number,
  ): Promise<RecurringDashboard>;

  getDetectionCandidates(
    anchorDate?: string | null,
    historyMonths?: number,
    limit?: number,
  ): Promise<RecurringDetectionResult>;

  confirmCandidate(
    candidate: RecurringDetectionCandidate,
    isSubscription: boolean,
  ): Promise<ConfirmRecurringCandidateResult>;

  setStatus(
    patternId: UUID,
    status: RecurringStatus,
  ): Promise<{ patternId: UUID; status: RecurringStatus }>;
}
