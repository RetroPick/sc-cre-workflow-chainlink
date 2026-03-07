/**
 * Understanding output from classification layer.
 */
export type UnderstandingOutput = {
  canonicalSubject: string;
  eventType: string;
  category:
    | "macro"
    | "weather"
    | "crypto_asset"
    | "crypto_product"
    | "governance"
    | "company_milestone"
    | "regulatory"
    | "politics"
    | "sports"
    | "war_violence"
    | "science"
    | "entertainment"
    | "unknown";
  subcategory?: string;
  candidateQuestion: string;
  marketType: "binary" | "categorical" | "timeline" | "invalid";
  outcomes?: string[];
  entities: string[];
  ambiguityScore: number;
  marketabilityScore: number;
  duplicateClusterId?: string;
  temporalWindow?: {
    opensAt?: number;
    resolvesBy?: number;
  };
};
