import type { FeedConfig } from "./feed";

export type WorkflowConfig = {
  gptModel?: string;
  deepseekApiKey?: string;
  useMockAi?: boolean;
  mockAiResponse?: string;
  cronSchedule?: string;
  marketFactoryAddress?: string;
  creatorAddress?: `0x${string}`;
  feeds?: FeedConfig[];
  evms: Array<{
    marketAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};
