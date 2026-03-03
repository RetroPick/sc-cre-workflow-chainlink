# Relayer Integration

Workflow ↔ Relayer API contract and usage. The workflow calls the relayer for checkpoint lifecycle (list, build, finalize, cancel) and health checks.

## Base URL

Config `relayerUrl` (e.g. `https://backend-relayer-production.up.railway.app`). Trailing slashes are stripped.

## Endpoint Reference (Workflow Usage)

| Method | Endpoint | Used By | Purpose |
|--------|----------|---------|---------|
| GET | /health | onCheckpointSubmit | Pre-flight health check; skip batch if relayer down |
| GET | /cre/checkpoints | onCheckpointSubmit, onCheckpointFinalize, onCheckpointCancel | List sessions with checkpoint metadata |
| GET | /cre/checkpoints/:sessionId/sigs | onCheckpointSubmit | Fetch stored user signatures (optional check) |
| POST | /cre/checkpoints/:sessionId | onCheckpointSubmit | Build full payload; body empty (relayer uses stored sigs) |
| POST | /cre/finalize/:sessionId | onCheckpointFinalize | Relayer submits finalizeCheckpoint tx |
| POST | /cre/cancel/:sessionId | onCheckpointCancel | Relayer submits cancelPendingCheckpoint tx |

## Health Check

**Endpoint:** `GET {relayerUrl}/health`

**When:** Before processing checkpoints in onCheckpointSubmit (pre-flight).

**Expected:** `{ "ok": true }`

**Behavior:** If request fails or `ok != true`, workflow returns early ("Relayer unhealthy" / "Relayer unreachable") and does not process any checkpoints.

## Checkpoint Lifecycle

### 1. List

`GET /cre/checkpoints` returns:

```json
{
  "checkpoints": [
    { "sessionId": "0x...", "marketId": "0", "hasDeltas": true }
  ]
}
```

Workflow filters `hasDeltas: true` and processes each session.

### 2. Spec (Optional)

`GET /cre/checkpoints/:sessionId` returns digest, users, deltas, channelSettlementAddress. Used by frontend for signature collection. Workflow does not call this for build; it POSTs directly.

### 3. Sigs

- **Frontend:** `POST /cre/checkpoints/:sessionId/sigs` with `{ userSigs: { "0xAddr": "0x..." } }` — stores sigs (TTL 10 min).
- **Workflow:** Optionally `GET /cre/checkpoints/:sessionId/sigs` to check if sigs exist; always `POST /cre/checkpoints/:sessionId` with empty body.

### 4. Build

`POST /cre/checkpoints/:sessionId` with `body: {}`. Relayer uses stored sigs when body has no `userSigs`. Returns `{ payload: "0x03...", format: "ChannelSettlement" }`. Workflow validates payload starts with `0x03`.

### 5. Deliver

Workflow: `runtime.report` + `evmClient.writeReport(receiver: creReceiverAddress)` with the payload.

### 6. Finalize

After 30 min challenge window, `POST /cre/finalize/:sessionId`. Relayer submits `finalizeCheckpoint` tx.

### 7. Cancel (Optional)

If checkpoint stuck > 6 hr, `POST /cre/cancel/:sessionId`. Relayer submits `cancelPendingCheckpoint` tx.

## Frontend Responsibility

1. After trades, fetch checkpoint spec: `GET /cre/checkpoints/:sessionId` (digest, users).
2. Prompt users to sign EIP-712 digest.
3. POST user signatures: `POST /cre/checkpoints/:sessionId/sigs` with `{ userSigs: { ... } }` **before** CRE cron runs.
4. CRE cron will fetch stored sigs (or relayer uses them on POST with empty body) and build payload.

## Error Handling

| Code | Meaning | Workflow Response |
|------|---------|-------------------|
| 400 | No deltas; state finalized; missing sig; challenge window; no pending | Log "not ready" or skip |
| 404 | Session not found | Skip / error |
| 500 | Finalize/cancel tx failed | Log failure |
| 503 | Relayer misconfigured (CHANNEL_SETTLEMENT_ADDRESS, RPC_URL, etc.) | Log 503 |

Workflow uses `httpJsonRequest` which throws on non-2xx. Handlers catch and log; finalize/cancel treat 400 as "not ready" (idempotent).

## Endpoints Not Used by Workflow

| Endpoint | Purpose | Note |
|----------|---------|------|
| GET /cre/sessions | Legacy sessions (resolveTime <= now) | Alternative to /cre/checkpoints for discovery |
| GET /cre/sessions/:sessionId | Legacy SessionFinalizer payload | sessionSnapshot uses yellowSessions from config, not relayer |
| GET /cre/markets | Session-to-market mapping | Frontend alignment |

## Full API Reference

See [apps/relayer/docs/development/cre/API_REFERENCE.md](../../relayer/docs/development/cre/API_REFERENCE.md) for complete endpoint specs, request/response schemas, and error details.
