/**
 * Embedding provider stub for deduplication, clustering, banned-market similarity.
 * Phase E: Replace with real OpenAI/Cohere/etc. when needed.
 */
import type { EmbeddingProvider } from "../interfaces";

/**
 * Stub implementation — returns zero vectors.
 * Use for deduplication/clustering when real embeddings are not yet integrated.
 */
export function createStubEmbeddingProvider(): EmbeddingProvider {
  return {
    async embedTexts(texts: string[]): Promise<number[][]> {
      // Return zero vectors of dimension 384 (common for small models)
      const dim = 384;
      return texts.map(() => Array(dim).fill(0));
    },
  };
}
