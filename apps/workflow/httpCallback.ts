// RetroPick/my-workflow/httpCallback.ts

import { type Runtime, type HTTPPayload, decodeJson } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "./types/config";
import { publishFromDraft, type PublishFromDraftInput } from "./pipeline/creation/publishFromDraft";
import { createMarkets } from "./pipeline/creation/marketCreator";
import { generateMarketInput } from "./builders/generateMarket";
import type { FeedItem } from "./types/feed";
import type { DraftPublishParams } from "./contracts/reportFormats";

// Interface for the HTTP Payload - create market
interface CreateMarketPayload {
  question: string;
  /** Unix timestamp when market resolves. Default: now + 24h */
  resolveTime?: number;
  /** Category label. Default: "http" */
  category?: string;
  /** Creator address; overrides config.creatorAddress */
  requestedBy?: string;
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
  const question = String(payload.question).trim();
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

export function onHttpTrigger(runtime: Runtime<Config>, payload: HTTPPayload): string {
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
    const publishInput: PublishFromDraftInput = {
      draftId: inputData.draftId as `0x${string}`,
      creator: inputData.creator as `0x${string}`,
      params: inputData.params,
      claimerSig: inputData.claimerSig as `0x${string}`,
    };
    return publishFromDraft(runtime, publishInput);
  }

  // Route: Create market (HTTP)
  const createPayload = inputData as CreateMarketPayload;
  runtime.log("[Step 1] Route: Create market");
  runtime.log(`[Step 1] Received question: ${createPayload.question}`);

  if (!createPayload.question || String(createPayload.question).trim().length === 0) {
    runtime.log("[ERROR] Question is required for create market");
    return "Error: Question is required";
  }

  const requestedBy =
    (createPayload.requestedBy as `0x${string}`) || runtime.config.creatorAddress;
  if (!requestedBy || requestedBy === "0x0000000000000000000000000000000000000000") {
    runtime.log("[ERROR] creatorAddress (config) or requestedBy (payload) required for HTTP create market");
    return "Error: creatorAddress or requestedBy required";
  }

  if (!runtime.config.marketFactoryAddress) {
    runtime.log("[ERROR] marketFactoryAddress is required for HTTP create market");
    return "Error: marketFactoryAddress required";
  }

  const feedItem = buildFeedItemFromPayload(createPayload);
  const marketInput = generateMarketInput(feedItem, requestedBy);
  return createMarkets(runtime, [marketInput]);
}