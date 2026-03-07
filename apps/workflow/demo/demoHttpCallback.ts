/**
 * Demo HTTP callback — proposal preview + publish-from-draft.
 * Uses demoAnalyzeCandidate (mocks) instead of analyzeCandidate.
 * Accepts both "question" and "title" for proposal payload (fixtures use "title").
 */
import { type Runtime, type HTTPPayload, decodeJson } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../src/types/config";
import type { DraftPublishParams } from "../src/contracts/reportFormats";
import type { SourceObservation } from "../src/domain/candidate";
import type { MarketBrief } from "../src/domain/marketBrief";
import { publishFromDraft, type PublishFromDraftInput } from "../src/pipeline/creation/publishFromDraft";
import { writeDraftRecord, markDraftPublished } from "../src/pipeline/creation/draftWriter";
import { getDefaultDraftRepository } from "../src/pipeline/persistence/draftRepository";
import { revalidateForPublish } from "../src/pipeline/creation/publishRevalidation";
import { demoAnalyzeCandidate } from "./demoAnalyzeCandidate";

type Config = WorkflowConfig;

interface ProposalPayload {
  title?: string;
  question?: string;
  body?: string;
  tags?: string[];
  sourceType?: string;
  resolveTime?: number;
  category?: string;
}

interface PublishPayload {
  action?: "publish";
  draftId: string;
  creator: string;
  params: DraftPublishParams;
  claimerSig: string;
}

function isPublishPayload(obj: unknown): obj is PublishPayload {
  const o = obj as Record<string, unknown>;
  return (
    typeof o?.draftId === "string" &&
    typeof o?.creator === "string" &&
    o?.params != null &&
    typeof o?.claimerSig === "string" &&
    typeof (o.params as Record<string, unknown>)?.question === "string" &&
    typeof (o.params as Record<string, unknown>)?.marketType === "number"
  );
}

function ensureDraftPublishParams(p: DraftPublishParams): DraftPublishParams {
  return {
    question: p.question,
    marketType: p.marketType,
    outcomes: Array.isArray(p.outcomes) ? p.outcomes : [],
    timelineWindows: Array.isArray(p.timelineWindows) ? p.timelineWindows : [],
    resolveTime: typeof p.resolveTime === "number" ? p.resolveTime : 0,
    tradingOpen: typeof p.tradingOpen === "number" ? p.tradingOpen : 0,
    tradingClose: typeof p.tradingClose === "number" ? p.tradingClose : 0,
  };
}

function normalizeProposalToObservation(payload: ProposalPayload): SourceObservation {
  const now = Math.floor(Date.now() / 1000);
  const question = String(payload.title ?? payload.question ?? "").trim();
  const resolveTime = payload.resolveTime ?? now + 86400;
  const category = payload.category ?? "http";
  const externalId = `http:${now}:${question.substring(0, 64)}`;

  return {
    sourceType: "http",
    sourceId: "http-proposal",
    externalId,
    observedAt: now,
    title: question,
    body: payload.body,
    url: "http-trigger",
    tags: payload.tags ?? (category ? [category] : undefined),
    eventTime: resolveTime,
    raw: { feedId: "http", question, category, resolveTime, sourceUrl: "http-trigger", externalId },
  };
}

export async function onDemoHttpTrigger(
  runtime: Runtime<Config>,
  payload: HTTPPayload
): Promise<string> {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Demo: HTTP Trigger");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (!payload.input || payload.input.length === 0) {
    runtime.log("[ERROR] Invalid payload: empty input");
    return "Error: Empty Request";
  }

  const inputData = decodeJson(payload.input) as Record<string, unknown>;

  // Route: Publish-from-draft
  if (isPublishPayload(inputData)) {
    runtime.log("[Step 1] Route: Publish from draft");
    const draftRepo = getDefaultDraftRepository();
    const record = await draftRepo.get(inputData.draftId);
    if (!record) {
      runtime.log("[Publish] Draft not found: " + inputData.draftId);
      return JSON.stringify({ ok: false, error: "Draft not found" });
    }
    const revalidation = revalidateForPublish(record, {
      draftId: inputData.draftId,
      creator: inputData.creator,
      params: inputData.params,
      claimerSig: inputData.claimerSig,
    });
    if (!revalidation.ok) {
      runtime.log("[Publish] Revalidation failed: " + revalidation.reason);
      return JSON.stringify({ ok: false, error: revalidation.reason });
    }
    const publishInput: PublishFromDraftInput = {
      draftId: inputData.draftId as `0x${string}`,
      creator: inputData.creator as `0x${string}`,
      params: ensureDraftPublishParams(inputData.params),
      claimerSig: inputData.claimerSig as `0x${string}`,
    };
    const result = publishFromDraft(runtime, publishInput);
    const isTxHash = typeof result === "string" && result.startsWith("0x") && result.length === 66;
    if (isTxHash) {
      await markDraftPublished({ repo: draftRepo, draftId: inputData.draftId });
      return JSON.stringify({ ok: true, txHash: result });
    }
    return JSON.stringify({ ok: false, error: result });
  }

  // Route: Proposal preview
  const proposalPayload = inputData as ProposalPayload;
  const question = String(proposalPayload.title ?? proposalPayload.question ?? "").trim();
  if (!question) {
    runtime.log("[ERROR] title or question required for proposal");
    return "Error: title or question required";
  }

  runtime.log("[Step 1] Route: Proposal preview");
  runtime.log(`[Step 1] Received: ${question}`);

  const observation = normalizeProposalToObservation(proposalPayload);
  const result = await demoAnalyzeCandidate(runtime, observation);

  const response = {
    ok: true,
    policy: {
      status: result.policy.status,
      reasons: result.policy.reasons,
      policyVersion: result.policy.policyVersion,
      ruleHits: result.policy.ruleHits ?? [],
    },
    understanding: {
      category: result.understanding.category,
      eventType: result.understanding.eventType,
      candidateQuestion: result.understanding.candidateQuestion,
      marketType: result.understanding.marketType,
      ambiguityScore: result.understanding.ambiguityScore,
      marketabilityScore: result.understanding.marketabilityScore,
    },
    resolutionPlan: {
      resolutionMode: result.resolutionPlan.resolutionMode,
      oracleabilityScore: result.resolutionPlan.oracleabilityScore,
      unresolvedCheckPassed: result.resolutionPlan.unresolvedCheckPassed,
      primarySources: result.resolutionPlan.primarySources.map((s) => ({
        sourceType: s.sourceType,
        locator: s.locator,
        trustScore: s.trustScore,
      })),
      reasons: result.resolutionPlan.reasons ?? [],
    },
    draft: result.draft
      ? {
          draftId: result.draft.draftId,
          canonicalQuestion: result.draft.canonicalQuestion,
          outcomes: result.draft.outcomes,
          explanation: result.draft.explanation,
          evidenceLinks: result.draft.evidenceLinks,
        }
      : undefined,
  };

  if (result.policy.status === "ALLOW" || result.policy.status === "REVIEW") {
    if (result.draft) {
      const draftRepo = getDefaultDraftRepository();
      const record = await writeDraftRecord({
        repo: draftRepo,
        observation: result.observation,
        understanding: result.understanding,
        risk: result.risk,
        evidence: result.evidence,
        resolutionPlan: result.resolutionPlan,
        policy: result.policy,
        draft: result.draft,
        brochure: result.marketBrief as MarketBrief,
        expiresAt: Math.floor(Date.now() / 1000) + 86400 * 7,
      });
      return JSON.stringify({
        ...response,
        draftId: record.draftId,
        status: record.status,
        brochure: record.brochure,
      });
    }
  }

  return JSON.stringify(response);
}
