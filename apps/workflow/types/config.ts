import type { FeedConfig } from "./feed";

export type WorkflowConfig = {
  gptModel?: string;
  deepseekApiKey?: string;
  useMockAi?: boolean;
  mockAiResponse?: string;
  cronSchedule?: string;
  marketFactoryAddress?: string;
  creReceiverAddress?: `0x${string}`;
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
    marketAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};
