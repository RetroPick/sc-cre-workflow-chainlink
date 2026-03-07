/**
 * Normalizes SourceObservation to canonical shape for analysis.
 */
import type { SourceObservation } from "../domain/candidate";

export type NormalizedCandidate = {
  title: string;
  subject: string;
  eventType: string;
  relevantDate?: number;
  outcomeFraming?: string[];
  sourceUrls: string[];
  raw: SourceObservation;
};

export function normalizeObservation(obs: SourceObservation): NormalizedCandidate {
  return {
    title: obs.title,
    subject: obs.title,
    eventType: inferEventType(obs),
    relevantDate: obs.eventTime,
    sourceUrls: obs.url ? [obs.url] : [],
    raw: obs,
  };
}

function inferEventType(obs: SourceObservation): string {
  if (obs.tags && obs.tags.length > 0) {
    return obs.tags[0];
  }
  switch (obs.sourceType) {
    case "coinGecko":
      return "price_threshold";
    case "newsAPI":
      return "news_event";
    case "githubTrends":
      return "repo_activity";
    case "polymarket":
      return "external_market";
    default:
      return "custom";
  }
}
