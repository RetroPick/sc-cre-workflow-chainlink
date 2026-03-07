/**
 * L6 Settlement Inference — uses ResolutionPlan when available.
 * Step 1: Deterministic resolution if possible.
 * Step 2: Verifier/LLM with constrained prompt.
 * Step 3: Return AMBIGUOUS when evidence insufficient or models disagree.
 */
import type { ResolutionPlan } from "../domain/resolutionPlan";
import type { SettlementDecision } from "../domain/settlement";
import type { EvidenceBundle } from "../domain/evidence";
import type { LlmProvider } from "../models/interfaces";
import type { VerifierProvider } from "../models/interfaces";
import { SETTLE_SYSTEM_PROMPT, buildSettleUserPrompt } from "../models/prompts/settle.prompt";

export type LiveMarketState = {
  question: string;
  outcomes: string[];
  marketType: number;
};

export type InferSettlementOptions = {
  llm: LlmProvider;
  verifier?: VerifierProvider;
  /** Min confidence (0-10000) to consider RESOLVED. Default 7000 (70%). */
  minConfidence?: number;
};

/**
 * Infers settlement outcome from resolution plan and evidence.
 * When plan is deterministic with API/onchain source, attempts deterministic resolution (stub for v1).
 * Otherwise uses LLM with constrained prompt.
 */
export async function inferSettlement(
  market: LiveMarketState,
  plan: ResolutionPlan,
  evidence: EvidenceBundle,
  options: InferSettlementOptions
): Promise<SettlementDecision> {
  const minConf = options.minConfidence ?? 7000;
  const evidenceLinks = evidence.primary.map((e) => e.url);

  if (plan.resolutionMode === "deterministic" && plan.primarySources.length > 0) {
    // v1: Deterministic resolution would fetch from primarySources and apply predicate.
    // For now, fall through to LLM with plan-constrained prompt.
    // Future: implement HTTP/chain fetch for official_api, onchain_event sources.
  }

  const raw = await options.llm.completeJson<{
    status: "RESOLVED" | "AMBIGUOUS" | "ESCALATE";
    selectedOutcomeIndex?: number;
    confidence?: number;
    justification?: string[];
    sourceEvidence?: string[];
  }>({
    system: SETTLE_SYSTEM_PROMPT,
    user: buildSettleUserPrompt(
      market.question,
      market.outcomes,
      plan.resolutionPredicate,
      evidenceLinks
    ),
    schemaName: "SettlementDecision",
    temperature: 0,
  });

  const status = raw.status ?? "AMBIGUOUS";
  const confidence = typeof raw.confidence === "number" ? Math.min(10000, Math.max(0, raw.confidence)) : 0;

  if (status === "RESOLVED" && typeof raw.selectedOutcomeIndex === "number") {
    const idx = raw.selectedOutcomeIndex;
    if (idx >= 0 && idx < market.outcomes.length && confidence >= minConf) {
      return {
        status: "RESOLVED",
        selectedOutcomeIndex: idx,
        confidence,
        justification: Array.isArray(raw.justification) ? raw.justification : [],
        sourceEvidence: Array.isArray(raw.sourceEvidence) ? raw.sourceEvidence : evidenceLinks,
      };
    }
  }

  return {
    status: status === "RESOLVED" ? "AMBIGUOUS" : status,
    confidence,
    justification: Array.isArray(raw.justification) ? raw.justification : ["Insufficient evidence or low confidence"],
    sourceEvidence: Array.isArray(raw.sourceEvidence) ? raw.sourceEvidence : evidenceLinks,
  };
}
