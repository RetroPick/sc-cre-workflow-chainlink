/**
 * Metrics collection for Risk Monitoring & Compliance Enforcement Layer.
 * Per 06_RiskMonitoringComplienceEnforcementLayer.md §4.
 */
import type { LiveMarketSnapshot } from "../../domain/monitoring";

export interface MarketMetricsProvider {
  listActiveMarketIds(): Promise<string[]>;
  getMarketSnapshot(marketId: string): Promise<LiveMarketSnapshot>;
}

export async function collectAllMarketSnapshots(
  provider: MarketMetricsProvider
): Promise<LiveMarketSnapshot[]> {
  const marketIds = await provider.listActiveMarketIds();

  const snapshots = await Promise.all(
    marketIds.map((marketId) => provider.getMarketSnapshot(marketId))
  );

  return snapshots.filter((s) => s.status === "ACTIVE");
}
