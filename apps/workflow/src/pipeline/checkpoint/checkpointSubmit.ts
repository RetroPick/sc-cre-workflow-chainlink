/**
 * CRE checkpoint submit job.
 * Polls relayer for sessions with checkpointable deltas, fetches stored user sigs,
 * builds payload, and delivers via Chainlink Forwarder to CREReceiver.
 *
 * Flow:
 * 1. GET {relayerUrl}/health (pre-flight; skip batch if relayer down)
 * 2. GET {relayerUrl}/cre/checkpoints → filter hasDeltas: true
 * 3. For each session: GET /cre/checkpoints/:sessionId/sigs (stored by frontend via POST)
 * 4. POST /cre/checkpoints/:sessionId (relayer uses stored sigs if body empty)
 * 5. evmClient.writeReport(payload) → CREReceiver
 *
 * Stored sigs flow: Frontend must POST user signatures to POST /cre/checkpoints/:sessionId/sigs
 * before CRE cron runs. CRE fetches via GET /cre/checkpoints/:sessionId/sigs and POSTs with
 * empty body; relayer falls back to stored sigs when body has no userSigs.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { cre, bytesToHex, hexToBase64, TxStatus, getNetwork } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import { httpJsonRequest } from "../../utils/http";

interface CheckpointMeta {
  sessionId: string;
  marketId: string;
  hasDeltas: boolean;
}

interface CheckpointPayloadResponse {
  payload: string;
  format: string;
}

export function onCheckpointSubmit(runtime: Runtime<WorkflowConfig>): string {
  const relayerUrl = runtime.config.relayerUrl?.replace(/\/$/, "");
  const receiverAddress = runtime.config.creReceiverAddress;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  if (!relayerUrl) {
    runtime.log("[Checkpoint] Missing relayerUrl in config.");
    return "Missing relayerUrl";
  }

  if (!receiverAddress || receiverAddress.toLowerCase() === ZERO_ADDRESS) {
    runtime.log("[Checkpoint] Missing creReceiverAddress in config (set to deployed CREReceiver).");
    return "Missing creReceiverAddress";
  }

  const evmConfig = runtime.config.evms[0];
  if (!evmConfig) {
    runtime.log("[Checkpoint] No evms config.");
    return "No evms config";
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

  try {
    // Pre-flight: skip batch if relayer is down
    try {
      const healthRes = httpJsonRequest(runtime, {
        url: `${relayerUrl}/health`,
        method: "GET",
      });
      const healthBody = JSON.parse(healthRes.bodyText);
      if (!healthBody?.ok) {
        runtime.log("[Checkpoint] Relayer health check failed (ok != true).");
        return "Relayer unhealthy";
      }
    } catch (healthErr) {
      const msg = healthErr instanceof Error ? healthErr.message : String(healthErr);
      runtime.log(`[Checkpoint] Relayer health check failed: ${msg}`);
      return "Relayer unreachable";
    }

    const listRes = httpJsonRequest(runtime, {
      url: `${relayerUrl}/cre/checkpoints`,
      method: "GET",
    });
    const listBody = JSON.parse(listRes.bodyText);
    const checkpoints: CheckpointMeta[] = listBody.checkpoints || [];
    const withDeltas = checkpoints.filter((c) => c.hasDeltas);
    if (withDeltas.length === 0) {
      runtime.log("[Checkpoint] No sessions with deltas.");
      return "No sessions with deltas";
    }

    const processed: string[] = [];
    for (const cp of withDeltas) {
      const sessionId = cp.sessionId;
      try {
        let hasSigs = false;
        try {
          const sigsRes = httpJsonRequest(runtime, {
            url: `${relayerUrl}/cre/checkpoints/${sessionId}/sigs`,
            method: "GET",
          });
          if (sigsRes.statusCode === 200) {
            const sigsBody = JSON.parse(sigsRes.bodyText);
            hasSigs = sigsBody.userSigs && Object.keys(sigsBody.userSigs).length > 0;
          }
        } catch {
          // No sigs stored
        }

        const postRes = httpJsonRequest(runtime, {
          url: `${relayerUrl}/cre/checkpoints/${sessionId}`,
          method: "POST",
          body: {},
        });
        const postBody: CheckpointPayloadResponse = JSON.parse(postRes.bodyText);
        if (!postBody.payload || !postBody.payload.startsWith("0x03")) {
          runtime.log(`[Checkpoint] Session ${sessionId}: invalid payload or missing sigs`);
          continue;
        }

        const reportResponse = runtime
          .report({
            encodedPayload: hexToBase64(postBody.payload as `0x${string}`),
            encoderName: "evm",
            signingAlgo: "ecdsa",
            hashingAlgo: "keccak256",
          })
          .result();

        const writeResult = evmClient
          .writeReport(runtime, {
            receiver: receiverAddress,
            report: reportResponse,
            gasConfig: { gasLimit: evmConfig.gasLimit },
          })
          .result();

        if (writeResult.txStatus === TxStatus.SUCCESS) {
          const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
          runtime.log(`[Checkpoint] Submitted ${sessionId}: ${txHash}`);
          processed.push(txHash);
        } else {
          runtime.log(`[Checkpoint] Submit failed for ${sessionId}: ${writeResult.txStatus}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtime.log(`[Checkpoint] Session ${sessionId} failed: ${msg}`);
      }
    }

    return `Submitted ${processed.length} checkpoints`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[Checkpoint] Error: ${msg}`);
    throw err;
  }
}
