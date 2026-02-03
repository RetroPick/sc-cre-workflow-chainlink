export type FeedType = "newsAPI" | "coinGecko" | "githubTrends" | "custom";

export type FeedConfig = {
  id: string;
  type: FeedType;
  url?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  questionTemplate?: string;
  valuePath?: string;
  category?: string;
  resolveSeconds?: number;
  mock?: boolean;
  mockValue?: number | string;
  metadata?: Record<string, string>;
  coinId?: string;
  vsCurrency?: string;
  multiplier?: number;
};

export type FeedItem = {
  feedId: string;
  question: string;
  category: string;
  resolveTime: number;
  sourceUrl?: string;
  externalId: string;
  metadata?: Record<string, string>;
};

export type MarketInput = {
  question: string;
  requestedBy: `0x${string}`;
  resolveTime: number;
  category: string;
  source: string;
  externalId: `0x${string}`;
};
