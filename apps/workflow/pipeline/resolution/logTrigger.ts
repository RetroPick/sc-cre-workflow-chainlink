/**
 * Legacy PoolMarketLegacy log-trigger resolution.
 * Listens for SettlementRequested event, reads getMarket, calls AI (binary/categorical/timeline), sends to CREReceiver.
 */
import {
  cre,
  type Runtime,
  type EVMLog,
  getNetwork,
  bytesToHex,
  hexToBase64,
  TxStatus,
} from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi } from "viem";
import { askGPTForOutcome } from "../../gpt";
import type { WorkflowConfig } from "../../types/config";
import {
  readMarket,
  readMarketType,
  readCategoricalOutcomes,
  readTimelineWindows,
} from "../../contracts/poolMarketLegacy";
import { encodeOutcomeReport } from "../../contracts/reportFormats";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const BINARY = 0;
const CATEGORICAL = 1;
const TIMELINE = 2;

const EVENT_ABI = parseAbi([
  "event SettlementRequested(uint256 indexed marketId, string question)",
]);

function logHeader(runtime: Runtime<WorkflowConfig>) {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: Log Trigger - Settle Market");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function logFooter(runtime: Runtime<WorkflowConfig>) {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function decodeSettlementRequested(log: EVMLog) {
  const topics = log.topics.map((t: Uint8Array) => bytesToHex(t)) as [
    `0x${string}`,
    ...`0x${string}`[]
  ];
  const data = bytesToHex(log.data);
  const decoded = decodeEventLog({ abi: EVENT_ABI, data, topics });
  const marketId = decoded.args.marketId as bigint;
  const question = decoded.args.question as string;
  return { marketId, question };
}

export function onLogTrigger(runtime: Runtime<WorkflowConfig>, log: EVMLog): string {
  logHeader(runtime);

  try {
    const creReceiverAddress = runtime.config.creReceiverAddress;
    if (!creReceiverAddress || creReceiverAddress.toLowerCase() === ZERO_ADDRESS) {
      runtime.log("[ERROR] creReceiverAddress required for outcome resolution (set to deployed CREReceiver)");
      logFooter(runtime);
      return "Missing creReceiverAddress";
    }

    const { marketId, question } = decodeSettlementRequested(log);
    runtime.log(`[Step 1] Settlement requested for Market #${marketId}`);
    runtime.log(`[Step 1] Question: "${question}"`);

    runtime.log("[Step 2] Reading market details from contract...");
    const evmConfig = runtime.config.evms[0];
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: evmConfig.chainSelectorName,
      isTestnet: true,
    });

    if (!network) {
      throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
    }

    const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
    const market = readMarket(runtime, evmClient, evmConfig.marketAddress, marketId);

    runtime.log(`[Step 2] Market creator: ${market.creator}`);
    runtime.log(`[Step 2] Already settled: ${market.settled}`);
    runtime.log(`[Step 2] Yes Pool: ${market.totalYesPool}`);
    runtime.log(`[Step 2] No Pool: ${market.totalNoPool}`);

    if (market.settled) {
      runtime.log("[Step 2] Market already settled, skipping...");
      logFooter(runtime);
      return "Market already settled";
    }

    runtime.log("[Step 3] Reading market type and querying AI...");
    const marketType = readMarketType(runtime, evmClient, evmConfig.marketAddress, marketId);
    let outcomes: string[] | undefined;
    let timelineWindows: bigint[] | undefined;
    if (marketType === CATEGORICAL) {
      outcomes = readCategoricalOutcomes(runtime, evmClient, evmConfig.marketAddress, marketId);
    } else if (marketType === TIMELINE) {
      timelineWindows = readTimelineWindows(runtime, evmClient, evmConfig.marketAddress, marketId);
    }

    const { outcomeIndex, confidence } = askGPTForOutcome(
      runtime,
      question,
      marketType,
      outcomes,
      timelineWindows
    );

    runtime.log(`[Step 3] AI outcomeIndex: ${outcomeIndex}`);
    runtime.log(`[Step 3] AI Confidence: ${confidence / 100}%`);

    const marketAddress = evmConfig.marketAddress as `0x${string}`;

    runtime.log("[Step 4] Generating settlement report...");
    const reportData = encodeOutcomeReport(
      marketAddress,
      marketId,
      outcomeIndex,
      confidence
    );

    const reportResponse = runtime
      .report({
        encodedPayload: hexToBase64(reportData),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result();

    runtime.log(`[Step 4] Writing to CREReceiver: ${creReceiverAddress}`);
    const writeResult = evmClient
      .writeReport(runtime, {
        receiver: creReceiverAddress,
        report: reportResponse,
        gasConfig: { gasLimit: evmConfig.gasLimit },
      })
      .result();

    if (writeResult.txStatus === TxStatus.SUCCESS) {
      const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
      runtime.log(`[Step 4] ✓ Settlement successful: ${txHash}`);
      logFooter(runtime);
      return `Settled: ${txHash}`;
    }

    throw new Error(`Transaction failed: ${writeResult.txStatus}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] ${msg}`);
    logFooter(runtime);
    throw err;
  }
}
