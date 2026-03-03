import type { FeedConfig } from "./feed";

export type ResolutionMode = "log" | "schedule" | "both";

export type WorkflowConfig = {
  gptModel?: string;
  deepseekApiKey?: string;
  relayerUrl?: string; // e.g. https://your-relayer.up.railway.app
  useMockAi?: boolean;
  mockAiResponse?: string;
  cronSchedule?: string;
  /** Separate cron for checkpoint finalize (e.g. "0 */35 * * * *" every 35 min). Defaults to main cron if unset. */
  cronScheduleFinalize?: string;
  /** Separate cron for checkpoint cancel (e.g. "0 0 */8 * * *" every 8 hr). Optional; cancel job uses this or no-op if unset. */
  cronScheduleCancel?: string;
  marketFactoryAddress?: string;
  creReceiverAddress?: `0x${string}`;
  /** CREPublishReceiver for publish-from-draft. Fallback when curatedPath.crePublishReceiverAddress not set. */
  crePublishReceiverAddress?: `0x${string}`;
  creatorAddress?: `0x${string}`;
  feeds?: FeedConfig[];
  yellowSessions?: Array<{
    marketId: number | string;
    sessionId: `0x${string}`;
    participants: `0x${string}`[];
    balances: Array<number | string>;
    signatures: `0x${string}`[];
    backendSignature: `0x${string}`;
    resolveTime: number;
  }>;
  evms: Array<{
    marketAddress: string; // PoolMarketLegacy (for SettlementRequested log)
    marketRegistryAddress?: string; // V3 MarketRegistry (schedule resolution)
    chainSelectorName: string;
    gasLimit: string;
  }>;
  /** Resolution lane: log=PoolMarketLegacy events, schedule=MarketRegistry cron, both=both */
  resolution?: {
    mode: ResolutionMode;
    /** Market IDs to check when mode includes 'schedule'. Required for schedule resolution. */
    marketIds?: number[];
  };
  /** ChannelSettlement address for cancel job (or derive from relayer GET /cre/checkpoints/:sessionId) */
  channelSettlementAddress?: `0x${string}`;
  /** For CREPublishReceiver / createFromDraft curated path and draftProposer */
  curatedPath?: {
    draftBoardAddress?: string;
    crePublishReceiverAddress?: string;
    enabled: boolean;
  };
  /** Polymarket Gamma API for draft feed. Optional. */
  polymarket?: {
    apiUrl?: string; // default https://gamma-api.polymarket.com
    apiKey?: string; // optional API key for rate limits
  };
  /** RPC URL for direct contract writes (e.g. draftProposer). Falls back to env RPC_URL. */
  rpcUrl?: string;
};
