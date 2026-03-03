/**
 * CRE checkpoint finalize job.
 * Polls relayer for sessions with checkpoints and calls POST /cre/finalize/:sessionId.
 * Idempotent: relayer returns 400 if challenge window not elapsed or no pending.
 *
 * Flow:
 * 1. GET {relayerUrl}/cre/checkpoints → filter hasDeltas: true
 * 2. For each session: POST /cre/finalize/:sessionId
 * 3. Relayer submits finalizeCheckpoint tx (succeeds after 30 min challenge window)
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import { httpJsonRequest } from "../../utils/http";

interface CheckpointMeta {
  sessionId: string;
  marketId: string;
  hasDeltas: boolean;
}

interface FinalizeResponse {
  txHash: string;
  ok: boolean;
}

export function onCheckpointFinalize(runtime: Runtime<WorkflowConfig>): string {
  const relayerUrl = runtime.config.relayerUrl?.replace(/\/$/, "");

  if (!relayerUrl) {
    runtime.log("[CheckpointFinalize] Missing relayerUrl in config.");
    return "Missing relayerUrl";
  }

  try {
    const listRes = httpJsonRequest(runtime, {
      url: `${relayerUrl}/cre/checkpoints`,
      method: "GET",
    });
    const listBody = JSON.parse(listRes.bodyText);
    const checkpoints: CheckpointMeta[] = listBody.checkpoints || [];
    const withDeltas = checkpoints.filter((c) => c.hasDeltas);
    if (withDeltas.length === 0) {
      runtime.log("[CheckpointFinalize] No sessions with deltas.");
      return "No sessions with deltas";
    }

    const finalized: string[] = [];
    for (const cp of withDeltas) {
      const sessionId = cp.sessionId;
      try {
        const postRes = httpJsonRequest(runtime, {
          url: `${relayerUrl}/cre/finalize/${sessionId}`,
          method: "POST",
          body: {},
        });
        const postBody: FinalizeResponse = JSON.parse(postRes.bodyText);
        if (postBody.ok && postBody.txHash) {
          runtime.log(`[CheckpointFinalize] Finalized ${sessionId}: ${postBody.txHash}`);
          finalized.push(postBody.txHash);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("Challenge window") ||
          msg.includes("No pending") ||
          msg.includes("400")
        ) {
          runtime.log(`[CheckpointFinalize] Session ${sessionId}: not ready (${msg.slice(0, 60)}...)`);
        } else {
          runtime.log(`[CheckpointFinalize] Session ${sessionId} failed: ${msg}`);
        }
      }
    }

    return `Finalized ${finalized.length} checkpoints`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[CheckpointFinalize] Error: ${msg}`);
    throw err;
  }
}
