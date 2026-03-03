/**
 * V3 MarketRegistry schedule-based resolution.
 * Polls config.resolution.marketIds, checks each for due-for-resolution,
 * calls AI for outcome (binary/categorical/timeline), sends to CREReceiver.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { cre, bytesToHex, hexToBase64, TxStatus, getNetwork } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import { askGPTForOutcome } from "../../gpt";
import {
  readMarket,
  readMarketType,
  readCategoricalOutcomes,
  readTimelineWindows,
  MarketTypeEnum,
} from "../../contracts/marketRegistry";
import { encodeOutcomeReport } from "../../contracts/reportFormats";
import { shouldRegisterScheduleResolver } from "../../config/schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function onScheduleResolver(runtime: Runtime<WorkflowConfig>): string {
  if (!shouldRegisterScheduleResolver(runtime.config)) {
    runtime.log("[ScheduleResolver] Not enabled (resolution.mode or marketRegistryAddress).");
    return "Schedule resolver not enabled";
  }

  const creReceiverAddress = runtime.config.creReceiverAddress;
  if (!creReceiverAddress || creReceiverAddress.toLowerCase() === ZERO_ADDRESS) {
    runtime.log("[ScheduleResolver] Missing creReceiverAddress.");
    return "Missing creReceiverAddress";
  }

  const marketIds = runtime.config.resolution?.marketIds ?? [];
  if (marketIds.length === 0) {
    runtime.log("[ScheduleResolver] No marketIds configured.");
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

      const { outcomeIndex, confidence } = askGPTForOutcome(
        runtime,
        market.question,
        marketType,
        outcomes,
        timelineWindows
      );

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
