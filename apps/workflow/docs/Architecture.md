# CRE Workflow Architecture

High-level system architecture for the RetroPick Chainlink CRE workflow, relayer, and smart contracts.

## Overview

The workflow runs on the Chainlink DON (Decentralized Oracle Network). It responds to cron, HTTP, and EVM log triggers, fetches data (from feeds, relayer, or chain), and delivers reports on-chain via `evmClient.writeReport`. The Chainlink Forwarder executes the transaction and calls the configured receiver contract.

## Component Roles

| Component | Role |
|-----------|------|
| **CRE Workflow** | Orchestration: triggers, handlers, consensus, HTTP/chain reads, report encoding, `writeReport` |
| **Relayer** | Off-chain trading engine: session state, checkpoint build (operator + user sigs), finalize/cancel tx submission |
| **Chainlink Forwarder** | Transaction executor: receives DON-signed reports, calls receiver `onReport` |
| **CREReceiver** | Outcome and checkpoint ingress: routes by report prefix to OracleCoordinator |
| **CREPublishReceiver** | Publish-from-draft ingress: validates EIP-712, calls MarketFactory |
| **OracleCoordinator** | Routes validated results to SettlementRouter |
| **SettlementRouter** | Dispatches to MarketRegistry (settle) or ChannelSettlement (finalize) |
| **MarketRegistry** | V3 market registry, resolution, redeem |
| **ChannelSettlement** | V3 checkpoint submit, challenge window, finalize, cancel |
| **MarketFactory** | Market creation (direct feed reports or createFromDraft) |

## Topology

```mermaid
flowchart TB
    subgraph external [External]
        DON[CRE Workflow DON]
        Relayer[Relayer API]
    end

    subgraph ingress [Ingress]
        FWD[Chainlink Forwarder]
        CR[CREReceiver]
        CPR[CREPublishReceiver]
    end

    subgraph routing [Routing]
        OC[OracleCoordinator]
        SR[SettlementRouter]
    end

    subgraph targets [On-Chain Targets]
        MR[MarketRegistry]
        PM[PoolMarketLegacy]
        CS[ChannelSettlement]
        MF[MarketFactory]
    end

    DON -->|writeReport| FWD
    Relayer -->|HTTP| DON
    FWD --> CR
    FWD --> CPR
    CR --> OC --> SR
    SR -->|settleMarket 0x01| MR
    SR -->|settleMarket 0x01| PM
    SR -->|finalizeSession 0x03| CS
    CPR --> MF
```

## Execution Lifecycle (Generic)

```
Trigger (cron/HTTP/EVM log) → Handler runs on DON
  → Capability calls (HTTP fetch, chain read)
  → Consensus across DON nodes
  → runtime.report + evmClient.writeReport(payload)
  → Forwarder receives tx
  → Forwarder calls receiver.onReport(metadata, payload)
  → Receiver routes by prefix
  → Target contract executes (resolve, submitCheckpoint, createFromDraft)
```

## Report Routing Table

| Report Prefix | Receiver | Internal Route | On-Chain Target |
|---------------|----------|----------------|-----------------|
| (none) | CREReceiver | submitResult | OracleCoordinator → SettlementRouter → MarketRegistry/PoolMarketLegacy |
| `0x03` | CREReceiver | submitSession | SettlementRouter → ChannelSettlement.submitCheckpointFromPayload |
| `0x04` | CREPublishReceiver | — | MarketFactory.createFromDraft |

## Workflow Handlers by Flow

| Flow | Handlers | Trigger |
|------|----------|---------|
| Resolution (log) | onLogTrigger | EVM log (`SettlementRequested`) |
| Resolution (schedule) | onScheduleResolver | Cron |
| Checkpoint submit | onCheckpointSubmit | Cron |
| Checkpoint finalize | onCheckpointFinalize | Cron (finalize schedule) |
| Checkpoint cancel | onCheckpointCancel | Cron (cancel schedule) |
| Market creation (feed) | scheduleTrigger → marketCreator | Cron |
| Publish-from-draft | onHttpTrigger → publishFromDraft | HTTP |
| Legacy session | sessionSnapshot | Cron |
| Draft proposal | onDraftProposer | Cron |

## Workflow Repo Structure

Directory layout and file descriptions for `apps/workflow/`:

```
apps/workflow/
├── main.ts                    # Entry point: Runner, trigger registration, handler wiring
├── httpCallback.ts            # HTTP trigger router: publish-from-draft vs create-market
├── logCallback.ts             # (deprecated) Re-exports onLogTrigger for backward compat
├── gpt.ts                     # AI resolution: DeepSeek API, askGPTForOutcome, binary/categorical/timeline
│
├── config/                    # Config validation
│   └── schema.ts              # validateWorkflowConfig, shouldRegisterLogTrigger, shouldRegisterScheduleResolver
│
├── types/
│   ├── config.ts              # WorkflowConfig, ResolutionMode
│   └── feed.ts                # FeedConfig, FeedItem, MarketInput, FeedType
│
├── pipeline/                  # Active handlers (primary implementation)
│   ├── resolution/
│   │   ├── logTrigger.ts      # EVM log SettlementRequested → read market → AI → writeReport
│   │   └── scheduleResolver.ts # Cron poll marketIds → read MarketRegistry → AI → writeReport
│   ├── checkpoint/
│   │   ├── checkpointSubmit.ts   # GET /health, /cre/checkpoints → POST build → writeReport(0x03)
│   │   ├── checkpointFinalize.ts # POST /cre/finalize/:sessionId (relayer submits tx)
│   │   └── checkpointCancel.ts   # POST /cre/cancel/:sessionId (relayer submits tx)
│   └── creation/
│       ├── scheduleTrigger.ts   # Feeds → fetchFeed → generateMarketInput → createMarkets
│       ├── marketCreator.ts     # encode + writeReport to marketFactoryAddress
│       ├── publishFromDraft.ts  # encodePublishReport(0x04) → writeReport to CREPublishReceiver
│       └── draftProposer.ts     # Polymarket Gamma API → proposeDraft (direct RPC)
│
├── jobs/                      # Thin wrappers (deprecated; re-export pipeline)
│   ├── checkpointSubmit.ts    # → pipeline/checkpoint/checkpointSubmit
│   ├── checkpointFinalize.ts   # → pipeline/checkpoint/checkpointFinalize
│   ├── marketCreator.ts        # → pipeline/creation/marketCreator
│   ├── scheduleTrigger.ts     # → pipeline/creation/scheduleTrigger
│   └── sessionSnapshot.ts     # Legacy: yellowSessions → 0x03 payload → CREReceiver
│
├── contracts/                 # On-chain clients and report encoding
│   ├── reportFormats.ts       # encodeOutcomeReport, encodePublishReport, DraftPublishParams
│   ├── poolMarketLegacy.ts    # PoolMarketLegacy ABI: getMarket, marketType, getCategoricalOutcomes, getTimelineWindows
│   ├── marketRegistry.ts     # MarketRegistry ABI: getMarket, marketType, outcomes, timeline
│   ├── publishFromDraft.ts    # EIP-712 computeParamsHash, typed data for PublishFromDraft
│   └── draftBoardClient.ts   # proposeDraft, computeQuestionHash, computeOutcomesHash (direct RPC)
│
├── sources/                   # External data feeds
│   ├── coinGecko.ts           # CoinGecko price API → price-based questions
│   ├── newsAPI.ts             # News API → questionTemplate + valuePath
│   ├── githubTrends.ts        # GitHub trends → repo/trend questions
│   ├── polymarketEvents.ts    # Polymarket Gamma API → events as drafts
│   └── customFeeds.ts         # Custom URL fetch → questionTemplate + valuePath
│
├── builders/                  # Data transformation and validation
│   ├── generateMarket.ts     # FeedItem → MarketInput (externalId hash, validate)
│   ├── schemaValidator.ts    # validateFeedConfig, validateFeedItem, validateMarketInput
│   └── buildFinalStateRequest.ts # SessionPayloadInput → 0x03-prefixed ABI (legacy session)
│
├── utils/
│   ├── http.ts                # httpJsonRequest: CRE HTTPClient + consensusIdenticalAggregation
│   └── jsonPath.ts            # getValueByPath: dot-notation JSON extraction for feeds
│
├── test/                      # Tests
│   ├── integration.test.ts   # Unit/integration tests
│   └── e2e/
│       └── workflowE2E.test.ts # End-to-end workflow tests
│
├── .docs/                     # Internal planning (e.g. UpgradePlan.md)
├── config.example.json        # Example config
├── config.staging.json        # Staging config
├── config.production.json     # Production config
└── docs/                      # Documentation (see DOCUMENTATION.md)
```

### Key Files by Responsibility

| File | Responsibility |
|------|----------------|
| **gpt.ts** | AI outcome resolution. `GPTService.askGPTForOutcome(question, marketType, outcomes?, timelineWindows?)` — DeepSeek API (`api.deepseek.com/v1/chat/completions`), model `gptModel` or `deepseek-chat`. Binary: `{"result":"YES"|"NO","confidence":0-10000}`; categorical/timeline: `{"outcomeIndex":0..N-1,"confidence":0-10000}`. System prompts per market type. Key: `DEEPSEEK_API_KEY` or `config.deepseekApiKey`. `consensusIdenticalAggregation` for DON consensus. Mock: `useMockAi` / `mockAiResponse`. |
| **httpCallback.ts** | Routes HTTP payloads: `draftId`+`creator`+`params`+`claimerSig` → publishFromDraft; `question` → createMarkets. |
| **contracts/reportFormats.ts** | `encodeOutcomeReport(market, marketId, outcomeIndex, confidence)` — no prefix; `encodePublishReport(draftId, creator, params, claimerSig)` — 0x04 prefix. |
| **contracts/poolMarketLegacy.ts** | Read market from PoolMarketLegacy for log-trigger resolution. |
| **contracts/marketRegistry.ts** | Read market from MarketRegistry for schedule resolution. |
| **contracts/draftBoardClient.ts** | `proposeDraft` via direct RPC (viem); used by draftProposer. Requires `AI_ORACLE_ROLE`. |
| **utils/http.ts** | `httpJsonRequest(runtime, { url, method, headers, body })` — CRE HTTP capability with consensus. |
| **utils/jsonPath.ts** | `getValueByPath(obj, "a.b.c")` — used by feeds to extract values from API responses. |
| **sources/*.ts** | Each fetches from external API and returns `FeedItem[]`; `scheduleTrigger` dispatches by `feed.type`. |
| **builders/generateMarket.ts** | `generateMarketInput(feedItem, requestedBy)` — validates, hashes externalId, produces MarketInput. |
| **builders/buildFinalStateRequest.ts** | Legacy session: encodes 0x03-prefixed payload for SessionFinalizer path. |

### gpt.ts (AI Resolution) — Detailed

Market outcome resolution via DeepSeek. Used by `logTrigger.ts` and `scheduleResolver.ts`.

| Aspect | Detail |
|--------|--------|
| **API** | `https://api.deepseek.com/v1/chat/completions` |
| **Model** | `config.gptModel` or default `deepseek-chat` |
| **Key** | CRE secret `DEEPSEEK_API_KEY` or `config.deepseekApiKey` |
| **Consensus** | `consensusIdenticalAggregation<GPTResponse>` — DON nodes must return identical response |
| **Mock** | `useMockAi: true` skips API; uses `mockAiResponse` (e.g. `{"result":"YES","confidence":10000}`) |

**Binary (marketType 0):** System prompt enforces `{"result":"YES"|"NO","confidence":0-10000}`. Maps YES→0, NO→1.

**Categorical (marketType 1):** User prompt includes `question` + `outcomes` array. AI returns `{"outcomeIndex":0..N-1,"confidence":0-10000}`.

**Timeline (marketType 2):** User prompt includes `question` + `timelineWindows`. AI returns window index.

**Flow:** `askGPTForOutcome()` → `askGPT()` or `askGPTWithPrompt()` → `buildGPTRequest` / `buildGPTRequestTyped` → HTTP POST (base64 body) → `handleDeepSeekResponse` → `parseOutcome` / `parseTypedOutcome`.

### Data Flow Summary

| Flow | Entry | Key Files | Exit |
|------|-------|-----------|------|
| **Resolution (log)** | EVM log | `logTrigger.ts` → `gpt.ts` → `reportFormats.ts` | CREReceiver |
| **Resolution (schedule)** | Cron | `scheduleResolver.ts` → `marketRegistry.ts` → `gpt.ts` → `reportFormats.ts` | CREReceiver |
| **Checkpoint submit** | Cron | `checkpointSubmit.ts` → `utils/http.ts` (relayer) | CREReceiver (0x03) |
| **Checkpoint finalize/cancel** | Cron | `checkpointFinalize.ts` / `checkpointCancel.ts` → `utils/http.ts` | Relayer submits tx |
| **Feed creation** | Cron | `scheduleTrigger.ts` → `sources/*` → `generateMarket.ts` → `marketCreator.ts` | MarketFactory |
| **Publish-from-draft** | HTTP | `httpCallback.ts` → `publishFromDraft.ts` → `reportFormats.ts` | CREPublishReceiver (0x04) |
| **Draft proposer** | Cron | `draftProposer.ts` → `polymarketEvents.ts` → `draftBoardClient.ts` | Direct RPC to MarketDraftBoard |

## References

- [packages/contracts/docs/abi/docs/cre/CREPipelineDiagram.md](../../packages/contracts/docs/abi/docs/cre/CREPipelineDiagram.md) — Contract-level pipeline diagrams
- [packages/contracts/docs/IntegrationMatrix.md](../../packages/contracts/docs/IntegrationMatrix.md) — Report types and ingress chain
- [HandlersReference](HandlersReference.md) — Per-handler details
