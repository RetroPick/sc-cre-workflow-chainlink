/**
 * Mock metrics provider for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md — v1 simulation and tests.
 */
import type { LiveMarketSnapshot } from "../../domain/monitoring";
import type { MarketMetricsProvider } from "./collectMetrics";

/** Preset identifiers for test case fixtures per doc §11. */
export type MockSnapshotPreset =
  | "healthy"
  | "mediumSpike"
  | "staleSource"
  | "lateTradingConcentration"
  | "blacklist";

/**
 * Creates a LiveMarketSnapshot preset for tests and simulation.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §11.
 *
 * - healthy: NO_ACTION (low risk across all signals)
 * - mediumSpike: ALERT (volumeSpikeScore elevates overallRisk)
 * - staleSource: REVIEW_REQUIRED (stale source near resolution)
 * - lateTradingConcentration: PAUSE_MARKET (late trading + concentration)
 * - blacklist: DELIST_MARKET (policyViolationRisk from BLACKLISTED)
 */
export function createMockSnapshotPreset(
  preset: MockSnapshotPreset,
  marketId = "1",
  overrides?: Partial<LiveMarketSnapshot>
): LiveMarketSnapshot {
  const now = Math.floor(Date.now() / 1000);
  const base: LiveMarketSnapshot = {
    marketId,
    status: "ACTIVE",
    resolveTime: now + 7200,
    openInterest: 50_000n,
    volume24h: 24_000n,
    volume1h: 1_000n,
    traderCount24h: 50,
    uniqueWalletCount24h: 45,
    largestWalletShareBps: 1500,
    top5WalletShareBps: 3500,
    tradesNearResolution1h: 2,
    volumeNearResolution1h: 100n,
    settlementSourceFresh: true,
    settlementSourceAgeSec: 120,
    category: "crypto",
    policyFlags: [],
  };

  switch (preset) {
    case "healthy":
      return { ...base, ...overrides };

    case "mediumSpike": {
      // volumeSpike 0.9 + concentration 0.9 + stale 0.9 + policy 0.75 → overallRisk ~0.56 → ALERT
      // Avoid legal>=0.6 (would trigger BLOCK_NEW_TRADES) and policy>=0.9 (DELIST)
      return {
        ...base,
        volume24h: 24_000n,
        volume1h: 6_000n,
        largestWalletShareBps: 9000,
        top5WalletShareBps: 9500,
        settlementSourceFresh: false,
        settlementSourceAgeSec: 4000,
        policyFlags: ["REVIEW_REQUIRED"],
        ...overrides,
      };
    }

    case "staleSource": {
      // Near resolution (30 min) + stale source
      return {
        ...base,
        resolveTime: now + 1800,
        settlementSourceFresh: false,
        settlementSourceAgeSec: 4000,
        ...overrides,
      };
    }

    case "lateTradingConcentration": {
      // High concentration + late trading spike near resolution
      return {
        ...base,
        resolveTime: now + 900,
        volume1h: 10_000n,
        volumeNearResolution1h: 8_500n,
        largestWalletShareBps: 8500,
        top5WalletShareBps: 9500,
        uniqueWalletCount24h: 3,
        ...overrides,
      };
    }

    case "blacklist": {
      return {
        ...base,
        policyFlags: ["BLACKLISTED"],
        ...overrides,
      };
    }

    default:
      return { ...base, ...overrides };
  }
}

/**
 * Configurable mock provider that returns predefined snapshots.
 * Use for tests and local simulation.
 */
export class MockMarketMetricsProvider implements MarketMetricsProvider {
  private readonly map: Map<string, LiveMarketSnapshot>;

  constructor(
    snapshots: Map<string, LiveMarketSnapshot> | LiveMarketSnapshot[]
  ) {
    this.map = Array.isArray(snapshots)
      ? new Map(snapshots.map((s) => [s.marketId, s]))
      : snapshots;
  }

  async listActiveMarketIds(): Promise<string[]> {
    return Array.from(this.map.keys()).filter(
      (id) => this.map.get(id)?.status === "ACTIVE"
    );
  }

  async getMarketSnapshot(marketId: string): Promise<LiveMarketSnapshot> {
    const snapshot = this.map.get(marketId);
    if (!snapshot) {
      throw new Error(`MockMarketMetricsProvider: no snapshot for ${marketId}`);
    }
    return snapshot;
  }
}
