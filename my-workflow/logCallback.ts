// prediction-market/my-workflow/logCallback.ts

import {
  cre,
  type Runtime,
  type EVMLog,
  getNetwork,
  bytesToHex,
  hexToBase64,
  TxStatus,
  encodeCallMsg,
} from "@chainlink/cre-sdk";

import {
  decodeEventLog,
  parseAbi,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
} from "viem";

import { askGPT } from "./gpt";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type Config = {
  openaiApiKey: string;
  evms: Array<{
    marketAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};

interface Market {
  creator: string;
  createdAt: bigint;
  settledAt: bigint;
  settled: boolean;
  confidence: number;
  outcome: number; // 0 = YES, 1 = NO
  totalYesPool: bigint;
  totalNoPool: bigint;
  question: string;
}

interface GPTResult {
  result: "YES" | "NO" | "INCONCLUSIVE";
  confidence: number; // 0-10000 (basis points * 100)
}

/* -------------------------------------------------------------------------- */
/*                                    ABI                                     */
/* -------------------------------------------------------------------------- */

/** SettlementRequested(uint256 indexed marketId, string question) */
const EVENT_ABI = parseAbi([
  "event SettlementRequested(uint256 indexed marketId, string question)",
]);

/** getMarket(uint256 marketId) -> Market tuple */
const GET_MARKET_ABI = [
  {
    name: "getMarket",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "createdAt", type: "uint48" },
          { name: "settledAt", type: "uint48" },
          { name: "settled", type: "bool" },
          { name: "confidence", type: "uint16" },
          { name: "outcome", type: "uint8" },
          { name: "totalYesPool", type: "uint256" },
          { name: "totalNoPool", type: "uint256" },
          { name: "question", type: "string" },
        ],
      },
    ],
  },
] as const;

const SETTLEMENT_PARAMS = parseAbiParameters(
  "uint256 marketId, uint8 outcome, uint16 confidence"
);

/* -------------------------------------------------------------------------- */
/*                               Small Helpers                                */
/* -------------------------------------------------------------------------- */

function logHeader(runtime: Runtime<Config>) {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("CRE Workflow: Log Trigger - Settle Market");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

function logFooter(runtime: Runtime<Config>) {
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

function getEvmClient(runtime: Runtime<Config>) {
  const evmConfig = runtime.config.evms[0];
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
  }

  const client = new cre.capabilities.EVMClient(network.chainSelector.selector);
  return { evmConfig, network, client };
}

function readMarket(
  runtime: Runtime<Config>,
  evmClient: cre.capabilities.EVMClient,
  marketAddress: string,
  marketId: bigint
): Market {
  const callData = encodeFunctionData({
    abi: GET_MARKET_ABI,
    functionName: "getMarket",
    args: [marketId],
  });

  const readResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: marketAddress,
        data: callData,
      }),
    })
    .result();

  const market = decodeFunctionResult({
    abi: GET_MARKET_ABI,
    functionName: "getMarket",
    data: bytesToHex(readResult.data),
  }) as Market;

  return market;
}

function extractGptJsonOrThrow(gptText: string): GPTResult {
  const jsonMatch = gptText.match(
    /\{[\s\S]*"result"[\s\S]*"confidence"[\s\S]*\}/
  );
  if (!jsonMatch) {
    throw new Error(`Could not find JSON in AI response: ${gptText}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as GPTResult;

  if (!["YES", "NO"].includes(parsed.result)) {
    throw new Error(
      `Cannot settle: AI returned ${parsed.result}. Only YES or NO can settle a market.`
    );
  }
  if (parsed.confidence < 0 || parsed.confidence > 10000) {
    throw new Error(`Invalid confidence: ${parsed.confidence}`);
  }

  return parsed;
}

function buildReport(runtime: Runtime<Config>, marketId: bigint, outcome: 0 | 1, confidence: number) {
  // encode: (marketId, outcome, confidence)
  const settlementData = encodeAbiParameters(SETTLEMENT_PARAMS, [
    marketId,
    outcome,
    confidence,
  ]);

  // add a simple prefix/version byte 0x01
  const reportData = ("0x01" + settlementData.slice(2)) as `0x${string}`;

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  return reportResponse;
}

function writeSettlementReport(
  runtime: Runtime<Config>,
  evmClient: cre.capabilities.EVMClient,
  receiver: string,
  report: unknown,
  gasLimit: string
) {
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver,
      report,
      gasConfig: {
        gasLimit,
      },
    })
    .result();

  return writeResult;
}

/* -------------------------------------------------------------------------- */
/*                                Main Handler                                */
/* -------------------------------------------------------------------------- */

export function onLogTrigger(runtime: Runtime<Config>, log: EVMLog): string {
  logHeader(runtime);

  try {
    // Step 1: Decode event log
    const { marketId, question } = decodeSettlementRequested(log);
    runtime.log(`[Step 1] Settlement requested for Market #${marketId}`);
    runtime.log(`[Step 1] Question: "${question}"`);

    // Step 2: Read market details
    runtime.log("[Step 2] Reading market details from contract...");
    const { evmConfig, client: evmClient } = getEvmClient(runtime);

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

    // Step 3: Ask GPT
    runtime.log("[Step 3] Querying OpenAI GPT...");
    const gptResult = askGPT(runtime, question);
    const parsed = extractGptJsonOrThrow(gptResult.gptResponse);

    runtime.log(`[Step 3] AI Result: ${parsed.result}`);
    runtime.log(`[Step 3] AI Confidence: ${parsed.confidence / 100}%`);

    const outcomeValue = (parsed.result === "YES" ? 0 : 1) as 0 | 1;

    // Step 4: Build report + write settlement
    runtime.log("[Step 4] Generating settlement report...");
    const report = buildReport(runtime, marketId, outcomeValue, parsed.confidence);

    runtime.log(`[Step 4] Writing to contract: ${evmConfig.marketAddress}`);
    const writeResult = writeSettlementReport(
      runtime,
      evmClient,
      evmConfig.marketAddress,
      report,
      evmConfig.gasLimit
    );

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
