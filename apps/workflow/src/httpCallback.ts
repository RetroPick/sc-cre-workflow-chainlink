// RetroPick/my-workflow/httpCallback.ts

import { type Runtime, type HTTPPayload, decodeJson } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "./types/config";
import { publishFromDraft, type PublishFromDraftInput } from "./pipeline/creation/publishFromDraft";
import { createMarkets } from "./pipeline/creation/marketCreator";
import { generateMarketInput } from "./builders/generateMarket";
import type { FeedItem } from "./types/feed";
import type { DraftPublishParams } from "./contracts/reportFormats";
import type { SourceObservation } from "./domain/candidate";
import { analyzeCandidate } from "./pipeline/orchestration/analyzeCandidate";
import { saveResolutionPlan } from "./pipeline/persistence/resolutionPlanStore";
import { writeDraftRecord, markDraftPublished } from "./pipeline/creation/draftWriter";
import { getDefaultDraftRepository } from "./pipeline/persistence/draftRepository";
import { revalidateForPublish } from "./pipeline/creation/publishRevalidation";
import { requiresEligibilityCheck } from "./pipeline/privacy/privacyRouter";
import { getDefaultEligibilityProvider } from "./pipeline/privacy/providers";
import { makePrivacyAuditRecord, logPrivacyAudit } from "./pipeline/privacy/privacyAudit";

// Interface for the HTTP Payload - create market
interface CreateMarketPayload {
  /** Primary field for the market question */
  question?: string;
  /** Alias for question (demo fixtures use "title") */
  title?: string;
  /** Unix timestamp when market resolves. Default: now + 24h */
  resolveTime?: number;
  /** Category label. Default: "http" */
  category?: string;
  /** Creator address; overrides config.creatorAddress */
  requestedBy?: string;
  /** When true with orchestration.enabled: run analysis and return preview (no create) */
  preview?: boolean;
  /** Privacy profile for the market. Per 07_PrivacyPreservingExtensions.md. */
  privacyProfile?: import("./domain/privacy").PrivacyProfile;
}

// Response type for proposal preview / draft creation
interface ProposalPreviewResponse {
  ok: boolean;
  policy: { status: string; reasons: string[]; policyVersion: string; ruleHits?: string[] };
  understanding: Record<string, unknown>;
  resolutionPlan: Record<string, unknown>;
  draft?: {
    draftId: string;
    canonicalQuestion: string;
    outcomes: string[];
    explanation: string;
    evidenceLinks: string[];
  };
  draftId?: string;
  status?: string;
  brochure?: import("./domain/marketBrief").MarketBrief;
}

// Interface for publish-from-draft (curated path)
interface PublishPayload {
  action?: "publish";
  draftId: string;
  creator: string;
  params: DraftPublishParams;
  claimerSig: string;
}

type Config = WorkflowConfig;

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

function buildFeedItemFromPayload(payload: CreateMarketPayload): FeedItem {
  const now = Math.floor(Date.now() / 1000);
  const resolveTime = payload.resolveTime ?? now + 86400;
  const category = payload.category ?? "http";
  const question = String(payload.title ?? payload.question ?? "").trim();
  const externalId = `http:${now}:${question.substring(0, 64)}`;
  return {
    feedId: "http",
    question,
    category,
    resolveTime,
    sourceUrl: "http-trigger",
    externalId,
  };
}

/** Ensure DraftPublishParams has required fields (e.g. timelineWindows). */
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

/** Converts HTTP proposal payload to SourceObservation for analysis core. */
function normalizeProposalToObservation(payload: CreateMarketPayload): SourceObservation {
  const now = Math.floor(Date.now() / 1000);
  const resolveTime = payload.resolveTime ?? now + 86400;
  const category = payload.category ?? "http";
  const question = String(payload.title ?? payload.question ?? "").trim();
  const externalId = `http:${now}:${question.substring(0, 64)}`;
  const feedItem = buildFeedItemFromPayload(payload);
  return {
    sourceType: "http",
    sourceId: "http-proposal",
    externalId,
    observedAt: now,
    title: question,
    url: "http-trigger",
    tags: category ? [category] : undefined,
    eventTime: resolveTime,
    raw: feedItem,
    privacyProfile: payload.privacyProfile,
  };
}

export async function onHttpTrigger(runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: HTTP Trigger");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (!payload.input || payload.input.length === 0) {
    runtime.log("[ERROR] Invalid payload: empty input");
    return "Error: Empty Request";
  }

  const inputData = decodeJson(payload.input) as Record<string, unknown>;

  // Route: Publish-from-draft (curated path)
  if (isPublishPayload(inputData)) {
    runtime.log("[Step 1] Route: Publish from draft");
    const draftRepo = getDefaultDraftRepository();
    const record = await draftRepo.get(inputData.draftId);
    if (!record) {
      runtime.log("[Publish] Draft not found: " + inputData.draftId);
      return JSON.stringify({ ok: false, error: "Draft not found" });
    }
    // Eligibility gate for COMPLIANCE_GATED markets (07_PrivacyPreservingExtensions)
    const profile = record.draft?.privacyProfile ?? "PUBLIC";
    if (
      requiresEligibilityCheck(profile) &&
      runtime.config.privacy?.enabled
    ) {
      const eligibilityProvider = getDefaultEligibilityProvider();
      const decision = await eligibilityProvider.checkEligibility({
        wallet: inputData.creator,
        marketId: inputData.draftId,
        policyProfile: "RETROPICK_RESTRICTED_MARKET_V1",
      });
      const auditRecord = makePrivacyAuditRecord({
        marketId: inputData.draftId,
        workflowType: "ELIGIBILITY_CHECK",
        privacyProfile: profile,
        providerType: "MockEligibilityProvider",
        actionTaken: decision.allowed ? "ALLOWED" : "DENIED",
        disclosedOutput: { allowed: decision.allowed, reasonCode: decision.reasonCode },
        privateReferenceId: decision.privateReferenceId,
      });
      logPrivacyAudit(auditRecord, runtime);
      if (!decision.allowed) {
        runtime.log("[Publish] Eligibility denied: " + decision.reasonCode);
        return JSON.stringify({ ok: false, error: decision.reasonCode });
      }
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

  // Route: Create market (HTTP)
  const createPayload = inputData as CreateMarketPayload;
  const question = String(createPayload.title ?? createPayload.question ?? "").trim();
  runtime.log("[Step 1] Route: Create market");
  runtime.log(`[Step 1] Received question: ${question}`);

  if (!question) {
    runtime.log("[ERROR] Question or title is required for create market");
    return "Error: Question is required";
  }

  const requestedBy =
    (createPayload.requestedBy as `0x${string}`) || runtime.config.creatorAddress;
  if (!requestedBy || requestedBy === "0x0000000000000000000000000000000000000000") {
    runtime.log("[ERROR] creatorAddress (config) or requestedBy (payload) required for HTTP create market");
    return "Error: creatorAddress or requestedBy required";
  }

  const useOrchestration = runtime.config.orchestration?.enabled === true;

  if (useOrchestration) {
    const observation = normalizeProposalToObservation(createPayload);
    const result = await analyzeCandidate(runtime, observation, { config: runtime.config });
    if (result.draft && result.resolutionPlan) {
      saveResolutionPlan(result.resolutionPlan, {
        question: result.understanding.candidateQuestion,
        draftId: result.draft?.draftId,
      });
    }
    const response: ProposalPreviewResponse = {
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
    if (createPayload.preview) {
      return JSON.stringify(response);
    }
    const useDraftingPipeline = runtime.config.orchestration?.draftingPipeline === true;
    if (result.policy.status === "ALLOW" || result.policy.status === "REVIEW") {
      if (useDraftingPipeline && result.draft) {
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
          brochure: result.marketBrief,
          expiresAt: Math.floor(Date.now() / 1000) + 86400 * 7,
        });
        return JSON.stringify({
          ...response,
          draftId: record.draftId,
          status: record.status,
          brochure: record.brochure,
        });
      }
      if (!useDraftingPipeline && result.policy.status === "ALLOW" && runtime.config.marketFactoryAddress) {
        const feedItem = buildFeedItemFromPayload(createPayload);
        const marketInput = generateMarketInput(feedItem, requestedBy);
        const createResult = createMarkets(runtime, [marketInput]);
        return JSON.stringify({ ...response, createResult });
      }
    }
    return JSON.stringify(response);
  }

  if (!runtime.config.marketFactoryAddress) {
    runtime.log("[ERROR] marketFactoryAddress is required for HTTP create market");
    return "Error: marketFactoryAddress required";
  }

  const feedItem = buildFeedItemFromPayload(createPayload);
  const marketInput = generateMarketInput(feedItem, requestedBy);
  return createMarkets(runtime, [marketInput]);
}
