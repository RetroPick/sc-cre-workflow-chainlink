/**
 * Draft artifact types for CRE Orchestration Layer.
 */
import type { ResolutionPlan } from "./resolutionPlan";

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
};
