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
    /** Market IDs to check when mode includes 'schedule'. Merged with relayer markets when useRelayerMarkets is true. */
    marketIds?: number[];
    /** When true, fetch marketIds from GET {relayerUrl}/cre/markets. Merged with marketIds if both provided. */
    useRelayerMarkets?: boolean;
    /** Enable multi-LLM consensus for ai_assisted resolution. When true, runs multiple providers in parallel. */
    multiLlmEnabled?: boolean;
    /** LLM provider IDs for multi-LLM consensus (e.g. ["openai", "anthropic"]). Used when multiLlmEnabled is true. */
    llmProviders?: string[];
    /** Minimum confidence (0–10000) for settlement. Default 7000 (70%). */
    minConfidence?: number;
    /** Consensus quorum: min number of agreeing LLM providers for multi-LLM. Default 2. */
    consensusQuorum?: number;
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
  /** Enable CRE Orchestration Layer (analysis core, policy engine). When true, discovery uses analyzeCandidate. */
  orchestration?: { enabled?: boolean; draftingPipeline?: boolean };
  /** ML analysis: use LLM for classify, risk, draft synthesis when true. Fallback to rules when false. */
  analysis?: {
    useLlm?: boolean;
    useExplainability?: boolean;
  };
};
