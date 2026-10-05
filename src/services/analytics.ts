import type {
  AnalyticsBreakdown,
  AnalyticsBreakdownRequest,
  AnalyticsTimeSeries,
  AnalyticsTimeSeriesRequest,
} from "../domain/analytics.js";

export interface FinanceAnalyticsService {
  getTimeSeries(
    request: AnalyticsTimeSeriesRequest,
  ): Promise<AnalyticsTimeSeries>;

  getBreakdown(
    request: AnalyticsBreakdownRequest,
  ): Promise<AnalyticsBreakdown>;
}
