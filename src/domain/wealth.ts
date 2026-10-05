import type { UUID } from "./finance.js";

export type WealthRangeMonths = 12 | 24 | 60;
export type BalanceObservationSource =
  | "manual"
  | "statement"
  | "import"
  | "market";
export type WealthPosition = "asset" | "liability";
export type WealthBalanceBasis =
  | "ledger"
  | "observation"
  | "observation_plus_ledger";

export interface WealthProfile {
  currencyCode: string;
  locale: string;
  timeZone: string;
}

export interface NetWorthSummary {
  netWorthMinor: number;
  assetsMinor: number;
  liabilitiesMinor: number;
  previousMonthNetWorthMinor: number;
  monthChangeMinor: number;
  monthChangeRatio: number | null;
  yearStartNetWorthMinor: number;
  ytdChangeMinor: number;
}

export interface SavingsSummary {
  currentMonthIncomeMinor: number;
  currentMonthSpendMinor: number;
  currentMonthSavingsMinor: number;
  currentMonthSavingsRate: number | null;
  ytdIncomeMinor: number;
  ytdSpendMinor: number;
  ytdSavingsMinor: number;
  ytdSavingsRate: number | null;
}

export interface WealthBridge {
  openingNetWorthMinor: number;
  closingNetWorthMinor: number;
  netWorthChangeMinor: number;
  ledgerSavingsMinor: number;
  valuationAndOtherChangeMinor: number;
}

export interface WealthAccount {
  accountId: UUID;
  name: string;
  kind: string;
  currencyCode: string;
  institutionName: string | null;
  accountLast4: string | null;
  includeInNetWorth: boolean;
  isArchived: boolean;
  balanceMinor: number;
  reportingBalanceMinor: number;
  position: WealthPosition;
  displayBalanceMinor: number;
  observationId: UUID | null;
  observationAt: string | null;
  observationSource: BalanceObservationSource | null;
  ledgerDeltaMinor: number;
  reportingLedgerDeltaMinor: number;
  lastActivityAt: string | null;
  balanceBasis: WealthBalanceBasis;
}

export interface NetWorthHistoryPoint {
  monthStart: string;
  date: string;
  netWorthMinor: number;
  assetsMinor: number;
  liabilitiesMinor: number;
}

export interface SavingsHistoryPoint {
  monthStart: string;
  incomeMinor: number;
  netSpentMinor: number;
  savingsMinor: number;
  savingsRate: number | null;
}

export interface WealthCompositionRow {
  kind: string;
  netMinor: number;
  assetMinor: number;
  liabilityMinor: number;
  accountCount: number;
}

export interface InvestmentBalanceBridge {
  accountId: UUID;
  name: string;
  currencyCode: string;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  netTransactionFlowMinor: number;
  residualValueChangeMinor: number;
}

export interface NetWorthDashboard {
  profile: WealthProfile;
  anchorDate: string;
  range: {
    months: number;
    startDate: string;
    asOf: string;
  };
  summary: NetWorthSummary;
  savings: SavingsSummary;
  bridge: WealthBridge;
  accounts: readonly WealthAccount[];
  history: readonly NetWorthHistoryPoint[];
  savingsHistory: readonly SavingsHistoryPoint[];
  composition: readonly WealthCompositionRow[];
  investmentBridges: readonly InvestmentBalanceBridge[];
}

export interface AccountWealthHistory {
  profile: WealthProfile;
  account: {
    accountId: UUID;
    name: string;
    kind: string;
    currencyCode: string;
    institutionName: string | null;
    includeInNetWorth: boolean;
    isArchived: boolean;
  };
  history: readonly {
    date: string;
    balanceMinor: number;
    reportingBalanceMinor: number;
  }[];
}

export interface RecordBalanceObservationInput {
  accountId: UUID;
  balanceMinor: number;
  observedAt?: string | null;
  reportingBalanceMinor?: number | null;
  exchangeRate?: number | null;
  source?: BalanceObservationSource;
  note?: string | null;
}
