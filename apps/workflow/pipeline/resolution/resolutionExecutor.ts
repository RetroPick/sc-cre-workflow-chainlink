/**
 * Resolution Executor — routes by ResolutionPlan.resolutionMode.
 * Implements deterministic, multi_source_deterministic, ai_assisted, human_review.
 * Per 05_AIEventDrivenLayer.md.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import type { ResolutionPlan, ResolutionSource } from "../../domain/resolutionPlan";
import type { LlmProvider } from "../../models/interfaces";
import { runLLMConsensus } from "./llmConsensus";
import { createLlmProvider } from "../../models/providers/llmProvider";
import { httpJsonRequest } from "../../utils/http";
import { getValueByPath } from "../../utils/jsonPath";

export type ResolutionExecutorResult =
  | {
      status: "SUCCESS";
      outcomeIndex: number;
      confidence: number;
      reasoning: string;
      sourcesUsed: string[];
      resolutionMode: string;
    }
  | { status: "AMBIGUOUS"; reason: string }
  | { status: "ESCALATE"; reason: string }
  | {
      status: "REVIEW_REQUIRED";
      reason: string;
    };

export type ExecutorMarketState = {
  question: string;
  outcomes: string[];
  marketType: number;
};

export type ExecuteResolutionOptions = {
  /** Min confidence (0-10000) to accept. Default 7000 (70%). */
  minConfidence?: number;
  /** Enable multi-LLM consensus for ai_assisted. Default false. */
  multiLlmEnabled?: boolean;
  /** Optional fetcher for testing. When provided, used instead of httpJsonRequest. */
  fetcher?: (url: string) => Promise<{ bodyText: string }>;
  /** Optional LLM providers for testing ai_assisted. When provided, used instead of createLlmProvider. */
  providers?: LlmProvider[];
};

/**
 * Execute resolution per the stored ResolutionPlan.
 * Routes by resolutionMode: deterministic, multi_source_deterministic, ai_assisted, human_review.
 */
export async function executeResolution(
  runtime: Runtime<WorkflowConfig>,
  market: ExecutorMarketState,
  resolutionPlan: ResolutionPlan,
  options?: ExecuteResolutionOptions
): Promise<ResolutionExecutorResult> {
  const minConf = options?.minConfidence ?? 7000;

  switch (resolutionPlan.resolutionMode) {
    case "deterministic":
      return deterministicResolution(runtime, market, resolutionPlan, minConf, options?.fetcher);
    case "multi_source_deterministic":
      return multiSourceDeterministicResolution(runtime, market, resolutionPlan, minConf, options?.fetcher);
    case "ai_assisted":
      return aiAssistedResolution(runtime, market, resolutionPlan, minConf, options?.multiLlmEnabled ?? false, options?.providers);
    case "human_review":
      return { status: "REVIEW_REQUIRED", reason: "Resolution mode is human_review" };
    default:
      return { status: "REVIEW_REQUIRED", reason: `Unsupported resolution mode: ${resolutionPlan.resolutionMode}` };
  }
}

async function deterministicResolution(
  runtime: Runtime<WorkflowConfig>,
  market: ExecutorMarketState,
  plan: ResolutionPlan,
  minConf: number,
  fetcher?: (url: string) => Promise<{ bodyText: string }>
): Promise<ResolutionExecutorResult> {
  if (!plan.primarySources?.length) {
    return { status: "REVIEW_REQUIRED", reason: "Deterministic mode requires primarySources" };
  }

  const source = plan.primarySources[0];

  if (source.sourceType === "onchain_event") {
    return { status: "REVIEW_REQUIRED", reason: "onchain_event deterministic resolution requires EVM client (not yet implemented)" };
  }

  if (source.sourceType === "official_api" || source.sourceType === "official_website" || source.sourceType === "public_dataset") {
    const result = await fetchAndEvaluatePredicate(runtime, source, plan.resolutionPredicate, market.outcomes.length, fetcher);
    if (result.outcomeIndex >= 0 && result.confidence >= minConf) {
      return {
        status: "SUCCESS",
        outcomeIndex: result.outcomeIndex,
        confidence: result.confidence,
        reasoning: "Deterministic oracle resolution",
        sourcesUsed: [source.locator],
        resolutionMode: "deterministic",
      };
    }
    return {
      status: "REVIEW_REQUIRED",
      reason: result.reason ?? "Predicate evaluation failed",
    };
  }

  return { status: "REVIEW_REQUIRED", reason: `Unsupported source type for deterministic: ${source.sourceType}` };
}

async function multiSourceDeterministicResolution(
  runtime: Runtime<WorkflowConfig>,
  market: ExecutorMarketState,
  plan: ResolutionPlan,
  minConf: number,
  fetcher?: (url: string) => Promise<{ bodyText: string }>
): Promise<ResolutionExecutorResult> {
  if (!plan.primarySources?.length) {
    return { status: "REVIEW_REQUIRED", reason: "Multi-source deterministic requires primarySources" };
  }

  const results: { outcomeIndex: number; source: string }[] = [];

  for (const source of plan.primarySources) {
    if (source.sourceType === "onchain_event") continue;
    try {
      const r = await fetchAndEvaluatePredicate(runtime, source, plan.resolutionPredicate, market.outcomes.length, fetcher);
      if (r.outcomeIndex >= 0) {
        results.push({ outcomeIndex: r.outcomeIndex, source: source.locator });
      }
    } catch (err) {
      runtime.log(`[ResolutionExecutor] Source ${source.locator} failed: ${err}`);
    }
  }

  if (results.length === 0) {
    return { status: "REVIEW_REQUIRED", reason: "No primary sources returned valid outcome" };
  }

  const counts: Record<number, number> = {};
  for (const r of results) {
    counts[r.outcomeIndex] = (counts[r.outcomeIndex] ?? 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [outcomeIndexStr, voteCount] = sorted[0];
  const outcomeIndex = Number(outcomeIndexStr);
  const majority = voteCount > results.length / 2;

  if (!majority) {
    return { status: "REVIEW_REQUIRED", reason: "Multi-source deterministic: no majority agreement" };
  }

  const sourcesUsed = results.filter((r) => r.outcomeIndex === outcomeIndex).map((r) => r.source);
  const confidence = Math.min(10000, Math.round((voteCount / results.length) * 10000));

  if (confidence < minConf) {
    return { status: "REVIEW_REQUIRED", reason: `Multi-source confidence ${confidence} below threshold ${minConf}` };
  }

  return {
    status: "SUCCESS",
    outcomeIndex,
    confidence,
    reasoning: "Multi-source deterministic consensus",
    sourcesUsed,
    resolutionMode: "multi_source_deterministic",
  };
}

async function aiAssistedResolution(
  runtime: Runtime<WorkflowConfig>,
  market: ExecutorMarketState,
  plan: ResolutionPlan,
  minConf: number,
  multiLlmEnabled: boolean,
  injectProviders?: LlmProvider[]
): Promise<ResolutionExecutorResult> {
  const providers = injectProviders ?? (() => {
    const llm = createLlmProvider(runtime);
    return multiLlmEnabled ? [llm, llm, llm] : [llm];
  })();

  const consensus = await runLLMConsensus(
    runtime,
    {
      question: market.question,
      outcomes: market.outcomes,
      resolutionPredicate: plan.resolutionPredicate,
      evidenceLinks: plan.primarySources.map((s) => s.locator),
    },
    {
      minConfidence: minConf,
      consensusQuorum: multiLlmEnabled ? 2 : 1,
      providers,
    }
  );

  if (!consensus) {
    return { status: "REVIEW_REQUIRED", reason: "LLM consensus failure" };
  }

  if (consensus.status === "AMBIGUOUS") {
    return { status: "AMBIGUOUS", reason: consensus.reason };
  }
  if (consensus.status === "ESCALATE") {
    return { status: "ESCALATE", reason: consensus.reason };
  }

  return {
    status: "SUCCESS",
    outcomeIndex: (consensus as import("./llmConsensus").LLMResult).outcomeIndex,
    confidence: consensus.confidence,
    reasoning: consensus.reasoning,
    sourcesUsed: consensus.sourcesUsed,
    resolutionMode: "ai_assisted",
  };
}

type PredicateResult = { outcomeIndex: number; confidence: number; reason?: string };

async function fetchAndEvaluatePredicate(
  runtime: Runtime<WorkflowConfig>,
  source: ResolutionSource,
  predicate: string,
  outcomeCount: number,
  fetcher?: (url: string) => Promise<{ bodyText: string }>
): Promise<PredicateResult> {
  let data: unknown;

  try {
    const res = fetcher
      ? await fetcher(source.locator)
      : httpJsonRequest(runtime, { url: source.locator, method: "GET" });
    data = JSON.parse(res.bodyText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { outcomeIndex: -1, confidence: 0, reason: `Fetch failed: ${msg}` };
  }

  const evalResult = evaluatePredicate(data, predicate, outcomeCount);
  return evalResult;
}

/**
 * Evaluate resolution predicate against fetched data.
 * Supports formats: "path > value", "path < value", "path >= value", "path <= value", "path == value".
 * Also supports "value > X" or "> X" to use first numeric value found.
 */
function evaluatePredicate(data: unknown, predicate: string, outcomeCount: number): PredicateResult {
  const trimmed = predicate.trim();

  // Support "> X" or "< X" (no path) — use first numeric value in JSON
  const simpleGt = trimmed.match(/^>\s*([\d.]+)$/);
  if (simpleGt) {
    const threshold = Number(simpleGt[1]);
    const value = findFirstNumber(data);
    if (!Number.isFinite(value)) return { outcomeIndex: -1, confidence: 0, reason: "Could not extract numeric value" };
    return { outcomeIndex: value > threshold ? 1 : 0, confidence: 10000 };
  }
  const simpleLt = trimmed.match(/^<\s*([\d.]+)$/);
  if (simpleLt) {
    const threshold = Number(simpleLt[1]);
    const value = findFirstNumber(data);
    if (!Number.isFinite(value)) return { outcomeIndex: -1, confidence: 0, reason: "Could not extract numeric value" };
    return { outcomeIndex: value < threshold ? 1 : 0, confidence: 10000 };
  }

  const gtMatch = trimmed.match(/^(.+?)\s*>\s*([\d.]+)$/);
  if (gtMatch) {
    const path = gtMatch[1].trim();
    const threshold = Number(gtMatch[2]);
    const value = path ? Number(getValueByPath(data, path)) : findFirstNumber(data);
    if (!Number.isFinite(value)) return { outcomeIndex: -1, confidence: 0, reason: "Could not extract numeric value" };
    const yes = value > threshold;
    return { outcomeIndex: yes ? 1 : 0, confidence: 10000 };
  }

  const ltMatch = trimmed.match(/^(.+?)\s*<\s*([\d.]+)$/);
  if (ltMatch) {
    const path = ltMatch[1].trim();
    const threshold = Number(ltMatch[2]);
    const value = path ? Number(getValueByPath(data, path)) : findFirstNumber(data);
    if (!Number.isFinite(value)) return { outcomeIndex: -1, confidence: 0, reason: "Could not extract numeric value" };
    const yes = value < threshold;
    return { outcomeIndex: yes ? 1 : 0, confidence: 10000 };
  }

  const gteMatch = trimmed.match(/^(.+?)\s*>=\s*([\d.]+)$/);
  if (gteMatch) {
    const path = gteMatch[1].trim();
    const threshold = Number(gteMatch[2]);
    const value = path ? Number(getValueByPath(data, path)) : findFirstNumber(data);
    if (!Number.isFinite(value)) return { outcomeIndex: -1, confidence: 0, reason: "Could not extract numeric value" };
    const yes = value >= threshold;
    return { outcomeIndex: yes ? 1 : 0, confidence: 10000 };
  }

  const lteMatch = trimmed.match(/^(.+?)\s*<=\s*([\d.]+)$/);
  if (lteMatch) {
    const path = lteMatch[1].trim();
    const threshold = Number(lteMatch[2]);
    const value = path ? Number(getValueByPath(data, path)) : findFirstNumber(data);
    if (!Number.isFinite(value)) return { outcomeIndex: -1, confidence: 0, reason: "Could not extract numeric value" };
    const yes = value <= threshold;
    return { outcomeIndex: yes ? 1 : 0, confidence: 10000 };
  }

  const eqMatch = trimmed.match(/^(.+?)\s*==\s*(.+)$/);
  if (eqMatch) {
    const path = eqMatch[1].trim();
    const expected = eqMatch[2].trim().toUpperCase();
    const value = path ? String(getValueByPath(data, path) ?? "").toUpperCase() : String(findFirstValue(data) ?? "").toUpperCase();
    const yes = value === expected || value === "YES" || value === "TRUE" || value === "1";
    return { outcomeIndex: yes ? 1 : 0, confidence: 10000 };
  }

  return { outcomeIndex: -1, confidence: 0, reason: `Unsupported predicate format: ${predicate}` };
}

function findFirstNumber(obj: unknown): number | undefined {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj === "number" && Number.isFinite(obj)) return obj;
  if (typeof obj === "object") {
    for (const v of Object.values(obj)) {
      const n = findFirstNumber(v);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

function findFirstValue(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== "object") return obj;
  for (const v of Object.values(obj)) {
    const r = findFirstValue(v);
    if (r !== undefined) return r;
  }
  return undefined;
}
