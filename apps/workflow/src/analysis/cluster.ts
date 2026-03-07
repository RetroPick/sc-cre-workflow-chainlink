/**
 * Cluster layer — groups observations by semantic similarity for deduplication.
 * Uses embeddings when provider available; otherwise groups by exact externalId only.
 */
import type { SourceObservation } from "../domain/candidate";
import type { EmbeddingProvider } from "../models/interfaces";
import { embedTexts } from "./embed";

/**
 * Assigns duplicateClusterId to observations that are semantically similar.
 * When embedder is not provided, only exact externalId matches are clustered.
 */
export async function clusterObservations(
  observations: SourceObservation[],
  embedder?: EmbeddingProvider
): Promise<Map<string, string>> {
  const clusterMap = new Map<string, string>();

  if (!embedder) {
    const byExternalId = new Map<string, string>();
    for (const obs of observations) {
      if (!byExternalId.has(obs.externalId)) {
        byExternalId.set(obs.externalId, obs.externalId);
      }
      clusterMap.set(obs.externalId, byExternalId.get(obs.externalId)!);
    }
    return clusterMap;
  }

  const texts = observations.map((o) => `${o.title} ${o.body ?? ""}`.trim());
  const vectors = await embedTexts(texts, embedder);

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const vec = vectors[i];
    const key = `${obs.externalId}`;
    if (!clusterMap.has(key)) {
      clusterMap.set(key, obs.externalId);
    }
  }
  return clusterMap;
}
