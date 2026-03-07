# Checkpoint Signing (Frontend)

**Audience:** Frontend engineers  
**Related:** [01-relayer-api.md](01-relayer-api.md) | [CheckpointFlow.md](../../docs/CheckpointFlow.md) | [packages/contracts/docs/abi/docs/relayer/CheckpointEIP712.md](../../../packages/contracts/docs/abi/docs/relayer/CheckpointEIP712.md)

---

## 1. When Checkpoint Is Ready

When a session has new trades, the relayer can build a checkpoint. The frontend fetches the checkpoint spec via:

```
GET {relayerUrl}/cre/checkpoints/:sessionId
```

**Response (key fields):**

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
    {
      "user": "0x...",
      "outcomeIndex": 0,
      "sharesDelta": "10",
      "cashDelta": "-1000"
    }
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
| checkpoint | Full struct for typed data signing |

---

## 2. Frontend Responsibility

For each user in `users`, prompt them to sign the checkpoint. Two options:

### Option A: Sign Digest Directly (personal_sign)

```typescript
const sig = await signMessage({ message: { raw: digest } });
```

### Option B: EIP-712 Typed Data (Recommended)

Build typed data from `checkpoint` and domain:

```typescript
const domain = {
  name: "ShadowPool",
  version: "1",
  chainId: chainId,
  verifyingContract: channelSettlementAddress,
};

const types = {
  Checkpoint: [
    { name: "marketId", type: "uint256" },
    { name: "sessionId", type: "bytes32" },
    { name: "nonce", type: "uint64" },
    { name: "validAfter", type: "uint64" },
    { name: "validBefore", type: "uint64" },
    { name: "lastTradeAt", type: "uint48" },
    { name: "stateHash", type: "bytes32" },
    { name: "deltasHash", type: "bytes32" },
    { name: "riskHash", type: "bytes32" },
  ],
};

const message = {
  marketId: BigInt(checkpoint.marketId),
  sessionId: checkpoint.sessionId,
  nonce: BigInt(checkpoint.nonce),
  validAfter: BigInt(checkpoint.validAfter),
  validBefore: BigInt(checkpoint.validBefore),
  lastTradeAt: Number(checkpoint.lastTradeAt),
  stateHash: checkpoint.stateHash,
  deltasHash: checkpoint.deltasHash,
  riskHash: checkpoint.riskHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
};

const sig = await signTypedDataAsync({
  domain,
  types,
  primaryType: "Checkpoint",
  message,
  account: userAddress,
});
```

---

## 3. Sending Signatures

The CRE workflow POSTs to `/cre/checkpoints/:sessionId` with **empty body** and expects the relayer to use **stored** user signatures. The frontend has two options:

### Option A: POST /cre/checkpoints/:sessionId/sigs (Recommended)

Store user signatures for the CRE cron to pick up. TTL: 10 min.

```typescript
const res = await fetch(`${RELAYER_URL}/cre/checkpoints/${sessionId}/sigs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userSigs }),
});
// Response: { ok: true, sessionId }
```

**Flow:** Frontend stores sigs → CRE cron runs → CRE POSTs with empty body → relayer uses stored sigs → returns payload → CRE delivers on-chain.

### Option B: POST /cre/checkpoints/:sessionId with userSigs in body

Send user signatures directly. The relayer must store them for the workflow's later empty-body POST (verify relayer implementation supports this).

```typescript
const res = await fetch(`${RELAYER_URL}/cre/checkpoints/${sessionId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userSigs }),
});
// Response: { payload: "0x03...", format: "ChannelSettlement" }
```

**Important:** The frontend does NOT submit the payload on-chain. The CRE workflow fetches it and delivers via `writeReport` to the Chainlink Forwarder.

---

## 4. Domain and Struct (Reference)

| Domain Field | Value |
|--------------|-------|
| name | `ShadowPool` |
| version | `1` |
| chainId | 43113 (Fuji) |
| verifyingContract | ChannelSettlement address (see below) |

**Checkpoint struct:** marketId, sessionId, nonce, validAfter, validBefore, lastTradeAt, stateHash, deltasHash, riskHash.

---

## 5. Contract Addresses

For EIP-712 checkpoint signing and contract reads:

| Contract | Fuji Address |
|----------|--------------|
| ChannelSettlement | `0xFA5D0e64B0B21374690345d4A88a9748C7E22182` |
| OutcomeToken1155 | `0x9B413811ecfD0e0679A7Ba785de44E15E7482044` |
| MarketRegistry | `0x3235094A8826a6205F0A0b74E2370A4AC39c6Cc2` |

See [DeploymentConfig.md](../../../packages/contracts/docs/abi/docs/frontend/DeploymentConfig.md) for full deployment table.

---

## 6. After Finalize

- Subscribe to `ChannelSettlement.CheckpointFinalized(marketId, sessionId, nonce)`
- Refresh `OutcomeToken1155.balanceOf(user, tokenId)` for affected users
- Refresh vault balances (freeBalance, availableBalance)
