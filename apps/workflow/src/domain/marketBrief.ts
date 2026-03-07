/**
 * Market brief for explainability layer (L5).
 * Plain-language explanation for users before they trade.
 */
export type MarketBrief = {
  title: string;
  explanation: string;
  whyThisMarketExists: string;
  evidenceSummary: string[];
  sourceLinks: string[];
  resolutionExplanation: string;
  caveats: string[];
};
