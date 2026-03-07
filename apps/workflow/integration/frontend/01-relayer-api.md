# Relayer API Contract (Frontend-Facing)

**Audience:** Frontend engineers  
**Reference:** [RelayerIntegration.md](../../docs/RelayerIntegration.md) | [Relayer CRE API Reference](../../../relayer/docs/development/cre/API_REFERENCE.md) | [relayerApi.ts](../../../front-end-v2/src/lib/relayerApi.ts)

---

## Base URL

Use a **configurable** base URL from environment, not hardcoded:

```typescript
const RELAYER_BASE_URL = import.meta.env.VITE_RELAYER_URL || 'http://localhost:8790';
```

**Production:** `https://backend-relayer-production.up.railway.app`  
**Local:** `http://localhost:8790`

---

## Trading Endpoints (Frontend Uses)

### POST /api/session/create

Create a new trading session. Usually done once per market by the backend/creator.

**Body:**
```json
{
  "sessionId": "0x...",
  "marketId": "0",
  "vaultId": "0xaa...",
  "numOutcomes": 2,
  "b": 100,
  "resolveTime": 1735689600
}
```

**Response:** `{ ok: true, sessionId }` or `{ ok: true, sessionId, existing: true }`

---

### GET /api/session/:sessionId

Get session data including current probabilities (p) and shares (q).

**Response:** Session state object.

---

### GET /api/session/:sessionId/account/:address

Get user balance and positions in a session.

**Response:** Account state (freeBalance, availableBalance, positions).

---

### GET /api/session/:sessionId/quote

Get quote for buy/sell. Query params: `type=buy|sell`, `outcomeIndex`, `delta`.

**Response:** `{ cost, netCost, prices }`

---

### POST /api/trade/buy

Execute a buy trade.

**Body:**
```json
{
  "sessionId": "0x...",
  "outcomeIndex": 0,
  "delta": 10,
  "userAddress": "0x...",
  "signature": "0x...",
  "maxCost": 100,
  "minShares": 0,
  "maxOddsImpactBps": 500
}
```

**Response:** `{ ok: true, cost, nonce }`

---

### POST /api/trade/sell

Execute a sell trade.

**Body:**
```json
{
  "sessionId": "0x...",
  "outcomeIndex": 0,
  "delta": 10,
  "userAddress": "0x...",
  "signature": "0x...",
  "minReceive": 0,
  "maxOddsImpactBps": 500
}
```

---

### POST /api/trade/swap

Execute a swap trade (e.g. selling YES for NO).

**Body:**
```json
{
  "sessionId": "0x...",
  "fromOutcome": 0,
  "toOutcome": 1,
  "delta": 10,
  "userAddress": "0x...",
  "signature": "0x...",
  "maxCost": 100
}
```

---

### POST /api/session/credit (Dev/Test)

Credit a user with mock USD balance in the session.

**Body:** `{ sessionId, userAddress, amount }`

---

### GET /api/history/:address

Get trade history for a specific wallet (newest first).

---

### GET /api/history

Get global trade history across all users.

---

### GET /api/risk/overview

Get risk overview across all active sessions (Layer 5 Risk Sentinel).

---

## CRE Checkpoint Endpoints (Frontend Uses)

### GET /cre/checkpoints/:sessionId

Get checkpoint spec with EIP-712 digest for signing.

**Response:**
```json
{
  "sessionId": "0x...",
  "marketId": "0",
  "checkpoint": {
    "marketId": "0",
    "sessionId": "0x...",
    "nonce": "1",
    "validAfter": "0",
    "validBefore": "0",
    "lastTradeAt": 1735680000,
    "stateHash": "0x...",
    "deltasHash": "0x...",
    "riskHash": "0x..."
  },
  "deltas": [
    { "user": "0x...", "outcomeIndex": 0, "sharesDelta": "10", "cashDelta": "-1000" }
  ],
  "digest": "0x...",
  "users": ["0x...", "0x..."],
  "chainId": 43113,
  "channelSettlementAddress": "0xFA5D0e64B0B21374690345d4A88a9748C7E22182"
}
```

| Field | Use |
|-------|-----|
| digest | EIP-712 digest to sign (or build typed data from checkpoint) |
| users | List of addresses that must sign |
| channelSettlementAddress | EIP-712 `verifyingContract` |
| chainId | EIP-712 domain chainId |

**Errors:** 404 session not found; 400 no deltas; 503 misconfigured.

---

### POST /cre/checkpoints/:sessionId/sigs (Recommended — Option A)

Store user signatures for the CRE workflow to pick up. TTL: 10 min.

**Body:**
```json
{
  "userSigs": {
    "0xUserAddress1": "0x...",
    "0xUserAddress2": "0x..."
  }
}
```

**Response:** `{ ok: true, sessionId }`

**Errors:** 400 — `userSigs` object required; at least one sig required.

**Flow:** Frontend POSTs here **before** the CRE cron runs. Workflow later POSTs to `/cre/checkpoints/:sessionId` with empty body; relayer uses stored sigs.

---

### POST /cre/checkpoints/:sessionId (Alternative — Option B)

Build full payload with user signatures in body. Relayer may store sigs for workflow's later empty-body POST if supported.

**Body:**
```json
{
  "userSigs": {
    "0xUserAddress1": "0x...",
    "0xUserAddress2": "0x..."
  }
}
```

**Response:**
```json
{
  "payload": "0x03...",
  "format": "ChannelSettlement"
}
```

**Note:** The frontend does **not** submit this payload on-chain. The CRE workflow delivers it via `writeReport`. If using Option B, verify the relayer stores sigs when received in body so the workflow's empty-body POST can succeed.

---

## Implementation Note: relayerApi.ts

The current [relayerApi.ts](../../../front-end-v2/src/lib/relayerApi.ts) uses:

- **Hardcoded** `http://localhost:8790` — should use `import.meta.env.VITE_RELAYER_URL`
- **submitCheckpointSigs** — POSTs to `/cre/checkpoints/:sessionId` with userSigs (Option B)

**Recommendation:** Add a method for Option A flow:

```typescript
async storeCheckpointSigs(sessionId: string, userSigs: Record<string, string>) {
  const res = await fetch(`${RELAYER_BASE_URL}/cre/checkpoints/${sessionId}/sigs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userSigs })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

Use `storeCheckpointSigs` when integrating with the CRE cron flow (recommended).

---

## Error Codes Summary

| Code | Meaning |
|------|---------|
| 400 | No deltas; state finalized; missing sig; challenge window; no pending; invalid body |
| 404 | Session not found |
| 500 | Finalize/cancel tx failed |
| 503 | Relayer misconfigured (CHANNEL_SETTLEMENT_ADDRESS, RPC_URL, OPERATOR_PRIVATE_KEY) |
