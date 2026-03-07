/**
 * V3 MarketRegistry schedule-based resolution.
 * Polls config.resolution.marketIds and/or fetches from relayer (useRelayerMarkets),
 * checks each for due-for-resolution, calls AI for outcome, sends to CREReceiver.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { cre, bytesToHex, hexToBase64, TxStatus, getNetwork } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import { resolveFromPlan } from "./resolveFromPlan";
import { getResolutionPlan } from "../persistence/resolutionPlanStore";
import {
  readMarket,
  readMarketType,
  readCategoricalOutcomes,
  readTimelineWindows,
  MarketTypeEnum,
} from "../../contracts/marketRegistry";
import { encodeOutcomeReport } from "../../contracts/reportFormats";
import { shouldRegisterScheduleResolver } from "../../config/schema";
import { logSettlementDecision, logSettlementArtifact } from "../audit/auditLogger";
import { httpJsonRequest } from "../../utils/http";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function resolveMarketIds(runtime: Runtime<WorkflowConfig>): number[] {
  const configIds = runtime.config.resolution?.marketIds ?? [];
  const useRelayerMarkets = runtime.config.resolution?.useRelayerMarkets === true;
  const relayerUrl = runtime.config.relayerUrl?.replace(/\/$/, "");

  if (!useRelayerMarkets || !relayerUrl) {
    return configIds;
  }

  try {
    const res = httpJsonRequest(runtime, {
      url: `${relayerUrl}/cre/markets`,
      method: "GET",
    });
    const body = JSON.parse(res.bodyText);
    const markets = body.markets ?? [];
    const relayerIds = new Set<number>();
    for (const m of markets) {
      const id = typeof m.marketId === "string" ? parseInt(m.marketId, 10) : Number(m.marketId);
      if (!Number.isNaN(id)) relayerIds.add(id);
    }
    const merged = new Set([...configIds, ...relayerIds]);
    return Array.from(merged);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ScheduleResolver] Failed to fetch /cre/markets: ${msg}; using config marketIds only`);
    return configIds;
  }
}

export async function onScheduleResolver(runtime: Runtime<WorkflowConfig>): Promise<string> {
  if (!shouldRegisterScheduleResolver(runtime.config)) {
    runtime.log("[ScheduleResolver] Not enabled (resolution.mode or marketRegistryAddress).");
    return "Schedule resolver not enabled";
  }

  const creReceiverAddress = runtime.config.creReceiverAddress;
  if (!creReceiverAddress || creReceiverAddress.toLowerCase() === ZERO_ADDRESS) {
    runtime.log("[ScheduleResolver] Missing creReceiverAddress.");
    return "Missing creReceiverAddress";
  }

  const marketIds = resolveMarketIds(runtime);
  if (marketIds.length === 0) {
    runtime.log("[ScheduleResolver] No marketIds (config or relayer).");
    return "No marketIds";
  }

  const evmConfig = runtime.config.evms[0];
  const marketRegistryAddress = evmConfig.marketRegistryAddress;
  if (!marketRegistryAddress || marketRegistryAddress === ZERO_ADDRESS) {
    runtime.log("[ScheduleResolver] marketRegistryAddress not set.");
    return "marketRegistryAddress not set";
  }

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const now = Math.floor(Date.now() / 1000);
  const settled: string[] = [];

  for (const marketIdNum of marketIds) {
    const marketId = BigInt(marketIdNum);
    try {
      const market = readMarket(
        runtime,
        evmClient,
        marketRegistryAddress,
        marketId
      );

      if (market.creator === ZERO_ADDRESS) {
        runtime.log(`[ScheduleResolver] Market ${marketId} does not exist.`);
        continue;
      }

      if (market.settled) {
        runtime.log(`[ScheduleResolver] Market ${marketId} already settled.`);
        continue;
      }

      const resolveTime = Number(market.resolveTime);
      if (resolveTime > now) {
        runtime.log(`[ScheduleResolver] Market ${marketId} resolveTime ${resolveTime} > now.`);
        continue;
      }

      runtime.log(`[ScheduleResolver] Resolving market ${marketId}: ${market.question}`);

      const marketType = readMarketType(
        runtime,
        evmClient,
        marketRegistryAddress,
        marketId
      );
      let outcomes: string[] | undefined;
      let timelineWindows: bigint[] | undefined;
      if (marketType === MarketTypeEnum.Categorical) {
        outcomes = readCategoricalOutcomes(
          runtime,
          evmClient,
          marketRegistryAddress,
          marketId
        );
      } else if (marketType === MarketTypeEnum.Timeline) {
        timelineWindows = readTimelineWindows(
          runtime,
          evmClient,
          marketRegistryAddress,
          marketId
        );
      }

      const resolutionPlan = getResolutionPlan(String(marketId), market.question);
      const result = await resolveFromPlan(
        runtime,
        market.question,
        marketType,
        outcomes,
        timelineWindows,
        resolutionPlan ?? undefined
      );

      if (!result.ok) {
        const ts = Math.floor(Date.now() / 1000);
        logSettlementDecision(
          {
            marketId: String(marketId),
            question: market.question,
            resolutionSourcesUsed: result.artifact?.sourcesUsed ?? [],
            settlementDecision: result.status,
            contradictionStatus: result.reason,
            createdAt: ts,
          },
          runtime
        );
        if (result.artifact) {
          logSettlementArtifact(
            {
              marketId: String(marketId),
              question: market.question,
              outcomeIndex: 0,
              confidence: 0,
              timestamp: ts,
              sourcesUsed: result.artifact.sourcesUsed ?? [],
              resolutionMode: result.artifact.resolutionMode ?? "unknown",
              reasoning: result.artifact.reasoning ?? result.reason,
              reviewRequired: true,
            },
            runtime
          );
        }
        runtime.log(`[ScheduleResolver] Market ${marketId} ${result.reason} - skipping`);
        continue;
      }

      const { outcomeIndex, confidence } = result;

      const reportData = encodeOutcomeReport(
        marketRegistryAddress as `0x${string}`,
        marketId,
        outcomeIndex,
        confidence
      );

      const reportResponse = runtime.report({
        encodedPayload: hexToBase64(reportData),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      }).result();

      const writeResult = evmClient.writeReport(runtime, {
        receiver: creReceiverAddress,
        report: reportResponse,
        gasConfig: { gasLimit: evmConfig.gasLimit },
      }).result();

      if (writeResult.txStatus === TxStatus.SUCCESS) {
        const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
        const ts = Math.floor(Date.now() / 1000);
        logSettlementDecision(
          {
            marketId: String(marketId),
            question: market.question,
            resolutionSourcesUsed: result.artifact?.sourcesUsed ?? [],
            settlementDecision: "RESOLVED",
            outcomeIndex,
            confidence,
            txHash,
            createdAt: ts,
          },
          runtime
        );
        if (result.artifact) {
          logSettlementArtifact(
            {
              marketId: String(marketId),
              question: market.question,
              outcomeIndex,
              confidence,
              timestamp: ts,
              modelsUsed: result.artifact.modelsUsed,
              sourcesUsed: result.artifact.sourcesUsed ?? [],
              resolutionMode: result.artifact.resolutionMode ?? "ai_assisted",
              reasoning: result.artifact.reasoning,
              txHash,
            },
            runtime
          );
        }
        runtime.log(`[ScheduleResolver] Settled market ${marketId}: ${txHash}`);
        settled.push(txHash);
      } else {
        runtime.log(`[ScheduleResolver] Submit failed for market ${marketId}: ${writeResult.txStatus}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runtime.log(`[ScheduleResolver] Market ${marketId} failed: ${msg}`);
    }
  }

  return `Resolved ${settled.length} markets`;
}
