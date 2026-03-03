/**
 * Draft proposer job: fetches Polymarket events and proposes drafts to MarketDraftBoard.
 * Only proposes; claimAndSeed + publish remain manual (require creator EIP-712 sig).
 * Requires curatedPath.enabled, draftBoardAddress, RPC, and AI_ORACLE_ROLE for signer.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import { fetchPolymarketEvents } from "../../sources/polymarketEvents";
import { proposeDraft } from "../../contracts/draftBoardClient";
import type { Hex } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_PROPOSE_LIMIT = 5;
const CHAIN_SELECTOR_TO_ID: Record<string, number> = {
  "avalanche-fuji": 43113,
  "ethereum-testnet-sepolia": 11155111,
};

export function onDraftProposer(runtime: Runtime<WorkflowConfig>): string {
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

  const feed: import("../../types/feed").FeedConfig = {
    id: "draftProposer",
    type: "polymarket",
    metadata: { limit: String(DEFAULT_PROPOSE_LIMIT) },
  };

  const drafts = fetchPolymarketEvents(runtime, feed);
  if (drafts.length === 0) {
    runtime.log("[DraftProposer] No Polymarket events to propose.");
    return "No events";
  }

  const proposed: string[] = [];
  for (const d of drafts) {
    try {
      const hash = await proposeDraft({
        question: d.question,
        questionUri: d.questionUri,
        outcomes: d.outcomes,
        outcomesUri: `ipfs://outcomes-${d.externalId.replace(/[^a-z0-9-]/gi, "")}`,
        resolveTime: d.resolveTime,
        tradingOpen: d.tradingOpen,
        tradingClose: d.tradingClose,
        draftBoardAddress: curated.draftBoardAddress as Hex,
        rpcUrl,
        privateKey,
        chainId,
      });
      runtime.log(`[DraftProposer] Proposed ${d.question.slice(0, 40)}...: ${hash}`);
      proposed.push(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runtime.log(`[DraftProposer] Failed to propose: ${msg}`);
    }
  }

  return `Proposed ${proposed.length} drafts`;
}
