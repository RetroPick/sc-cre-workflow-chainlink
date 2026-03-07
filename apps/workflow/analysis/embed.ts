/**
 * Embedding layer — produces vectors for deduplication and clustering.
 * Uses EmbeddingProvider when available; otherwise returns stub vectors.
 */
import type { EmbeddingProvider } from "../models/interfaces";
import { createStubEmbeddingProvider } from "../models/providers/embeddingProvider";

/**
 * Embeds texts using the provided provider, or stub when none given.
 */
export async function embedTexts(
  texts: string[],
  provider?: EmbeddingProvider
): Promise<number[][]> {
  const embedder = provider ?? createStubEmbeddingProvider();
  return embedder.embedTexts(texts);
}
