/**
 * Draft proposer job: multi-source draft proposer with analysis core.
 * Fetches observations from registry, runs analyzeCandidate, proposes ALLOW items to MarketDraftBoard.
 * Polymarket is one source; other feeds (news, coinGecko, etc.) also flow through when orchestration enabled.
 * Requires curatedPath.enabled, draftBoardAddress, RPC, and AI_ORACLE_ROLE for signer.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { SourceObservation } from "../../domain/candidate";
import type { WorkflowConfig } from "../../types/config";
import type { FeedItem } from "../../types/feed";
import { fetchObservationsFromRegistry, polymarketDraftToSourceObservation } from "../../sources/registry";
import { fetchPolymarketEvents } from "../../sources/polymarketEvents";
import { analyzeCandidate } from "../orchestration/analyzeCandidate";
import { proposeDraft } from "../../contracts/draftBoardClient";
import { saveResolutionPlan } from "../persistence/resolutionPlanStore";
import { writeDraftRecord } from "./draftWriter";
import { getDefaultDraftRepository } from "../persistence/draftRepository";
import type { Hex } from "viem";
import type { PolymarketDraftInput } from "../../sources/polymarketEvents";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CHAIN_SELECTOR_TO_ID: Record<string, number> = {
  "avalanche-fuji": 43113,
  "ethereum-testnet-sepolia": 11155111,
};

function observationToDraftParams(obs: SourceObservation): {
  question: string;
  questionUri: string;
  outcomes: string[];
  resolveTime: number;
  tradingOpen: number;
  tradingClose: number;
  externalId: string;
} | null {
  const raw = obs.raw;
  if (isPolymarketDraft(raw)) {
    return {
      question: raw.question,
      questionUri: raw.questionUri,
      outcomes: raw.outcomes,
      resolveTime: raw.resolveTime,
      tradingOpen: raw.tradingOpen,
      tradingClose: raw.tradingClose,
      externalId: raw.externalId,
    };
  }
  if (isFeedItem(raw)) {
    const now = Math.floor(Date.now() / 1000);
    return {
      question: raw.question,
      questionUri: raw.question,
      outcomes: ["Yes", "No"],
      resolveTime: raw.resolveTime,
      tradingOpen: now,
      tradingClose: raw.resolveTime,
      externalId: raw.externalId,
    };
  }
  return null;
}

function isPolymarketDraft(x: unknown): x is PolymarketDraftInput {
  return (
    typeof x === "object" &&
    x !== null &&
    "question" in x &&
    "resolveTime" in x &&
    "outcomes" in x &&
    "tradingOpen" in x &&
    "tradingClose" in x
  );
}

function isFeedItem(x: unknown): x is FeedItem {
  return (
    typeof x === "object" &&
    x !== null &&
    "feedId" in x &&
    "question" in x &&
    "resolveTime" in x &&
    "externalId" in x
  );
}

export async function onDraftProposer(runtime: Runtime<WorkflowConfig>): Promise<string> {
  const curated = runtime.config.curatedPath;
  if (!curated?.enabled || !curated?.draftBoardAddress || curated.draftBoardAddress === ZERO_ADDRESS) {
    runtime.log("[DraftProposer] Not enabled (curatedPath.enabled and draftBoardAddress required).");
    return "DraftProposer not enabled";
  }

  const rpcUrl = runtime.config.rpcUrl ?? process.env.RPC_URL;
  const privateKey = (process.env.CRE_ETH_PRIVATE_KEY ?? process.env.DRAFT_PROPOSER_PRIVATE_KEY) as
    | Hex
    | undefined;

  if (!rpcUrl || !privateKey) {
    runtime.log("[DraftProposer] RPC_URL and CRE_ETH_PRIVATE_KEY (or DRAFT_PROPOSER_PRIVATE_KEY) required.");
    return "Missing RPC or private key";
  }

  const evmConfig = runtime.config.evms?.[0];
  if (!evmConfig) {
    runtime.log("[DraftProposer] No evms config.");
    return "No evms config";
  }

  const chainId = CHAIN_SELECTOR_TO_ID[evmConfig.chainSelectorName] ?? 43113;

  const useOrchestration = runtime.config.orchestration?.enabled === true;
  let observations = fetchObservationsFromRegistry(runtime);

  if (observations.length === 0 && runtime.config.feeds?.length === 0) {
    const fallbackFeed: import("../../types/feed").FeedConfig = {
      id: "draftProposer",
      type: "polymarket",
      metadata: { limit: "5", order: "volume_24hr" },
    };
    const origFeeds = runtime.config.feeds;
    (runtime.config as { feeds?: unknown }).feeds = [fallbackFeed];
    observations = fetchObservationsFromRegistry(runtime);
    (runtime.config as { feeds?: unknown }).feeds = origFeeds;
  }

  if (observations.length === 0) {
    runtime.log("[DraftProposer] No observations from registry.");
    return "No observations";
  }

  const toPropose: Array<{ obs: SourceObservation; params: ReturnType<typeof observationToDraftParams> }> = [];

  for (const obs of observations) {
    const params = observationToDraftParams(obs);
    if (!params) continue;

    if (useOrchestration) {
      const result = await analyzeCandidate(runtime, obs, { config: runtime.config });
      if (result.policy.status !== "ALLOW") continue;
      if (result.resolutionPlan) {
        saveResolutionPlan(result.resolutionPlan, {
          question: result.understanding.candidateQuestion,
          draftId: result.draft?.draftId,
        });
      }
      if (result.draft) {
        const draftRepo = getDefaultDraftRepository();
        await writeDraftRecord({
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
      }
    }

    toPropose.push({ obs, params });
  }

  if (toPropose.length === 0) {
    runtime.log("[DraftProposer] No approved drafts to propose.");
    return "No approved drafts";
  }

  const proposed: string[] = [];
  for (const { params } of toPropose) {
    try {
      const hash = await proposeDraft({
        question: params.question,
        questionUri: params.questionUri,
        outcomes: params.outcomes,
        outcomesUri: `ipfs://outcomes-${params.externalId.replace(/[^a-z0-9-]/gi, "")}`,
        resolveTime: params.resolveTime,
        tradingOpen: params.tradingOpen,
        tradingClose: params.tradingClose,
        draftBoardAddress: curated.draftBoardAddress as Hex,
        rpcUrl,
        privateKey,
        chainId,
      });
      runtime.log(`[DraftProposer] Proposed ${params.question.slice(0, 40)}...: ${hash}`);
      proposed.push(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runtime.log(`[DraftProposer] Failed to propose: ${msg}`);
    }
  }

  return `Proposed ${proposed.length} drafts`;
}
