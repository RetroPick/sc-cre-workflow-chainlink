# Creation Flows

Market creation paths: feed-driven (scheduleTrigger), publish-from-draft (HTTP), and draft proposer (Polymarket → MarketDraftBoard).

## Overview

| Path | Trigger | Receiver | Flow |
|------|---------|----------|------|
| Feed-driven | Cron | MarketFactory | Feeds → scheduleTrigger → marketCreator → writeReport |
| Publish-from-draft | HTTP | CREPublishReceiver | HTTP payload → publishFromDraft → writeReport(0x04) |
| Draft proposer | Cron | RPC (direct) | Polymarket → proposeDraft → MarketDraftBoard.proposeDraft |

## 1. Feed-Driven (scheduleTrigger)

**Source:** [pipeline/creation/scheduleTrigger.ts](../pipeline/creation/scheduleTrigger.ts), [pipeline/creation/marketCreator.ts](../pipeline/creation/marketCreator.ts)

### Flow

1. Cron runs → onScheduleTrigger.
2. For each feed in `feeds`: fetch items (coinGecko, newsAPI, githubTrends, polymarket, custom).
3. Generate MarketInput from each item (question, requestedBy, resolveTime, category, source, externalId).
4. createMarkets: for each input, encode and writeReport to `marketFactoryAddress`.

### Feed Types

| Type | Source | Notes |
|------|--------|-------|
| coinGecko | CoinGecko API | Price-based questions |
| newsAPI | News API | News-based questions |
| githubTrends | GitHub | Repo/trend data |
| polymarket | Polymarket Gamma API | External events as drafts |
| custom | Custom URL | HTTP fetch with config |

### Config

| Field | Purpose |
|-------|---------|
| feeds | Array of FeedConfig |
| creatorAddress | requestedBy for all created markets |
| marketFactoryAddress | Receiver for writeReport (MarketFactory) |

### Payload

`abi.encode(question, requestedBy, resolveTime, category, source, externalId, signature)` — no prefix. MarketFactory receives directly.

---

## 2. Create Market via HTTP

**Source:** [httpCallback.ts](../httpCallback.ts), [pipeline/creation/marketCreator.ts](../pipeline/creation/marketCreator.ts)

When HTTP payload has `question` (and not the publish-from-draft shape), the workflow creates a market via MarketFactory.

### Flow

1. HTTP trigger receives payload with `question` (required), optional `resolveTime`, `category`, `requestedBy`.
2. buildFeedItemFromPayload builds a FeedItem with defaults (resolveTime: now + 24h, category: "http").
3. generateMarketInput + createMarkets → writeReport to `marketFactoryAddress`.

### Config

- `marketFactoryAddress` — required
- `creatorAddress` — required (or provide `requestedBy` in payload)

### HTTP Payload

```json
{
  "question": "Will X happen by tomorrow?",
  "resolveTime": 1735689600,
  "category": "custom",
  "requestedBy": "0x..."
}
```

---

## 3. Publish-from-Draft (HTTP)

**Source:** [httpCallback.ts](../httpCallback.ts), [pipeline/creation/publishFromDraft.ts](../pipeline/creation/publishFromDraft.ts)

### Flow

1. HTTP trigger receives payload with `draftId`, `creator`, `params`, `claimerSig`.
2. publishFromDraft encodes `0x04 || abi.encode(draftId, creator, params, claimerSig)`.
3. writeReport to **CREPublishReceiver** (not CREReceiver).

### Prerequisites

- Draft must be Claimed (claimAndSeed) on MarketDraftBoard.
- Creator must match claimer.
- Creator signs EIP-712 PublishFromDraft; claimerSig included in payload.

### HTTP Payload

```json
{
  "draftId": "0x...",
  "creator": "0x...",
  "params": {
    "question": "Will X happen?",
    "marketType": 0,
    "outcomes": ["Yes", "No"],
    "timelineWindows": [],
    "resolveTime": 1735689600,
    "tradingOpen": 0,
    "tradingClose": 1735689600
  },
  "claimerSig": "0x..."
}
```

**marketType:** 0=binary, 1=categorical, 2=timeline.

### Config

| Field | Purpose |
|-------|---------|
| crePublishReceiverAddress | Top-level or curatedPath.crePublishReceiverAddress |

### On-Chain

CREPublishReceiver validates EIP-712 PublishFromDraft signature and calls MarketFactory.createFromDraft(draftId, creator, params).

---

## 4. Draft Proposer (Polymarket → MarketDraftBoard)

**Source:** [pipeline/creation/draftProposer.ts](../pipeline/creation/draftProposer.ts)

### Flow

1. Cron runs → onDraftProposer.
2. Fetch Polymarket events (Gamma API).
3. For each event: proposeDraft via **direct RPC call** to MarketDraftBoard.proposeDraft.
4. Does **not** use CRE writeReport; uses CRE_ETH_PRIVATE_KEY to sign and send tx.

### Scope

- **Only proposes** drafts to MarketDraftBoard. Claim and publish remain manual (require creator EIP-712 signatures).
- Signer must have AI_ORACLE_ROLE on MarketDraftBoard (per contract).

### Config

| Field | Purpose |
|-------|---------|
| curatedPath.enabled | Must be true |
| curatedPath.draftBoardAddress | MarketDraftBoard contract |
| polymarket.apiUrl | Gamma API (default: https://gamma-api.polymarket.com) |
| polymarket.apiKey | Optional for rate limits |
| rpcUrl | RPC for direct tx; falls back to RPC_URL env |
| CRE_ETH_PRIVATE_KEY | Signer; or DRAFT_PROPOSER_PRIVATE_KEY |

### proposeDraft

Calls MarketDraftBoard.proposeDraft with question, questionUri, outcomes, outcomesUri, resolveTime, tradingOpen, tradingClose. Returns tx hash.

### Chain Support

| chainSelectorName | chainId |
|-------------------|---------|
| avalanche-fuji | 43113 |
| ethereum-testnet-sepolia | 11155111 |

---

## Comparison

| Aspect | Feed-Driven | HTTP Create | Publish-from-Draft | Draft Proposer |
|--------|-------------|-------------|---------------------|----------------|
| Trigger | Cron | HTTP | HTTP | Cron |
| Receiver | MarketFactory | MarketFactory | CREPublishReceiver | RPC (MarketDraftBoard) |
| CRE writeReport | Yes | Yes | Yes | No (direct tx) |
| Creator sig | No | No | Yes (EIP-712) | N/A (propose only) |
| Claim/Publish | N/A | N/A | Manual (creator) | Manual |

## Session Auto-Creation (Optional)

After market creation, the workflow can notify the relayer to create a trading session via `POST {relayerUrl}/cre/sessions/create`.

**Relayer endpoint:** `POST /cre/sessions/create`

**Body:** `{ marketId, vaultId, resolveTime, sessionId?, numOutcomes?, b? }`

If `sessionId` is omitted, the relayer generates one deterministically. When workflow receives market IDs from creation (e.g. via future marketCreator enhancement to parse MarketCreated events), it can call this endpoint to auto-create sessions.

## References

- [ContractIntegration](ContractIntegration.md) — Report formats
- [packages/contracts/docs/abi/docs/cre/CREWorkflowPublish.md](../../packages/contracts/docs/abi/docs/cre/CREWorkflowPublish.md)
