/**
 * Onchain metrics provider for Risk Monitoring & Compliance Enforcement Layer.
 * Reads from MarketRegistry; OI/volume/wallet metrics are placeholders until indexer available.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { readMarket, readStatus, MarketRegistryStatusEnum } from "../../contracts/marketRegistry";
import type { LiveMarketSnapshot, LiveMarketStatus } from "../../domain/monitoring";
import type { MarketMetricsProvider } from "./collectMetrics";
import { httpJsonRequest } from "../../utils/http";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function statusToLiveStatus(s: number): LiveMarketStatus {
  switch (s) {
    case MarketRegistryStatusEnum.Open:
      return "ACTIVE";
    case MarketRegistryStatusEnum.Frozen:
      return "PAUSED";
    case MarketRegistryStatusEnum.Resolved:
      return "SETTLED";
    case MarketRegistryStatusEnum.Draft:
    default:
      return "REVIEW_REQUIRED";
  }
}

/**
 * Resolves market IDs for monitoring from config and/or relayer.
 */
export function resolveMonitoringMarketIds(
  runtime: Runtime<{ monitoring?: { marketIds?: number[]; useRelayerMarkets?: boolean }; resolution?: { marketIds?: number[]; useRelayerMarkets?: boolean }; relayerUrl?: string }>
): number[] {
  const mon = runtime.config.monitoring;
  const res = runtime.config.resolution;
  const configIds = mon?.marketIds ?? res?.marketIds ?? [];
  const useRelayer = mon?.useRelayerMarkets ?? res?.useRelayerMarkets === true;
  const relayerUrl = runtime.config.relayerUrl?.replace(/\/$/, "");

  if (!useRelayer || !relayerUrl) {
    return configIds;
  }

  try {
    const res_1 = httpJsonRequest(runtime, {
      url: `${relayerUrl}/cre/markets`,
      method: "GET",
    });
    const body = JSON.parse(res_1.bodyText);
    const markets = body.markets ?? [];
    const relayerIds = new Set<number>();
    for (const m of markets) {
      const id = typeof m.marketId === "string" ? parseInt(m.marketId, 10) : Number(m.marketId);
      if (!Number.isNaN(id)) relayerIds.add(id);
    }
    const merged = new Set([...configIds, ...relayerIds]);
    return Array.from(merged);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[RiskMonitoring] Failed to fetch /cre/markets: ${msg}; using config marketIds only`);
    return configIds;
  }
}

/**
 * Creates a MarketMetricsProvider that reads from MarketRegistry.
 * Volume/wallet metrics are placeholders (0) until indexer is available.
 */
export function createOnchainMarketMetricsProvider(
  runtime: Runtime,
  evmClient: { callContract: (runtime: unknown, opts: unknown) => unknown },
  marketRegistryAddress: string,
  marketIds: number[]
): MarketMetricsProvider {
  return {
    async listActiveMarketIds(): Promise<string[]> {
      return marketIds.map((id) => String(id));
    },

    async getMarketSnapshot(marketId: string): Promise<LiveMarketSnapshot> {
      const id = BigInt(marketId);
      const market = readMarket(runtime, evmClient, marketRegistryAddress, id);
      const status = readStatus(runtime, evmClient, marketRegistryAddress, id);

      if (market.creator === ZERO_ADDRESS) {
        return {
          marketId,
          status: "DELISTED",
          resolveTime: Number(market.resolveTime),
          openInterest: 0n,
          volume24h: 0n,
          volume1h: 0n,
          traderCount24h: 0,
          uniqueWalletCount24h: 0,
          largestWalletShareBps: 0,
          top5WalletShareBps: 0,
          tradesNearResolution1h: 0,
          volumeNearResolution1h: 0n,
          settlementSourceFresh: true,
        };
      }

      return {
        marketId,
        status: statusToLiveStatus(status),
        resolveTime: Number(market.resolveTime),
        openInterest: 0n,
        volume24h: 0n,
        volume1h: 0n,
        traderCount24h: 0,
        uniqueWalletCount24h: 0,
        largestWalletShareBps: 0,
        top5WalletShareBps: 0,
        tradesNearResolution1h: 0,
        volumeNearResolution1h: 0n,
        settlementSourceFresh: true,
      };
    },
  };
}
