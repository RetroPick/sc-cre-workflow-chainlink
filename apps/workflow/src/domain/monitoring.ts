/**
 * Live market snapshot for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §8.
 */
export type LiveMarketStatus =
  | "ACTIVE"
  | "PAUSED"
  | "DELISTED"
  | "SETTLED"
  | "REVIEW_REQUIRED";

export type LiveMarketSnapshot = {
  marketId: string;
  status: LiveMarketStatus;
  resolveTime: number; // unix seconds

  openInterest: bigint;
  volume24h: bigint;
  volume1h: bigint;

  traderCount24h: number;
  uniqueWalletCount24h: number;

  largestWalletShareBps: number; // 0..10000
  top5WalletShareBps: number; // 0..10000

  tradesNearResolution1h: number;
  volumeNearResolution1h: bigint;

  settlementSourceFresh: boolean;
  settlementSourceAgeSec?: number;

  category?: string;
  policyFlags?: string[];
};
