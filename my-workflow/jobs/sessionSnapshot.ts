import type { Runtime } from "@chainlink/cre-sdk";
import { cre, bytesToHex, hexToBase64, TxStatus, getNetwork } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../types/config";
import { buildFinalStateRequest } from "../builders/buildFinalStateRequest";

export function onSessionSnapshot(runtime: Runtime<WorkflowConfig>): string {
  const sessions = runtime.config.yellowSessions || [];
  if (sessions.length === 0) {
    runtime.log("[Yellow] No sessions configured.");
    return "No sessions";
  }

  const receiverAddress = runtime.config.creReceiverAddress;
  if (!receiverAddress) {
    runtime.log("[Yellow] Missing creReceiverAddress in config.");
    return "Missing creReceiverAddress";
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
  const now = Math.floor(Date.now() / 1000);

  const processed: string[] = [];
  for (const session of sessions) {
    if (session.resolveTime > now) {
      continue;
    }

    try {
      const reportData = buildFinalStateRequest({
        marketId: BigInt(session.marketId),
        sessionId: session.sessionId,
        participants: session.participants,
        balances: session.balances.map((b) => BigInt(b)),
        signatures: session.signatures,
        backendSignature: session.backendSignature,
      });

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
          receiver: receiverAddress,
          report: reportResponse,
          gasConfig: {
            gasLimit: evmConfig.gasLimit,
          },
        })
        .result();

      if (writeResult.txStatus === TxStatus.SUCCESS) {
        const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
        runtime.log(`[Yellow] Session finalized: ${txHash}`);
        processed.push(txHash);
      } else {
        runtime.log(`[Yellow] Session finalization failed: ${writeResult.txStatus}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      runtime.log(`[Yellow] Session failed: ${msg}`);
    }
  }

  return `Finalized ${processed.length} sessions`;
}
