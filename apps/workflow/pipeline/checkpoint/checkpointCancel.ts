/**
 * CRE checkpoint cancel job.
 * Polls relayer for sessions with checkpoints and calls POST /cre/cancel/:sessionId.
 * Cancel is only valid after CANCEL_DELAY (6 hours) from pending createdAt.
 * Used when checkpoint was submitted but never finalized (e.g. workflow/signature failure).
 *
 * Flow:
 * 1. GET {relayerUrl}/cre/checkpoints → filter hasDeltas: true
 * 2. For each session: POST /cre/cancel/:sessionId
 * 3. Relayer submits cancelPendingCheckpoint tx (succeeds after 6 hr)
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import { httpJsonRequest } from "../../utils/http";

interface CheckpointMeta {
  sessionId: string;
  marketId: string;
  hasDeltas: boolean;
  /** When present (relayer chain read), pre-filter to avoid 400s */
  canCancel?: boolean;
}

interface CancelResponse {
  txHash: string;
  ok: boolean;
}

export function onCheckpointCancel(runtime: Runtime<WorkflowConfig>): string {
  const relayerUrl = runtime.config.relayerUrl?.replace(/\/$/, "");

  if (!relayerUrl) {
    runtime.log("[CheckpointCancel] Missing relayerUrl in config.");
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
    const toCancel =
      withDeltas.length > 0 && typeof withDeltas[0].canCancel === "boolean"
        ? withDeltas.filter((c) => c.canCancel === true)
        : withDeltas;
    if (toCancel.length === 0) {
      runtime.log(
        withDeltas.length === 0
          ? "[CheckpointCancel] No sessions with deltas."
          : "[CheckpointCancel] No sessions ready to cancel (CANCEL_DELAY not elapsed)."
      );
      return withDeltas.length === 0 ? "No sessions with deltas" : "No sessions ready to cancel";
    }

    const cancelled: string[] = [];
    for (const cp of toCancel) {
      const sessionId = cp.sessionId;
      try {
        const postRes = httpJsonRequest(runtime, {
          url: `${relayerUrl}/cre/cancel/${sessionId}`,
          method: "POST",
          body: {},
        });
        const postBody: CancelResponse = JSON.parse(postRes.bodyText);
        if (postBody.ok && postBody.txHash) {
          runtime.log(`[CheckpointCancel] Cancelled ${sessionId}: ${postBody.txHash}`);
          cancelled.push(postBody.txHash);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("CANCEL_DELAY") ||
          msg.includes("TooEarly") ||
          msg.includes("No pending") ||
          msg.includes("400")
        ) {
          runtime.log(`[CheckpointCancel] Session ${sessionId}: not ready (${msg.slice(0, 60)}...)`);
        } else {
          runtime.log(`[CheckpointCancel] Session ${sessionId} failed: ${msg}`);
        }
      }
    }

    return `Cancelled ${cancelled.length} checkpoints`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[CheckpointCancel] Error: ${msg}`);
    throw err;
  }
}
