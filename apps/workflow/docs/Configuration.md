# Configuration Reference

Full reference for `WorkflowConfig` used by the CRE workflow. Edit `config.staging.json` or `config.production.json` (see [config.example.json](../config.example.json)).

## Required Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `relayerUrl` | Base URL of relayer API; required for checkpoint jobs | `"https://backend-relayer-production.up.railway.app"` |
| `evms` | Array with at least one EVM config; `chainSelectorName` required | See [EVM Config](#evm-config) |

## Core Addresses

| Field | Purpose | Used By |
|-------|---------|---------|
| `creReceiverAddress` | CREReceiver for resolution, checkpoint, session finalization | onLogTrigger, onScheduleResolver, onCheckpointSubmit, sessionSnapshot |
| `crePublishReceiverAddress` | CREPublishReceiver for publish-from-draft | onHttpTrigger (fallback when curatedPath.crePublishReceiverAddress not set) |
| `marketFactoryAddress` | Receiver for feed-driven market creation | scheduleTrigger, marketCreator |

## Cron Schedules

| Field | Default | Purpose |
|-------|---------|---------|
| `cronSchedule` | `"*/15 * * * *"` | Main cron: scheduleTrigger, draftProposer, sessionSnapshot, checkpointSubmit, scheduleResolver |
| `cronScheduleFinalize` | Same as cronSchedule | Separate cron for checkpoint finalize. **Recommended:** Run at least every 35–40 min (e.g. `0 */35 * * * *`) since challenge window is 30 min. |
| `cronScheduleCancel` | `"0 0 */8 * * *"` | Cron for checkpoint cancel (every 8 hr). Run at least every 8 hr; CANCEL_DELAY is 6 hr. |

Cron format: `second minute hour day month weekday` (6 fields).

## EVM Config

Each `evms` entry:

| Field | Purpose | Required For |
|-------|---------|---------------|
| `marketAddress` | PoolMarketLegacy address (for log-trigger resolution) | resolution.mode = "log" or "both" |
| `marketRegistryAddress` | MarketRegistry address (for schedule resolution) | resolution.mode = "schedule" or "both" |
| `chainSelectorName` | Chain selector (e.g. `avalanche-fuji`, `ethereum-testnet-sepolia`) | All |
| `gasLimit` | Gas limit for writeReport | All |

Example:

```json
"evms": [
  {
    "marketAddress": "0x...",
    "marketRegistryAddress": "0x...",
    "chainSelectorName": "avalanche-fuji",
    "gasLimit": "500000"
  }
]
```

## Resolution

| Field | Type | Purpose |
|-------|------|---------|
| `resolution.mode` | `"log"` \| `"schedule"` \| `"both"` | Resolution lane. Default: `"log"` |
| `resolution.marketIds` | `number[]` | Market IDs to poll when mode includes "schedule". Merged with relayer markets when `useRelayerMarkets` is true. |
| `resolution.useRelayerMarkets` | `boolean` | When true, fetch market IDs from `GET {relayerUrl}/cre/markets` and merge with `marketIds`. Schedule mode requires either `marketIds` non-empty or `useRelayerMarkets: true`. |

- **log**: Event-driven; listens for `SettlementRequested` on `marketAddress`. Requires `evms[0].marketAddress`.
- **schedule**: Cron polls `marketIds` (and/or relayer when `useRelayerMarkets`); resolves markets where `resolveTime <= now`. Requires `evms[0].marketRegistryAddress`.
- **both**: Registers both log trigger and schedule resolver.

## Curated Path (Draft Board)

| Field | Purpose |
|-------|---------|
| `curatedPath.enabled` | Enable draftProposer and publish-from-draft |
| `curatedPath.draftBoardAddress` | MarketDraftBoard contract (for proposeDraft) |
| `curatedPath.crePublishReceiverAddress` | CREPublishReceiver (overrides top-level) |

Validation: If `curatedPath.enabled` and `crePublishReceiverAddress` are set, `draftBoardAddress` is required.

## AI (Resolution)

| Field | Purpose |
|-------|---------|
| `gptModel` | Model name (default: `deepseek-chat`) |
| `deepseekApiKey` | API key; fallback when DEEPSEEK_API_KEY secret not set |
| `useMockAi` | Use mock response for demo (no API call) |
| `mockAiResponse` | JSON string for mock (e.g. `"{\"result\":\"YES\",\"confidence\":10000}"`) |

## Market Creation

| Field | Purpose |
|-------|---------|
| `creatorAddress` | Default creator for feed-driven creation |
| `feeds` | Array of [FeedConfig](#feed-config) for scheduleTrigger |

## Feed Config

Each feed in `feeds`:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Unique identifier |
| `type` | `"newsAPI"` \| `"coinGecko"` \| `"githubTrends"` \| `"polymarket"` \| `"custom"` | Feed source |
| `url` | string | URL for custom feed |
| `questionTemplate` | string | Template for market question |
| `category` | string | Category label |
| `metadata` | object | Extra metadata (e.g. limit for polymarket) |

Additional fields per type: `coinId`, `vsCurrency`, `multiplier` (coinGecko); `apiKey` (newsAPI); etc.

## Legacy Session Finalization

| Field | Purpose |
|-------|---------|
| `yellowSessions` | Array of session payloads for legacy SessionFinalizer path |

Each item: `marketId`, `sessionId`, `participants`, `balances`, `signatures`, `backendSignature`, `resolveTime`.

## Polymarket (Draft Proposer)

| Field | Purpose |
|-------|---------|
| `polymarket.apiUrl` | Gamma API URL (default: `https://gamma-api.polymarket.com`) |
| `polymarket.apiKey` | Optional API key for rate limits |

## RPC and Keys

| Field | Purpose |
|-------|---------|
| `rpcUrl` | RPC for direct contract writes (draftProposer); falls back to env RPC_URL |
| `channelSettlementAddress` | Optional; for cancel job; can derive from relayer |

Environment: `CRE_ETH_PRIVATE_KEY` (or `DRAFT_PROPOSER_PRIVATE_KEY`) for draftProposer.

## Example Minimal Config

```json
{
  "relayerUrl": "https://backend-relayer-production.up.railway.app",
  "creReceiverAddress": "0x51c0680d8E9fFE2A2f6CC65e598280D617D6cAb7",
  "cronSchedule": "*/15 * * * *",
  "cronScheduleFinalize": "0 */35 * * * *",
  "evms": [
    {
      "marketAddress": "0x0000000000000000000000000000000000000000",
      "marketRegistryAddress": "0x...",
      "chainSelectorName": "avalanche-fuji",
      "gasLimit": "500000"
    }
  ],
  "resolution": { "mode": "schedule", "marketIds": [0, 1] }
}
```

## Validation Rules

- `evms` must have at least one entry.
- `relayerUrl` required (length >= 10).
- If `resolution.mode` is `schedule` or `both`: `evms[0].marketRegistryAddress` required and non-zero.
- If `resolution.mode` is `log` or `both`: `evms[0].marketAddress` required and non-zero.
- If `curatedPath.enabled` and `curatedPath.crePublishReceiverAddress`: `curatedPath.draftBoardAddress` required.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CRE_ETH_PRIVATE_KEY` | Private key for chain writes |
| `RPC_URL` | RPC URL (fallback when config.rpcUrl not set) |
| `DEEPSEEK_API_KEY` | AI API key (CRE secret or env) |
