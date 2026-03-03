// RetroPick/my-workflow/httpCallback.ts

import { type Runtime, type HTTPPayload, decodeJson } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "./types/config";
import { publishFromDraft, type PublishFromDraftInput } from "./pipeline/creation/publishFromDraft";
import type { DraftPublishParams } from "./contracts/reportFormats";

// Interface for the HTTP Payload - create market (feed-driven)
interface CreateMarketPayload {
  question: string;
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

  // Route: Create market (legacy / feed-driven)
  const createPayload = inputData as CreateMarketPayload;
  runtime.log("[Step 1] Route: Create market");
  runtime.log(`[Step 1] Received question: ${createPayload.question}`);

  if (!createPayload.question || String(createPayload.question).trim().length === 0) {
    runtime.log("[ERROR] Question is required for create market");
    return "Error: Question is required";
  }

  // Create market path is delegated to scheduleTrigger/marketCreator;
  // HTTP trigger for create would need marketFactoryAddress and full MarketInput.
  // For now return Success (original behavior).
  return "Success";
}