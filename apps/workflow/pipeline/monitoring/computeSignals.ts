/**
 * Risk signal computation for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §5.
 */
import type { LiveMarketSnapshot } from "../../domain/monitoring";
import type { MarketRiskSignals } from "../../domain/enforcement";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function bigintToNumberSafe(v: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (v > max) return Number.MAX_SAFE_INTEGER;
  return Number(v);
}

function scoreVolumeSpike(snapshot: LiveMarketSnapshot): number {
  const v24 = Math.max(bigintToNumberSafe(snapshot.volume24h), 1);
  const v1 = bigintToNumberSafe(snapshot.volume1h);

  const expected1h = v24 / 24;
  const ratio = v1 / Math.max(expected1h, 1);

  if (ratio <= 1.5) return 0.1;
  if (ratio <= 2.5) return 0.35;
  if (ratio <= 4.0) return 0.65;
  return 0.9;
}

function scoreConcentration(snapshot: LiveMarketSnapshot): number {
  const largest = snapshot.largestWalletShareBps / 10000;
  const top5 = snapshot.top5WalletShareBps / 10000;

  const weighted = largest * 0.55 + top5 * 0.45;
  return clamp01(weighted);
}

function scoreLateTradingSpike(snapshot: LiveMarketSnapshot, nowSec: number): number {
  const secsToResolve = Math.max(snapshot.resolveTime - nowSec, 0);

  if (secsToResolve > 3600) return 0.05;

  const nearResVol = bigintToNumberSafe(snapshot.volumeNearResolution1h);
  const vol1h = Math.max(bigintToNumberSafe(snapshot.volume1h), 1);

  const ratio = nearResVol / vol1h;

  if (ratio <= 0.25) return 0.1;
  if (ratio <= 0.5) return 0.35;
  if (ratio <= 0.75) return 0.65;
  return 0.9;
}

function scoreCorrelatedWalletRisk(snapshot: LiveMarketSnapshot): number {
  const uniqueWallets = Math.max(snapshot.uniqueWalletCount24h, 1);

  let score = 0.05;
  if (uniqueWallets < 5) score += 0.35;
  if (uniqueWallets < 3) score += 0.25;
  if (snapshot.top5WalletShareBps > 8000) score += 0.25;

  return clamp01(score);
}

function scoreStaleSourceRisk(snapshot: LiveMarketSnapshot): number {
  if (!snapshot.settlementSourceFresh) return 0.9;
  if (!snapshot.settlementSourceAgeSec) return 0.15;

  if (snapshot.settlementSourceAgeSec <= 300) return 0.05;
  if (snapshot.settlementSourceAgeSec <= 1800) return 0.2;
  if (snapshot.settlementSourceAgeSec <= 3600) return 0.45;
  return 0.75;
}

function scorePolicyViolationRisk(snapshot: LiveMarketSnapshot): number {
  const flags = snapshot.policyFlags ?? [];
  if (flags.includes("BLACKLISTED")) return 1.0;
  if (flags.includes("REVIEW_REQUIRED")) return 0.75;
  if (flags.includes("LEGAL_SENSITIVE")) return 0.8;
  return 0.05;
}

function scoreLegalSensitivity(snapshot: LiveMarketSnapshot): number {
  switch (snapshot.category) {
    case "politics":
    case "sports":
    case "war_violence":
      return 1.0;
    case "regulatory":
    case "entertainment":
      return 0.6;
    default:
      return 0.15;
  }
}

function scoreOpenInterestDelta(snapshot: LiveMarketSnapshot): number {
  const oi = bigintToNumberSafe(snapshot.openInterest);

  if (oi <= 1_000) return 0.1;
  if (oi <= 10_000) return 0.25;
  if (oi <= 100_000) return 0.45;
  return 0.7;
}

function combineOverallRisk(s: Omit<MarketRiskSignals, "overallRisk">): number {
  return clamp01(
    s.volumeSpikeScore * 0.18 +
      s.concentrationScore * 0.18 +
      s.lateTradingSpikeScore * 0.18 +
      s.correlatedWalletScore * 0.1 +
      s.staleSourceRisk * 0.12 +
      s.policyViolationRisk * 0.14 +
      s.legalSensitivityRisk * 0.1
  );
}

export function computeSignals(
  snapshot: LiveMarketSnapshot,
  nowSec = Math.floor(Date.now() / 1000)
): MarketRiskSignals {
  const signals: Omit<MarketRiskSignals, "overallRisk"> = {
    openInterest: snapshot.openInterest,
    openInterestDelta1h: scoreOpenInterestDelta(snapshot),
    volume24h: snapshot.volume24h,
    volumeSpikeScore: scoreVolumeSpike(snapshot),
    concentrationScore: scoreConcentration(snapshot),
    lateTradingSpikeScore: scoreLateTradingSpike(snapshot, nowSec),
    correlatedWalletScore: scoreCorrelatedWalletRisk(snapshot),
    staleSourceRisk: scoreStaleSourceRisk(snapshot),
    policyViolationRisk: scorePolicyViolationRisk(snapshot),
    legalSensitivityRisk: scoreLegalSensitivity(snapshot),
  };

  return {
    ...signals,
    overallRisk: combineOverallRisk(signals),
  };
}
