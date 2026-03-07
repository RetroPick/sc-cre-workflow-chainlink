/**
 * Resolution from plan — uses resolutionExecutor when plan provided.
 * When plan provided: routes via executeResolution (deterministic / multi-source / ai_assisted).
 * When plan null: delegates to askGPTForOutcome (legacy).
 * Per 05_AIEventDrivenLayer.md.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import type { ResolutionPlan } from "../../domain/resolutionPlan";
import type { SettlementArtifact } from "../../domain/settlementArtifact";
import { askGPTForOutcome } from "../../gpt";
import { executeResolution } from "./resolutionExecutor";

export type ResolveResult =
  | { ok: true; outcomeIndex: number; confidence: number; artifact?: Partial<SettlementArtifact> }
  | { ok: false; status: "AMBIGUOUS" | "UNRESOLVED" | "ESCALATE"; reason: string; artifact?: Partial<SettlementArtifact> };

export async function resolveFromPlan(
  runtime: Runtime<WorkflowConfig>,
  question: string,
  marketType: number,
  outcomes?: string[],
  timelineWindows?: bigint[],
  resolutionPlan?: ResolutionPlan | null
): Promise<ResolveResult> {
  if (!resolutionPlan || !resolutionPlan.primarySources?.length) {
    const legacy = askGPTForOutcome(runtime, question, marketType, outcomes, timelineWindows);
    return { ok: true, outcomeIndex: legacy.outcomeIndex, confidence: legacy.confidence };
  }

  const marketOutcomes =
    marketType === 0
      ? ["Yes", "No"]
      : outcomes && outcomes.length >= 2
        ? outcomes
        : ["Yes", "No"];

  const resolutionConfig = runtime.config.resolution as { multiLlmEnabled?: boolean; minConfidence?: number } | undefined;
  const result = await executeResolution(
    runtime,
    { question, outcomes: marketOutcomes, marketType },
    resolutionPlan,
    {
      minConfidence: resolutionConfig?.minConfidence ?? 7000,
      multiLlmEnabled: resolutionConfig?.multiLlmEnabled ?? false,
    }
  );

  if (result.status === "SUCCESS") {
    return {
      ok: true,
      outcomeIndex: result.outcomeIndex,
      confidence: result.confidence,
      artifact: {
        outcomeIndex: result.outcomeIndex,
        confidence: result.confidence,
        sourcesUsed: result.sourcesUsed,
        resolutionMode: result.resolutionMode,
        reasoning: result.reasoning,
      },
    };
  }

  const status = result.status === "AMBIGUOUS" ? "AMBIGUOUS" : result.status === "ESCALATE" ? "ESCALATE" : "ESCALATE";
  return {
    ok: false,
    status,
    reason: result.reason,
    artifact: { reviewRequired: true, reasoning: result.reason },
  };
}
