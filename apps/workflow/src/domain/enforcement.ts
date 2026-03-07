/**
 * Risk signals and enforcement actions for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §8–9.
 */
export type MarketRiskSignals = {
  openInterest: bigint;
  openInterestDelta1h: number; // normalized ratio or percent
  volume24h: bigint;
  volumeSpikeScore: number; // 0..1
  concentrationScore: number; // 0..1
  lateTradingSpikeScore: number; // 0..1
  correlatedWalletScore: number; // 0..1
  staleSourceRisk: number; // 0..1
  policyViolationRisk: number; // 0..1
  legalSensitivityRisk: number; // 0..1
  overallRisk: number; // 0..1
};

export type EnforcementAction =
  | { type: "NO_ACTION"; reasons: string[] }
  | { type: "ALERT"; reasons: string[]; severity: "low" | "medium" | "high" }
  | { type: "REVIEW_REQUIRED"; reasons: string[]; severity: "medium" | "high" }
  | { type: "PAUSE_MARKET"; reasons: string[]; severity: "high" }
  | { type: "DELIST_MARKET"; reasons: string[]; severity: "high" }
  | { type: "BLOCK_NEW_TRADES"; reasons: string[]; severity: "high" };
