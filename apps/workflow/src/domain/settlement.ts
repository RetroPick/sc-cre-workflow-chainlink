/**
 * Settlement decision types for L6 Settlement Inference Layer.
 */
export type SettlementDecision = {
  status: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS" | "ESCALATE";
  selectedOutcomeIndex?: number;
  confidence: number;
  justification: string[];
  sourceEvidence: string[];
};
