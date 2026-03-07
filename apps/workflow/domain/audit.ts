/**
 * Audit record types for Safety & Compliance Layer.
 * Per 03_SafetyComplienceLayer.md §12.
 */
import type { SourceObservation } from "./candidate";
import type { UnderstandingOutput } from "./understanding";
import type { RiskScores } from "./risk";
import type { EvidenceBundle } from "./evidence";
import type { ResolutionPlan } from "./resolutionPlan";
import type { PolicyDecision } from "./policy";
import type { DraftArtifact } from "./draft";

export type DraftAuditRecord = {
  candidateId: string;
  sourceType: string;
  sourceId: string;
  externalId: string;
  observedAt: number;
  understanding: {
    category: string;
    eventType: string;
    candidateQuestion: string;
    marketType: string;
    ambiguityScore: number;
    marketabilityScore: number;
  };
  risk: {
    overallRisk: number;
    gamblingLanguageRisk: number;
    flaggedTerms: string[];
  };
  resolutionPlan: {
    resolutionMode: string;
    oracleabilityScore: number;
    unresolvedCheckPassed: boolean;
    primarySourceCount: number;
  };
  policy: {
    status: PolicyDecision["status"];
    reasons: string[];
    ruleHits: string[];
    policyVersion: string;
  };
  draftId?: string;
  createdAt: number;
};

export type SettlementAuditRecord = {
  marketId: string | number;
  question: string;
  resolutionSourcesUsed: string[];
  settlementDecision: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS" | "ESCALATE";
  outcomeIndex?: number;
  confidence?: number;
  contradictionStatus?: string;
  txHash?: string;
  createdAt: number;
};
