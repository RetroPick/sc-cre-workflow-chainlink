/**
 * Demo mock evidence provider — fixture-driven per DEMO.md §7.3.
 * Returns static evidence structure by category; no external fetches.
 */
import type { SourceObservation } from "../../src/domain/candidate";
import type { UnderstandingOutput } from "../../src/domain/understanding";
import type { EvidenceBundle } from "../../src/domain/evidence";

const EVIDENCE_BY_CATEGORY: Record<string, EvidenceBundle> = {
  crypto_asset: {
    primary: [
      { label: "CoinGecko price feed", url: "https://www.coingecko.com/en/coins/ethereum", sourceType: "official_api", trustScore: 0.9 },
      { label: "Public market data", url: "https://example.com/eth-price", sourceType: "public_dataset", trustScore: 0.85 },
    ],
    supporting: [
      { label: "ETH price history", url: "https://example.com/eth-history", sourceType: "official_website", trustScore: 0.8 },
    ],
    contradicting: [],
  },
  crypto_product: {
    primary: [
      { label: "Official announcement", url: "https://example.com/announcement", sourceType: "official_website", trustScore: 0.7 },
      { label: "GitHub activity", url: "https://github.com/example", sourceType: "public_dataset", trustScore: 0.6 },
    ],
    supporting: [
      { label: "Community discussion", url: "https://example.com/community", sourceType: "official_website", trustScore: 0.5 },
    ],
    contradicting: [
      { label: "No official announcement", url: "https://example.com/no-announcement", sourceType: "official_website", trustScore: 0.8 },
    ],
  },
  politics: {
    primary: [
      { label: "Election results", url: "https://example.com/election", sourceType: "official_website", trustScore: 0.9 },
    ],
    supporting: [],
    contradicting: [],
  },
  default: {
    primary: [
      { label: "Primary source", url: "https://example.com/primary", sourceType: "official_api", trustScore: 0.8 },
    ],
    supporting: [
      { label: "Supporting source", url: "https://example.com/supporting", sourceType: "public_dataset", trustScore: 0.7 },
    ],
    contradicting: [],
  },
};

export function mockFetchEvidence(
  _obs: SourceObservation,
  understanding: UnderstandingOutput
): EvidenceBundle {
  const bundle =
    EVIDENCE_BY_CATEGORY[understanding.category] ?? EVIDENCE_BY_CATEGORY.default;
  return { ...bundle };
}
