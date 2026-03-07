/**
 * Deterministic enforcement engine for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §6.
 */
import type { LiveMarketSnapshot } from "../../domain/monitoring";
import type { EnforcementAction, MarketRiskSignals } from "../../domain/enforcement";

export const MONITORING_THRESHOLDS = {
  alertOverallRisk: 0.55,
  reviewOverallRisk: 0.7,
  pauseOverallRisk: 0.85,

  hardPolicyViolation: 0.9,
  staleNearResolution: 0.8,
  suspiciousLateTrading: 0.85,
  suspiciousConcentration: 0.8,
  suspiciousVolumeSpike: 0.8,
};

export function enforcePolicy(args: {
  snapshot: LiveMarketSnapshot;
  signals: MarketRiskSignals;
  nowSec?: number;
}): EnforcementAction {
  const { snapshot, signals } = args;
  const nowSec = args.nowSec ?? Math.floor(Date.now() / 1000);

  const reasons: string[] = [];
  const secsToResolve = Math.max(snapshot.resolveTime - nowSec, 0);
  const nearResolution = secsToResolve <= 3600;

  // 1. Hard legal/policy violation
  if (signals.policyViolationRisk >= MONITORING_THRESHOLDS.hardPolicyViolation) {
    reasons.push("Policy violation risk exceeds hard threshold");
    return {
      type: "DELIST_MARKET",
      severity: "high",
      reasons,
    };
  }

  // 2. Stale settlement source near resolution
  if (
    nearResolution &&
    signals.staleSourceRisk >= MONITORING_THRESHOLDS.staleNearResolution
  ) {
    reasons.push("Settlement source is too stale near resolution");
    return {
      type: "REVIEW_REQUIRED",
      severity: "high",
      reasons,
    };
  }

  // 3. Suspicious late trading + high concentration
  if (
    signals.lateTradingSpikeScore >= MONITORING_THRESHOLDS.suspiciousLateTrading &&
    signals.concentrationScore >= MONITORING_THRESHOLDS.suspiciousConcentration
  ) {
    reasons.push("Suspicious late trading spike with concentrated participation");
    return {
      type: "PAUSE_MARKET",
      severity: "high",
      reasons,
    };
  }

  // 4. Large volume spike on sensitive market
  if (
    signals.volumeSpikeScore >= MONITORING_THRESHOLDS.suspiciousVolumeSpike &&
    signals.legalSensitivityRisk >= 0.6
  ) {
    reasons.push("Large volume spike on legally or policy-sensitive market");
    return {
      type: "BLOCK_NEW_TRADES",
      severity: "high",
      reasons,
    };
  }

  // 5. Review threshold
  if (signals.overallRisk >= MONITORING_THRESHOLDS.reviewOverallRisk) {
    reasons.push("Overall risk exceeds review threshold");
    return {
      type: "REVIEW_REQUIRED",
      severity: "high",
      reasons,
    };
  }

  // 6. Alert threshold
  if (signals.overallRisk >= MONITORING_THRESHOLDS.alertOverallRisk) {
    reasons.push("Overall risk exceeds alert threshold");
    return {
      type: "ALERT",
      severity: "medium",
      reasons,
    };
  }

  // 7. Default
  return {
    type: "NO_ACTION",
    reasons: ["Risk signals within allowed range"],
  };
}
