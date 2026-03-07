/**
 * Settlement artifact for AI Event-Driven Layer (05).
 * Per 05_AIEventDrivenLayer.md — full audit record for each settlement.
 */
export type SettlementArtifact = {
  marketId: string;
  question: string;
  outcomeIndex: number;
  confidence: number;
  timestamp: number;
  modelsUsed?: string[];
  sourcesUsed: string[];
  resolutionMode: string;
  reasoning?: string;
  reviewRequired?: boolean;
  txHash?: string;
};
