# RetroPick CRE Workflow

Chainlink CRE (Request-and-Execute) workflow for RetroPick prediction markets. Orchestrates market creation, session finalization, and settlement via the Chainlink Forwarder.

## Workflow Handlers

| Handler | Trigger | Purpose |
|---------|---------|---------|
| **scheduleTrigger** | Cron | Feed-driven market creation (AI-generated drafts); sends reports to `marketFactoryAddress` |
| **sessionSnapshot** | Cron | Legacy session finalization (SessionFinalizer path); uses `yellowSessions` + `creReceiverAddress` |
| **onHttpTrigger** | HTTP | On-demand market creation |
| **onLogTrigger** | Log | `SettlementRequested` from PoolMarketLegacy (legacy resolution path) |

**Note:** The primary RetroPick V3 checkpoint path (relayer → GET /cre/checkpoints/:sessionId → CREReceiver 0x03) requires a separate checkpoint job. See [CREWorkflowCheckpoints.md](../../packages/contracts/docs/abi/docs/cre/CREWorkflowCheckpoints.md).

## Config

Edit `config.staging.json` or `config.production.json`:

| Field | Purpose |
|-------|---------|
| `marketFactoryAddress` | CRE receiver for market creation (can be CREPublishReceiver for curated publish) |
| `creReceiverAddress` | CREReceiver for legacy session finalization (SessionFinalizer) |
| `creatorAddress` | Default creator for market creation |
| `feeds` | Feed configs for cron market creation (coinGecko, custom, etc.) |
| `yellowSessions` | Legacy session payloads for SessionFinalizer |
| `evms` | `marketAddress` (for Log trigger), `chainSelectorName`, `gasLimit` |

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

## Related

| Package | Purpose |
|---------|---------|
| [packages/contracts](../../packages/contracts) | CREReceiver, ChannelSettlement, MarketRegistry; CRE docs |
| [apps/relayer](../relayer) | Checkpoint payload source; `GET /cre/checkpoints/:sessionId` |
| [CRE Workflow Checkpoints](../../packages/contracts/docs/abi/docs/cre/CREWorkflowCheckpoints.md) | V3 checkpoint flow (relayer → CRE → ChannelSettlement) |
