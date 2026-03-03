# RetroPick CRE Workflow

Chainlink CRE (Request-and-Execute) workflow for RetroPick prediction markets. Orchestrates market creation, session finalization, and settlement via the Chainlink Forwarder. Supports V3 architecture (MarketRegistry, ChannelSettlement, OutcomeToken1155) and legacy PoolMarketLegacy.

**See [docs/](docs/) for detailed documentation.**

## Workflow Handlers

| Handler | Trigger | Purpose |
|---------|---------|---------|
| **scheduleTrigger** | Cron | Feed-driven market creation; sends reports to `marketFactoryAddress` |
| **sessionSnapshot** | Cron | Legacy session finalization (SessionFinalizer path); uses `yellowSessions` |
| **onCheckpointSubmit** | Cron | V3 checkpoint path: relayer → CREReceiver (0x03) → ChannelSettlement |
| **onCheckpointFinalize** | Cron (finalize) | V3: Relayer submits finalizeCheckpoint after 30 min challenge window |
| **onCheckpointCancel** | Cron (cancel) | V3: Relayer submits cancelPendingCheckpoint after 6 hr for stuck checkpoints |
| **onScheduleResolver** | Cron | V3 MarketRegistry schedule-based resolution; uses `resolution.marketIds` (binary/categorical/timeline) |
| **onDraftProposer** | Cron | Polymarket → MarketDraftBoard.proposeDraft (curated path; requires AI_ORACLE_ROLE) |
| **onHttpTrigger** | HTTP | On-demand market creation; publish-from-draft when payload has `draftId`, `creator`, `params`, `claimerSig` |
| **onLogTrigger** | Log | Legacy: `SettlementRequested` from PoolMarketLegacy → CREReceiver (binary/categorical/timeline) |

## Resolution Modes

Set `resolution.mode` to choose the resolution lane:

- **log** (default): PoolMarketLegacy event-driven. Listens for `SettlementRequested`. Requires `evms[0].marketAddress`.
- **schedule**: V3 MarketRegistry cron. Polls `resolution.marketIds`, resolves due markets. Requires `evms[0].marketRegistryAddress` and `resolution.marketIds`.
- **both**: Registers both log trigger and schedule resolver.

## Config

Edit `config.staging.json` or `config.production.json` (see `config.example.json`):

| Field | Purpose |
|-------|---------|
| `marketFactoryAddress` | CRE receiver for market creation |
| `creReceiverAddress` | **Required.** CREReceiver for resolution, checkpoint, session finalization |
| `relayerUrl` | **Required.** Base URL of relayer API (e.g. `https://backend-relayer-production.up.railway.app`). Used by checkpoint submit/finalize/cancel jobs. Health check: `GET {relayerUrl}/health` should return `{ ok: true }`. |
| `cronSchedule` | Main cron (default `*/15 * * * *`) |
| `cronScheduleFinalize` | Separate cron for checkpoint finalize (default `0 */35 * * * *` every 35 min) |
| `cronScheduleCancel` | Cron for checkpoint cancel (default `0 0 */8 * * *` every 8 hr) |
| `creatorAddress` | Default creator for market creation |
| `feeds` | Feed configs for cron market creation |
| `yellowSessions` | Legacy session payloads for SessionFinalizer |
| `evms` | `marketAddress` (PoolMarketLegacy for log), `marketRegistryAddress` (V3 for schedule), `chainSelectorName`, `gasLimit` |
| `resolution` | `mode`: "log" \| "schedule" \| "both"; `marketIds`: number[] for schedule mode |
| `curatedPath` | `draftBoardAddress`, `crePublishReceiverAddress`, `enabled` (for draftProposer and HTTP publish) |
| `crePublishReceiverAddress` | CREPublishReceiver for publish-from-draft (top-level or in curatedPath) |
| `polymarket` | `apiUrl`, `apiKey` — Polymarket Gamma API for draft feed |
| `rpcUrl` | RPC for direct contract writes (draftProposer); falls back to env RPC_URL |

For demo without AI: `"useMockAi": true`, `"mockAiResponse": "{\"result\":\"YES\",\"confidence\":10000}"`.

## Setup

### 1. Environment

Add to `.env`:

```
CRE_ETH_PRIVATE_KEY=0x...
```

Required for chain writes. For read-only or simulation, a dummy key works.

### 2. Install

```bash
cd apps/workflow && bun install
```

### 3. Simulate

From **project root**:

```bash
cre workflow simulate ./apps/workflow --target=staging-settings
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/requestSettlement.sh` | Emit `SettlementRequested` (PoolMarketLegacy) |
| `scripts/predict.sh` | Make a prediction (legacy) |
| `scripts/getMarket.sh` | Read market data |
| `scripts/getPrediction.sh` | Read user prediction result |

Example:

```bash
MARKET_ADDRESS=0x... CRE_ETH_PRIVATE_KEY=0x... RPC_URL=... \
  bash ./apps/workflow/scripts/requestSettlement.sh ./apps/workflow/config.staging.json 0
```

## Publish-from-Draft (HTTP)

When `onHttpTrigger` receives a payload with `draftId`, `creator`, `params`, and `claimerSig`, it routes to the publish flow:
- Encodes `0x04 || abi.encode(draftId, creator, params, claimerSig)`
- Sends via `writeReport` to **CREPublishReceiver** (not CREReceiver)
- Requires `crePublishReceiverAddress` or `curatedPath.crePublishReceiverAddress`

**Payload format:**
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
Creator must sign EIP-712 `PublishFromDraft`; see [packages/contracts/docs/abi/docs/cre/CREWorkflowPublish.md](../../packages/contracts/docs/abi/docs/cre/CREWorkflowPublish.md) and `apps/workflow/contracts/publishFromDraft.ts` for helpers.

## Relayer–CRE Checkpoint Flow

1. **Submit:** CRE polls `GET {relayerUrl}/cre/checkpoints`, fetches stored sigs via `GET /cre/checkpoints/:sessionId/sigs`, POSTs to build payload, delivers via `writeReport` → CREReceiver.
2. **Finalize:** After 30 min challenge window, `onCheckpointFinalize` calls `POST /cre/finalize/:sessionId` (relayer submits `finalizeCheckpoint` tx).
3. **Cancel:** If checkpoint stuck > 6 hr, `onCheckpointCancel` calls `POST /cre/cancel/:sessionId` (relayer submits `cancelPendingCheckpoint` tx).
4. **Stored sigs:** Frontend must POST user signatures to `POST /cre/checkpoints/:sessionId/sigs` before CRE cron runs.

## Related

| Package | Purpose |
|---------|---------|
| [docs/](docs/) | **Detailed workflow documentation** — Architecture, Resolution, Checkpoint, Config, Troubleshooting |
| [packages/contracts](../../packages/contracts) | CREReceiver, ChannelSettlement, MarketRegistry; CRE docs |
| [apps/relayer](../relayer) | Checkpoint payload source; `GET/POST /cre/checkpoints/:sessionId` |
| [Relayer CRE API](../relayer/docs/development/cre/API_REFERENCE.md) | Full endpoint reference |
| [CRE Workflow Checkpoints](../../packages/contracts/docs/abi/docs/cre/CREWorkflowCheckpoints.md) | V3 checkpoint flow (relayer → CRE → ChannelSettlement) |
