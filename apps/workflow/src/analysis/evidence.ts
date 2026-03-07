/**
 * Evidence provider layer — collects source material for resolution planning.
 * Per 03_SafetyComplienceLayer.md. Pluggable EvidenceProvider for extensibility.
 */
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { EvidenceBundle, EvidenceLink } from "../domain/evidence";

export type EvidenceQuery = {
  subject: string;
  category: string;
  eventType: string;
  question: string;
  entities: string[];
};

export type RawEvidenceCandidate = {
  label: string;
  url: string;
  sourceType: string;
  excerpt?: string;
  observedAt?: number;
  trustHint?: number;
};

export interface EvidenceProvider {
  search(query: EvidenceQuery): Promise<{
    primary: RawEvidenceCandidate[];
    supporting: RawEvidenceCandidate[];
    contradicting: RawEvidenceCandidate[];
  }>;
}

export interface EvidenceService {
  fetch(
    observation: SourceObservation,
    understanding: UnderstandingOutput
  ): Promise<EvidenceBundle>;
}

const SOURCE_BASE_TRUST: Record<string, number> = {
  onchain_event: 1.0,
  official_api: 0.95,
  official_website: 0.9,
  official_blog: 0.88,
  public_dataset: 0.8,
  github: 0.7,
  news: 0.65,
  custom_api: 0.6,
  social: 0.35,
  llm_summary: 0.2,
  observation: 0.5,
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function scoreEvidenceTrust(sourceType: string, trustHint?: number): number {
  const base = SOURCE_BASE_TRUST[sourceType] ?? 0.5;
  if (typeof trustHint !== "number") return base;
  return clamp01(Math.max(base, trustHint));
}

function dedupeEvidence(items: EvidenceLink[]): EvidenceLink[] {
  const seen = new Set<string>();
  const out: EvidenceLink[] = [];
  for (const item of items) {
    const key = `${item.url}|${item.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sortEvidence(items: EvidenceLink[]): EvidenceLink[] {
  return [...items].sort((a, b) => {
    if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
    return (b.observedAt ?? 0) - (a.observedAt ?? 0);
  });
}

function normalizeRaw(item: RawEvidenceCandidate): EvidenceLink {
  return {
    label: item.label,
    url: item.url,
    sourceType: item.sourceType,
    trustScore: scoreEvidenceTrust(item.sourceType, item.trustHint),
    excerpt: item.excerpt,
    observedAt: item.observedAt,
  };
}

function observationToEvidence(observation: SourceObservation): EvidenceLink {
  return {
    label: observation.title,
    url:
      observation.url ??
      `observation://${observation.sourceType}/${observation.externalId}`,
    sourceType: "observation",
    trustScore: scoreEvidenceTrust("observation"),
    excerpt: observation.body,
    observedAt: observation.observedAt,
  };
}

export class DefaultEvidenceService implements EvidenceService {
  constructor(private readonly provider: EvidenceProvider) {}

  async fetch(
    observation: SourceObservation,
    understanding: UnderstandingOutput
  ): Promise<EvidenceBundle> {
    const query: EvidenceQuery = {
      subject: understanding.canonicalSubject,
      category: understanding.category,
      eventType: understanding.eventType,
      question: understanding.candidateQuestion,
      entities: understanding.entities,
    };

    const providerResult = await this.provider.search(query);
    const direct = observationToEvidence(observation);

    let primary = sortEvidence(
      dedupeEvidence(providerResult.primary.map(normalizeRaw))
    ).slice(0, 5);
    if (primary.length === 0 && (observation.url || observation.title)) {
      primary = [direct];
    }

    const supporting = sortEvidence(
      dedupeEvidence([direct, ...providerResult.supporting.map(normalizeRaw)])
    ).slice(0, 8);

    const contradicting = sortEvidence(
      dedupeEvidence(providerResult.contradicting.map(normalizeRaw))
    ).slice(0, 5);

    return {
      primary,
      supporting,
      contradicting,
    };
  }
}

/** Mock provider for testing; returns observation as supporting evidence only. */
export class MockEvidenceProvider implements EvidenceProvider {
  async search(_query: EvidenceQuery) {
    return {
      primary: [],
      supporting: [],
      contradicting: [],
    };
  }
}

/** Factory for DefaultEvidenceService. */
export function createDefaultEvidenceService(
  provider: EvidenceProvider
): EvidenceService {
  return new DefaultEvidenceService(provider);
}
