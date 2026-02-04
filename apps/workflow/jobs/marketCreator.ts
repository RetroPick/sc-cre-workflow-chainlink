import type { Runtime } from "@chainlink/cre-sdk";
import { cre, bytesToHex, hexToBase64, TxStatus, getNetwork } from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import type { MarketInput } from "../types/feed";
import type { WorkflowConfig } from "../types/config";
import { validateMarketInput } from "../builders/schemaValidator";

const MARKET_INPUT_PARAMS = parseAbiParameters(
  "string question, address requestedBy, uint48 resolveTime, string category, string source, bytes32 externalId, bytes signature"
);

export function createMarkets(runtime: Runtime<WorkflowConfig>, inputs: MarketInput[]): string {
  const factoryAddress = runtime.config.marketFactoryAddress;
  if (!factoryAddress) {
    runtime.log("[Cron] Missing marketFactoryAddress in config.");
    return "Missing marketFactoryAddress";
  }

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

  const created: string[] = [];
  for (const input of inputs) {
    try {
      validateMarketInput(input);
      const reportData = encodeAbiParameters(MARKET_INPUT_PARAMS, [
        input.question,
        input.requestedBy,
        BigInt(input.resolveTime),
        input.category,
        input.source,
        input.externalId,
        "0x",
      ]);

      const reportResponse = runtime
        .report({
          encodedPayload: hexToBase64(reportData),
          encoderName: "evm",
          signingAlgo: "ecdsa",
          hashingAlgo: "keccak256",
        })
        .result();

      const writeResult = evmClient
        .writeReport(runtime, {
          receiver: factoryAddress,
          report: reportResponse,
          gasConfig: {
            gasLimit: evmConfig.gasLimit,
          },
        })
        .result();

      if (writeResult.txStatus === TxStatus.SUCCESS) {
        const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
        runtime.log(`[Cron] Market created: ${txHash}`);
        created.push(txHash);
      } else {
        runtime.log(`[Cron] Market creation failed: ${writeResult.txStatus}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      runtime.log(`[Cron] Market input failed: ${msg}`);
    }
  }

  return `Created ${created.length} markets`;
}
