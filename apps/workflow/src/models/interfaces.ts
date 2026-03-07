/**
 * Model provider interfaces for ML layers.
 * Enables vendor-agnostic LLM, embedding, and verification.
 */

/** Structured JSON completion from an LLM. */
export interface LlmProvider {
  completeJson<T>(args: {
    system: string;
    user: string;
    schemaName: string;
    temperature?: number;
  }): Promise<T>;
}

/** Text embedding for deduplication, clustering, similarity. */
export interface EmbeddingProvider {
  embedTexts(texts: string[]): Promise<number[][]>;
}

/** Fast topic/risk routing before LLM. */
export interface ClassifierProvider {
  classify(args: { text: string; labels: string[] }): Promise<{
    scores: Record<string, number>;
  }>;
}

/** Claim verification for unresolved checks and settlement. */
export interface VerifierProvider {
  verifyClaim(args: {
    claim: string;
    sources: string[];
    allowedOutcomes?: string[];
  }): Promise<{
    verdict: "SUPPORTED" | "UNSUPPORTED" | "AMBIGUOUS";
    confidence: number;
    evidence: string[];
  }>;
}
