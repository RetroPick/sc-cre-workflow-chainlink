/**
 * Evidence types for CRE Orchestration Layer.
 */
export type EvidenceLink = {
  label: string;
  url: string;
  sourceType: string;
  trustScore: number;
  excerpt?: string;
  observedAt?: number;
  signals?: string[];
};

export type EvidenceBundle = {
  primary: EvidenceLink[];
  supporting: EvidenceLink[];
  contradicting: EvidenceLink[];
};
