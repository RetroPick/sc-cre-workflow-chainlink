/**
 * Multi-LLM consensus engine for AI-assisted settlement.
 * Per 05_AIEventDrivenLayer.md — reduces hallucination risk via multi-oracle consensus.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import type { LlmProvider } from "../../models/interfaces";
import { createLlmProvider } from "../../models/providers/llmProvider";
import { SETTLE_SYSTEM_PROMPT, buildSettleUserPrompt } from "../../models/prompts/settle.prompt";

export type LLMResult = {
  outcomeIndex: number;
  confidence: number;
  reasoning: string;
  sourcesUsed: string[];
  providerId: string;
};

export type LLMConsensusArgs = {
  question: string;
  outcomes: string[];
  resolutionPredicate: string;
  evidenceLinks: string[];
};

export type LLMConsensusOptions = {
  /** Min confidence (0-10000) to accept. Default 7000 (70%). */
  minConfidence?: number;
  /** Quorum: min number of agreeing models. Default 2 for 2/3. */
  consensusQuorum?: number;
  /** Providers to use. Default: single from createLlmProvider. */
  providers?: LlmProvider[];
  providerIds?: string[];
};

export type LLMConsensusFailure =
  | { status: "AMBIGUOUS"; reason: string }
  | { status: "ESCALATE"; reason: string };

/**
 * Runs multiple LLMs in parallel and applies consensus rules.
 * - Unanimous: accept
 * - Majority (>= quorum) + min confidence: accept
 * - Single provider returns AMBIGUOUS/ESCALATE: propagate that status
 * - Else: return null (REVIEW_REQUIRED)
 */
export async function runLLMConsensus(
  runtime: Runtime<WorkflowConfig>,
  args: LLMConsensusArgs,
  options?: LLMConsensusOptions
): Promise<LLMResult | LLMConsensusFailure | null> {
  const minConf = options?.minConfidence ?? 7000;
  const quorum = options?.consensusQuorum ?? 2;

  const providers = options?.providers ?? [createLlmProvider(runtime)];
  const providerIds = options?.providerIds ?? providers.map((_, i) => `llm-${i}`);

  const userPrompt = buildSettleUserPrompt(
    args.question,
    args.outcomes,
    args.resolutionPredicate,
    args.evidenceLinks
  );

  type TaskResult =
    | { kind: "resolved"; result: LLMResult }
    | { kind: "ambiguous"; reason: string }
    | { kind: "escalate"; reason: string }
    | { kind: "invalid"; reason: string };

  const tasks = providers.map(async (provider, i): Promise<TaskResult> => {
    const raw = await provider.completeJson<{
      status: "RESOLVED" | "AMBIGUOUS" | "ESCALATE";
      selectedOutcomeIndex?: number;
      confidence?: number;
      justification?: string[];
      sourceEvidence?: string[];
    }>({
      system: SETTLE_SYSTEM_PROMPT,
      user: userPrompt,
      schemaName: "SettlementDecision",
      temperature: 0,
    });

    const status = raw.status ?? "AMBIGUOUS";
    const confidence = typeof raw.confidence === "number"
      ? Math.min(10000, Math.max(0, raw.confidence))
      : 0;
    const reason = Array.isArray(raw.justification) ? raw.justification.join("; ") : "Insufficient evidence";

    if (status === "RESOLVED" && typeof raw.selectedOutcomeIndex === "number") {
      const idx = raw.selectedOutcomeIndex;
      if (idx >= 0 && idx < args.outcomes.length) {
        return {
          kind: "resolved",
          result: {
            outcomeIndex: idx,
            confidence,
            reasoning: reason,
            sourcesUsed: Array.isArray(raw.sourceEvidence) ? raw.sourceEvidence : args.evidenceLinks,
            providerId: providerIds[i] ?? `llm-${i}`,
          },
        };
      }
    }

    if (status === "ESCALATE") {
      return { kind: "escalate", reason };
    }
    return { kind: "ambiguous", reason };
  });

  const results = await Promise.all(tasks);
  const valid = results.filter((r): r is { kind: "resolved"; result: LLMResult } => r.kind === "resolved").map((r) => r.result);

  if (valid.length === 0) {
    const first = results[0];
    if (first?.kind === "ambiguous") {
      return { status: "AMBIGUOUS", reason: first.reason };
    }
    if (first?.kind === "escalate") {
      return { status: "ESCALATE", reason: first.reason };
    }
    return null;
  }

  const counts: Record<number, number> = {};
  for (const r of valid) {
    counts[r.outcomeIndex] = (counts[r.outcomeIndex] ?? 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [outcomeIndexStr, voteCount] = sorted[0] ?? ["0", 0];
  const outcomeIndex = Number(outcomeIndexStr);

  if (voteCount < quorum) {
    return null;
  }

  const agreeing = valid.filter((r) => r.outcomeIndex === outcomeIndex);
  const avgConfidence =
    agreeing.reduce((sum, r) => sum + r.confidence, 0) / agreeing.length;

  if (avgConfidence < minConf) {
    return null;
  }

  return {
    outcomeIndex,
    confidence: Math.round(avgConfidence),
    reasoning: agreeing.map((r) => r.reasoning).filter(Boolean).join(" | ") || "LLM consensus",
    sourcesUsed: [...new Set(agreeing.flatMap((r) => r.sourcesUsed))],
    providerId: agreeing.map((r) => r.providerId).join(","),
  };
}
