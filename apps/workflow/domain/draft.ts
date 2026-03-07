/**
 * Draft artifact types for CRE Orchestration Layer.
 */
import type { ResolutionPlan } from "./resolutionPlan";
import type { PrivacyProfile } from "./privacy";
import type { PrivacyProfile } from "./privacy";

export type DraftArtifact = {
  draftId: string;
  canonicalQuestion: string;
  marketType: "binary" | "categorical" | "timeline";
  outcomes: string[];
  category: string;
  explanation: string;
  evidenceLinks: string[];
  policyVersion: string;
  policyDecision: "ALLOW" | "REVIEW" | "REJECT";
  policyReasons: string[];
  resolutionPlan: ResolutionPlan;
  confidence: {
    topic: number;
    risk: number;
    oracleability: number;
    explanation: number;
  };
  createdAt: number;
  /** Privacy profile for confidential workflows. Default PUBLIC when unset. */
  privacyProfile?: PrivacyProfile;
};
