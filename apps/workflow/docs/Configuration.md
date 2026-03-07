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
| `marketFactoryAddress` | Receiver for feed-driven market creation | discoveryCron, scheduleTrigger, marketCreator |

## Cron Schedules

| Field | Default | Purpose |
|-------|---------|---------|
| `cronSchedule` | `"*/15 * * * *"` | Main cron: discoveryCron, draftProposer, sessionSnapshot, checkpointSubmit, scheduleResolver |
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

### Resolution (Extended — AI Event-Driven)

| Field | Type | Purpose |
|-------|------|---------|
| `resolution.multiLlmEnabled` | `boolean` | Enable multi-LLM consensus for ai_assisted mode |
| `resolution.llmProviders` | `string[]` | LLM provider IDs (e.g. `["openai", "anthropic"]`) |
| `resolution.minConfidence` | `number` | Minimum confidence (0–10000) for settlement; default 7000 (70%) |
| `resolution.consensusQuorum` | `number` | Min agreeing LLM providers for multi-LLM; default 2 |

## Orchestration

| Field | Purpose |
|-------|---------|
| `orchestration.enabled` | Enable CRE Orchestration Layer (discoveryCron, analyzeCandidate, policy engine) |
| `orchestration.draftingPipeline` | When true with orchestration: ALLOW creates DraftRecord (PENDING_CLAIM) instead of direct createMarkets |

## Analysis

| Field | Purpose |
|-------|---------|
| `analysis.useLlm` | Use LLM for classify, risk, draft synthesis when true; fallback to rules when false |
| `analysis.useExplainability` | Generate MarketBrief (L5) for approved drafts when true |

## Monitoring (Risk & Compliance)

| Field | Purpose |
|-------|---------|
| `monitoring.enabled` | Enable onRiskCron for live-market risk monitoring |
| `monitoring.cronSchedule` | Cron for risk checks (default: `"*/5 * * * *"` every 5 min) |
| `monitoring.marketIds` | Market IDs to monitor; falls back to resolution.marketIds when unset |
| `monitoring.useRelayerMarkets` | Fetch market IDs from relayer; falls back to resolution.useRelayerMarkets when unset |

## Privacy (Privacy-Preserving Extensions)

| Field | Purpose |
|-------|---------|
| `privacy.enabled` | Enable confidential fetch, eligibility gating, private settlement |
| `privacy.defaultProfile` | Default PrivacyProfile: `PUBLIC` \| `PROTECTED_SOURCE` \| `PRIVATE_INPUT` \| `COMPLIANCE_GATED` |

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
| `llmProvider` | `"deepseek"` (default) or `"gemini"`. Use `gemini` for Google Gemini API. |
| `gptModel` | DeepSeek model name (default: `deepseek-chat`). Used when `llmProvider` is `deepseek`. |
| `deepseekApiKey` | DeepSeek API key; fallback when DEEPSEEK_API_KEY secret not set |
| `geminiApiKey` | Gemini API key; used when `llmProvider` is `gemini`. Fallback: GEMINI_API_KEY env/secret. |
| `geminiModel` | Gemini model (e.g. `gemini-1.5-flash`, `gemini-1.5-pro`). Default: `gemini-1.5-flash`. |
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

## Polymarket (Draft Proposer & Resolution)

| Field | Purpose |
|-------|---------|
| `polymarket.apiUrl` | Gamma API URL (default: `https://gamma-api.polymarket.com`) |
| `polymarket.apiKey` | Gamma API key for rate limits; prefer CRE secret `POLYMARKET_API_KEY` |
| `polymarket.clobUrl` | CLOB API URL (default: `https://clob.polymarket.com`) |
| `polymarket.secret` | CLOB L2 auth; prefer CRE secret `POLYMARKET_SECRET` |
| `polymarket.passphrase` | CLOB L2 auth; prefer CRE secret `POLYMARKET_PASSPHRASE` |

**Never commit credentials.** Store in CRE secrets or `.env` (gitignored).

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
| `DEEPSEEK_API_KEY` | AI API key when `llmProvider` is `deepseek` (default) |
| `GEMINI_API_KEY` | AI API key when `llmProvider` is `gemini` |
| `POLYMARKET_API_KEY` | Polymarket Gamma API key (rate limit bypass) |
| `POLYMARKET_SECRET` | Polymarket CLOB L2 auth (trading) |
| `POLYMARKET_PASSPHRASE` | Polymarket CLOB L2 auth |
